// Lectura del QR de una factura electrónica SIAT (Bolivia). POST {qr: texto del QR, tipo?: tipo de registro}
// El QR trae nit, cuf y numero; el monto, la fecha, el emisor y el detalle se consultan al servicio público del SIN
// (el mismo que usa su página de verificación). Devuelve la factura, el proveedor de la empresa con ese NIT y si ya fue registrada.
import { json, err, txt, int, num, sesion, puede, TIPOS_PROV, E } from "../../lib/db.js";
const SIN = "https://siatrest.impuestos.gob.bo/sre-sfe-shared-v2-rest/consulta/factura";
export function leerQR(texto) {
  const s = String(texto || "").trim(); let q = null;
  try { q = new URL(s).searchParams; } catch (e) { try { q = new URLSearchParams(s.replace(/^\?/, "")); } catch (x) { q = null; } }
  const nit = txt(q?.get("nit"), 20).replace(/\D/g, ""), cuf = txt(q?.get("cuf"), 120).replace(/[^0-9A-Fa-f]/g, ""), numero = txt(q?.get("numero"), 20).replace(/\D/g, "");
  if (!nit || !cuf || !numero) return null;
  return { nit, cuf: cuf.toUpperCase(), numero };
}
const fechaISO = f => { const s = String(f || ""); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); };
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  if (!puede(u, "registrar") && !puede(u, "mantenimiento") && !puede(u, "reportes")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({})), q = leerQR(b.qr);
  if (!q) return err("Ese QR no es de una factura electrónica del SIN (debe traer nit, cuf y número)");
  let r; try {
    const resp = await fetch(SIN, { method: "PUT", headers: { "content-type": "application/json", accept: "application/json", origin: "https://siat.impuestos.gob.bo", referer: "https://siat.impuestos.gob.bo/consulta/QR" },
      body: JSON.stringify({ nitEmisor: Number(q.nit), cuf: q.cuf, numeroFactura: Number(q.numero) }), signal: AbortSignal.timeout(10000) });
    r = await resp.json();
  } catch (e) { return err("No se pudo consultar al SIN en este momento. Escribe los datos a mano.", 502); }
  if (!r || !r.transaccion || !r.objeto) return err("El SIN no reconoce esta factura" + (r?.mensajes?.[0]?.descripcion ? ": " + txt(r.mensajes[0].descripcion, 120).trim() : ""), 404);
  const o = r.objeto, det = Array.isArray(o.listaDetalle) ? o.listaDetalle : [];
  const detalle = det.map(d => ({ descripcion: txt(d.descripcion || d.descripcionProducto || d.producto, 120), cantidad: num(d.cantidad), precio: num(d.precioUnitario), subtotal: num(d.subTotal ?? d.subtotal ?? d.montoTotal) }));
  const comb = detalle.filter(d => /gasolina|di[eé]sel|gnv|gas natural|combustible|especial|premium/i.test(d.descripcion));
  const factura = { nit: q.nit, numero: q.numero, cuf: q.cuf, fecha: fechaISO(o.fechaEmision), monto: Math.round(num(o.montoTotal) * 100) / 100, estado: txt(o.estadoFactura, 40), emisor: txt(o.razonSocialEmisor, 120),
    cliente: txt(o.nombreRazonSocial, 120), cliente_doc: txt(o.numeroDocumento, 30), litros: comb.length ? Math.round(comb.reduce((a, d) => a + d.cantidad, 0) * 100) / 100 : null, detalle };
  const tp = TIPOS_PROV[b.tipo] || null;
  const prov = await env.DB.prepare(`SELECT id, nombre, tipo FROM proveedores WHERE empresa_id = ? AND activo = 1 AND nit = ?${tp ? " AND tipo = ?" : ""} ORDER BY id LIMIT 1`).bind(E(u), q.nit, ...(tp ? [tp] : [])).first();
  const dup = await env.DB.prepare("SELECT e.id, e.fecha, v.placa FROM eventos e JOIN vehiculos v ON v.id = e.vehiculo_id WHERE e.empresa_id = ? AND e.cuf = ? AND e.anulado = 0").bind(E(u), q.cuf).first();
  return json({ ok: true, factura, proveedor: prov || null, duplicado: dup ? { id: dup.id, fecha: dup.fecha, placa: dup.placa } : null, valida: /valid|vigente/i.test(factura.estado) && !/anulad|invalid|no valid/i.test(factura.estado) });
}
