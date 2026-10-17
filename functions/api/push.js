// Notificaciones push del usuario. GET: clave pública y cuántos equipos tiene activos
// POST {sub} activar en este equipo | POST {baja: endpoint} desactivar | POST {probar: true} enviar una prueba a mis equipos
import { json, err, txt, sesion } from "../../lib/db.js";
import { clavesVapid, notificar } from "../../lib/push.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u) return err("Inicia sesión", 401);
  const c = await clavesVapid(env), n = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE usuario_id = ?").bind(u.id).first();
  return json({ ok: true, clave: c.publica, equipos: n.n });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u) return err("Inicia sesión", 401);
  const b = await request.json().catch(() => ({}));
  if (b.sub) {
    const s = b.sub, endpoint = txt(s.endpoint, 1000), p256dh = txt(s.keys?.p256dh, 200), auth = txt(s.keys?.auth, 100);
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return err("Suscripción no válida");
    await env.DB.prepare(`INSERT INTO push_subs(usuario_id, empresa_id, endpoint, p256dh, auth, equipo) VALUES(?,?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, empresa_id = excluded.empresa_id, p256dh = excluded.p256dh, auth = excluded.auth, equipo = excluded.equipo`)
      .bind(u.id, u.empresa_id ?? null, endpoint, p256dh, auth, txt(b.equipo || request.headers.get("user-agent"), 120)).run();
    return json({ ok: true });
  }
  if (b.baja) { await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND usuario_id = ?").bind(txt(b.baja, 1000), u.id).run(); return json({ ok: true }); }
  if (b.probar) {
    const n = await notificar(env, [u.id], { title: "🔔 FlotaControl", body: `Hola ${u.nombre}: las notificaciones funcionan en este equipo.`, url: "/", tag: "prueba" });
    return n ? json({ ok: true, enviadas: n }) : err("No hay equipos con notificaciones activas, o el servicio de notificaciones las rechazó", 404);
  }
  return err("Nada que hacer");
}
