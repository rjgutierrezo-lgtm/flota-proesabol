// GET ?desde=&hasta=&sucursal_id= → costos y consumo por vehículo y por categoría (permiso "reportes")
import { json, err, txt, int, sesion, puede, misSucursales, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "reportes")) return err("Sin permiso", 403);
  const q = new URL(request.url).searchParams; let sucs = (await misSucursales(env, u)).map(s => s.id);
  if (q.get("sucursal_id")) sucs = sucs.filter(s => s === int(q.get("sucursal_id"))); if (!sucs.length) return json({ ok: true, vehiculos: [], tipos: [], meses: [] });
  const d = new Date((txt(q.get("desde"), 10) || "2000-01-01") + "T00:00:00-04:00").toISOString(), h = new Date(new Date((txt(q.get("hasta"), 10) || "2999-12-30") + "T00:00:00-04:00").getTime() + 864e5).toISOString();
  const w = `e.empresa_id = ? AND e.anulado = 0 AND e.sucursal_id IN (${sucs.map(() => "?").join(",")}) AND e.fecha >= ? AND e.fecha < ?`, p = [E(u), ...sucs, d, h];
  const [veh, tip, mes] = await env.DB.batch([
    env.DB.prepare(`SELECT v.id, v.placa, v.marca, v.modelo, v.rendimiento_esp, SUM(CASE WHEN e.tipo='combustible' THEN e.monto ELSE 0 END) AS combustible,
      SUM(CASE WHEN e.tipo='mantenimiento' THEN e.monto ELSE 0 END) AS mantenimiento, SUM(CASE WHEN e.tipo='lavado' THEN e.monto ELSE 0 END) AS lavado,
      SUM(CASE WHEN e.tipo='gasto' THEN e.monto ELSE 0 END) AS gastos, SUM(e.monto) AS total, SUM(CASE WHEN e.tipo='combustible' THEN e.litros ELSE 0 END) AS litros,
      MAX(e.km) - MIN(e.km) AS km, SUM(CASE WHEN e.rendimiento IS NOT NULL THEN e.rendimiento * e.litros END) / NULLIF(SUM(CASE WHEN e.rendimiento IS NOT NULL THEN e.litros END), 0) AS rendimiento, SUM(CASE WHEN e.alerta IS NOT NULL THEN 1 ELSE 0 END) AS alertas
      FROM eventos e JOIN vehiculos v ON v.id = e.vehiculo_id WHERE ${w} GROUP BY v.id ORDER BY total DESC`).bind(...p),
    env.DB.prepare(`SELECT e.tipo, COUNT(*) AS cantidad, SUM(e.monto) AS total FROM eventos e WHERE ${w} GROUP BY e.tipo ORDER BY total DESC`).bind(...p),
    env.DB.prepare(`SELECT substr(datetime(e.fecha, '-4 hours'), 1, 7) AS mes, SUM(e.monto) AS total, SUM(CASE WHEN e.tipo='combustible' THEN e.monto ELSE 0 END) AS combustible FROM eventos e WHERE ${w} GROUP BY mes ORDER BY mes`).bind(...p)]);
  return json({ ok: true, vehiculos: veh.results, tipos: tip.results, meses: mes.results });
}
