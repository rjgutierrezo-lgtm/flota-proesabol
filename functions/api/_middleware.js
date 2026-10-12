import { ensureSchema, err } from "../../lib/db.js";
export async function onRequest({ env, next }) {
  try {
    await ensureSchema(env);
    const r = await next();
    // Cabeceras de seguridad para las respuestas del API
    const h = new Headers(r.headers); h.set("x-content-type-options", "nosniff"); h.set("referrer-policy", "same-origin");
    return new Response(r.body, { status: r.status, headers: h });
  }
  catch (e) { return err(String(e && e.message || e), 500); }
}
