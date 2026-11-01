// POST: deja la empresa en blanco para empezar de cero (permiso "usuarios" y acceso a todos los parqueos). Solo toca filas de esta empresa.
// { modo: "registros" } borra cargas, mantenimientos, gastos, fotos, movimientos de repuestos y recordatorios; los planes vuelven a "sin registro".
// { modo: "todo" } además borra vehículos, conductores, planes, proveedores, repuestos, llantas y baterías.
// Quedan la empresa, su configuración, los usuarios y los parqueos. Se exige escribir el nombre de la empresa tal cual.
import { json, err, txt, sesion, puede, E } from "../../lib/db.js";
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  if (u.sucursales.length) return err("Solo un administrador con acceso a todos los parqueos puede limpiar la base", 403);
  const b = await request.json().catch(() => ({})), modo = b.modo === "todo" ? "todo" : b.modo === "registros" ? "registros" : null;
  if (!modo) return err("Elige qué borrar");
  const emp = await env.DB.prepare("SELECT nombre FROM empresas WHERE id = ?").bind(E(u)).first();
  if (!emp || txt(b.confirmar, 100).toLowerCase() !== String(emp.nombre).trim().toLowerCase()) return err("Escribe el nombre de la empresa exactamente para confirmar");
  const e = E(u), q = s => env.DB.prepare(s).bind(e), antes = await q(`SELECT (SELECT count(*) FROM eventos WHERE empresa_id = ?1) eventos,
    (SELECT count(*) FROM vehiculos WHERE empresa_id = ?1) vehiculos, (SELECT count(*) FROM conductores WHERE empresa_id = ?1) conductores`).first();
  // fotos: en modo "registros" se conservan las fotos de los vehículos; las de R2 se borran aparte del lote
  const { results: fv } = modo === "todo" ? { results: [] } : await q("SELECT foto FROM vehiculos WHERE empresa_id = ? AND foto IS NOT NULL AND foto <> ''").all(), quedan = new Set(fv.map(x => x.foto));
  let r2 = 0;
  if (env.FOTOS) { let cursor; do { const l = await env.FOTOS.list({ prefix: e + "/", cursor, limit: 1000 }); cursor = l.truncated ? l.cursor : null;
    const ks = l.objects.map(o => o.key).filter(k => !quedan.has(k)); if (ks.length) { await env.FOTOS.delete(ks); r2 += ks.length; } } while (cursor); }
  const st = [modo === "todo" ? q("DELETE FROM fotos WHERE empresa_id = ?") : q("DELETE FROM fotos WHERE empresa_id = ? AND k NOT IN (SELECT foto FROM vehiculos WHERE empresa_id = ?1 AND foto IS NOT NULL)"),
    q("DELETE FROM eventos WHERE empresa_id = ?"), q("DELETE FROM movimientos WHERE empresa_id = ?"),
    q("DELETE FROM recordatorios WHERE empresa_id = ?")];
  if (modo === "todo") st.push(q("DELETE FROM activos WHERE empresa_id = ?"), q("DELETE FROM repuestos WHERE empresa_id = ?"), q("DELETE FROM planes WHERE empresa_id = ?"),
    q("DELETE FROM vehiculos WHERE empresa_id = ?"), q("DELETE FROM conductores WHERE empresa_id = ?"), q("DELETE FROM proveedores WHERE empresa_id = ?"),
    q("UPDATE usuarios SET conductor_id = NULL, vehiculo_id = NULL WHERE empresa_id = ?"));
  else st.push(q("UPDATE planes SET ultimo_km = 0, ultima_fecha = NULL WHERE empresa_id = ?"));
  await env.DB.batch(st);
  return json({ ok: true, modo, borrados: { ...antes, ...(modo === "registros" ? { vehiculos: 0, conductores: 0 } : {}), fotos_r2: r2 } });
}
