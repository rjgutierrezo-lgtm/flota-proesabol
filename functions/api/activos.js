// Llantas y baterías de cada vehículo. GET ?vehiculo_id= (o todos los de mis parqueos) | POST crear/editar | POST {id, retirar:true, km_retiro, fecha_retiro, motivo}
// Administran: permiso "mantenimiento" o "vehiculos". Al instalar con costo, el gasto se registra en el vehículo (salvo registrar_gasto:false).
import { json, err, txt, int, num, sesion, puede, misSucursales, esFecha, hoyTZ, mediodia, estadoActivo, NOM_ACTIVO, E } from "../../lib/db.js";
const TIPOS = Object.keys(NOM_ACTIVO);
function campos(b, base) {
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : "llanta";
  return [tipo, txt(b.marca, 60), txt(b.detalle, 80), txt(b.posicion, 40), esFecha(b.fecha_instalacion) ? b.fecha_instalacion : base.fecha_instalacion,
    b.km_instalacion === "" || b.km_instalacion == null ? (base.km_instalacion || 0) : Math.max(0, num(b.km_instalacion)),
    Math.max(0, num(b.costo)), Math.max(0, num(b.vida_km)), Math.max(0, int(b.vida_meses)), txt(b.nota, 200)];
}
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const sucs = (await misSucursales(env, u)).map(s => s.id); if (!sucs.length) return json({ ok: true, activos: [] });
  const vid = int(new URL(request.url).searchParams.get("vehiculo_id")), hoy = hoyTZ(u.tz);
  const { results } = await env.DB.prepare(`SELECT a.*, v.placa, v.km_actual FROM activos a JOIN vehiculos v ON v.id = a.vehiculo_id WHERE a.empresa_id = ? AND v.sucursal_id IN (${sucs.map(() => "?").join(",")})${vid ? " AND a.vehiculo_id = ?" : ""}
    ORDER BY a.estado = 'retirado', a.tipo, a.posicion, a.id`).bind(E(u), ...sucs, ...(vid ? [vid] : [])).all();
  return json({ ok: true, activos: results.map(a => ({ ...a, ...estadoActivo(a, a.km_actual, hoy) })) });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "mantenimiento") && !puede(u, "vehiculos")) return err("Sin permiso para llantas y baterías", 403);
  const b = await request.json().catch(() => ({})), sucs = (await misSucursales(env, u)).map(s => s.id);
  if (b.id) {
    const a = await env.DB.prepare("SELECT a.*, v.sucursal_id, v.km_actual FROM activos a JOIN vehiculos v ON v.id = a.vehiculo_id WHERE a.id = ? AND a.empresa_id = ?").bind(int(b.id), E(u)).first();
    if (!a || !sucs.includes(a.sucursal_id)) return err("No encontrado", 404);
    if (b.retirar) {
      const km = b.km_retiro === "" || b.km_retiro == null ? a.km_actual : Math.max(0, num(b.km_retiro)), f = esFecha(b.fecha_retiro) ? b.fecha_retiro : hoyTZ(u.tz);
      await env.DB.prepare("UPDATE activos SET estado = 'retirado', km_retiro = ?, fecha_retiro = ?, motivo_retiro = ? WHERE id = ?").bind(km, f, txt(b.motivo, 120), a.id).run();
      return json({ ok: true });
    }
    await env.DB.prepare("UPDATE activos SET tipo=?, marca=?, detalle=?, posicion=?, fecha_instalacion=?, km_instalacion=?, costo=?, vida_km=?, vida_meses=?, nota=? WHERE id=?").bind(...campos(b, a), a.id).run();
    return json({ ok: true });
  }
  const v = await env.DB.prepare("SELECT * FROM vehiculos WHERE id = ? AND empresa_id = ?").bind(int(b.vehiculo_id), E(u)).first();
  if (!v || !sucs.includes(v.sucursal_id)) return err("Vehículo no encontrado", 404);
  const c = campos(b, { fecha_instalacion: hoyTZ(u.tz), km_instalacion: v.km_actual }), costo = c[6];
  const st = [env.DB.prepare("INSERT INTO activos(empresa_id, vehiculo_id, tipo, marca, detalle, posicion, fecha_instalacion, km_instalacion, costo, vida_km, vida_meses, nota) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(E(u), v.id, ...c)];
  const gasto = costo > 0 && b.registrar_gasto !== false;
  if (gasto) st.push(env.DB.prepare(`INSERT INTO eventos(empresa_id, sucursal_id, vehiculo_id, tipo, fecha, km, monto, lleno, proveedor, detalle, categoria, conductor_id, usuario_id, factura)
      VALUES(?,?,?,'gasto',?,?,?,0,?,?,?,?,?,?)`).bind(E(u), v.sucursal_id, v.id, mediodia(c[4], u.tz), c[5], costo, txt(b.proveedor, 80),
      `${NOM_ACTIVO[c[0]]}${c[1] ? " " + c[1] : ""}${c[2] ? " " + c[2] : ""}${c[3] ? " (" + c[3] + ")" : ""}`.slice(0, 300), c[0] === "llanta" ? "Llantas" : "Repuesto", v.conductor_id, u.id, txt(b.factura, 40)));
  const r = await env.DB.batch(st);
  return json({ ok: true, id: r[0].meta.last_row_id, gasto });
}
