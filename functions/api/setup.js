// Crea el usuario dueño de la plataforma (super administrador). Requiere SETUP_KEY y solo funciona una vez.
import { json, err, txt, hashPass, randomHex, sameStr, validUser, ITER } from "../../lib/db.js";
export async function onRequestGet({ env }) {
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE super = 1").first();
  const sso = (env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET) ? (env.OIDC_NOMBRE || "Entrar con la cuenta de la empresa") : (env.MS_CLIENT_ID && env.MS_CLIENT_SECRET) ? "Entrar con Microsoft" : null;
  const ad = !!(env.AD_URL && env.AD_SECRETO);
  return json({ ok: true, necesita: c.n === 0, fotos_r2: !!env.FOTOS, microsoft: sso === "Entrar con Microsoft", sso, ad, ad_nombre: ad ? (env.AD_NOMBRE || "Entrar con mi usuario de Windows (dominio)") : null }); // fotos_r2: bucket R2; sso: texto del botón de inicio con la cuenta de la empresa (null si no está configurado)
}
export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  if (!env.SETUP_KEY || !sameStr(b.setup_key || "", env.SETUP_KEY)) return err("Clave de instalación incorrecta", 401);
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE super = 1").first();
  if (c.n > 0) return err("La plataforma ya tiene administrador", 409);
  const usuario = txt(b.usuario, 60).toLowerCase(), pass = String(b.password || "");
  if (!validUser(usuario)) return err("Usuario: 3 a 60 letras, números, punto, guion o @");
  if (pass.length < 10) return err("La contraseña del dueño de la plataforma debe tener al menos 10 caracteres");
  const salt = randomHex(16);
  await env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, super, iter) VALUES(NULL,?,?,?,?,1,?)")
    .bind(usuario, txt(b.nombre, 80) || usuario, await hashPass(pass, salt), salt, ITER).run();
  return json({ ok: true });
}
