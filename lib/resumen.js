// Resumen diario de una empresa (mantenimientos vencidos y próximos, documentos, presupuestos superados, repuestos bajo mínimo)
// y envío de correo. Lo usan el recordatorio automático y el botón de prueba en Empresa.
import { estadoPlan, estadoDoc, hoyTZ, tzSql } from "./db.js";
export async function resumenEmpresa(env, e, sucs = null) { // e: fila de empresas (id, nombre, tz, doc1, doc2, moneda); sucs: solo esos parqueos (null = todos)
  const hoy = hoyTZ(e.tz), mes = hoy.slice(0, 7), off = tzSql(e.tz), fs = sucs && sucs.length ? ` AND v.sucursal_id IN (${sucs.map(() => "?").join(",")})` : "";
  const [veh, pla, rep, gm, gv] = await env.DB.batch([
    env.DB.prepare(`SELECT v.*, s.nombre AS sucursal, s.presupuesto_mes AS pres_suc, c.nombre AS conductor, c.licencia_vence FROM vehiculos v JOIN sucursales s ON s.id = v.sucursal_id
      LEFT JOIN conductores c ON c.id = v.conductor_id WHERE v.empresa_id = ? AND v.estado <> 'baja'${fs} ORDER BY v.placa`).bind(e.id, ...(fs ? sucs : [])),
    env.DB.prepare("SELECT * FROM planes WHERE empresa_id = ? AND activo = 1").bind(e.id),
    env.DB.prepare("SELECT nombre, stock, minimo, unidad FROM repuestos WHERE empresa_id = ? AND activo = 1 AND minimo > 0 AND stock <= minimo ORDER BY nombre").bind(e.id),
    env.DB.prepare("SELECT sucursal_id, SUM(monto) AS total FROM eventos WHERE empresa_id = ? AND anulado = 0 AND substr(datetime(fecha, ?), 1, 7) = ? GROUP BY sucursal_id").bind(e.id, off, mes),
    env.DB.prepare("SELECT vehiculo_id, SUM(monto) AS total FROM eventos WHERE empresa_id = ? AND anulado = 0 AND substr(datetime(fecha, ?), 1, 7) = ? GROUP BY vehiculo_id").bind(e.id, off, mes)]);
  const vencidos = [], proximos = [], documentos = [], presupuestos = [], mon = e.moneda || "Bs";
  const nom = { soat_vence: e.doc1 || "SOAT", itv_vence: e.doc2 || "Inspección técnica", seguro_vence: "Seguro", licencia_vence: "Licencia" };
  for (const v of veh.results) {
    for (const p of pla.results.filter(x => x.vehiculo_id === v.id)) {
      const s = estadoPlan(p, v.km_actual, hoy);
      const t = `${v.placa}: ${p.nombre}${s.faltaKm != null ? ` (${s.faltaKm <= 0 ? "pasado " + Math.round(-s.faltaKm) : "faltan " + Math.round(s.faltaKm)} km)` : ""}${s.faltaDias != null ? ` (${s.faltaDias <= 0 ? "venció hace " + -s.faltaDias : "en " + s.faltaDias} días)` : ""}`;
      if (s.estado === "vencido") vencidos.push(t); else if (s.estado === "proximo") proximos.push(t);
    }
    for (const k of Object.keys(nom)) { const d = estadoDoc(v[k], hoy); if (d && d.estado !== "ok" && d.dias <= 15) documentos.push(`${v.placa}: ${nom[k]}${k === "licencia_vence" && v.conductor ? " de " + v.conductor : ""} ${d.estado === "vencido" ? `vencido hace ${-d.dias} días` : `vence en ${d.dias} días`}`); }
    const g = gv.results.find(x => x.vehiculo_id === v.id);
    if (v.presupuesto_mes > 0 && g && g.total > v.presupuesto_mes) presupuestos.push(`${v.placa}: ${mon} ${Math.round(g.total)} de ${Math.round(v.presupuesto_mes)} (${Math.round(g.total / v.presupuesto_mes * 100)}%)`);
  }
  const porSuc = new Map(); for (const v of veh.results) porSuc.set(v.sucursal_id, { nombre: v.sucursal, pres: v.pres_suc });
  for (const [sid, s] of porSuc) { const g = gm.results.find(x => x.sucursal_id === sid); if (s.pres > 0 && g && g.total > s.pres) presupuestos.push(`Parqueo ${s.nombre}: ${mon} ${Math.round(g.total)} de ${Math.round(s.pres)} (${Math.round(g.total / s.pres * 100)}%)`); }
  const repuestos = rep.results.map(r => `${r.nombre}: quedan ${r.stock} ${r.unidad} (mínimo ${r.minimo})`);
  const L = [`${e.nombre} · Resumen de flota al ${hoy}`];
  if (vencidos.length) L.push("", `⛔ Mantenimientos vencidos (${vencidos.length})`, ...vencidos.map(x => "• " + x));
  if (proximos.length) L.push("", `🔧 Mantenimientos próximos (${proximos.length})`, ...proximos.map(x => "• " + x));
  if (documentos.length) L.push("", `📄 Documentos (${documentos.length})`, ...documentos.map(x => "• " + x));
  if (presupuestos.length) L.push("", `💸 Presupuesto del mes superado (${presupuestos.length})`, ...presupuestos.map(x => "• " + x));
  if (repuestos.length) L.push("", `📦 Repuestos bajo mínimo (${repuestos.length})`, ...repuestos.map(x => "• " + x));
  const pendientes = vencidos.length + proximos.length + documentos.length + presupuestos.length + repuestos.length;
  if (!pendientes) L.push("", "✅ Sin pendientes. Todo al día.");
  return { hoy, texto: L.join("\n"), pendientes, vencidos, proximos, documentos, presupuestos, repuestos };
}
// Correo por Resend (https://resend.com). Requiere las variables RESEND_KEY y MAIL_FROM en Cloudflare.
export async function enviarCorreo(env, para, asunto, texto) {
  if (!env.RESEND_KEY || !env.MAIL_FROM) return { ok: false, error: "El envío de correo no está configurado en el servidor (variables RESEND_KEY y MAIL_FROM)" };
  const to = String(para || "").split(/[,;\s]+/).filter(Boolean); if (!to.length) return { ok: false, error: "No hay correo de destino" };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject: asunto, text: texto }) });
  if (!r.ok) return { ok: false, error: "El servicio de correo respondió " + r.status + ": " + (await r.text()).slice(0, 200) };
  return { ok: true };
}
