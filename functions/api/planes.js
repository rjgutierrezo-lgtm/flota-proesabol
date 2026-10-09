// Planes de mantenimiento de un vehículo. POST {id?, vehiculo_id, nombre, cada_km, cada_dias, ultimo_km?, ultima_fecha?, activo} (permiso "mantenimiento")
import { json, err, txt, int, num, sesion, puede, misSucursales, E } from "../../lib/db.js";
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "mantenimiento")) return err("No tienes permiso para planes de mantenimiento", 403);
  const b = await request.json().catch(() => ({})), vid = int(b.vehiculo_id);
  const v = await env.DB.prepare("SELECT sucursal_id FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(vid, E(u)).first();
  if (!v || !(await misSucursales(env, u)).some(s => s.id === v.sucursal_id)) return err("Vehículo no encontrado", 404);
  if (b.borrar && b.id) { await env.DB.prepare("UPDATE planes SET activo = 0 WHERE id = ? AND vehiculo_id = ?").bind(int(b.id), vid).run(); return json({ ok: true }); }
  const nombre = txt(b.nombre, 80); if (!nombre) return err("Ponle un nombre (ej: Cambio de aceite)");
  const km = Math.max(0, num(b.cada_km)), dias = Math.max(0, int(b.cada_dias)); if (!km && !dias) return err("Indica cada cuántos km o cada cuántos días");
  const uf = /^\d{4}-\d{2}-\d{2}$/.test(b.ultima_fecha || "") ? b.ultima_fecha : null;
  if (b.id) { await env.DB.prepare("UPDATE planes SET nombre=?, cada_km=?, cada_dias=?, ultimo_km=?, ultima_fecha=? WHERE id=? AND vehiculo_id=? AND empresa_id=?")
      .bind(nombre, km, dias, Math.max(0, num(b.ultimo_km)), uf, int(b.id), vid, E(u)).run(); return json({ ok: true }); }
  const r = await env.DB.prepare("INSERT INTO planes(empresa_id, vehiculo_id, nombre, cada_km, cada_dias, ultimo_km, ultima_fecha) VALUES(?,?,?,?,?,?,?)").bind(E(u), vid, nombre, km, dias, Math.max(0, num(b.ultimo_km)), uf).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
