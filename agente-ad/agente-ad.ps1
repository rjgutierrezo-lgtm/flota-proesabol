# Agente de Active Directory para FlotaControl.
# Corre en cualquier PC o servidor de la red (NO en el controlador de dominio) y responde si un usuario y contraseña
# son válidos en el dominio. Solo escucha en localhost; se publica a internet con un túnel de Cloudflare (cloudflared).
# Requiere PowerShell 5.1 (viene con Windows) y que la máquina esté unida al dominio o lo vea en la red.
# Uso: powershell -ExecutionPolicy Bypass -File agente-ad.ps1   (instalar.ps1 lo deja como tarea al iniciar Windows)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $raiz "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$puerto = if ($cfg.puerto) { [int]$cfg.puerto } else { 8787 }
$logFile = Join-Path $raiz "agente-ad.log"
function Log($m) { $l = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; Add-Content -Path $logFile -Value $l -Encoding UTF8; Write-Host $l }
if (-not $cfg.secreto -or $cfg.secreto.Length -lt 20) { throw "Pon en config.json un 'secreto' de al menos 20 caracteres (el mismo que AD_SECRETO en Cloudflare)" }

Add-Type -AssemblyName System.DirectoryServices.AccountManagement
$tipo = [System.DirectoryServices.AccountManagement.ContextType]::Domain

function Validar($usuario, $password) {
  # Usuario: "jperez", "DOMINIO\jperez" o "jperez@dominio.local"
  $u = $usuario -replace '^.*\\', '' -replace '@.*$', ''
  $u = $u.Trim().ToLower()
  if ($u -notmatch '^[a-z0-9._-]{1,64}$' -or -not $password) { return @{ ok = $false; error = "Usuario o contraseña incorrectos" } }
  # Cuentas que nunca se validan por esta vía (administradores integrados y cuentas de sistema), más las de config.json "bloquear"
  $prohibidas = @("administrator", "administrador", "admin", "krbtgt", "guest", "invitado") + @($cfg.bloquear | Where-Object { $_ } | ForEach-Object { "$_".ToLower() })
  if ($prohibidas -contains $u) { return @{ ok = $false; error = "Usuario o contraseña incorrectos" } }
  # El dominio: el de config.json, o el de la máquina si está unida al dominio
  $dom = if ($cfg.dominio) { $cfg.dominio } elseif ($env:USERDNSDOMAIN) { $env:USERDNSDOMAIN } else { $null }
  if (-not $dom) { return @{ ok = $false; error = "Falta 'dominio' en config.json (ej: proesabol.loc)" } }
  # 1) Validar la contraseña. 2) Leer la ficha (nombre, correo, grupos) con las credenciales del propio usuario, para no depender
  #    de los permisos de la cuenta que corre el agente. Si la ficha no se puede leer, igual se deja pasar con los datos mínimos.
  $ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext($tipo, $dom)
  try { $valido = $ctx.ValidateCredentials($u, $password, [System.DirectoryServices.AccountManagement.ContextOptions]::Negotiate) } finally { $ctx.Dispose() }
  if (-not $valido) { return @{ ok = $false; error = "Usuario o contraseña incorrectos" } }
  $p = $null; $ctx2 = $null
  try {
    $ctx2 = New-Object System.DirectoryServices.AccountManagement.PrincipalContext($tipo, $dom, $u, $password)
    $p = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($ctx2, [System.DirectoryServices.AccountManagement.IdentityType]::SamAccountName, $u)
  } catch { Log "no se pudo leer la ficha de $u ($($_.Exception.Message)); se continúa con datos mínimos" }
  try {
    if ($p -and $p.Enabled -eq $false) { return @{ ok = $false; error = "La cuenta está deshabilitada en el dominio" } }
    if ($cfg.grupo) {
      if (-not $p) { return @{ ok = $false; error = "No se pudo comprobar el grupo autorizado; avisa al administrador" } }
      $grupos = @(); try { $grupos = @($p.GetGroups() | ForEach-Object { $_.SamAccountName }) } catch { $grupos = @() }
      if ($grupos -notcontains $cfg.grupo) { return @{ ok = $false; error = "Tu usuario no pertenece al grupo autorizado ($($cfg.grupo))" } }
    }
    return @{ ok = $true; cuenta = $u; nombre = $(if ($p -and $p.DisplayName) { $p.DisplayName } else { $u }); correo = $(if ($p -and $p.EmailAddress) { $p.EmailAddress.ToLower() } else { "" }); sid = $(if ($p -and $p.Sid) { $p.Sid.Value } else { "" }) }
  } finally { if ($ctx2) { $ctx2.Dispose() } }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$puerto/")
$listener.Start()
Log "Agente AD escuchando en http://localhost:$puerto/ (dominio: $(if ($cfg.dominio) { $cfg.dominio } else { 'el de la máquina' }))"
while ($listener.IsListening) {
  $ctxHttp = $listener.GetContext(); $req = $ctxHttp.Request; $res = $ctxHttp.Response
  $res.ContentType = "application/json; charset=utf-8"
  $salida = @{ ok = $false; error = "Ruta no encontrada" }; $res.StatusCode = 404
  try {
    if ($req.HttpMethod -eq "GET" -and $req.Url.AbsolutePath -eq "/salud") { $salida = @{ ok = $true; agente = "flotacontrol-ad"; hora = (Get-Date).ToString("s") }; $res.StatusCode = 200 }
    elseif ($req.HttpMethod -eq "POST" -and $req.Url.AbsolutePath -eq "/validar") {
      if ($req.Headers["x-agente-secreto"] -ne $cfg.secreto) { $salida = @{ ok = $false; error = "Secreto incorrecto" }; $res.StatusCode = 401 }
      else {
        $sr = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8); $body = $sr.ReadToEnd() | ConvertFrom-Json
        $salida = Validar $body.usuario $body.password
        $res.StatusCode = $(if ($salida.ok) { 200 } else { 401 })
        Log ("validar {0} -> {1}" -f $body.usuario, $(if ($salida.ok) { "ok" } else { $salida.error }))
      }
    }
  } catch { $salida = @{ ok = $false; error = "Error del agente: $($_.Exception.Message)" }; $res.StatusCode = 500; Log "error: $($_.Exception.Message)" }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($salida | ConvertTo-Json -Compress))
  $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); $res.OutputStream.Close()
}
