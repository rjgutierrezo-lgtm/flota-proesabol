// Worker "flota-backup": copia diaria de la base D1 de FlotaControl. Destinos (uno o los dos):
//  - GitHub (GITHUB_TOKEN + GITHUB_REPO "dueño/repo", repo PRIVADO solo para backups): datos/AAAA-MM-DD.sql.gz.enc cifrado con BACKUP_CLAVE
//    (AES-256-GCM) y cada foto de la base una sola vez en fotos/<clave de la foto> (las fotos no se cifran: son jpg del surtidor, odómetro o factura).
//  - R2 (binding BACKUPS): diario/AAAA-MM-DD.sql.gz (90 días), mensual/AAAA-MM.sql.gz (12 meses) y fotos/<clave>.
// El SQL lleva la estructura y los datos de todas las tablas; la tabla de fotos va vacía porque las fotos se copian aparte.
// Restaurar: node restaurar.mjs (ver LEEME.md) y luego  npx wrangler d1 execute <base> --remote --file restaurar.sql
// GET /?key=BACKUP_KEY → backup ahora | GET /lista?key= y /bajar/<archivo>?key= → backups en R2
const DIAS_DIARIOS = 90, MESES_MENSUALES = 12, LOTE = 500, FOTOS_POR_VEZ = 40;
const SIN_DATOS = new Set(["sesiones", "intentos", "fotos"]); // sesiones e intentos son pasajeros; las fotos se copian aparte

const lit = v => v === null || v === undefined ? "NULL" : typeof v === "number" ? (isFinite(v) ? String(v) : "NULL")
  : v instanceof ArrayBuffer ? "X'" + [...new Uint8Array(v)].map(b => b.toString(16).padStart(2, "0")).join("") + "'"
  : "'" + String(v).replace(/'/g, "''") + "'";
const nom = n => '"' + String(n).replace(/"/g, '""') + '"';

export async function generar(env) {
  const { results: obj } = await env.DB.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type = 'table' DESC, name").all();
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
  for (const i of obj.filter(o => o.type !== "table")) partes.push(`${i.sql};\n`); // índices al final
  const sql = new Blob(partes), gz = await new Response(sql.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return { gz, filas, bytes_sql: sql.size, bytes_gz: gz.byteLength };
}

// Cifrado: "FLB1" + iv (12 bytes) + AES-256-GCM. La clave es SHA-256 de BACKUP_CLAVE (usa una frase larga y guárdala aparte).
async function clave(env) { return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.BACKUP_CLAVE)), "AES-GCM", false, ["encrypt"]); }
async function cifrar(env, datos) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await clave(env), datos));
  const out = new Uint8Array(4 + 12 + c.length); out.set(new TextEncoder().encode("FLB1")); out.set(iv, 4); out.set(c, 16); return out;
}
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

