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

La página de venta está en `public/landing/index.html` y se sirve en `/landing/`. El número de WhatsApp de ventas se pone en la constante `WHATSAPP` al final de ese archivo.

## Publicar en Cloudflare Pages

1. Conecta este repositorio en Cloudflare Pages. Directorio de salida: `public`. Sin comando de build.
2. En **Settings → Functions → Bindings** agrega:
   - **D1 database** con nombre de variable `DB`.
   - **R2 bucket** con nombre `FOTOS` (opcional; sin esto las fotos van a D1).
   - **Environment variable** `SETUP_KEY`: clave secreta para crear el primer usuario de la plataforma.
3. Abre la URL publicada. La primera vez pide la `SETUP_KEY` y crea el dueño de la plataforma.
4. Con ese usuario entra a **Empresas** y crea la primera empresa con su administrador.

Para el límite de intentos de login y el bloqueo por IP la app usa D1. Si quieres una capa extra, agrega una regla de *rate limiting* de Cloudflare sobre `/api/login`.

### Variables de entorno opcionales

| Variable | Para qué |
|---|---|
| `RESEND_KEY` y `MAIL_FROM` | Envío de correo con [Resend](https://resend.com): recordatorio diario y aviso de registros nuevos. `MAIL_FROM` es el remitente verificado, por ejemplo `FlotaControl <avisos@tudominio.com>`. |
| `CRON_KEY` | Clave del recordatorio automático (si falta, se usa `SETUP_KEY`). |
| `MAIL_ADMIN` | Correo del dueño de la plataforma: recibe un aviso cada vez que una empresa se registra desde la landing. |
| `REGISTRO_ABIERTO` | `0` cierra el registro de empresas desde la landing (por defecto está abierto, con 30 días de prueba). |

### Recordatorio diario automático

El endpoint `GET /api/recordatorios?key=CRON_KEY` genera el resumen de cada empresa (mantenimientos vencidos y próximos, documentos por vencer, presupuesto superado, repuestos bajo mínimo) y lo envía al correo configurado en **Empresa → Recordatorio diario**. No repite el envío si ya se hizo ese día.

Cloudflare Pages no tiene cron propio, así que programa la llamada una vez al día (por ejemplo a las 07:00) con cualquiera de estas opciones:

- Un servicio gratuito como [cron-job.org](https://cron-job.org) apuntando a `https://TU-DOMINIO/api/recordatorios?key=CRON_KEY`.
- Un Worker de Cloudflare con *Cron Trigger* cuyo `scheduled()` haga `fetch` a esa URL.

En **Empresa** hay un botón "Enviar prueba ahora" para verificar la configuración y otro para ver el resumen del día sin enviarlo.

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
| mantenimiento | Planes de mantenimiento, registrar mantenimientos y administrar proveedores |
| vehiculos | Vehículos, conductores, documentos y proveedores |
| reportes | Costos, historial completo, anular y corregir cualquier registro |
| sucursales | Parqueos o bases |
| usuarios | Usuarios y datos de la empresa |

Un usuario puede limitarse a ciertos parqueos: solo ve y registra los vehículos de esos parqueos.

## Funciones principales

- **Dashboard**: mantenimientos vencidos y próximos con fecha estimada según el uso real de cada vehículo, documentos por vencer, gasto por parqueo y por mes. Botón para enviar el resumen por WhatsApp.
- **Registrar**: elige el vehículo por lista o escaneando su QR. Combustible calcula km/l entre tanques llenos y avisa si el consumo se sale de lo esperado. Funciona sin señal: el registro se guarda en el teléfono y se envía solo.
- **Vehículos**: ficha con planes, documentos, costo por km de los últimos 30 días y etiqueta QR para imprimir.
- **Proveedores**: lista de talleres, estaciones de servicio y lavaderos de la empresa. Al registrar, el campo es una lista con buscador: mientras la empresa tenga proveedores de ese tipo, solo se puede elegir de la lista (no se escribe cualquier cosa). Un botón importa los nombres que ya aparecen en el historial.
- **Historial**: filtros, precio por litro, corrección y anulación de registros, descarga en CSV.
- **Costos**: gasto por vehículo, por tipo y por mes, costo por km, descarga en CSV.
- **Repuestos**: inventario sencillo con stock mínimo. Las salidas con vehículo entran como gasto de ese vehículo; lo que baja del mínimo aparece en el Dashboard y en el recordatorio diario.
- **Llantas y batería**: en la ficha de cada vehículo, con km y meses de uso, porcentaje de vida útil y alerta al 85 % y al 100 %. Al instalar con costo se registra el gasto.
- **Conductor por registro**: cada carga o gasto guarda quién manejaba (por defecto el conductor asignado). Costos muestra una tabla por conductor con consumo y alertas.
- **Presupuesto mensual** por vehículo y por parqueo, con barra y semáforo en el Dashboard.
- **Exportación contable**: en Costos, un CSV con fecha, tipo, placa, proveedor, N° de factura, categoría y monto de todos los registros del período.
- **Ficha pública por QR**: al escanear el QR sin usuario se ve la ficha del vehículo (planes, documentos, últimos mantenimientos, sin costos). Se desactiva en Empresa.
- **Registro desde la landing**: `/landing/` permite crear una empresa con 30 días de prueba del plan Flota. Se cierra con `REGISTRO_ABIERTO=0`.
- **País, moneda y zona horaria por empresa**, con los nombres de los dos documentos obligatorios (SOAT e inspección técnica en Bolivia, SOAT y revisión técnica en Perú, etc.). Los textos de la aplicación están en español.
- **Empresas** (dueño de la plataforma): planes, límites, pagos, vencimiento con días de gracia, recordatorio de pago por WhatsApp y empresa demo con 6 meses de datos.

## Seguridad

- Contraseñas con PBKDF2-SHA256 (60 000 iteraciones; las antiguas se actualizan al iniciar sesión).
- Sesiones de 30 días con token aleatorio. Máximo 6 intentos fallidos de login cada 15 minutos por usuario y por IP.
- Todas las consultas filtran por empresa y por los parqueos del usuario.
- Las fotos se sirven solo a usuarios de la misma empresa y se borran según la retención configurada.
