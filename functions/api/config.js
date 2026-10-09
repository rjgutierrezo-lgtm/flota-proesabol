// POST: datos de la empresa (permiso "usuarios")
import { json, err, txt, int, sesion, puede, PERFIL_EMPRESA, E } from "../../lib/db.js";
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({}));
  await env.DB.prepare("UPDATE empresas SET nombre=?, whatsapp=?, direccion=?, moneda=?, tolerancia_consumo=?, retencion_fotos=? WHERE id=?")
    .bind(txt(b.nombre, 100) || "Mi empresa", txt(b.whatsapp, 20).replace(/\D/g, ""), txt(b.direccion, 200), txt(b.moneda, 6) || "Bs",
      Math.min(80, Math.max(5, int(b.tolerancia_consumo) || 20)), Math.min(1095, Math.max(30, int(b.retencion_fotos) || 365)), E(u)).run();
  return json({ ok: true, empresa: await env.DB.prepare(PERFIL_EMPRESA).bind(E(u)).first() });
}
