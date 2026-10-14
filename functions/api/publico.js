// Ficha pública de un vehículo al escanear su QR, sin usuario: datos básicos, planes de mantenimiento, documentos y últimos trabajos.
// GET ?v=codigo. Solo si la empresa tiene activada la ficha pública (Empresa → "Ficha pública al escanear el QR").
import { json, err, txt, estadoPlan, estadoDoc, hoyTZ, tzSql } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const cod = txt(new URL(request.url).searchParams.get("v"), 20).toLowerCase(); if (!/^[a-f0-9]{6,20}$/.test(cod)) return err("Código no válido");
  const v = await env.DB.prepare(`SELECT v.*, e.nombre AS empresa, e.whatsapp, e.ficha_publica, e.activo AS e_activo, e.tz, e.doc1, e.doc2, c.nombre AS conductor
    FROM vehiculos v JOIN empresas e ON e.id = v.empresa_id LEFT JOIN conductores c ON c.id = v.conductor_id WHERE v.codigo = ?`).bind(cod).first();
  if (!v || !v.e_activo) return err("Vehículo no encontrado", 404);
  if (!v.ficha_publica) return err("Esta empresa no comparte la ficha pública del vehículo. Inicia sesión para verlo.", 403);
  const hoy = hoyTZ(v.tz);
  const [pla, man] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM planes WHERE vehiculo_id = ? AND activo = 1 ORDER BY id").bind(v.id),
    env.DB.prepare(`SELECT substr(datetime(e.fecha, ?), 1, 10) AS fecha, e.km, e.proveedor, e.detalle, p.nombre AS plan FROM eventos e LEFT JOIN planes p ON p.id = e.plan_id
      WHERE e.vehiculo_id = ? AND e.tipo = 'mantenimiento' AND e.anulado = 0 ORDER BY e.fecha DESC LIMIT 10`).bind(tzSql(v.tz), v.id)]);
  const planes = pla.results.map(p => ({ nombre: p.nombre, cada_km: p.cada_km, cada_dias: p.cada_dias, ultimo_km: p.ultimo_km, ultima_fecha: p.ultima_fecha, ...estadoPlan(p, v.km_actual, hoy) }));
  const documentos = [[v.doc1 || "SOAT", v.soat_vence], [v.doc2 || "Inspección técnica", v.itv_vence], ["Seguro", v.seguro_vence]].filter(d => d[1]).map(([nombre, fecha]) => ({ nombre, fecha, ...(estadoDoc(fecha, hoy) || {}) }));
  return json({ ok: true, hoy, empresa: v.empresa, whatsapp: v.whatsapp, vehiculo: { placa: v.placa, marca: v.marca, modelo: v.modelo, anio: v.anio, tipo: v.tipo, combustible: v.combustible, km_actual: v.km_actual, conductor: v.conductor, estado: v.estado },
    planes, documentos, mantenimientos: man.results });
}
