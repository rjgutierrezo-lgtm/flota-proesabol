import { ensureSchema, err } from "../../lib/db.js";
export async function onRequest({ env, next }) {
  try { await ensureSchema(env); return await next(); }
  catch (e) { return err(String(e && e.message || e), 500); }
}