// ---------- GitHub ----------
async function gh(env, metodo, ruta, cuerpo) {
  const r = await fetch(`${env.GITHUB_API || "https://api.github.com"}/repos/${env.GITHUB_REPO}${ruta}`, { method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json", "user-agent": "flota-backup", "x-github-api-version": "2022-11-28", ...(cuerpo ? { "content-type": "application/json" } : {}) } });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`GitHub ${r.status} en ${ruta.split("?")[0]}: ${j.message || ""}`); return j;
}
async function aGitHub(env, dia, b) {
  if (!env.BACKUP_CLAVE || String(env.BACKUP_CLAVE).length < 16) throw new Error("Falta el secreto BACKUP_CLAVE (mínimo 16 caracteres) para cifrar el backup");
  const repo = await gh(env, "GET", ""), rama = repo.default_branch || "main";
  // repo recién creado sin archivos: GitHub responde 409 y se empieza con la lista vacía (el primer archivo crea la rama)
  const arbol = await gh(env, "GET", `/git/trees/${encodeURIComponent(rama)}?recursive=1`).catch(e => { if (/GitHub 409/.test(e.message)) return { tree: [] }; throw e; }), hay = new Map((arbol.tree || []).filter(x => x.type === "blob").map(x => [x.path, x.sha]));
  const ruta = `datos/${dia}.sql.gz.enc`;
  await gh(env, "PUT", `/contents/${ruta}`, { message: `Backup ${dia}`, branch: rama, content: b64(await cifrar(env, b.gz)), ...(hay.has(ruta) ? { sha: hay.get(ruta) } : {}) });
  // fotos guardadas en la base: cada una se sube una sola vez (ya vienen en base64, no se procesan)
  let subidas = 0, pendientes = 0;
  const { results: ks } = await env.DB.prepare("SELECT k FROM fotos ORDER BY creado").all();
  for (const { k } of ks) {
    if (hay.has("fotos/" + k)) continue; if (subidas >= FOTOS_POR_VEZ) { pendientes++; continue; }
    const f = await env.DB.prepare("SELECT data FROM fotos WHERE k = ?").bind(k).first(), m = /^data:[^;]+;base64,(.+)$/.exec(f?.data || ""); if (!m) continue;
    await gh(env, "PUT", `/contents/fotos/${k.split("/").map(encodeURIComponent).join("/")}`, { message: `Foto ${k}`, branch: rama, content: m[1] }); subidas++;
  }
  return { archivo: ruta, fotos_subidas: subidas, fotos_pendientes: pendientes };
}

// ---------- R2 ----------
async function aR2(env, dia, b) {
  const meta = { customMetadata: { filas: JSON.stringify(b.filas), bytes_sql: String(b.bytes_sql) }, httpMetadata: { contentType: "application/gzip" } };
  await env.BACKUPS.put(`diario/${dia}.sql.gz`, b.gz, meta);
  if (dia.endsWith("-01")) await env.BACKUPS.put(`mensual/${dia.slice(0, 7)}.sql.gz`, b.gz, meta);
  let subidas = 0, pendientes = 0; const { results: ks } = await env.DB.prepare("SELECT k FROM fotos ORDER BY creado").all();
  for (const { k } of ks) { if (await env.BACKUPS.head("fotos/" + k)) continue; if (subidas >= FOTOS_POR_VEZ) { pendientes++; continue; }
    const f = await env.DB.prepare("SELECT data FROM fotos WHERE k = ?").bind(k).first(), m = /^data:([^;]+);base64,(.+)$/.exec(f?.data || ""); if (!m) continue;
    await env.BACKUPS.put("fotos/" + k, Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)), { httpMetadata: { contentType: m[1] } }); subidas++; }
  // limpieza: solo dentro de este bucket y solo por antigüedad (las fotos no se borran)
  const borrar = [], limD = new Date(Date.now() - DIAS_DIARIOS * 864e5).toISOString().slice(0, 10), limM = new Date(Date.now() - MESES_MENSUALES * 31 * 864e5).toISOString().slice(0, 7);
  for (const [pre, lim, largo] of [["diario/", limD, 10], ["mensual/", limM, 7]]) {
    let cursor; do { const l = await env.BACKUPS.list({ prefix: pre, cursor }); cursor = l.truncated ? l.cursor : null;
      for (const o of l.objects) if (o.key.slice(pre.length, pre.length + largo) < lim) borrar.push(o.key); } while (cursor);
  }
  if (borrar.length) await env.BACKUPS.delete(borrar);
  return { archivo: `diario/${dia}.sql.gz`, fotos_subidas: subidas, fotos_pendientes: pendientes, borrados: borrar };
}

const hoyBO = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); // hora de Bolivia
export async function respaldar(env) {
  const usaGH = !!(env.GITHUB_TOKEN && env.GITHUB_REPO), usaR2 = !!env.BACKUPS;
  if (!usaGH && !usaR2) throw new Error("No hay destino: configura GITHUB_TOKEN y GITHUB_REPO, o conecta el bucket BACKUPS");
  const dia = hoyBO(), b = await generar(env), res = { ok: true, dia, bytes_sql: b.bytes_sql, bytes_gz: b.bytes_gz, filas: b.filas };
  if (usaGH) res.github = await aGitHub(env, dia, b);
  if (usaR2) { res.r2 = await aR2(env, dia, b); await env.BACKUPS.put("ultimo.json", JSON.stringify({ ...res, fecha: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } }); }
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
      if (url.pathname === "/lista" && env.BACKUPS) { const out = []; for (const pre of ["diario/", "mensual/"]) { let cursor; do { const l = await env.BACKUPS.list({ prefix: pre, cursor }); cursor = l.truncated ? l.cursor : null; out.push(...l.objects.map(o => ({ archivo: o.key, bytes: o.size, fecha: o.uploaded }))); } while (cursor); }
        return json({ ok: true, backups: out.sort((a, b) => b.archivo.localeCompare(a.archivo)) }); }
      if (url.pathname.startsWith("/bajar/") && env.BACKUPS) { const k = decodeURIComponent(url.pathname.slice(7)); if (!/^(diario|mensual)\/[\d-]+\.sql\.gz$/.test(k)) return json({ ok: false, error: "Archivo no válido" }, 400);
        const o = await env.BACKUPS.get(k); if (!o) return json({ ok: false, error: "No existe" }, 404);
        return new Response(o.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="flota-${k.replace("/", "-")}"` } }); }
      return json(await respaldar(env));
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
  }
};
