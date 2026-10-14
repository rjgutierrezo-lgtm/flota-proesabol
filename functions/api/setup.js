// Crea el usuario dueño de la plataforma (super administrador). Requiere SETUP_KEY y solo funciona una vez.
import { json, err, txt, hashPass, randomHex, sameStr, validUser, ITER } from "../../lib/db.js";
export async function onRequestGet({ env }) {
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE super = 1").first();
  return json({ ok: true, necesita: c.n === 0, fotos_r2: !!env.FOTOS }); // fotos_r2: si el bucket R2 está conectado
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
