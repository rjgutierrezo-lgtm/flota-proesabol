// Inicio de sesión con la cuenta de la empresa por OpenID Connect. Sirve para Microsoft Entra ID y para cualquier proveedor
// estándar (Keycloak o Authentik conectados a un Active Directory local, Google Workspace, etc.).
// Variables (una de las dos formas):
//   Microsoft:  MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT (id del directorio u "organizations")
//   Genérico:   OIDC_ISSUER (ej. https://id.empresa.com/realms/empresa), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_NOMBRE (texto del botón)
// GET /api/ms/login → redirige al proveedor. GET /api/ms/callback → valida, busca el usuario y abre la sesión.
// Vinculación del usuario, en este orden: id del proveedor ya enlazado; correo (Usuarios → Correo); nombre de usuario igual al del dominio.
import { err, randomHex, sameStr, bloqueo } from "../../../lib/db.js";
const b64url = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); return decodeURIComponent(Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")); };
export function proveedor(env) {
  if (env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET) return { tipo: "oidc", issuer: env.OIDC_ISSUER.replace(/\/$/, ""), id: env.OIDC_CLIENT_ID, secreto: env.OIDC_CLIENT_SECRET, nombre: env.OIDC_NOMBRE || "Entrar con la cuenta de la empresa" };
  if (env.MS_CLIENT_ID && env.MS_CLIENT_SECRET) { const t = env.MS_TENANT || "organizations"; return { tipo: "ms", issuer: `https://login.microsoftonline.com/${t}/v2.0`, tenant: t, id: env.MS_CLIENT_ID, secreto: env.MS_CLIENT_SECRET, nombre: "Entrar con Microsoft",
    auth: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token` }; }
  return null;
}
async function endpoints(p) { // Microsoft: conocidos; otros: descubrimiento OIDC
  if (p.auth) return p;
  const r = await fetch(p.issuer + "/.well-known/openid-configuration", { signal: AbortSignal.timeout(8000) }); const d = await r.json();
  if (!d.authorization_endpoint || !d.token_endpoint) throw new Error("El proveedor no publica su configuración OpenID");
  return { ...p, auth: d.authorization_endpoint, token: d.token_endpoint };
}
export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url), origin = url.origin, p0 = proveedor(env);
  if (!p0) return err("El inicio de sesión con la cuenta de la empresa no está configurado", 404);
  const redirect_uri = origin + "/api/ms/callback";
  const limpiar = { "set-cookie": "ms_state=; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=0" };
  const fallo = m => new Response(null, { status: 302, headers: { location: origin + "/#mserr=" + encodeURIComponent(m), ...limpiar } });
  let p; try { p = await endpoints(p0); } catch (e) { return fallo("No se pudo conectar con el servidor de identidad de la empresa"); }
  if (params.accion === "login") {
    const state = randomHex(16), a = new URL(p.auth);
    for (const [k, v] of Object.entries({ client_id: p.id, response_type: "code", redirect_uri, response_mode: "query", scope: "openid profile email", state, ...(p.tipo === "ms" ? { prompt: "select_account" } : {}) })) a.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { location: a.toString(), "set-cookie": `ms_state=${state}; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  }
  if (params.accion !== "callback") return err("Ruta no encontrada", 404);
  const cookie = /(?:^|;\s*)ms_state=([0-9a-f]+)/.exec(request.headers.get("cookie") || "")?.[1] || "", state = url.searchParams.get("state") || "";
  if (url.searchParams.get("error")) return fallo("El proveedor no autorizó el acceso: " + (url.searchParams.get("error_description") || url.searchParams.get("error")).slice(0, 160));
  if (!state || !cookie || !sameStr(state, cookie)) return fallo("La sesión de inicio expiró. Vuelve a intentar.");
  const code = url.searchParams.get("code") || ""; if (!code) return fallo("El proveedor no devolvió el código de acceso");
  let tok; try {
    const r = await fetch(p.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: p.id, client_secret: p.secreto, code, redirect_uri, grant_type: "authorization_code" }), signal: AbortSignal.timeout(10000) });
    tok = await r.json();
  } catch (e) { return fallo("No se pudo conectar con el servidor de identidad. Intenta de nuevo."); }
  if (!tok?.id_token) return fallo("Acceso rechazado: " + String(tok?.error_description || tok?.error || "sin detalle").slice(0, 160));
  let c; try { c = JSON.parse(b64url(tok.id_token.split(".")[1])); } catch (e) { return fallo("Respuesta del proveedor no válida"); }
  // el token llega directo del proveedor por HTTPS; se comprueba que sea para esta aplicación y de este emisor
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud]; if (!aud.includes(p.id)) return fallo("El token no corresponde a esta aplicación");
  if (p.tipo === "ms" && !["common", "organizations"].includes(p.tenant) && c.tid !== p.tenant) return fallo("Tu cuenta no pertenece al directorio autorizado");
  if (p.tipo === "oidc" && c.iss && c.iss.replace(/\/$/, "") !== p.issuer) return fallo("El token no viene del servidor de identidad configurado");
  const sub = String(c.oid || c.sub || ""), correo = String(c.email || (String(c.preferred_username || "").includes("@") ? c.preferred_username : "") || c.upn || "").toLowerCase().trim();
  const cuenta = String(c.preferred_username || "").toLowerCase().replace(/@.*$/, "").trim(); // nombre de usuario del dominio (sAMAccountName en Keycloak+AD)
  if (!sub) return fallo("El proveedor no entregó la identidad del usuario");
  const clave = p.tipo + ":" + sub;
  let u = await env.DB.prepare("SELECT * FROM usuarios WHERE ms_oid = ? AND activo = 1").bind(clave).first();
  if (!u && correo) u = await env.DB.prepare("SELECT * FROM usuarios WHERE lower(email) = ? AND activo = 1 AND ms_oid IS NULL").bind(correo).first();
  if (!u && cuenta) u = await env.DB.prepare("SELECT * FROM usuarios WHERE lower(usuario) = ? AND activo = 1 AND ms_oid IS NULL").bind(cuenta).first();
  if (!u) return fallo(`La cuenta ${correo || cuenta || "indicada"} no está vinculada a ningún usuario de FlotaControl. Pide al administrador que ponga ese correo o nombre de usuario en tu usuario.`);
  if (u.ms_oid !== clave) await env.DB.prepare("UPDATE usuarios SET ms_oid = ? WHERE id = ?").bind(clave, u.id).run();
  if (!u.super) { const e = await env.DB.prepare("SELECT activo, vence FROM empresas WHERE id = ?").bind(u.empresa_id).first(); const bq = bloqueo(e); if (bq) return fallo(bq); }
  const token = randomHex(32);
  await env.DB.batch([env.DB.prepare("DELETE FROM sesiones WHERE expira < datetime('now')"), env.DB.prepare("INSERT INTO sesiones(token, usuario_id, expira) VALUES(?, ?, datetime('now', '+30 days'))").bind(token, u.id)]);
  return new Response(null, { status: 302, headers: { location: origin + "/#ms=" + token, ...limpiar } });
}
