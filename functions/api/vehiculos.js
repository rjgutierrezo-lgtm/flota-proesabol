// Vehículos. GET: lista con alertas (mantenimiento, documentos, consumo) | GET ?codigo= : vehículo por QR | POST: crear/editar (permiso "vehiculos")
import { json, err, txt, int, num, sesion, puede, misSucursales, revisarLimite, guardarFoto, randomHex, normPlaca, estadoPlan, estadoDoc, hoyBO, PLANES_INICIALES, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const sucs = (await misSucursales(env, u)).map(s => s.id); if (!sucs.length) return json({ ok: true, vehiculos: [] });
  const q = new URL(request.url).searchParams, ph = sucs.map(() => "?").join(","), hoy = hoyBO();
  const w = q.get("codigo") ? " AND v.codigo = ?" : "", wv = q.get("codigo") ? [txt(q.get("codigo"), 20).toLowerCase()] : [];
  const [v, p, c, ult] = await env.DB.batch([
    env.DB.prepare(`SELECT v.*, s.nombre AS sucursal, c.nombre AS conductor, c.licencia_vence FROM vehiculos v JOIN sucursales s ON s.id = v.sucursal_id LEFT JOIN conductores c ON c.id = v.conductor_id
      WHERE v.empresa_id = ? AND v.sucursal_id IN (${ph})${w} ORDER BY v.estado = 'baja', v.placa`).bind(E(u), ...sucs, ...wv),
    env.DB.prepare("SELECT * FROM planes WHERE empresa_id = ? AND activo = 1 ORDER BY id").bind(E(u)),
    env.DB.prepare(`SELECT vehiculo_id, SUM(CASE WHEN tipo='combustible' THEN monto ELSE 0 END) AS comb, SUM(monto) AS total, MAX(km) - MIN(km) AS km, SUM(CASE WHEN tipo='combustible' THEN litros ELSE 0 END) AS litros FROM eventos WHERE empresa_id = ? AND anulado = 0 AND fecha >= ? GROUP BY vehiculo_id`).bind(E(u), new Date(Date.now() - 30 * 864e5).toISOString()),
    env.DB.prepare(`SELECT e.vehiculo_id, e.rendimiento, e.alerta, e.fecha, e.monto, e.litros FROM eventos e WHERE e.empresa_id = ? AND e.anulado = 0 AND e.tipo = 'combustible' AND e.id IN (SELECT MAX(id) FROM eventos WHERE empresa_id = ? AND tipo='combustible' AND anulado = 0 GROUP BY vehiculo_id)`).bind(E(u), E(u))]);
  const vehiculos = v.results.map(x => {
    const planes = p.results.filter(y => y.vehiculo_id === x.id).map(y => ({ ...y, ...estadoPlan(y, x.km_actual, hoy) }));
    const docs = { soat: estadoDoc(x.soat_vence, hoy), itv: estadoDoc(x.itv_vence, hoy), seguro: estadoDoc(x.seguro_vence, hoy), licencia: estadoDoc(x.licencia_vence, hoy) };
    const alertas = [];
    for (const y of planes) if (y.estado === "vencido" || y.estado === "proximo") alertas.push({ nivel: y.estado === "vencido" ? "bad" : "warn", texto: `${y.nombre}: ${y.estado === "vencido" ? "vencido" : "próximo"}${y.faltaKm != null ? ` (${y.faltaKm <= 0 ? "pasado por " + Math.round(-y.faltaKm) : "faltan " + Math.round(y.faltaKm)} km)` : ""}${y.faltaDias != null ? ` (${y.faltaDias <= 0 ? "venció hace " + -y.faltaDias : "en " + y.faltaDias} días)` : ""}` });
    const nom = { soat: "SOAT", itv: "Inspección técnica", seguro: "Seguro", licencia: "Licencia del conductor" };
    for (const [k, d] of Object.entries(docs)) if (d && d.estado !== "ok") alertas.push({ nivel: d.estado === "vencido" ? "bad" : "warn", texto: `${nom[k]}: ${d.estado === "vencido" ? `vencido hace ${-d.dias} días` : `vence en ${d.dias} días`}` });
    const u2 = ult.results.find(y => y.vehiculo_id === x.id); if (u2?.alerta) alertas.push({ nivel: "warn", texto: "Última carga: " + u2.alerta });
    const g = c.results.find(y => y.vehiculo_id === x.id) || {};
    return { ...x, planes, docs, alertas, gasto_30d: g.total || 0, km_30d: g.km || 0, litros_30d: g.litros || 0, costo_km_30d: g.km > 0 ? Math.round(g.total / g.km * 100) / 100 : null,
      rendimiento_ult: u2?.rendimiento ?? null, precio_litro_ult: u2?.litros > 0 && u2?.monto > 0 ? Math.round(u2.monto / u2.litros * 100) / 100 : null, ultima_carga: u2?.fecha || null };
  });
  return json({ ok: true, vehiculos, hoy });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "vehiculos")) return err("No tienes permiso para administrar vehículos", 403);
  const b = await request.json().catch(() => ({})), sid = int(b.sucursal_id), placa = normPlaca(b.placa);
  if (!(await misSucursales(env, u)).some(s => s.id === sid)) return err("Elige una sucursal válida"); if (placa.length < 3) return err("Escribe la placa");
  const f = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null;
  let cid = int(b.conductor_id) || null; if (cid && !(await env.DB.prepare("SELECT 1 FROM conductores WHERE id = ? AND empresa_id = ?").bind(cid, E(u)).first())) cid = null;
  const estado = ["activo", "taller", "baja"].includes(b.estado) ? b.estado : "activo";
  const vals = [sid, placa, txt(b.marca, 40), txt(b.modelo, 40), int(b.anio) || null, txt(b.tipo, 30), txt(b.combustible, 20) || "Gasolina", Math.max(0, num(b.tanque_l)),
    Math.max(0, num(b.rendimiento_esp)), cid, estado, f(b.soat_vence), f(b.itv_vence), f(b.seguro_vence), txt(b.notas, 400)];
  let foto; if (typeof b.foto === "string" && b.foto.startsWith("data:")) { try { foto = await guardarFoto(env, E(u), b.foto); } catch (e) { return err(e.message); } }
  try {
    if (b.id) {
      const cur = await env.DB.prepare("SELECT estado, sucursal_id, km_actual FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(int(b.id), E(u)).first();
      if (!cur || !(await misSucursales(env, u)).some(s => s.id === cur.sucursal_id)) return err("Vehículo no encontrado", 404);
      // corrección manual del odómetro (solo si se envía y cambia)
      const kmNuevo = b.km_actual === "" || b.km_actual == null ? null : Math.max(0, num(b.km_actual));
      if (cur.estado === "baja" && estado !== "baja") { const lim = await revisarLimite(env, E(u), "vehiculos"); if (lim) return err(lim, 402); }
      await env.DB.prepare(`UPDATE vehiculos SET sucursal_id=?, placa=?, marca=?, modelo=?, anio=?, tipo=?, combustible=?, tanque_l=?, rendimiento_esp=?, conductor_id=?, estado=?,
        soat_vence=?, itv_vence=?, seguro_vence=?, notas=?${foto ? ", foto=?" : ""}${kmNuevo != null && kmNuevo !== cur.km_actual ? ", km_actual=?" : ""} WHERE id=? AND empresa_id=?`)
        .bind(...vals, ...(foto ? [foto] : []), ...(kmNuevo != null && kmNuevo !== cur.km_actual ? [kmNuevo] : []), int(b.id), E(u)).run();
      return json({ ok: true, id: int(b.id) });
    }
    const lim = await revisarLimite(env, E(u), "vehiculos"); if (lim) return err(lim, 402);
    const km = Math.max(0, num(b.km_actual)), hoy = hoyBO();
    const id = (await env.DB.prepare(`INSERT INTO vehiculos(sucursal_id, placa, marca, modelo, anio, tipo, combustible, tanque_l, rendimiento_esp, conductor_id, estado, soat_vence, itv_vence, seguro_vence, notas, foto, km_actual, codigo, empresa_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...vals, foto || null, km, randomHex(5), E(u)).run()).meta.last_row_id;
    // planes preventivos de ejemplo, contando desde hoy y el km actual
    await env.DB.batch(PLANES_INICIALES.map(([n, k, d]) => env.DB.prepare("INSERT INTO planes(empresa_id, vehiculo_id, nombre, cada_km, cada_dias, ultimo_km, ultima_fecha) VALUES(?,?,?,?,?,?,?)").bind(E(u), id, n, k, d, km, hoy)));
    return json({ ok: true, id });
  } catch (e) { if (String(e).includes("UNIQUE")) return err("Ya existe un vehículo con esa placa"); throw e; }
}
