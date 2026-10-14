// Registro de una empresa nueva desde la landing: prueba gratis de 30 días con el plan Flota.
// GET → si el registro está abierto y la lista de países | POST {empresa, nombre, usuario, password, telefono, email, pais} → crea la empresa, su parqueo y el administrador, y devuelve la sesión.
// Se cierra con la variable REGISTRO_ABIERTO=0. Límite por IP (6 intentos cada 15 minutos). Si hay MAIL_ADMIN, avisa al dueño de la plataforma por correo.
import { json, err, txt, hashPass, randomHex, validUser, slugify, hoy, sumarDias, PERMISOS, PAISES, ITER, intentosBloqueado, intentoFallido } from "../../lib/db.js";
import { enviarCorreo } from "../../lib/resumen.js";
const DIAS_PRUEBA = 30;
export async function onRequestGet({ env }) {
  return json({ ok: true, abierto: env.REGISTRO_ABIERTO !== "0", dias: DIAS_PRUEBA, paises: Object.fromEntries(Object.entries(PAISES).map(([k, p]) => [k, p.nombre])) });
}
export async function onRequestPost({ request, env }) {
  if (env.REGISTRO_ABIERTO === "0") return err("El registro en línea está cerrado. Escríbenos por WhatsApp.", 403);
  const ip = request.headers.get("cf-connecting-ip") || "", claves = ip ? ["reg:" + ip] : [];
  if (claves.length && await intentosBloqueado(env, claves)) return err("Demasiados intentos desde esta conexión. Prueba en 15 minutos.", 429);
  const b = await request.json().catch(() => ({}));
  const empresa = txt(b.empresa, 100), au = txt(b.usuario, 60).toLowerCase(), ap = String(b.password || ""), email = txt(b.email, 120).toLowerCase(), tel = txt(b.telefono, 20).replace(/\D/g, "");
  if (empresa.length < 3) return err("Escribe el nombre de tu empresa");
  if (!validUser(au)) return err("Usuario: 3 a 60 letras, números, punto, guion o @");
  if (ap.length < 8) return err("La contraseña debe tener al menos 8 caracteres");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("Escribe un correo válido");
  if (tel.length < 7) return err("Escribe tu WhatsApp con código de país");
  const pais = PAISES[b.pais] ? b.pais : "BO", P = PAISES[pais];
  if (claves.length) await intentoFallido(env, claves); // cada intento cuenta para el límite por IP
  if (await env.DB.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").bind(au).first()) return err("Ese usuario ya existe. Elige otro o ingresa con tu cuenta.");
  let slug = slugify(empresa) || "empresa"; if (await env.DB.prepare("SELECT 1 FROM empresas WHERE slug = ?").bind(slug).first()) slug = (slug + "-" + randomHex(2)).slice(0, 40);
  const vence = sumarDias(hoy(), DIAS_PRUEBA);
  const e = await env.DB.prepare("INSERT INTO empresas(nombre, slug, vence, plan, telefono_admin, email, email_avisos, origen, pais, moneda, tz, doc1, doc2) VALUES(?,?,?,'flota',?,?,?,'web',?,?,?,?,?)")
    .bind(empresa, slug, vence, tel, email, email, pais, P.moneda, P.tz, P.doc1, P.doc2).run();
  const eid = e.meta.last_row_id, salt = randomHex(16), token = randomHex(32);
  const uid = (await env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, iter) VALUES(?,?,?,?,?,?,?)")
    .bind(eid, au, txt(b.nombre, 80) || au, await hashPass(ap, salt), salt, JSON.stringify(Object.keys(PERMISOS)), ITER).run()).meta.last_row_id;
  await env.DB.batch([env.DB.prepare("INSERT INTO sucursales(empresa_id, nombre) VALUES(?, 'Principal')").bind(eid),
    env.DB.prepare("INSERT INTO sesiones(token, usuario_id, expira) VALUES(?, ?, datetime('now', '+30 days'))").bind(token, uid)]);
  if (env.MAIL_ADMIN) { try { await enviarCorreo(env, env.MAIL_ADMIN, `Nueva empresa en FlotaControl: ${empresa}`, `Empresa: ${empresa}\nPaís: ${P.nombre}\nAdministrador: ${txt(b.nombre, 80) || au} (${au})\nWhatsApp: ${tel}\nCorreo: ${email}\nPrueba hasta: ${vence}`); } catch (x) { /* el registro no depende del correo */ } }
  return json({ ok: true, token, empresa, vence });
}
