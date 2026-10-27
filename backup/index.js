// Worker "flota-backup": copia diaria de la base D1 de FlotaControl a un bucket R2 propio (flota-backups).
// Cada día a la hora del cron genera un archivo SQL (estructura + datos), lo comprime en gzip y lo guarda como
// diario/AAAA-MM-DD.sql.gz. El día 1 de cada mes guarda además mensual/AAAA-MM.sql.gz. Borra los diarios de más de DIAS_DIARIOS días
// y los mensuales de más de MESES_MENSUALES meses.
// Restaurar (en una base nueva o la misma):  npx wrangler d1 execute <base> --remote --file AAAA-MM-DD.sql   (descomprimido)
// GET /?key=BACKUP_KEY → genera un backup ahora y devuelve el resumen | GET /lista?key= → backups guardados | GET /bajar/<archivo>?key= → descarga
const DIAS_DIARIOS = 90, MESES_MENSUALES = 12, LOTE = 500;
const SIN_DATOS = new Set(["sesiones", "intentos"]); // pasajeras: se guarda la tabla vacía (al restaurar todos vuelven a iniciar sesión)

const lit = v => v === null || v === undefined ? "NULL" : typeof v === "number" ? (isFinite(v) ? String(v) : "NULL")
  : v instanceof ArrayBuffer ? "X'" + [...new Uint8Array(v)].map(b => b.toString(16).padStart(2, "0")).join("") + "'"
  : "'" + String(v).replace(/'/g, "''") + "'";
const nom = n => '"' + String(n).replace(/"/g, '""') + '"';

export async function generar(env) {
  const { results: obj } = await env.DB.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type = 'table' DESC, name").all();
  const partes = [`-- Backup de FlotaControl ${new Date().toISOString()}\n`], filas = {};
  for (const t of obj.filter(o => o.type === "table")) {
    partes.push(`\nDROP TABLE IF EXISTS ${nom(t.name)};\n${t.sql};\n`); filas[t.name] = 0;
    if (SIN_DATOS.has(t.name)) continue;
    for (let desde = 0; ; desde += LOTE) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${nom(t.name)} ORDER BY rowid LIMIT ? OFFSET ?`).bind(LOTE, desde).all();
      if (!results.length) break;
      const cols = Object.keys(results[0]).map(nom).join(", ");
      for (const r of results) partes.push(`INSERT INTO ${nom(t.name)} (${cols}) VALUES (${Object.values(r).map(lit).join(", ")});\n`);
      filas[t.name] += results.length; if (results.length < LOTE) break;
    }
  }
  for (const i of obj.filter(o => o.type !== "table")) partes.push(`${i.sql};\n`); // índices y vistas al final
  const sql = new Blob(partes), gz = await new Response(sql.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return { gz, filas, bytes_sql: sql.size, bytes_gz: gz.byteLength };
}

const hoyBO = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); // hora de Bolivia

export async function respaldar(env) {
  const dia = hoyBO(), b = await generar(env), meta = { customMetadata: { filas: JSON.stringify(b.filas), bytes_sql: String(b.bytes_sql) }, httpMetadata: { contentType: "application/gzip" } };
  await env.BACKUPS.put(`diario/${dia}.sql.gz`, b.gz, meta);
  if (dia.endsWith("-01")) await env.BACKUPS.put(`mensual/${dia.slice(0, 7)}.sql.gz`, b.gz, meta);
  // limpieza: solo dentro de este bucket de backups y solo por antigüedad
  const borrar = [], limD = new Date(Date.now() - DIAS_DIARIOS * 864e5).toISOString().slice(0, 10), limM = new Date(Date.now() - MESES_MENSUALES * 31 * 864e5).toISOString().slice(0, 7);
  for (const [pre, lim, largo] of [["diario/", limD, 10], ["mensual/", limM, 7]]) {
    let cursor; do { const l = await env.BACKUPS.list({ prefix: pre, cursor }); cursor = l.truncated ? l.cursor : null;
      for (const o of l.objects) { const f = o.key.slice(pre.length, pre.length + largo); if (f < lim) borrar.push(o.key); } } while (cursor);
  }
  if (borrar.length) await env.BACKUPS.delete(borrar);
  const res = { ok: true, archivo: `diario/${dia}.sql.gz`, bytes_sql: b.bytes_sql, bytes_gz: b.bytes_gz, filas: b.filas, borrados: borrar };
  await env.BACKUPS.put("ultimo.json", JSON.stringify({ ...res, fecha: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
  return res;
}

const json = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });
function igual(a, b) { a = String(a); b = String(b); if (!b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

export default {
  async scheduled(evento, env, ctx) { ctx.waitUntil(respaldar(env)); },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.BACKUP_KEY || !igual(url.searchParams.get("key") || "", env.BACKUP_KEY)) return json({ ok: false, error: "No autorizado" }, 401);
    try {
      if (url.pathname === "/lista") { const out = []; for (const pre of ["diario/", "mensual/"]) { let cursor; do { const l = await env.BACKUPS.list({ prefix: pre, cursor }); cursor = l.truncated ? l.cursor : null; out.push(...l.objects.map(o => ({ archivo: o.key, bytes: o.size, fecha: o.uploaded }))); } while (cursor); }
        return json({ ok: true, backups: out.sort((a, b) => b.archivo.localeCompare(a.archivo)) }); }
      if (url.pathname.startsWith("/bajar/")) { const k = decodeURIComponent(url.pathname.slice(7)); if (!/^(diario|mensual)\/[\d-]+\.sql\.gz$/.test(k)) return json({ ok: false, error: "Archivo no válido" }, 400);
        const o = await env.BACKUPS.get(k); if (!o) return json({ ok: false, error: "No existe" }, 404);
        return new Response(o.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="flota-${k.replace("/", "-")}"` } }); }
      return json(await respaldar(env));
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
  }
};
