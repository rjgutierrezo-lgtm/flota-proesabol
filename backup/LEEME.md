# Backup diario de FlotaControl

El Worker `flota-backup` se ejecuta solo todos los días a las 03:00 (Bolivia) y guarda en un **repo privado de GitHub**:

| Ruta | Contenido |
|---|---|
| `datos/AAAA-MM-DD.sql.gz.enc` | Toda la base (estructura y datos), comprimida y **cifrada** con `BACKUP_CLAVE` (AES-256-GCM). Uno por día. |
| `fotos/<empresa>/<fecha>/<archivo>` | Cada foto guardada en la base, **una sola vez** (máximo 40 por día; si hay más, siguen al día siguiente). |

Las fotos guardadas en R2 (binding `FOTOS` de la app) no pasan por aquí: R2 ya las guarda y no las borra.

## Instalación (una vez por cuenta)

1. En GitHub, crea un repo **privado** `flota-backups` marcando *Add a README file* (el repo no puede estar vacío).
2. Crea un token: GitHub → Settings → Developer settings → *Fine-grained tokens* → *Generate new token*.
   Repository access: *Only select repositories* → `flota-backups`. Permissions → *Contents: Read and write*. Sin vencimiento o con un recordatorio para renovarlo.
3. En esta carpeta: copia `wrangler.example.toml` como `wrangler.toml`, pon el `database_id` (`npx wrangler d1 list`) y el `GITHUB_REPO`, y ejecuta `npx wrangler deploy`.
4. En el panel de Cloudflare: Workers → `flota-backup` → Settings → Variables and Secrets → agrega como **Secret**:
   `GITHUB_TOKEN`, `BACKUP_CLAVE` (frase larga, **guárdala en un lugar seguro**: sin ella los backups no se pueden abrir) y `BACKUP_KEY`.
5. Prueba: abre `https://flota-backup.<cuenta>.workers.dev/?key=<BACKUP_KEY>` → debe responder `"ok": true` y aparecer el archivo en el repo.

## Restaurar

1. Descarga el repo (GitHub → Code → *Download ZIP*) y descomprímelo.
2. En PowerShell, desde esta carpeta:
   ```powershell
   $env:BACKUP_CLAVE = "la frase de cifrado"
   node restaurar.mjs C:\ruta\flota-backups-main            # el más reciente
   node restaurar.mjs C:\ruta\flota-backups-main 2026-10-26 # o un día concreto
   ```
   Genera `restaurar-AAAA-MM-DD.sql` con los datos y las fotos.
3. Cárgalo en una base (de preferencia una nueva para revisar antes):
   `npx wrangler d1 execute <base> --remote --file restaurar-AAAA-MM-DD.sql`

Además, D1 tiene *Time Travel*: permite volver la base a cualquier minuto de los últimos días desde el panel (D1 → la base → Time Travel), sin usar estos archivos.
