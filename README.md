# FlotaControl

Control de flota para pequeñas y medianas empresas: mantenimientos preventivos por kilómetros y días, cargas de combustible con cálculo de rendimiento, documentos con vencimiento, costos por vehículo y panel multiempresa para cobrar suscripciones.

Es una aplicación web instalable (PWA) que funciona en el celular del conductor y en la PC del jefe de flota. Pensada para Bolivia (hora UTC-4, moneda Bs, SOAT e inspección técnica), pero la moneda y los textos se ajustan por empresa.

## Cómo está hecha

| Parte | Tecnología |
|---|---|
| Front-end | HTML, CSS y JavaScript sin frameworks (`public/`) |
| API | Cloudflare Pages Functions (`functions/api/`) |
| Base de datos | Cloudflare D1 (SQLite). El esquema se crea solo al primer uso (`lib/db.js`) |
| Fotos | Cloudflare R2 si está conectado; si no, en D1 |
| Sin conexión | Service worker (`public/sw.js`) y cola de registros en el teléfono |

No hay paso de compilación: lo que está en `public/` se publica tal cual.

## Publicar en Cloudflare Pages

1. Conecta este repositorio en Cloudflare Pages. Directorio de salida: `public`. Sin comando de build.
2. En **Settings → Functions → Bindings** agrega:
   - **D1 database** con nombre de variable `DB`.
   - **R2 bucket** con nombre `FOTOS` (opcional; sin esto las fotos van a D1).
   - **Environment variable** `SETUP_KEY`: clave secreta para crear el primer usuario de la plataforma.
3. Abre la URL publicada. La primera vez pide la `SETUP_KEY` y crea el dueño de la plataforma.
4. Con ese usuario entra a **Empresas** y crea la primera empresa con su administrador.

Para el límite de intentos de login y el bloqueo por IP la app usa D1. Si quieres una capa extra, agrega una regla de *rate limiting* de Cloudflare sobre `/api/login`.

## Correr en local

```bash
npm install -g wrangler        # o usa npx
cp wrangler.example.toml wrangler.toml
npx wrangler pages dev public --d1 DB --binding SETUP_KEY=una-clave-local
```

Abre http://localhost:8788. La base D1 local se crea en `.wrangler/`. No subas `wrangler.toml` al repositorio: Cloudflare Pages lo usaría en lugar de los bindings del panel.

## Roles y permisos

| Permiso | Qué puede hacer |
|---|---|
| registrar | Cargar combustible, lavados, gastos y kilometraje. Corregir sus registros hasta 24 h después |
| mantenimiento | Planes de mantenimiento y registrar mantenimientos |
| vehiculos | Vehículos, conductores y documentos |
| reportes | Costos, historial completo, anular y corregir cualquier registro |
| sucursales | Parqueos o bases |
| usuarios | Usuarios y datos de la empresa |

Un usuario puede limitarse a ciertos parqueos: solo ve y registra los vehículos de esos parqueos.

## Funciones principales

- **Dashboard**: mantenimientos vencidos y próximos con fecha estimada según el uso real de cada vehículo, documentos por vencer, gasto por parqueo y por mes. Botón para enviar el resumen por WhatsApp.
- **Registrar**: elige el vehículo por lista o escaneando su QR. Combustible calcula km/l entre tanques llenos y avisa si el consumo se sale de lo esperado. Funciona sin señal: el registro se guarda en el teléfono y se envía solo.
- **Vehículos**: ficha con planes, documentos, costo por km de los últimos 30 días y etiqueta QR para imprimir.
- **Historial**: filtros, precio por litro, corrección y anulación de registros, descarga en CSV.
- **Costos**: gasto por vehículo, por tipo y por mes, costo por km, descarga en CSV.
- **Empresas** (dueño de la plataforma): planes, límites, pagos, vencimiento con días de gracia, recordatorio de pago por WhatsApp y empresa demo con 6 meses de datos.

## Seguridad

- Contraseñas con PBKDF2-SHA256 (60 000 iteraciones; las antiguas se actualizan al iniciar sesión).
- Sesiones de 30 días con token aleatorio. Máximo 6 intentos fallidos de login cada 15 minutos por usuario y por IP.
- Todas las consultas filtran por empresa y por los parqueos del usuario.
- Las fotos se sirven solo a usuarios de la misma empresa y se borran según la retención configurada.
