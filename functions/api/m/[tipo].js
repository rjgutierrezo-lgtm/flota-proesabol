// Sucursales o bases: /api/m/sucursales. GET: lista | POST: crear o editar (permiso "sucursales")
import { json, err, int, txt, sesion, puede, revisarLimite, E } from "../../../lib/db.js";
export async function onRequestGet({ request, env, params }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  if (params.tipo !== "sucursales") return err("Ruta no encontrada", 404);
  const { results } = await env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM vehiculos v WHERE v.sucursal_id = s.id AND v.estado <> 'baja') AS vehiculos FROM sucursales s WHERE s.empresa_id = ? ORDER BY s.activo DESC, s.id`).bind(E(u)).all();
  return json({ ok: true, items: results });
}
export async function onRequestPost({ request, env, params }) {
  const u = await sesion(request, env); if (!puede(u, "sucursales")) return err("No tienes permiso para administrar sucursales", 403);
  if (params.tipo !== "sucursales") return err("Ruta no encontrada", 404);
  const b = await request.json().catch(() => ({})); const nombre = txt(b.nombre, 80); if (!nombre) return err("Falta el nombre");
  const activo = b.activo === false ? 0 : 1, vals = [nombre, txt(b.direccion, 200), txt(b.telefono, 30), activo];
  if (b.id) {
    const cur = await env.DB.prepare("SELECT activo FROM sucursales WHERE id=? AND empresa_id=?").bind(int(b.id), E(u)).first(); if (!cur) return err("No encontrada", 404);
    if (activo && !cur.activo) { const lim = await revisarLimite(env, E(u), "sucursales"); if (lim) return err(lim, 402); }
    await env.DB.prepare("UPDATE sucursales SET nombre=?, direccion=?, telefono=?, activo=? WHERE id=? AND empresa_id=?").bind(...vals, int(b.id), E(u)).run(); return json({ ok: true });
  }
  const lim = await revisarLimite(env, E(u), "sucursales"); if (lim) return err(lim, 402);
  const r = await env.DB.prepare("INSERT INTO sucursales(empresa_id, nombre, direccion, telefono, activo) VALUES(?,?,?,?,?)").bind(E(u), ...vals).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
