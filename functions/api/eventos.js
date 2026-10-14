// Registros de la flota: combustible, mantenimiento, lavado, gasto, kilometraje.
// GET ?vehiculo_id=&tipo=&desde=&hasta=&pagina=&csv=1 | POST registrar | POST {id, anular:true, motivo} | POST {id, editar:true, ...campos}
// Anular: permiso "reportes". Editar: permiso "reportes", o quien lo registró dentro de las 24 horas.
import { json, err, txt, int, num, sesion, puede, misSucursales, guardarFoto, limpiarFotos, hoyTZ, inicioDia, finDia, mediodia, recalcularVehiculo, resolverProveedor, PERFIL_EMPRESA, E } from "../../lib/db.js";
const TIPOS = ["combustible", "mantenimiento", "lavado", "gasto", "kilometraje"];
const PAGINA = 200, MAX_CSV = 5000;
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "registrar") && !puede(u, "reportes") && !puede(u, "mantenimiento")) return err("Sin permiso", 403);
  const q = new URL(request.url).searchParams, sucs = (await misSucursales(env, u)).map(s => s.id); if (!sucs.length) return json({ ok: true, eventos: [], mas: false });
  const w = [`e.empresa_id = ?`, `e.sucursal_id IN (${sucs.map(() => "?").join(",")})`], v = [E(u), ...sucs];
  if (q.get("vehiculo_id")) { w.push("e.vehiculo_id = ?"); v.push(int(q.get("vehiculo_id"))); }
  if (q.get("sucursal_id") && sucs.includes(int(q.get("sucursal_id")))) { w.push("e.sucursal_id = ?"); v.push(int(q.get("sucursal_id"))); }
  if (TIPOS.includes(q.get("tipo"))) { w.push("e.tipo = ?"); v.push(q.get("tipo")); }
  const desde = txt(q.get("desde"), 10), hasta = txt(q.get("hasta"), 10);
  if (!puede(u, "reportes")) { w.push("e.usuario_id = ?"); v.push(u.id); }
  if (desde) { w.push("e.fecha >= ?"); v.push(inicioDia(desde, u.tz)); }
  if (hasta) { w.push("e.fecha < ?"); v.push(finDia(hasta, u.tz)); }
  const csv = q.get("csv") === "1", limite = csv ? MAX_CSV : PAGINA, pagina = Math.max(0, int(q.get("pagina")));
  const { results } = await env.DB.prepare(`SELECT e.*, ve.placa, s.nombre AS sucursal, c.nombre AS conductor, us.nombre AS usuario, p.nombre AS plan FROM eventos e JOIN vehiculos ve ON ve.id = e.vehiculo_id
    JOIN sucursales s ON s.id = e.sucursal_id LEFT JOIN conductores c ON c.id = e.conductor_id LEFT JOIN usuarios us ON us.id = e.usuario_id LEFT JOIN planes p ON p.id = e.plan_id WHERE ${w.join(" AND ")} ORDER BY e.fecha DESC, e.id DESC LIMIT ? OFFSET ?`)
    .bind(...v, limite + 1, csv ? 0 : pagina * PAGINA).all();
  const mas = results.length > limite; if (mas) results.pop();
  return json({ ok: true, eventos: results, mas, pagina });
}
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f || "");
// Validación común de los campos de un registro. Devuelve los campos limpios o {error}
function validar(tipo, b, v) {
  const km = b.km === "" || b.km == null ? null : num(b.km), litros = tipo === "combustible" ? num(b.litros) : null, monto = Math.max(0, num(b.monto));
  if (["combustible", "kilometraje"].includes(tipo) && !(km > 0)) return { error: "Escribe el kilometraje (odómetro)" };
  if (tipo === "combustible" && !(litros > 0)) return { error: "Escribe los litros cargados" };
  if (["combustible", "lavado", "gasto"].includes(tipo) && !(monto > 0)) return { error: "Escribe el monto" };
  const alertas = [];
  if (tipo === "combustible" && v.tanque_l > 0 && litros > v.tanque_l * 1.05) alertas.push(`Cargó ${litros} L y el tanque es de ${v.tanque_l} L`);
  const lleno = tipo === "combustible" ? (b.lleno === false ? 0 : 1) : 0;
  return { km, litros, monto, lleno, alertas, proveedor: txt(b.proveedor, 80), detalle: txt(b.detalle, 300), categoria: txt(b.categoria, 40), factura: txt(b.factura, 40) };
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const b = await request.json().catch(() => ({}));
  const sucs = (await misSucursales(env, u)).map(s => s.id);
  // ---------- anular ----------
  if (b.anular) {
    if (!puede(u, "reportes")) return err("Solo un supervisor puede anular registros", 403); if (!txt(b.motivo)) return err("Escribe el motivo");
    const ev = await env.DB.prepare("SELECT id, vehiculo_id, sucursal_id FROM eventos WHERE id = ? AND empresa_id = ? AND anulado = 0").bind(int(b.id), E(u)).first();
    if (!ev || !sucs.includes(ev.sucursal_id)) return err("Registro no encontrado", 404);
    await env.DB.prepare("UPDATE eventos SET anulado = 1, detalle = trim(detalle || ' [Anulado: ' || ? || ']') WHERE id = ?").bind(txt(b.motivo, 150), ev.id).run();
    await recalcularVehiculo(env, ev.vehiculo_id);
    return json({ ok: true });
  }
  // ---------- editar ----------
  if (b.editar) {
    const ev = await env.DB.prepare("SELECT * FROM eventos WHERE id = ? AND empresa_id = ? AND anulado = 0").bind(int(b.id), E(u)).first();
    if (!ev || !sucs.includes(ev.sucursal_id)) return err("Registro no encontrado", 404);
    const propio = ev.usuario_id === u.id && Date.now() - new Date(ev.creado.replace(" ", "T") + "Z").getTime() < 24 * 3600e3;
    if (!puede(u, "reportes") && !propio) return err("Solo un supervisor puede corregir registros de más de 24 horas", 403);
    const v = await env.DB.prepare("SELECT * FROM vehiculos WHERE id = ?").bind(ev.vehiculo_id).first();
    const c = validar(ev.tipo, b, v); if (c.error) return err(c.error);
    const pr = await resolverProveedor(env, E(u), ev.tipo, b, ev.proveedor); if (pr.error) return err(pr.error); c.proveedor = pr.nombre;
    const fechaLocal = new Date(new Date(ev.fecha).getTime() + (u.tz ?? -4) * 3600e3).toISOString().slice(0, 10);
    const fecha = esFecha(b.fecha) && b.fecha !== fechaLocal ? mediodia(b.fecha, u.tz) : ev.fecha;
    let cid = ev.conductor_id; // conductor del registro (quién manejaba)
    if (b.conductor_id !== undefined) { const x = int(b.conductor_id) || null; cid = x && !(await env.DB.prepare("SELECT 1 FROM conductores WHERE id = ? AND empresa_id = ?").bind(x, E(u)).first()) ? ev.conductor_id : x; }
    // se conservan las alertas que no dependen de los datos editados; el rendimiento se recalcula después
    const viejas = (ev.alerta || "").split(" · ").filter(s => s && !/^Cargó |^Rendimiento /.test(s));
    await env.DB.prepare(`UPDATE eventos SET km=?, litros=?, monto=?, lleno=?, proveedor=?, detalle=?, categoria=?, fecha=?, alerta=?, factura=?, conductor_id=? WHERE id=?`)
      .bind(c.km, c.litros, c.monto, c.lleno, c.proveedor, c.detalle, c.categoria, fecha, [...viejas, ...c.alertas].join(" · ") || null, c.factura, cid, ev.id).run();
    await recalcularVehiculo(env, ev.vehiculo_id);
    return json({ ok: true });
  }
  // ---------- registrar ----------
  const tipo = b.tipo; if (!TIPOS.includes(tipo)) return err("Tipo de registro no válido");
  if (tipo === "mantenimiento" ? !puede(u, "mantenimiento") : !puede(u, "registrar")) return err("No tienes permiso para este registro", 403);
  const v = await env.DB.prepare("SELECT * FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(int(b.vehiculo_id), E(u)).first();
  if (!v || !sucs.includes(v.sucursal_id)) return err("Vehículo no encontrado", 404);
  if (v.estado === "baja") return err("Ese vehículo está dado de baja");
  if (u.foto_obligatoria && ["combustible", "mantenimiento"].includes(tipo) && !b.foto1) return err("Tu empresa exige la foto de la factura en este registro. Tómala o elige el archivo antes de guardar.");
  const c = validar(tipo, b, v); if (c.error) return err(c.error);
  let cid = u.conductor_id || v.conductor_id; // quién manejaba: el conductor enlazado al usuario, o el asignado al vehículo
  if (b.conductor_id !== undefined && b.conductor_id !== null) { const x = int(b.conductor_id) || null; cid = !x ? null : (await env.DB.prepare("SELECT 1 FROM conductores WHERE id = ? AND empresa_id = ?").bind(x, E(u)).first()) ? x : v.conductor_id; }
  const pr = await resolverProveedor(env, E(u), tipo, b); if (pr.error) return err(pr.error); c.proveedor = pr.nombre;
  const { km, litros, monto, lleno, alertas } = c;
  if (km != null && km < v.km_actual - 1) { if (!b.confirmar_km) return err(`El kilometraje (${km}) es menor al último registrado (${v.km_actual}). Revisa el odómetro.`, 409); alertas.push(`Km menor al anterior (${v.km_actual})`); }
  if (km != null && km > v.km_actual + 3000 && v.km_actual > 0 && !b.confirmar_km) return err(`Son ${Math.round(km - v.km_actual)} km más que el último registro. ¿Es correcto? Confírmalo para guardar.`, 409);
  let rendimiento = null;
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
  const fecha = esFecha(b.fecha) && b.fecha !== hoyTZ(u.tz) ? mediodia(b.fecha, u.tz) : new Date().toISOString();
  const st = [env.DB.prepare(`INSERT INTO eventos(empresa_id, sucursal_id, vehiculo_id, tipo, fecha, km, litros, monto, lleno, proveedor, detalle, categoria, plan_id, foto1, foto2, conductor_id, usuario_id, rendimiento, alerta, plan_km_antes, plan_fecha_antes, factura)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(E(u), v.sucursal_id, v.id, tipo, fecha, km, litros, monto, lleno, c.proveedor, c.detalle, c.categoria, plan?.id ?? null, f1, f2, cid, u.id, rendimiento, alertas.join(" · ") || null,
      plan ? plan.ultimo_km : null, plan ? plan.ultima_fecha : null, c.factura)];
  if (km != null && km > v.km_actual) st.push(env.DB.prepare("UPDATE vehiculos SET km_actual = ? WHERE id = ?").bind(km, v.id));
  if (plan) st.push(env.DB.prepare("UPDATE planes SET ultimo_km = ?, ultima_fecha = ? WHERE id = ?").bind(km ?? v.km_actual, fecha.slice(0, 10), plan.id));
  const r = await env.DB.batch(st);
  if (Math.random() < 0.05) { const emp = await env.DB.prepare(PERFIL_EMPRESA).bind(E(u)).first(); await limpiarFotos(env, E(u), emp.retencion_fotos); }
  return json({ ok: true, id: r[0].meta.last_row_id, rendimiento, alertas });
}
