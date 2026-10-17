// POST: iniciar sesión | GET: datos de la sesión | DELETE: cerrar sesión
import { json, err, txt, hashPass, randomHex, sameStr, sesion, bloqueo, aviso, limites, misSucursales, PERFIL_EMPRESA, ITER, intentosBloqueado, intentoFallido, intentosLimpiar } from "../../lib/db.js";
async function perfil(env, u) {
  const out = { id: u.id, usuario: u.usuario, nombre: u.nombre, super: !!u.super, permisos: u.super ? [] : u.permisos, conductor_id: u.conductor_id || null, vehiculo_id: u.vehiculo_id || null };
  if (!u.super) {
    if (u.conductor_id) out.conductor = (await env.DB.prepare("SELECT nombre FROM conductores WHERE id = ? AND empresa_id = ?").bind(u.conductor_id, u.empresa_id).first())?.nombre || null;
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
  let u;
  if (b.dominio) { // usuario de Windows: lo valida el agente AD instalado en la red de la empresa (agente-ad/)
    if (!(env.AD || env.AD_URL) || !env.AD_SECRETO) return err("El ingreso con usuario de dominio no está configurado", 404);
    let r; try {
      // AD: service binding al Worker puente (túnel + Workers VPC, sin dominio). AD_URL: dirección pública del agente.
      const init = { method: "POST", headers: { "content-type": "application/json", "x-agente-secreto": env.AD_SECRETO }, body: JSON.stringify({ usuario, password: String(b.password || "") }), signal: AbortSignal.timeout(8000) };
      const resp = env.AD ? await env.AD.fetch("https://agente-ad/validar", init) : await fetch(String(env.AD_URL).replace(/\/$/, "") + "/validar", init);
      const t = await resp.text(); try { r = JSON.parse(t); } catch (x) { throw new Error(`respuesta ${resp.status}: ${t.slice(0, 120)}`); }
    } catch (e) { console.log("agente AD:", String(e && e.message || e)); return err("No se pudo contactar con el servidor de la empresa. Intenta de nuevo o usa tu contraseña de FlotaControl. (" + String(e && e.message || e).slice(0, 160) + ")", 502); }
    if (!r?.ok) { await intentoFallido(env, claves); return err(r?.error || "Usuario o contraseña incorrectos", 401); }
    const cuenta = String(r.cuenta || usuario).toLowerCase().replace(/^.*\\/, "").replace(/@.*$/, ""), correo = String(r.correo || "").toLowerCase(), clave = "ad:" + (r.sid || cuenta);
    u = await env.DB.prepare("SELECT * FROM usuarios WHERE ms_oid = ? AND activo = 1").bind(clave).first();
    if (!u) u = await env.DB.prepare("SELECT * FROM usuarios WHERE lower(usuario) = ? AND activo = 1 AND ms_oid IS NULL").bind(cuenta).first();
    if (!u && correo) u = await env.DB.prepare("SELECT * FROM usuarios WHERE lower(email) = ? AND activo = 1 AND ms_oid IS NULL").bind(correo).first();
    if (!u) return err(`La cuenta de dominio ${cuenta} es válida, pero no está vinculada a ningún usuario de FlotaControl. Pide al administrador que cree tu usuario con ese nombre o con tu correo.`, 403);
    if (u.ms_oid !== clave) await env.DB.prepare("UPDATE usuarios SET ms_oid = ? WHERE id = ?").bind(clave, u.id).run();
  } else {
    u = await env.DB.prepare("SELECT * FROM usuarios WHERE usuario = ? AND activo = 1").bind(usuario).first();
    const h = u ? await hashPass(String(b.password || ""), u.salt, u.iter || 20000) : await hashPass("x", "y", 20000);
    if (!u || !sameStr(h, u.hash)) { await intentoFallido(env, claves); return err("Usuario o contraseña incorrectos", 401); }
  }
  if (!u.super) { const e = await env.DB.prepare("SELECT activo, vence FROM empresas WHERE id = ?").bind(u.empresa_id).first(); const bq = bloqueo(e); if (bq) return err(bq, 403); }
  const token = randomHex(32), st = [env.DB.prepare("DELETE FROM sesiones WHERE expira < datetime('now')"),
    env.DB.prepare("INSERT INTO sesiones(token, usuario_id, expira) VALUES(?, ?, datetime('now', '+30 days'))").bind(token, u.id)];
  // contraseñas guardadas con menos iteraciones: se vuelven a cifrar con el valor actual
  if (!b.dominio && (u.iter || 20000) < ITER) { const salt = randomHex(16); st.push(env.DB.prepare("UPDATE usuarios SET salt = ?, hash = ?, iter = ? WHERE id = ?").bind(salt, await hashPass(String(b.password || ""), salt), ITER, u.id)); }
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
