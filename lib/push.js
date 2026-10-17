// Notificaciones push (Web Push, RFC 8291 + VAPID RFC 8292) con WebCrypto, sin librerías.
// Las claves VAPID se generan solas la primera vez y se guardan en la tabla `ajustes` de cada instalación.
const te = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const deB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - String(s).length % 4) % 4)), c => c.charCodeAt(0));
const concat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const hkdf = async (salt, ikm, info, bits) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bits));

// Claves VAPID de la instalación: { publica: base64url (65 bytes), jwk: clave privada }
export async function clavesVapid(env) {
  const r = await env.DB.prepare("SELECT v FROM ajustes WHERE k = 'vapid'").first();
  if (r) return JSON.parse(r.v);
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const c = { publica: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  await env.DB.prepare("INSERT OR IGNORE INTO ajustes(k, v) VALUES('vapid', ?)").bind(JSON.stringify(c)).run();
  return JSON.parse((await env.DB.prepare("SELECT v FROM ajustes WHERE k = 'vapid'").first()).v); // por si otra petición la creó a la vez
}
// Cifra el mensaje para una suscripción (aes128gcm)
export async function cifrar(p256dh, auth, texto) {
  const uaPub = deB64u(p256dh), secreto = deB64u(auth), salt = crypto.getRandomValues(new Uint8Array(16));
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(secreto, ecdh, concat(te.encode("WebPush: info\0"), uaPub, asPub), 256);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 128), nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 96);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(te.encode(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // tamaño de registro 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function jwtVapid(c, endpoint) {
  const h = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:avisos@flotacontrol.app" })));
  const k = await crypto.subtle.importKey("jwk", c.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return `${h}.${p}.${b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, te.encode(`${h}.${p}`)))}`;
}
// Envía a una suscripción. Devuelve el estado HTTP (404/410 = suscripción vencida)
export async function enviarPush(env, sub, msg, c) {
  c = c || await clavesVapid(env);
  const body = await cifrar(sub.p256dh, sub.auth, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, { method: "POST", body, headers: { authorization: `vapid t=${await jwtVapid(c, sub.endpoint)}, k=${c.publica}`,
    "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: "86400", urgency: msg.urgente ? "high" : "normal" } });
  return r.status;
}
// Envía a todas las suscripciones de los usuarios indicados (consulta SQL que devuelve usuario ids) y limpia las vencidas
export async function notificar(env, usuarioIds, msg) {
  const ids = [...new Set(usuarioIds)].filter(Boolean); if (!ids.length) return 0;
  const { results } = await env.DB.prepare(`SELECT * FROM push_subs WHERE usuario_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  if (!results.length) return 0; const c = await clavesVapid(env); let ok = 0;
  await Promise.all(results.map(async s => { try { const st = await enviarPush(env, s, msg, c); if (st === 404 || st === 410) await env.DB.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run(); else if (st < 300) ok++; } catch (e) { /* un fallo no detiene a los demás */ } }));
  return ok;
}
// Usuarios de la empresa que supervisan un parqueo (permiso reportes o mantenimiento, con acceso a ese parqueo)
export async function supervisores(env, empresaId, sucursalId, excluir = 0) {
  const { results } = await env.DB.prepare("SELECT id, permisos, sucursales FROM usuarios WHERE empresa_id = ? AND activo = 1 AND id <> ?").bind(empresaId, excluir).all();
  return results.filter(u => { const p = JSON.parse(u.permisos || "[]"), s = JSON.parse(u.sucursales || "[]"); return (p.includes("reportes") || p.includes("mantenimiento")) && (!s.length || !sucursalId || s.includes(sucursalId)); }).map(u => u.id);
}
