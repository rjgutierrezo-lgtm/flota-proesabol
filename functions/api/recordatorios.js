// Recordatorio diario por correo con el resumen de la flota.
// GET ?key=CRON_KEY → lo envía a todas las empresas con correo de avisos (lo llama un cron externo una vez al día; no repite si ya se envió hoy).
// POST {probar:true} (permiso "usuarios") → genera el resumen de la empresa, lo envía al correo configurado y devuelve el texto.
// GET ?historial=1 (permiso "usuarios") → últimos envíos de la empresa.
import { json, err, int, sesion, puede, sameStr, hoyTZ, bloqueo, PERFIL_EMPRESA, E } from "../../lib/db.js";
import { resumenEmpresa, enviarCorreo } from "../../lib/resumen.js";
async function procesar(env, e, canal) {
  const R = await resumenEmpresa(env, e);
  const asunto = `${e.nombre}: ${R.pendientes ? R.pendientes + " pendientes de flota" : "flota al día"} · ${R.hoy}`;
  const envio = e.email_avisos ? await enviarCorreo(env, e.email_avisos, asunto, R.texto) : { ok: false, error: "La empresa no tiene correo de avisos configurado" };
  await env.DB.prepare("INSERT INTO recordatorios(empresa_id, fecha, canal, destino, resumen, ok) VALUES(?,?,?,?,?,?)").bind(e.id, R.hoy, canal, e.email_avisos || "", R.texto, envio.ok ? 1 : 0).run();
  return { ...R, enviado: envio.ok, error: envio.error || null };
}
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("historial")) {
    const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
    const { results } = await env.DB.prepare("SELECT id, fecha, canal, destino, ok, creado FROM recordatorios WHERE empresa_id = ? ORDER BY id DESC LIMIT ?").bind(E(u), Math.min(50, int(q.get("historial")) || 10)).all();
    return json({ ok: true, envios: results });
  }
  const key = q.get("key") || "", esperada = env.CRON_KEY || env.SETUP_KEY || "";
  if (!esperada || !sameStr(key, esperada)) return err("Clave incorrecta", 401);
  const { results } = await env.DB.prepare("SELECT * FROM empresas WHERE activo = 1 AND trim(COALESCE(email_avisos, '')) <> ''").all();
  const out = [];
  for (const e of results) {
    if (bloqueo(e)) { out.push({ empresa: e.nombre, enviado: false, motivo: "suscripción vencida" }); continue; }
    const hoy = hoyTZ(e.tz);
    const ya = await env.DB.prepare("SELECT 1 FROM recordatorios WHERE empresa_id = ? AND fecha = ? AND canal = 'cron' AND ok = 1").bind(e.id, hoy).first();
    if (ya) { out.push({ empresa: e.nombre, enviado: false, motivo: "ya enviado hoy" }); continue; }
    try { const r = await procesar(env, e, "cron"); out.push({ empresa: e.nombre, enviado: r.enviado, pendientes: r.pendientes, error: r.error }); }
    catch (x) { out.push({ empresa: e.nombre, enviado: false, error: String(x.message || x) }); }
  }
  return json({ ok: true, empresas: out.length, enviados: out.filter(x => x.enviado).length, detalle: out });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const e = await env.DB.prepare(PERFIL_EMPRESA).bind(E(u)).first(), b = await request.json().catch(() => ({}));
  const r = b.enviar === false ? { ...(await resumenEmpresa(env, e)), enviado: false, error: null } : await procesar(env, e, "prueba");
  return json({ ok: true, texto: r.texto, pendientes: r.pendientes, enviado: r.enviado, error: r.error, correo: e.email_avisos || "" });
}
