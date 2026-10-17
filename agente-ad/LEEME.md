# Agente de Active Directory para FlotaControl

Permite que los usuarios entren a FlotaControl con su usuario y contraseña de Windows (dominio), sin instalar nada en el controlador de dominio ni abrir puertos.

Cómo funciona: este agente corre en una PC o servidor de la red, unido al dominio. Cuando alguien elige "Entrar con usuario de dominio" en FlotaControl, la app le pregunta al agente si el usuario y la contraseña son válidos; el agente consulta al Active Directory por la red interna, como lo hace cualquier PC al iniciar sesión, y responde sí o no con el nombre y el correo de la persona. El agente solo escucha en `localhost` y se publica a internet con un túnel de Cloudflare, cifrado y protegido con un secreto compartido.

## Requisitos

- Una máquina Windows de la red, unida al dominio, que quede encendida (no el controlador de dominio).
- PowerShell 5.1 (viene con Windows 10, 11 y Server).
- Un dominio administrado en Cloudflare para el túnel, por ejemplo `ad.proesabol.com`.

## Instalación (15 minutos)

1. Copiar la carpeta `agente-ad` a la máquina, por ejemplo en `C:\flotacontrol\agente-ad`.
2. Copiar `config.ejemplo.json` a `config.json` y editarlo:
   - `secreto`: una clave larga e irrepetible (mínimo 20 caracteres). La misma irá en Cloudflare.
   - `dominio`: vacío para usar el dominio de la máquina, o el nombre del dominio (`proesabol.local`).
   - `grupo`: opcional; si se pone un grupo del AD (por ejemplo `FlotaControl`), solo sus miembros podrán entrar.
3. Abrir PowerShell **como administrador** y ejecutar:

```powershell
cd C:\flotacontrol\agente-ad
powershell -ExecutionPolicy Bypass -File instalar.ps1
```

   Queda registrado como tarea programada que arranca con Windows y se reinicia sola si se cae. Para probar: abrir http://localhost:8787/salud en esa máquina.

4. Publicarlo con un túnel de Cloudflare: panel de Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** (Cloudflared) → elegir Windows e instalar con el comando que muestra → en **Public hostnames**: subdominio `ad`, dominio `proesabol.com`, servicio **HTTP** `localhost:8787`.
5. En Cloudflare Pages, proyecto de FlotaControl → **Settings → Variables and Secrets**, agregar como secretos:

| Variable | Valor |
|---|---|
| `AD_URL` | `https://ad.proesabol.com` |
| `AD_SECRETO` | el secreto de `config.json` |
| `AD_NOMBRE` | opcional, texto del botón: `Entrar con mi usuario de Proesabol` |

   Luego **Deployments → Retry deployment**.

## Vincular a los usuarios

Cada persona debe existir como usuario en FlotaControl con sus permisos. La cuenta de dominio se enlaza sola si el **nombre de usuario** en FlotaControl es igual al de Windows (por ejemplo `jperez`), o si el **correo** cargado en Usuarios coincide con el correo del AD. Si no coincide con nadie, la app lo indica y no deja entrar.

## Seguridad

- El agente nunca está abierto a internet directamente: solo responde en `localhost` y a través del túnel de Cloudflare.
- Cada consulta debe traer el secreto compartido; sin él responde 401.
- Las contraseñas no se guardan en ningún lado; FlotaControl las reenvía cifradas al agente solo para validarlas.
- Para un nivel extra, en Cloudflare Zero Trust se puede proteger el hostname `ad.` con un *service token*, de modo que solo FlotaControl pueda llamarlo.
- El registro `agente-ad.log` guarda cada intento (usuario y resultado), nunca contraseñas.
