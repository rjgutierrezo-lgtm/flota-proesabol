// Inicio de sesión con Microsoft (Entra ID / Microsoft 365) por OpenID Connect.
// Variables: MS_CLIENT_ID, MS_CLIENT_SECRET y MS_TENANT (id del directorio, o "organizations" para cualquier empresa).
// GET /api/ms/login → redirige a Microsoft. GET /api/ms/callback → valida, busca el usuario por su correo y abre la sesión.
// Vinculación: el administrador pone el correo de Microsoft en el usuario (Usuarios → Correo). La primera vez queda enlazado por su id de Microsoft.
import { err, randomHex, sameStr, bloqueo } from "../../../lib/db.js";
const redir = (origin, hash) => new Response(null, { status: 302, headers: { location: origin + "/#" + hash } });
const b64url = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); return decodeURIComponent(Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")); };
export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url), origin = url.origin, tenant = env.MS_TENANT || "organizations";
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) return err("El inicio de sesión con Microsoft no está configurado", 404);
  const redirect_uri = origin + "/api/ms/callback";
  if (params.accion === "login") {
    const state = randomHex(16);
    const a = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
    for (const [k, v] of Object.entries({ client_id: env.MS_CLIENT_ID, response_type: "code", redirect_uri, response_mode: "query", scope: "openid profile email", state, prompt: "select_account" })) a.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { location: a.toString(), "set-cookie": `ms_state=${state}; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  }
  if (params.accion !== "callback") return err("Ruta no encontrada", 404);
  const cookie = /(?:^|;\s*)ms_state=([0-9a-f]+)/.exec(request.headers.get("cookie") || "")?.[1] || "", state = url.searchParams.get("state") || "";
  const limpiar = { "set-cookie": "ms_state=; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=0" };
  const fallo = m => new Response(null, { status: 302, headers: { location: origin + "/#mserr=" + encodeURIComponent(m), ...limpiar } });
  if (url.searchParams.get("error")) return fallo("Microsoft no autorizó el acceso: " + (url.searchParams.get("error_description") || url.searchParams.get("error")).slice(0, 160));
  if (!state || !cookie || !sameStr(state, cookie)) return fallo("La sesión de inicio con Microsoft expiró. Vuelve a intentar.");
  const code = url.searchParams.get("code") || ""; if (!code) return fallo("Microsoft no devolvió el código de acceso");
  let tok; try {
    const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, code, redirect_uri, grant_type: "authorization_code", scope: "openid profile email" }), signal: AbortSignal.timeout(10000) });
    tok = await r.json();
  } catch (e) { return fallo("No se pudo conectar con Microsoft. Intenta de nuevo."); }
  if (!tok?.id_token) return fallo("Microsoft rechazó el acceso: " + String(tok?.error_description || tok?.error || "sin detalle").slice(0, 160));
  let c; try { c = JSON.parse(b64url(tok.id_token.split(".")[1])); } catch (e) { return fallo("Respuesta de Microsoft no válida"); }
  // el token llega directo del servidor de Microsoft por HTTPS; se comprueba que sea para esta aplicación y de este directorio
  if (c.aud !== env.MS_CLIENT_ID) return fallo("El token no corresponde a esta aplicación");
  if (env.MS_TENANT && !["common", "organizations"].includes(env.MS_TENANT) && c.tid !== env.MS_TENANT) return fallo("Tu cuenta no pertenece al directorio autorizado");
  const oid = String(c.oid || ""), correo = String(c.preferred_username || c.email || c.upn || "").toLowerCase().trim();
  if (!oid) return fallo("Microsoft no entregó la identidad del usuario");
  let u = await env.DB.prepare("SELECT * FROM usuarios WHERE ms_oid = ? AND activo = 1").bind(oid).first();
  if (!u && correo) { u = await env.DB.prepare("SELECT * FROM usuarios WHERE lower(email) = ? AND activo = 1").bind(correo).first();
    if (u) await env.DB.prepare("UPDATE usuarios SET ms_oid = ? WHERE id = ?").bind(oid, u.id).run(); }
  if (!u) return fallo(`La cuenta ${correo || "de Microsoft"} no está vinculada a ningún usuario de FlotaControl. Pide al administrador que ponga ese correo en tu usuario.`);
  if (!u.super) { const e = await env.DB.prepare("SELECT activo, vence FROM empresas WHERE id = ?").bind(u.empresa_id).first(); const bq = bloqueo(e); if (bq) return fallo(bq); }
  const token = randomHex(32);
  await env.DB.batch([env.DB.prepare("DELETE FROM sesiones WHERE expira < datetime('now')"), env.DB.prepare("INSERT INTO sesiones(token, usuario_id, expira) VALUES(?, ?, datetime('now', '+30 days'))").bind(token, u.id)]);
  return new Response(null, { status: 302, headers: { location: origin + "/#ms=" + token, ...limpiar } });
}
