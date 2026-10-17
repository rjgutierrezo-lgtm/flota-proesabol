# Entrar a FlotaControl con el usuario del Active Directory local

Escenario: la empresa tiene Active Directory en un Windows Server de la oficina, sin Microsoft 365. La app corre en Cloudflare y no puede hablar con el AD directamente, así que se instala **Keycloak** (servidor de identidad gratuito, de Red Hat) dentro de la red, se le conecta al AD por LDAP y se publica hacia internet con un **túnel de Cloudflare**, sin abrir ningún puerto en el router. Las contraseñas nunca salen de la red: el usuario las escribe en la pantalla de Keycloak, que las valida contra el AD.

Tiempo estimado: 1 a 2 horas para quien administra el servidor.

## Requisitos

- Un servidor Windows (o una máquina virtual Linux) dentro de la red, con acceso al controlador de dominio por el puerto 389 (LDAP) o 636 (LDAPS). Puede ser el mismo servidor de archivos; necesita 2 GB de RAM libres.
- Un **usuario de solo lectura** en el AD para que Keycloak consulte usuarios, por ejemplo `svc-keycloak`.
- Un dominio administrado en Cloudflare para publicar Keycloak, por ejemplo `id.proesabol.com`. Si el dominio `proesabol.com` no está en Cloudflare, se puede agregar (es gratis y solo cambia los servidores DNS) o registrar uno nuevo.
- Java 21 en el servidor (Keycloak lo necesita).

## 1. Instalar Keycloak

1. Instalar Java 21: https://adoptium.net (Temurin 21, instalador para Windows).
2. Descargar Keycloak (zip) desde https://www.keycloak.org/downloads y descomprimir en `C:\keycloak`.
3. Abrir PowerShell como administrador y arrancarlo por primera vez en modo desarrollo para crear el administrador:

```powershell
cd C:\keycloak\bin
$env:KC_BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:KC_BOOTSTRAP_ADMIN_PASSWORD = "una-clave-larga"
.\kc.bat start-dev --http-port 8080
```

4. Abrir http://localhost:8080 en el propio servidor y entrar con ese administrador.

Para producción conviene correrlo como servicio de Windows (con NSSM, https://nssm.cc) con el comando `kc.bat start --http-port 8080 --hostname https://id.proesabol.com --proxy-headers xforwarded --http-enabled true`, ya que el HTTPS lo pone Cloudflare.

## 2. Crear el realm y conectar el Active Directory

1. En Keycloak, arriba a la izquierda, **Create realm**. Nombre: `proesabol`.
2. Menú **User federation**, **Add LDAP providers**:
   - UI display name: `Active Directory`
   - Vendor: **Active Directory**
   - Connection URL: `ldap://IP-DEL-CONTROLADOR:389` (o `ldaps://...:636` si está configurado)
   - Bind type: `simple`
   - Bind DN: `CN=svc-keycloak,OU=Servicios,DC=proesabol,DC=local` (el usuario de solo lectura, con su ruta real)
   - Bind credentials: su contraseña. Probar con **Test authentication**.
   - Edit mode: `READ_ONLY`
   - Users DN: `OU=Usuarios,DC=proesabol,DC=local` (la unidad donde están las personas)
   - Username LDAP attribute: `sAMAccountName`
   - RDN LDAP attribute: `cn`, UUID LDAP attribute: `objectGUID`, User object classes: `person, organizationalPerson, user`
   - Import users: `On`, Sync registrations: `Off`, Periodic full sync: `On` cada 3600 segundos.
3. **Save** y luego, en la misma pantalla, **Action → Sync all users**. En **Users** deben aparecer las personas del dominio con su correo (atributo `mail` del AD).

Con esto, cualquier usuario del AD puede iniciar sesión en Keycloak con su usuario y contraseña de Windows. Si se bloquea o se deshabilita en el AD, deja de poder entrar.

## 3. Registrar FlotaControl como cliente

1. Menú **Clients**, **Create client**:
   - Client type: `OpenID Connect`, Client ID: `flotacontrol`. Next.
   - Client authentication: **On**. Standard flow: marcado. Next.
   - Valid redirect URIs: `https://flota-proesabol.pages.dev/api/ms/callback`
   - Web origins: `https://flota-proesabol.pages.dev`
   - Save.
2. Pestaña **Credentials**: copiar el **Client secret**.
3. Pestaña **Client scopes**: el scope `email` y `profile` deben estar asignados (vienen por defecto).

## 4. Publicar Keycloak con un túnel de Cloudflare

1. En el panel de Cloudflare: **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → tipo Cloudflared. Nombre: `keycloak`.
2. Elegir Windows y seguir el comando de instalación que muestra (instala `cloudflared` como servicio con el token del túnel).
3. En **Public hostnames**, agregar: subdominio `id`, dominio `proesabol.com`, servicio `HTTP` → `localhost:8080`. Guardar.
4. Comprobar desde fuera de la red que https://id.proesabol.com abre la pantalla de Keycloak.

Opcional recomendado: en Keycloak, realm `proesabol`, **Realm settings → Security defenses → Brute force detection**: activar para bloquear intentos repetidos.

## 5. Configurar FlotaControl

En Cloudflare Pages, proyecto `flota-proesabol`, **Settings → Variables and Secrets**, agregar como secretos:

| Variable | Valor |
|---|---|
| `OIDC_ISSUER` | `https://id.proesabol.com/realms/proesabol` |
| `OIDC_CLIENT_ID` | `flotacontrol` |
| `OIDC_CLIENT_SECRET` | el secreto copiado en el paso 3 |
| `OIDC_NOMBRE` | `Entrar con mi usuario de Proesabol` |

Luego **Deployments → Retry deployment**. En la pantalla de ingreso aparece el botón con ese texto.

## 6. Vincular a los usuarios

Cada persona que entre por esta vía debe existir también como usuario en FlotaControl, con sus permisos y parqueos. La vinculación es automática si se cumple cualquiera de estas dos:

- El **nombre de usuario** en FlotaControl es igual al nombre de cuenta del dominio (por ejemplo `jperez`).
- El **correo** cargado en Usuarios → "Correo de la empresa" es igual al atributo `mail` del AD.

La primera vez que la persona entra, su cuenta queda enlazada y en Usuarios aparece una marca. Si no coincide con nadie, la app lo dice y no deja pasar.

## Preguntas frecuentes

- **¿Y si se cae internet en la oficina?** Nadie podrá entrar con la cuenta del dominio hasta que vuelva, porque Keycloak está dentro de la red. Las contraseñas propias de FlotaControl siguen funcionando, así que conviene que al menos un administrador conserve la suya.
- **¿Las contraseñas del AD salen de la red?** No. El usuario las escribe en la página de Keycloak, que vive en el servidor de la oficina; FlotaControl solo recibe un token firmado que dice quién es.
- **¿Puedo usar el mismo Keycloak para otras aplicaciones?** Sí, es justamente su propósito: cada aplicación se agrega como un cliente más.
