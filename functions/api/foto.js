// GET ?k= → foto (solo usuarios de la misma empresa; se pide con el token de sesión)
import { err, sesion, E } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u || u.super) return err("Inicia sesión", 401);
  const k = new URL(request.url).searchParams.get("k") || ""; if (!k.startsWith(E(u) + "/")) return err("No encontrada", 404);
  if (env.FOTOS) { const o = await env.FOTOS.get(k); // si no está en R2 se busca en D1 (fotos guardadas antes de conectar R2)
    if (o) return new Response(o.body, { headers: { "content-type": o.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } }); }
  const r = await env.DB.prepare("SELECT data FROM fotos WHERE k = ? AND empresa_id = ?").bind(k, E(u)).first(); if (!r) return err("No encontrada (puede haber vencido)", 404);
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.data);
  return new Response(Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)), { headers: { "content-type": m[1], "cache-control": "private, max-age=3600" } });
}
