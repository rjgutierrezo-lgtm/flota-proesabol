// Registros de la flota: combustible, mantenimiento, lavado, gasto, kilometraje.
// GET ?vehiculo_id=&tipo=&desde=&hasta= | POST registrar | POST {id, anular:true, motivo} (permiso "reportes")
import { json, err, txt, int, num, sesion, puede, misSucursales, guardarFoto, limpiarFotos, hoyBO, PERFIL_EMPRESA, E } from "../../lib/db.js";
const TIPOS = ["combustible", "mantenimiento", "lavado", "gasto", "kilometraje"];
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "registrar") && !puede(u, "reportes") && !puede(u, "mantenimiento")) return err("Sin permiso", 403);
  const q = new URL(request.url).searchParams, sucs = (await misSucursales(env, u)).map(s => s.id); if (!sucs.length) return json({ ok: true, eventos: [] });
  const w = [`e.empresa_id = ?`, `e.sucursal_id IN (${sucs.map(() => "?").join(",")})`], v = [E(u), ...sucs];
  if (q.get("vehiculo_id")) { w.push("e.vehiculo_id = ?"); v.push(int(q.get("vehiculo_id"))); }
  if (TIPOS.includes(q.get("tipo"))) { w.push("e.tipo = ?"); v.push(q.get("tipo")); }
  const desde = txt(q.get("desde"), 10), hasta = txt(q.get("hasta"), 10);
  if (!puede(u, "reportes")) { w.push("e.usuario_id = ?"); v.push(u.id); }
  if (desde) { w.push("e.fecha >= ?"); v.push(new Date(desde + "T00:00:00-04:00").toISOString()); }
  if (hasta) { w.push("e.fecha < ?"); v.push(new Date(new Date(hasta + "T00:00:00-04:00").getTime() + 864e5).toISOString()); }
  const { results } = await env.DB.prepare(`SELECT e.*, ve.placa, c.nombre AS conductor, us.nombre AS usuario, p.nombre AS plan FROM eventos e JOIN vehiculos ve ON ve.id = e.vehiculo_id
    LEFT JOIN conductores c ON c.id = e.conductor_id LEFT JOIN usuarios us ON us.id = e.usuario_id LEFT JOIN planes p ON p.id = e.plan_id WHERE ${w.join(" AND ")} ORDER BY e.fecha DESC, e.id DESC LIMIT 500`).bind(...v).all();
  return json({ ok: true, eventos: results });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const b = await request.json().catch(() => ({}));
  if (b.anular) {
    if (!puede(u, "reportes")) return err("Solo un supervisor puede anular registros", 403); if (!txt(b.motivo)) return err("Escribe el motivo");
    const r = await env.DB.prepare("UPDATE eventos SET anulado = 1, detalle = trim(detalle || ' [Anulado: ' || ? || ']') WHERE id = ? AND empresa_id = ? AND anulado = 0").bind(txt(b.motivo, 150), int(b.id), E(u)).run();
    return r.meta.changes ? json({ ok: true }) : err("Registro no encontrado", 404);
  }
  const tipo = b.tipo; if (!TIPOS.includes(tipo)) return err("Tipo de registro no válido");
  if (tipo === "mantenimiento" ? !puede(u, "mantenimiento") : !puede(u, "registrar")) return err("No tienes permiso para este registro", 403);
  const v = await env.DB.prepare("SELECT * FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(int(b.vehiculo_id), E(u)).first();
  if (!v || !(await misSucursales(env, u)).some(s => s.id === v.sucursal_id)) return err("Vehículo no encontrado", 404);
  if (v.estado === "baja") return err("Ese vehículo está dado de baja");
  const km = b.km === "" || b.km == null ? null : num(b.km), litros = tipo === "combustible" ? num(b.litros) : null, monto = Math.max(0, num(b.monto));
  if (["combustible", "kilometraje"].includes(tipo) && !(km > 0)) return err("Escribe el kilometraje (odómetro)");
  if (tipo === "combustible" && !(litros > 0)) return err("Escribe los litros cargados");
  if (["combustible", "lavado", "gasto", "mantenimiento"].includes(tipo) && tipo !== "mantenimiento" && !(monto > 0)) return err("Escribe el monto");
  const alertas = [];
  if (km != null && km < v.km_actual - 1) { if (!b.confirmar_km) return err(`El kilometraje (${km}) es menor al último registrado (${v.km_actual}). Revisa el odómetro.`, 409); alertas.push(`Km menor al anterior (${v.km_actual})`); }
  if (km != null && km > v.km_actual + 3000 && v.km_actual > 0 && !b.confirmar_km) return err(`Son ${Math.round(km - v.km_actual)} km más que el último registro. ¿Es correcto? Confírmalo para guardar.`, 409);
  if (tipo === "combustible" && v.tanque_l > 0 && litros > v.tanque_l * 1.05) alertas.push(`Cargó ${litros} L y el tanque es de ${v.tanque_l} L`);
  let rendimiento = null; const lleno = b.lleno === false ? 0 : 1;
  if (tipo === "combustible" && lleno && km != null) { // rendimiento entre dos cargas de tanque lleno
    const prev = await env.DB.prepare("SELECT km, id FROM eventos WHERE vehiculo_id = ? AND tipo = 'combustible' AND lleno = 1 AND anulado = 0 AND km < ? ORDER BY km DESC LIMIT 1").bind(v.id, km).first();
    if (prev) { const s = await env.DB.prepare("SELECT COALESCE(SUM(litros),0) AS l FROM eventos WHERE vehiculo_id = ? AND tipo = 'combustible' AND anulado = 0 AND km > ? AND km < ?").bind(v.id, prev.km, km).first();
      const l = s.l + litros; if (l > 0) rendimiento = Math.round((km - prev.km) / l * 100) / 100;
      const emp = await env.DB.prepare(PERFIL_EMPRESA).bind(E(u)).first();
      if (rendimiento != null && v.rendimiento_esp > 0 && rendimiento < v.rendimiento_esp * (1 - emp.tolerancia_consumo / 100)) alertas.push(`Rendimiento bajo: ${rendimiento} km/l (esperado ${v.rendimiento_esp})`);
      if (rendimiento != null && v.rendimiento_esp > 0 && rendimiento > v.rendimiento_esp * 1.6) alertas.push(`Rendimiento muy alto (${rendimiento} km/l): puede faltar registrar alguna carga`); }
  }
  let plan = null; if (tipo === "mantenimiento" && b.plan_id) { plan = await env.DB.prepare("SELECT * FROM planes WHERE id = ? AND vehiculo_id = ? AND activo = 1").bind(int(b.plan_id), v.id).first(); if (!plan) return err("Plan de mantenimiento no válido"); }
  let f1 = null, f2 = null; try { if (b.foto1) f1 = await guardarFoto(env, E(u), b.foto1); if (b.foto2) f2 = await guardarFoto(env, E(u), b.foto2); } catch (e) { return err(e.message); }
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || "") && b.fecha !== hoyBO() ? new Date(b.fecha + "T12:00:00-04:00").toISOString() : new Date().toISOString();
  const st = [env.DB.prepare(`INSERT INTO eventos(empresa_id, sucursal_id, vehiculo_id, tipo, fecha, km, litros, monto, lleno, proveedor, detalle, categoria, plan_id, foto1, foto2, conductor_id, usuario_id, rendimiento, alerta)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(E(u), v.sucursal_id, v.id, tipo, fecha, km, litros, monto, tipo === "combustible" ? lleno : 0, txt(b.proveedor, 80), txt(b.detalle, 300),
      txt(b.categoria, 40), plan?.id ?? null, f1, f2, v.conductor_id, u.id, rendimiento, alertas.join(" · ") || null)];
  if (km != null && km > v.km_actual) st.push(env.DB.prepare("UPDATE vehiculos SET km_actual = ? WHERE id = ?").bind(km, v.id));
  if (plan) st.push(env.DB.prepare("UPDATE planes SET ultimo_km = ?, ultima_fecha = ? WHERE id = ?").bind(km ?? v.km_actual, fecha.slice(0, 10), plan.id));
  await env.DB.batch(st);
  if (Math.random() < 0.05) { const emp = await env.DB.prepare(PERFIL_EMPRESA).bind(E(u)).first(); await limpiarFotos(env, E(u), emp.retencion_fotos); }
  return json({ ok: true, rendimiento, alertas });
}
