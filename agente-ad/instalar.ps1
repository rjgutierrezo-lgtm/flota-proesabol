# Instala el agente AD de FlotaControl como tarea programada que arranca con Windows (sin sesión iniciada).
# Ejecutar en PowerShell como administrador: powershell -ExecutionPolicy Bypass -File instalar.ps1
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgPath = Join-Path $raiz "config.json"
if (-not (Test-Path $cfgPath)) { Copy-Item (Join-Path $raiz "config.ejemplo.json") $cfgPath; Write-Host "Se creó config.json: edítalo (secreto, dominio) y vuelve a ejecutar este instalador."; exit 1 }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($cfg.secreto -like "cambia-esto*" -or $cfg.secreto.Length -lt 20) { Write-Host "Edita config.json y pon un secreto propio de al menos 20 caracteres."; exit 1 }
$nombre = "FlotaControl agente AD"
$accion = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $raiz 'agente-ad.ps1')`""
$disparador = New-ScheduledTaskTrigger -AtStartup
$config = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable
# Corre como SYSTEM: puede consultar el dominio desde una máquina unida a él sin guardar contraseñas
if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -Settings $config -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $nombre
Start-Sleep -Seconds 3
try { $r = Invoke-RestMethod "http://localhost:$($cfg.puerto)/salud" -TimeoutSec 5; Write-Host "Agente en marcha: $($r | ConvertTo-Json -Compress)" } catch { Write-Host "El agente no respondió todavía; revisa agente-ad.log" }
Write-Host ""
Write-Host "Siguiente paso: publicar el agente con un túnel de Cloudflare (Zero Trust > Networks > Tunnels):"
Write-Host "  hostname público: ad.TU-DOMINIO.com  ->  servicio HTTP  ->  localhost:$($cfg.puerto)"
Write-Host "Y en Cloudflare Pages (proyecto de FlotaControl) las variables AD_URL=https://ad.TU-DOMINIO.com y AD_SECRETO=(el secreto de config.json)."
