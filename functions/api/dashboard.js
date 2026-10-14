// GET ?sucursal_id=&desde=&hasta= → dashboard: mantenimientos realizados y planificados, documentos, presupuesto del mes, repuestos bajo mínimo,
// resumen por parqueo y gasto por mes. Los montos solo se envían a quien tiene permiso "reportes".
import { json, err, txt, int, sesion, puede, misSucursales, estadoPlan, estadoDoc, hoyTZ, tzSql, inicioDia, finDia, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const q = new URL(request.url).searchParams, todas = await misSucursales(env, u); let sucs = todas.map(s => s.id);
  if (q.get("sucursal_id")) sucs = sucs.filter(s => s === int(q.get("sucursal_id")));
  if (!sucs.length) return json({ ok: true, vacio: true });
  const hoy = hoyTZ(u.tz), off = tzSql(u.tz), mes = hoy.slice(0, 7), costos = puede(u, "reportes"), ph = sucs.map(() => "?").join(",");
  const desde = txt(q.get("desde"), 10) || new Date(Date.now() + (u.tz ?? -4) * 3600e3 - 29 * 864e5).toISOString().slice(0, 10), hasta = txt(q.get("hasta"), 10) || hoy;
  const d = inicioDia(desde, u.tz), h = finDia(hasta, u.tz);
  const hace60 = new Date(Date.now() - 60 * 864e5).toISOString(), hace12m = inicioDia(mes + "-01", u.tz).replace(/^(\d{4})-(\d{2})/, (m0, y, mo) => `${+mo > 12 ? +y : +y - 1}-${String(+mo).padStart(2, "0")}`);
  const wp = `e.empresa_id = ? AND e.anulado = 0 AND e.sucursal_id IN (${ph}) AND e.fecha >= ? AND e.fecha < ?`, pp = [E(u), ...sucs, d, h];
  const [prov, topVeh, trabajos, categorias, kmPer] = costos ? await env.DB.batch([
    env.DB.prepare(`SELECT e.proveedor AS nombre, SUM(e.monto) AS total, COUNT(*) AS n FROM eventos e WHERE ${wp} AND trim(e.proveedor) <> '' GROUP BY e.proveedor ORDER BY total DESC LIMIT 10`).bind(...pp),
    env.DB.prepare(`SELECT v.placa AS nombre, v.id, SUM(e.monto) AS total, MAX(e.km) - MIN(e.km) AS km FROM eventos e JOIN vehiculos v ON v.id = e.vehiculo_id WHERE ${wp} GROUP BY e.vehiculo_id ORDER BY total DESC LIMIT 10`).bind(...pp),
    env.DB.prepare(`SELECT COALESCE(p.nombre, NULLIF(e.detalle, ''), 'Correctivo') AS nombre, SUM(e.monto) AS total, COUNT(*) AS n FROM eventos e LEFT JOIN planes p ON p.id = e.plan_id WHERE ${wp} AND e.tipo = 'mantenimiento' GROUP BY 1 ORDER BY total DESC LIMIT 10`).bind(...pp),
    env.DB.prepare(`SELECT CASE WHEN e.tipo = 'gasto' THEN COALESCE(NULLIF(e.categoria, ''), 'Otro gasto') WHEN e.tipo = 'combustible' THEN 'Combustible' WHEN e.tipo = 'mantenimiento' THEN 'Mantenimiento' WHEN e.tipo = 'lavado' THEN 'Lavado' ELSE e.tipo END AS nombre, SUM(e.monto) AS total, COUNT(*) AS n FROM eventos e WHERE ${wp} AND e.monto > 0 GROUP BY 1 ORDER BY total DESC`).bind(...pp),
    env.DB.prepare(`SELECT SUM(km) AS km, SUM(litros) AS litros FROM (SELECT MAX(e.km) - MIN(e.km) AS km, SUM(CASE WHEN e.tipo = 'combustible' THEN e.litros ELSE 0 END) AS litros FROM eventos e WHERE ${wp} AND e.km IS NOT NULL GROUP BY e.vehiculo_id)`).bind(...pp)]) : [];
  const [veh, pla, kmr, rea, gas, mesQ, gmes, gveh, pres, rep] = await env.DB.batch([
    env.DB.prepare(`SELECT v.*, s.nombre AS sucursal, c.nombre AS conductor, c.licencia_vence FROM vehiculos v JOIN sucursales s ON s.id = v.sucursal_id LEFT JOIN conductores c ON c.id = v.conductor_id
      WHERE v.empresa_id = ? AND v.estado <> 'baja' AND v.sucursal_id IN (${ph}) ORDER BY v.placa`).bind(E(u), ...sucs),
    env.DB.prepare("SELECT * FROM planes WHERE empresa_id = ? AND activo = 1").bind(E(u)),
    env.DB.prepare(`SELECT vehiculo_id, MIN(km) AS km0, MIN(fecha) AS f0 FROM eventos WHERE empresa_id = ? AND anulado = 0 AND km IS NOT NULL AND fecha >= ? GROUP BY vehiculo_id`).bind(E(u), hace60),
    env.DB.prepare(`SELECT e.id, e.fecha, e.km, e.monto, e.proveedor, e.detalle, v.placa, s.nombre AS sucursal, p.nombre AS plan FROM eventos e JOIN vehiculos v ON v.id = e.vehiculo_id
      JOIN sucursales s ON s.id = e.sucursal_id LEFT JOIN planes p ON p.id = e.plan_id WHERE e.empresa_id = ? AND e.anulado = 0 AND e.tipo = 'mantenimiento' AND e.sucursal_id IN (${ph})
      AND e.fecha >= ? AND e.fecha < ? ORDER BY e.fecha DESC LIMIT 200`).bind(E(u), ...sucs, d, h),
    env.DB.prepare(`SELECT e.sucursal_id, e.tipo, SUM(e.monto) AS total, SUM(e.litros) AS litros, COUNT(*) AS n FROM eventos e WHERE e.empresa_id = ? AND e.anulado = 0 AND e.sucursal_id IN (${ph})
      AND e.fecha >= ? AND e.fecha < ? GROUP BY e.sucursal_id, e.tipo`).bind(E(u), ...sucs, d, h),
    env.DB.prepare(`SELECT substr(datetime(e.fecha, ?), 1, 7) AS mes, e.tipo, SUM(e.monto) AS total FROM eventos e WHERE e.empresa_id = ? AND e.anulado = 0 AND e.sucursal_id IN (${ph})
      AND e.fecha >= ? GROUP BY mes, e.tipo ORDER BY mes`).bind(off, E(u), ...sucs, hace12m),
    // presupuesto del mes en curso: gasto por parqueo y por vehículo
    env.DB.prepare(`SELECT e.sucursal_id, SUM(e.monto) AS total FROM eventos e WHERE e.empresa_id = ? AND e.anulado = 0 AND e.sucursal_id IN (${ph}) AND substr(datetime(e.fecha, ?), 1, 7) = ? GROUP BY e.sucursal_id`).bind(E(u), ...sucs, off, mes),
    env.DB.prepare(`SELECT e.vehiculo_id, SUM(e.monto) AS total FROM eventos e WHERE e.empresa_id = ? AND e.anulado = 0 AND e.sucursal_id IN (${ph}) AND substr(datetime(e.fecha, ?), 1, 7) = ? GROUP BY e.vehiculo_id`).bind(E(u), ...sucs, off, mes),
    env.DB.prepare(`SELECT id, nombre, presupuesto_mes FROM sucursales WHERE empresa_id = ? AND id IN (${ph})`).bind(E(u), ...sucs),
    env.DB.prepare("SELECT id, nombre, codigo, stock, minimo, unidad FROM repuestos WHERE empresa_id = ? AND activo = 1 AND minimo > 0 AND stock <= minimo ORDER BY (stock / minimo), nombre LIMIT 50").bind(E(u))]);
  // Planificados: próxima fecha por días, y fecha estimada por km según el uso de los últimos 60 días
  const planificados = [], alertasDoc = [], porSuc = new Map();
  for (const s of todas.filter(x => sucs.includes(x.id))) porSuc.set(s.id, { sucursal_id: s.id, nombre: s.nombre, vehiculos: 0, vencidos: 0, proximos: 0, combustible: 0, mantenimiento: 0, lavado: 0, gasto: 0, total: 0, litros: 0 });
  const nom = { soat_vence: u.doc1 || "SOAT", itv_vence: u.doc2 || "Inspección técnica", seguro_vence: "Seguro", licencia_vence: "Licencia" };
  const presVeh = [];
  for (const v of veh.results) {
    const r = kmr.results.find(x => x.vehiculo_id === v.id), dias = r ? Math.max(1, (Date.now() - new Date(r.f0)) / 864e5) : 0;
    const kmDia = r && dias >= 3 && v.km_actual > r.km0 ? (v.km_actual - r.km0) / dias : null, ps = porSuc.get(v.sucursal_id); ps.vehiculos++;
    for (const p of pla.results.filter(x => x.vehiculo_id === v.id)) {
      const e = estadoPlan(p, v.km_actual, hoy);
      let porKm = null; if (e.faltaKm != null && kmDia) porKm = new Date(Date.now() + (u.tz ?? -4) * 3600e3 + Math.max(0, e.faltaKm) / kmDia * 864e5).toISOString().slice(0, 10);
      const est = [e.proxFecha, porKm].filter(Boolean).sort()[0] || null;
      if (e.estado === "vencido") ps.vencidos++; else if (e.estado === "proximo") ps.proximos++;
      planificados.push({ vehiculo_id: v.id, placa: v.placa, sucursal: v.sucursal, plan: p.nombre, plan_id: p.id, estado: e.estado, proxKm: e.proxKm, faltaKm: e.faltaKm, proxFecha: e.proxFecha, estimada: est, km_dia: kmDia ? Math.round(kmDia) : null });
    }
    for (const k of Object.keys(nom)) { const dd = estadoDoc(v[k], hoy); if (dd && dd.estado !== "ok") alertasDoc.push({ placa: v.placa, sucursal: v.sucursal, doc: k === "licencia_vence" ? `Licencia de ${v.conductor || "conductor"}` : nom[k], fecha: v[k], ...dd }); }
    if (v.presupuesto_mes > 0) { const g = gveh.results.find(x => x.vehiculo_id === v.id); presVeh.push({ id: v.id, placa: v.placa, sucursal: v.sucursal, presupuesto: v.presupuesto_mes, gastado: g?.total || 0 }); }
  }
  for (const g of gas.results) { const ps = porSuc.get(g.sucursal_id); if (!ps) continue; const k = g.tipo === "gasto" ? "gasto" : g.tipo; ps[k] = (ps[k] || 0) + (g.total || 0); ps.total += g.total || 0; if (g.tipo === "combustible") ps.litros += g.litros || 0; }
  const ord = { vencido: 0, proximo: 1, sin_registro: 2, ok: 3 };
  planificados.sort((a, b) => ord[a.estado] - ord[b.estado] || String(a.estimada || "9999").localeCompare(String(b.estimada || "9999")));
  const presSuc = pres.results.filter(s => s.presupuesto_mes > 0).map(s => ({ sucursal_id: s.id, nombre: s.nombre, presupuesto: s.presupuesto_mes, gastado: gmes.results.find(x => x.sucursal_id === s.id)?.total || 0 }));
  const out = { ok: true, hoy, mes, desde, hasta, costos, planificados, realizados: rea.results, documentos: alertasDoc.sort((a, b) => a.dias - b.dias), parqueos: [...porSuc.values()], meses: mesQ.results,
    presupuestos: { parqueos: presSuc, vehiculos: presVeh.sort((a, b) => b.gastado / b.presupuesto - a.gastado / a.presupuesto) }, repuestos_min: rep.results,
    graficos: costos ? { proveedores: prov.results, top_vehiculos: topVeh.results, trabajos: trabajos.results, categorias: categorias.results, km: kmPer.results[0]?.km || 0, litros: kmPer.results[0]?.litros || 0 } : null,
    vehiculos: veh.results.map(v => ({ id: v.id, placa: v.placa, marca: v.marca, modelo: v.modelo, sucursal: v.sucursal, km_actual: v.km_actual, conductor: v.conductor, estado: v.estado })) };
  if (!costos) { out.realizados.forEach(x => delete x.monto); out.parqueos.forEach(p => { for (const k of ["combustible", "mantenimiento", "lavado", "gasto", "total"]) delete p[k]; }); out.meses = []; out.presupuestos = { parqueos: [], vehiculos: [] }; }
  return json(out);
}
