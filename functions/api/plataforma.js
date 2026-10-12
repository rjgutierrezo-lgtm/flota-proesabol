// Panel del dueño de la plataforma (super)
// GET: empresas con plan, uso y cobros | GET ?pagos=ID: historial de pagos
// POST {nombre, slug?, plan, precio?, telefono_admin?, vence?, admin_usuario, admin_nombre, admin_password} → crea empresa
// POST {id, nombre?, activo?, vence?, plan?, precio?, telefono_admin?, max_sucursales?, max_usuarios?, } → edita
// POST {id, pago:{monto, meses, metodo, ref, nota}} → registra pago y extiende el vencimiento
// POST {id, reset_usuario, reset_password} → restablece contraseña
import { json, err, txt, int, num, sesion, hashPass, randomHex, validUser, slugify, hoy, sumarMeses, PERMISOS, PLANES, GRACIA_DIAS, ITER } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u?.super) return err("Solo el dueño de la plataforma", 403);
  const q = new URL(request.url).searchParams;
  if (q.get("pagos")) { const { results } = await env.DB.prepare("SELECT * FROM pagos WHERE empresa_id = ? ORDER BY fecha DESC").bind(int(q.get("pagos"))).all(); return json({ ok: true, pagos: results }); }
  const mes = hoy().slice(0, 7);
  const { results } = await env.DB.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM usuarios x WHERE x.empresa_id = e.id AND x.activo = 1) AS usuarios,
      (SELECT COUNT(*) FROM sucursales x WHERE x.empresa_id = e.id AND x.activo = 1) AS sucursales,
      (SELECT COUNT(*) FROM vehiculos x WHERE x.empresa_id = e.id AND x.estado <> 'baja') AS vehiculos,
      (SELECT COUNT(*) FROM eventos x WHERE x.empresa_id = e.id AND x.creado >= datetime('now','-30 days')) AS eventos_30d,
      (SELECT MAX(fecha) FROM pagos x WHERE x.empresa_id = e.id) AS ultimo_pago,
      (SELECT GROUP_CONCAT(usuario, ', ') FROM usuarios x WHERE x.empresa_id = e.id AND x.permisos LIKE '%"usuarios"%') AS admins
    FROM empresas e ORDER BY e.vence IS NULL, e.vence`).all();
  const cob = await env.DB.prepare("SELECT COALESCE(SUM(monto),0) AS total, COUNT(*) AS n FROM pagos WHERE substr(fecha,1,7) = ?").bind(mes).first();
  return json({ ok: true, empresas: results, planes: PLANES, hoy: hoy(), gracia: GRACIA_DIAS, cobrado_mes: cob });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u?.super) return err("Solo el dueño de la plataforma", 403);
  const b = await request.json().catch(() => ({}));
  const vence = b.vence === "" || b.vence === null ? null : (/^\d{4}-\d{2}-\d{2}$/.test(b.vence || "") ? b.vence : undefined);
  const plan = b.plan in PLANES ? b.plan : undefined;
  if (b.id) {
    const id = int(b.id), e = await env.DB.prepare("SELECT * FROM empresas WHERE id = ?").bind(id).first(); if (!e) return err("Empresa no encontrada", 404);
    if (b.pago) {
      const monto = num(b.pago.monto), meses = int(b.pago.meses);
      if (!(monto > 0)) return err("Escribe el monto pagado"); if (![1, 2, 3, 6, 12].includes(meses)) return err("Elige cuántos meses cubre el pago");
      const base = e.vence && e.vence >= hoy() ? e.vence : hoy(), nuevo = sumarMeses(base, meses);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO pagos(empresa_id, monto, meses, vence_antes, vence_nuevo, metodo, ref, nota, registrado_por) VALUES(?,?,?,?,?,?,?,?,?)")
          .bind(id, monto, meses, e.vence, nuevo, txt(b.pago.metodo, 30), txt(b.pago.ref, 80), txt(b.pago.nota, 200), u.id),
        env.DB.prepare("UPDATE empresas SET vence = ?, activo = 1 WHERE id = ?").bind(nuevo, id)]);
      return json({ ok: true, vence: nuevo });
    }
    if (b.reset_usuario) {
      if (String(b.reset_password || "").length < 8) return err("La contraseña debe tener al menos 8 caracteres");
      const salt = randomHex(16);
      const r = await env.DB.prepare("UPDATE usuarios SET salt = ?, hash = ?, iter = ?, activo = 1 WHERE usuario = ? AND empresa_id = ?").bind(salt, await hashPass(String(b.reset_password), salt), ITER, txt(b.reset_usuario, 60).toLowerCase(), id).run();
      if (!r.meta.changes) return err("Ese usuario no pertenece a la empresa"); return json({ ok: true });
    }
    const sets = [], vals = [];
    const lim = k => b[k] === "" || b[k] === null ? null : Math.max(0, int(b[k]));
    if (b.nombre !== undefined) { sets.push("nombre = ?"); vals.push(txt(b.nombre, 100)); }
    if (b.activo !== undefined) { sets.push("activo = ?"); vals.push(b.activo ? 1 : 0); }
    if (vence !== undefined) { sets.push("vence = ?"); vals.push(vence); }
    if (plan) { sets.push("plan = ?"); vals.push(plan); }
    if (b.precio !== undefined) { sets.push("precio = ?"); vals.push(b.precio === "" ? null : Math.max(0, num(b.precio))); }
    if (b.telefono_admin !== undefined) { sets.push("telefono_admin = ?"); vals.push(txt(b.telefono_admin, 20).replace(/\D/g, "")); }
    for (const k of ["max_sucursales", "max_usuarios", "max_vehiculos"]) if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(lim(k)); }
    if (!sets.length) return err("Nada que cambiar");
    await env.DB.prepare(`UPDATE empresas SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
    return json({ ok: true });
  }
  const nombre = txt(b.nombre, 100); if (!nombre) return err("Falta el nombre de la empresa");
  const slug = slugify(b.slug || nombre); if (slug.length < 3) return err("El identificador web debe tener al menos 3 letras");
  const au = txt(b.admin_usuario, 60).toLowerCase(), ap = String(b.admin_password || "");
  if (!validUser(au)) return err("Usuario del administrador: 3 a 60 letras, números, punto, guion o @");
  if (ap.length < 8) return err("La contraseña del administrador debe tener al menos 8 caracteres");
  if (await env.DB.prepare("SELECT 1 FROM empresas WHERE slug = ?").bind(slug).first()) return err("Ese identificador web ya está en uso");
  if (await env.DB.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").bind(au).first()) return err("Ese usuario ya existe en la plataforma");
  const e = await env.DB.prepare("INSERT INTO empresas(nombre, slug, vence, plan, precio, telefono_admin) VALUES(?,?,?,?,?,?)")
    .bind(nombre, slug, vence ?? null, plan || "basico", b.precio === "" || b.precio == null ? null : Math.max(0, num(b.precio)), txt(b.telefono_admin, 20).replace(/\D/g, "")).run();
  const eid = e.meta.last_row_id, salt = randomHex(16);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sucursales(empresa_id, nombre) VALUES(?, 'Principal')").bind(eid),
    env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, iter) VALUES(?,?,?,?,?,?,?)")
      .bind(eid, au, txt(b.admin_nombre, 80) || au, await hashPass(ap, salt), salt, JSON.stringify(Object.keys(PERMISOS)), ITER)]);
  return json({ ok: true, id: eid, slug });
}
