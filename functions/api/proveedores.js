// Catálogo de proveedores de la empresa: talleres, estaciones de servicio, lavaderos y otros.
// GET ?tipo= : lista (cualquier usuario de la empresa) | POST crear/editar | POST {importar:true} toma los nombres ya usados en el historial
// Administran: permiso "mantenimiento" o "vehiculos".
import { json, err, txt, int, sesion, puede, TIPOS_PROV, E } from "../../lib/db.js";
const TIPOS = [...new Set(Object.values(TIPOS_PROV))];
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const tipo = new URL(request.url).searchParams.get("tipo"), w = ["p.empresa_id = ?"], v = [E(u)];
  if (TIPOS.includes(tipo)) { w.push("p.tipo = ?"); v.push(tipo); }
  const { results } = await env.DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM eventos e WHERE e.empresa_id = p.empresa_id AND e.anulado = 0 AND e.proveedor = p.nombre) AS usos
    FROM proveedores p WHERE ${w.join(" AND ")} ORDER BY p.activo DESC, p.tipo, p.nombre COLLATE NOCASE`).bind(...v).all();
  return json({ ok: true, proveedores: results });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "mantenimiento") && !puede(u, "vehiculos")) return err("No tienes permiso para administrar proveedores", 403);
  const b = await request.json().catch(() => ({}));
  if (b.importar) { // crea un proveedor por cada nombre distinto que ya aparece en los registros y aún no está en la lista
    const caso = "CASE e.tipo WHEN 'combustible' THEN 'surtidor' WHEN 'mantenimiento' THEN 'taller' WHEN 'lavado' THEN 'lavadero' ELSE 'proveedor' END";
    const r = await env.DB.prepare(`INSERT INTO proveedores(empresa_id, tipo, nombre) SELECT DISTINCT e.empresa_id, ${caso}, trim(e.proveedor) FROM eventos e
      WHERE e.empresa_id = ? AND e.anulado = 0 AND e.tipo <> 'kilometraje' AND trim(e.proveedor) <> ''
      AND NOT EXISTS (SELECT 1 FROM proveedores p WHERE p.empresa_id = e.empresa_id AND p.tipo = ${caso} AND lower(p.nombre) = lower(trim(e.proveedor)))`).bind(E(u)).run();
    return json({ ok: true, importados: r.meta.changes });
  }
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : "taller", nombre = txt(b.nombre, 80); if (!nombre) return err("Falta el nombre");
  const dup = await env.DB.prepare("SELECT id FROM proveedores WHERE empresa_id = ? AND tipo = ? AND lower(nombre) = lower(?) AND id <> ?").bind(E(u), tipo, nombre, int(b.id)).first();
  if (dup) return err("Ya existe uno con ese nombre");
  const vals = [tipo, nombre, txt(b.telefono, 30), txt(b.nota, 200), b.activo === false ? 0 : 1, txt(b.nit, 20).replace(/\D/g, "")];
  if (b.id) {
    const r = await env.DB.prepare("UPDATE proveedores SET tipo=?, nombre=?, telefono=?, nota=?, activo=?, nit=? WHERE id=? AND empresa_id=?").bind(...vals, int(b.id), E(u)).run();
    if (!r.meta.changes) return err("No encontrado", 404); return json({ ok: true });
  }
  const r = await env.DB.prepare("INSERT INTO proveedores(empresa_id, tipo, nombre, telefono, nota, activo, nit) VALUES(?,?,?,?,?,?,?)").bind(E(u), ...vals).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
