// Conductores. GET: lista de los parqueos del usuario | POST: crear/editar (permiso "vehiculos")
// Cada conductor pertenece a un parqueo. Quien está limitado a ciertos parqueos solo ve y edita los conductores de esos parqueos;
// los conductores sin parqueo asignado solo los ve quien tiene acceso a todos.
import { json, err, txt, int, sesion, puede, misSucursales, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const sucs = (await misSucursales(env, u)).map(s => s.id), todas = !u.sucursales.length;
  const w = todas ? "" : sucs.length ? ` AND c.sucursal_id IN (${sucs.map(() => "?").join(",")})` : " AND 0";
  const { results } = await env.DB.prepare(`SELECT c.*, s.nombre AS sucursal, (SELECT GROUP_CONCAT(placa, ', ') FROM vehiculos v WHERE v.conductor_id = c.id AND v.estado <> 'baja') AS vehiculos
    FROM conductores c LEFT JOIN sucursales s ON s.id = c.sucursal_id WHERE c.empresa_id = ?${w} ORDER BY c.activo DESC, c.nombre`).bind(E(u), ...(todas ? [] : sucs)).all();
  return json({ ok: true, conductores: results });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "vehiculos")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({})), nombre = txt(b.nombre, 80); if (!nombre) return err("Falta el nombre");
  const sucs = (await misSucursales(env, u)).map(s => s.id), todas = !u.sucursales.length;
  let sid = int(b.sucursal_id) || null; if (sid && !sucs.includes(sid)) return err("Elige un parqueo válido");
  if (!sid && !todas) { if (sucs.length === 1) sid = sucs[0]; else return err("Elige el parqueo del conductor"); }
  const vals = [nombre, txt(b.ci, 20), txt(b.telefono, 20), txt(b.licencia_cat, 10), /^\d{4}-\d{2}-\d{2}$/.test(b.licencia_vence || "") ? b.licencia_vence : null, b.activo === false ? 0 : 1, sid];
  if (b.id) {
    const cur = await env.DB.prepare("SELECT sucursal_id FROM conductores WHERE id = ? AND empresa_id = ?").bind(int(b.id), E(u)).first();
    if (!cur || (!todas && !sucs.includes(cur.sucursal_id))) return err("Conductor no encontrado", 404);
    await env.DB.prepare("UPDATE conductores SET nombre=?, ci=?, telefono=?, licencia_cat=?, licencia_vence=?, activo=?, sucursal_id=? WHERE id=? AND empresa_id=?").bind(...vals, int(b.id), E(u)).run(); return json({ ok: true });
  }
  const r = await env.DB.prepare("INSERT INTO conductores(nombre, ci, telefono, licencia_cat, licencia_vence, activo, sucursal_id, empresa_id) VALUES(?,?,?,?,?,?,?,?)").bind(...vals, E(u)).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
