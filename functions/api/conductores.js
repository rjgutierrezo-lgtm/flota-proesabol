// Conductores. GET: lista | POST: crear/editar (permiso "vehiculos")
import { json, err, txt, int, sesion, puede, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const { results } = await env.DB.prepare(`SELECT c.*, (SELECT GROUP_CONCAT(placa, ', ') FROM vehiculos v WHERE v.conductor_id = c.id AND v.estado <> 'baja') AS vehiculos
    FROM conductores c WHERE c.empresa_id = ? ORDER BY c.activo DESC, c.nombre`).bind(E(u)).all();
  return json({ ok: true, conductores: results });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "vehiculos")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({})), nombre = txt(b.nombre, 80); if (!nombre) return err("Falta el nombre");
  const vals = [nombre, txt(b.ci, 20), txt(b.telefono, 20), txt(b.licencia_cat, 10), /^\d{4}-\d{2}-\d{2}$/.test(b.licencia_vence || "") ? b.licencia_vence : null, b.activo === false ? 0 : 1];
  if (b.id) { await env.DB.prepare("UPDATE conductores SET nombre=?, ci=?, telefono=?, licencia_cat=?, licencia_vence=?, activo=? WHERE id=? AND empresa_id=?").bind(...vals, int(b.id), E(u)).run(); return json({ ok: true }); }
  const r = await env.DB.prepare("INSERT INTO conductores(nombre, ci, telefono, licencia_cat, licencia_vence, activo, empresa_id) VALUES(?,?,?,?,?,?,?)").bind(...vals, E(u)).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
