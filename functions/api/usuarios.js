// Usuarios de la empresa (permiso "usuarios"). GET: lista | POST: crear o editar
// conductor_id: ficha de conductor enlazada al usuario ("nuevo" crea la ficha con el nombre del usuario). vehiculo_id: vehículo predeterminado al registrar.
import { json, err, int, txt, sesion, puede, hashPass, randomHex, validUser, revisarLimite, PERMISOS, ITER, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const { results } = await env.DB.prepare(`SELECT u.id, u.usuario, u.nombre, u.permisos, u.sucursales, u.activo, u.creado, u.conductor_id, u.vehiculo_id, c.nombre AS conductor, v.placa
    FROM usuarios u LEFT JOIN conductores c ON c.id = u.conductor_id LEFT JOIN vehiculos v ON v.id = u.vehiculo_id WHERE u.empresa_id = ? ORDER BY u.nombre`).bind(E(u)).all();
  results.forEach(r => { r.permisos = JSON.parse(r.permisos || "[]"); r.sucursales = JSON.parse(r.sucursales || "[]"); });
  return json({ ok: true, usuarios: results, permisos: PERMISOS });
}
// Devuelve {conductor_id, vehiculo_id} validados (null = sin asignar, undefined = no cambiar)
async function enlaces(env, eid, b, nombre) {
  const out = {};
  if (b.conductor_id !== undefined) {
    if (b.conductor_id === "nuevo") { const r = await env.DB.prepare("INSERT INTO conductores(empresa_id, nombre) VALUES(?, ?)").bind(eid, nombre).run(); out.conductor_id = r.meta.last_row_id; }
    else { const id = int(b.conductor_id) || null; out.conductor_id = id && (await env.DB.prepare("SELECT 1 FROM conductores WHERE id = ? AND empresa_id = ?").bind(id, eid).first()) ? id : null; }
  }
  if (b.vehiculo_id !== undefined) { const id = int(b.vehiculo_id) || null; out.vehiculo_id = id && (await env.DB.prepare("SELECT 1 FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(id, eid).first()) ? id : null; }
  return out;
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({}));
  const perms = Array.isArray(b.permisos) ? b.permisos.filter(p => p in PERMISOS) : null;
  let sucs = null; if (Array.isArray(b.sucursales)) { const { results } = await env.DB.prepare("SELECT id FROM sucursales WHERE empresa_id = ?").bind(E(u)).all();
    const ok = new Set(results.map(r => r.id)); sucs = b.sucursales.map(x => int(x)).filter(x => ok.has(x)); }
  if (b.id) {
    const id = int(b.id), cur = await env.DB.prepare("SELECT activo, nombre FROM usuarios WHERE id = ? AND empresa_id = ?").bind(id, E(u)).first();
    if (!cur) return err("Usuario no encontrado", 404);
    if (b.activo === true && !cur.activo) { const lim = await revisarLimite(env, E(u), "usuarios"); if (lim) return err(lim, 402); }
    if (id === u.id && (b.activo === false || (perms && !perms.includes("usuarios")))) return err("No puedes quitarte tu propio acceso de administrador");
    const sets = [], vals = [], en = await enlaces(env, E(u), b, txt(b.nombre, 80) || cur.nombre);
    if (b.nombre !== undefined) { sets.push("nombre=?"); vals.push(txt(b.nombre, 80)); }
    if (perms) { sets.push("permisos=?"); vals.push(JSON.stringify(perms)); }
    if (sucs) { sets.push("sucursales=?"); vals.push(JSON.stringify(sucs)); }
    if (b.activo !== undefined) { sets.push("activo=?"); vals.push(b.activo ? 1 : 0); }
    for (const k of ["conductor_id", "vehiculo_id"]) if (en[k] !== undefined) { sets.push(`${k}=?`); vals.push(en[k]); }
    if (b.password) { if (String(b.password).length < 8) return err("La contraseña debe tener al menos 8 caracteres"); const salt = randomHex(16); sets.push("salt=?", "hash=?", "iter=?"); vals.push(salt, await hashPass(String(b.password), salt), ITER); }
    if (!sets.length) return err("Nada que cambiar");
    const st = [env.DB.prepare(`UPDATE usuarios SET ${sets.join(",")} WHERE id=? AND empresa_id=?`).bind(...vals, id, E(u))];
    if (b.activo === false || b.password) st.push(env.DB.prepare("DELETE FROM sesiones WHERE usuario_id=?").bind(id));
    await env.DB.batch(st); return json({ ok: true });
  }
  { const lim = await revisarLimite(env, E(u), "usuarios"); if (lim) return err(lim, 402); }
  const usuario = txt(b.usuario, 60).toLowerCase(), pass = String(b.password || ""), nombre = txt(b.nombre, 80) || usuario;
  if (!validUser(usuario)) return err("Usuario: 3 a 60 letras, números, punto, guion o @");
  if (pass.length < 8) return err("La contraseña debe tener al menos 8 caracteres");
  if (await env.DB.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").bind(usuario).first()) return err("Ese nombre de usuario ya está en uso en la plataforma. Prueba otro (ej: ana.tienda)");
  const en = await enlaces(env, E(u), b, nombre), salt = randomHex(16);
  const r = await env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, sucursales, iter, conductor_id, vehiculo_id) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(E(u), usuario, nombre, await hashPass(pass, salt), salt, JSON.stringify(perms || ["registrar"]), JSON.stringify(sucs || []), ITER, en.conductor_id ?? null, en.vehiculo_id ?? null).run();
  return json({ ok: true, id: r.meta.last_row_id, conductor_id: en.conductor_id ?? null });
}
