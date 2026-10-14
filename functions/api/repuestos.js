// Repuestos con stock mínimo. GET: lista | GET ?movimientos=ID: historial de un repuesto | POST crear/editar
// POST {movimiento:{repuesto_id, tipo:'entrada'|'salida'|'ajuste', cantidad, costo, vehiculo_id, nota}}
// Permiso "mantenimiento". Una salida con vehículo registra el gasto (categoría Repuesto) en ese vehículo para que entre en sus costos.
import { json, err, txt, int, num, sesion, puede, misSucursales, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const q = new URL(request.url).searchParams;
  if (q.get("movimientos")) {
    const { results } = await env.DB.prepare(`SELECT m.*, v.placa, us.nombre AS usuario FROM movimientos m LEFT JOIN vehiculos v ON v.id = m.vehiculo_id LEFT JOIN usuarios us ON us.id = m.usuario_id
      WHERE m.empresa_id = ? AND m.repuesto_id = ? ORDER BY m.fecha DESC, m.id DESC LIMIT 200`).bind(E(u), int(q.get("movimientos"))).all();
    return json({ ok: true, movimientos: results });
  }
  const { results } = await env.DB.prepare("SELECT * FROM repuestos WHERE empresa_id = ? ORDER BY activo DESC, nombre COLLATE NOCASE").bind(E(u)).all();
  return json({ ok: true, repuestos: results, bajo_minimo: results.filter(r => r.activo && r.minimo > 0 && r.stock <= r.minimo).length });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "mantenimiento")) return err("Sin permiso para repuestos", 403);
  const b = await request.json().catch(() => ({}));
  if (b.movimiento) {
    const m = b.movimiento, r = await env.DB.prepare("SELECT * FROM repuestos WHERE id = ? AND empresa_id = ?").bind(int(m.repuesto_id), E(u)).first(); if (!r) return err("Repuesto no encontrado", 404);
    const tipo = ["entrada", "salida", "ajuste"].includes(m.tipo) ? m.tipo : "entrada", cant = num(m.cantidad);
    if (!(cant > 0) && tipo !== "ajuste") return err("Escribe la cantidad"); if (tipo === "ajuste" && !(cant >= 0)) return err("Escribe el stock real");
    const conCosto = m.costo !== "" && m.costo != null, costo = conCosto ? Math.max(0, num(m.costo)) : r.costo;
    const nuevo = tipo === "entrada" ? r.stock + cant : tipo === "salida" ? r.stock - cant : cant;
    if (tipo === "salida" && nuevo < 0) return err(`Solo hay ${r.stock} ${r.unidad} en stock`);
    let v = null;
    if (tipo === "salida" && m.vehiculo_id) {
      v = await env.DB.prepare("SELECT * FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(int(m.vehiculo_id), E(u)).first();
      if (!v || !(await misSucursales(env, u)).some(s => s.id === v.sucursal_id)) return err("Vehículo no encontrado", 404);
    }
    const ahora = new Date().toISOString(); let evId = null;
    if (v && costo * cant > 0) { // el consumo entra como gasto del vehículo
      const e = await env.DB.prepare(`INSERT INTO eventos(empresa_id, sucursal_id, vehiculo_id, tipo, fecha, km, monto, lleno, proveedor, detalle, categoria, conductor_id, usuario_id) VALUES(?,?,?,'gasto',?,?,?,0,'',?,'Repuesto',?,?)`)
        .bind(E(u), v.sucursal_id, v.id, ahora, v.km_actual, Math.round(costo * cant * 100) / 100, `${r.nombre} x ${cant} ${r.unidad}${m.nota ? " · " + txt(m.nota, 100) : ""}`.slice(0, 300), v.conductor_id, u.id).run();
      evId = e.meta.last_row_id;
    }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO movimientos(empresa_id, repuesto_id, fecha, tipo, cantidad, costo, vehiculo_id, evento_id, usuario_id, nota) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(E(u), r.id, ahora, tipo, tipo === "ajuste" ? nuevo - r.stock : cant, costo, v ? v.id : null, evId, u.id, txt(m.nota, 150)),
      env.DB.prepare(`UPDATE repuestos SET stock = ?${tipo === "entrada" && conCosto ? ", costo = ?" : ""} WHERE id = ?`).bind(nuevo, ...(tipo === "entrada" && conCosto ? [costo] : []), r.id)]);
    return json({ ok: true, stock: nuevo, evento_id: evId });
  }
  const nombre = txt(b.nombre, 80); if (!nombre) return err("Falta el nombre");
  const vals = [nombre, txt(b.codigo, 40), txt(b.unidad, 20) || "unidad", Math.max(0, num(b.minimo)), Math.max(0, num(b.costo)), b.activo === false ? 0 : 1];
  if (b.id) { const r = await env.DB.prepare("UPDATE repuestos SET nombre=?, codigo=?, unidad=?, minimo=?, costo=?, activo=? WHERE id=? AND empresa_id=?").bind(...vals, int(b.id), E(u)).run(); if (!r.meta.changes) return err("No encontrado", 404); return json({ ok: true }); }
  const r = await env.DB.prepare("INSERT INTO repuestos(empresa_id, nombre, codigo, unidad, minimo, costo, activo, stock) VALUES(?,?,?,?,?,?,?,?)").bind(E(u), ...vals, Math.max(0, num(b.stock))).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
