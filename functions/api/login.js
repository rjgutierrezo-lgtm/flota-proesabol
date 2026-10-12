// POST: iniciar sesión | GET: datos de la sesión | DELETE: cerrar sesión
import { json, err, txt, hashPass, randomHex, sameStr, sesion, bloqueo, aviso, limites, misSucursales, PERFIL_EMPRESA, ITER, intentosBloqueado, intentoFallido, intentosLimpiar } from "../../lib/db.js";
async function perfil(env, u) {
  const out = { id: u.id, usuario: u.usuario, nombre: u.nombre, super: !!u.super, permisos: u.super ? [] : u.permisos };
  if (!u.super) {
    out.empresa = await env.DB.prepare(PERFIL_EMPRESA).bind(u.empresa_id).first();
    out.aviso = aviso(out.empresa); out.plan = await limites(env, u.empresa_id);
    out.sucursales = await misSucursales(env, { ...u, sucursales: Array.isArray(u.sucursales) ? u.sucursales : JSON.parse(u.sucursales || "[]") });
  }
  return out;
}
export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const usuario = txt(b.usuario, 60).toLowerCase(), ip = request.headers.get("cf-connecting-ip") || "";
  const claves = ["u:" + usuario, ...(ip ? ["ip:" + ip] : [])];
  const bq0 = await intentosBloqueado(env, claves); if (bq0) return err(bq0, 429);
  const u = await env.DB.prepare("SELECT * FROM usuarios WHERE usuario = ? AND activo = 1").bind(usuario).first();
  const h = u ? await hashPass(String(b.password || ""), u.salt, u.iter || 20000) : await hashPass("x", "y", 20000);
  if (!u || !sameStr(h, u.hash)) { await intentoFallido(env, claves); return err("Usuario o contraseña incorrectos", 401); }
  if (!u.super) { const e = await env.DB.prepare("SELECT activo, vence FROM empresas WHERE id = ?").bind(u.empresa_id).first(); const bq = bloqueo(e); if (bq) return err(bq, 403); }
  const token = randomHex(32), st = [env.DB.prepare("DELETE FROM sesiones WHERE expira < datetime('now')"),
    env.DB.prepare("INSERT INTO sesiones(token, usuario_id, expira) VALUES(?, ?, datetime('now', '+30 days'))").bind(token, u.id)];
  // contraseñas guardadas con menos iteraciones: se vuelven a cifrar con el valor actual
  if ((u.iter || 20000) < ITER) { const salt = randomHex(16); st.push(env.DB.prepare("UPDATE usuarios SET salt = ?, hash = ?, iter = ? WHERE id = ?").bind(salt, await hashPass(String(b.password || ""), salt), ITER, u.id)); }
  await env.DB.batch(st); await intentosLimpiar(env, claves);
  u.permisos = JSON.parse(u.permisos || "[]");
  return json({ ok: true, token, usuario: await perfil(env, u) });
}
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u) return err("Sesión vencida", 401);
  return json({ ok: true, usuario: await perfil(env, u) });
}
export async function onRequestDelete({ request, env }) {
  const u = await sesion(request, env); if (u) await env.DB.prepare("DELETE FROM sesiones WHERE token = ?").bind(u.token).run();
  return json({ ok: true });
}
