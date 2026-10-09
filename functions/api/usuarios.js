// Usuarios de la empresa (permiso "usuarios"). GET: lista | POST: crear o editar
import { json, err, int, txt, sesion, puede, hashPass, randomHex, validUser, revisarLimite, PERMISOS, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const { results } = await env.DB.prepare("SELECT id, usuario, nombre, permisos, sucursales, activo, creado FROM usuarios WHERE empresa_id = ? ORDER BY nombre").bind(E(u)).all();
  results.forEach(r => { r.permisos = JSON.parse(r.permisos || "[]"); r.sucursales = JSON.parse(r.sucursales || "[]"); });
  return json({ ok: true, usuarios: results, permisos: PERMISOS });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({}));
  const perms = Array.isArray(b.permisos) ? b.permisos.filter(p => p in PERMISOS) : null;
  let sucs = null; if (Array.isArray(b.sucursales)) { const { results } = await env.DB.prepare("SELECT id FROM sucursales WHERE empresa_id = ?").bind(E(u)).all();
    const ok = new Set(results.map(r => r.id)); sucs = b.sucursales.map(x => int(x)).filter(x => ok.has(x)); }
  if (b.id) {
    const id = int(b.id);
    if (!(await env.DB.prepare("SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?").bind(id, E(u)).first())) return err("Usuario no encontrado", 404);
    if (b.activo === true) { const cur = await env.DB.prepare("SELECT activo FROM usuarios WHERE id = ?").bind(id).first(); if (!cur.activo) { const lim = await revisarLimite(env, E(u), "usuarios"); if (lim) return err(lim, 402); } }
    if (id === u.id && (b.activo === false || (perms && !perms.includes("usuarios")))) return err("No puedes quitarte tu propio acceso de administrador");
    const sets = [], vals = [];
    if (b.nombre !== undefined) { sets.push("nombre=?"); vals.push(txt(b.nombre, 80)); }
    if (perms) { sets.push("permisos=?"); vals.push(JSON.stringify(perms)); }
    if (sucs) { sets.push("sucursales=?"); vals.push(JSON.stringify(sucs)); }
    if (b.activo !== undefined) { sets.push("activo=?"); vals.push(b.activo ? 1 : 0); }
    if (b.password) { if (String(b.password).length < 8) return err("La contraseña debe tener al menos 8 caracteres"); const salt = randomHex(16); sets.push("salt=?", "hash=?"); vals.push(salt, await hashPass(String(b.password), salt)); }
    if (!sets.length) return err("Nada que cambiar");
    const st = [env.DB.prepare(`UPDATE usuarios SET ${sets.join(",")} WHERE id=? AND empresa_id=?`).bind(...vals, id, E(u))];
    if (b.activo === false || b.password) st.push(env.DB.prepare("DELETE FROM sesiones WHERE usuario_id=?").bind(id));
    await env.DB.batch(st); return json({ ok: true });
  }
  { const lim = await revisarLimite(env, E(u), "usuarios"); if (lim) return err(lim, 402); }
  const usuario = txt(b.usuario, 60).toLowerCase(), pass = String(b.password || "");
  if (!validUser(usuario)) return err("Usuario: 3 a 60 letras, números, punto, guion o @");
  if (pass.length < 8) return err("La contraseña debe tener al menos 8 caracteres");
  const salt = randomHex(16);
  try { await env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, sucursales) VALUES(?,?,?,?,?,?,?)")
      .bind(E(u), usuario, txt(b.nombre, 80) || usuario, await hashPass(pass, salt), salt, JSON.stringify(perms || ["registrar"]), JSON.stringify(sucs || [])).run(); }
  catch (e) { if (String(e).includes("UNIQUE")) return err("Ese nombre de usuario ya está en uso en la plataforma. Prueba otro (ej: ana.tienda)"); throw e; }
  return json({ ok: true });
}
