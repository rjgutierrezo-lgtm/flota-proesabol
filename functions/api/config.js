// POST: datos de la empresa (permiso "usuarios"): nombre, contacto, país/moneda/zona horaria, nombres de documentos, avisos por correo, foto obligatoria y ficha pública.
import { json, err, txt, int, num, sesion, puede, PERFIL_EMPRESA, PAISES, E } from "../../lib/db.js";
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!puede(u, "usuarios")) return err("Sin permiso", 403);
  const b = await request.json().catch(() => ({}));
  const pais = PAISES[b.pais] ? b.pais : "BO", P = PAISES[pais];
  const tz = b.tz === "" || b.tz == null ? P.tz : Math.max(-12, Math.min(14, num(b.tz, P.tz)));
  const email = txt(b.email_avisos, 200).toLowerCase().split(/[,;\s]+/).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).join(", ");
  if (txt(b.email_avisos) && !email) return err("El correo de avisos no es válido");
  await env.DB.prepare(`UPDATE empresas SET nombre=?, whatsapp=?, direccion=?, moneda=?, tolerancia_consumo=?, retencion_fotos=?, email_avisos=?, email=?, foto_obligatoria=?, ficha_publica=?, pais=?, tz=?, doc1=?, doc2=? WHERE id=?`)
    .bind(txt(b.nombre, 100) || "Mi empresa", txt(b.whatsapp, 20).replace(/\D/g, ""), txt(b.direccion, 200), txt(b.moneda, 6) || P.moneda,
      Math.min(80, Math.max(5, int(b.tolerancia_consumo) || 20)), Math.min(1095, Math.max(30, int(b.retencion_fotos) || 365)), email, txt(b.email, 120).toLowerCase(),
      b.foto_obligatoria ? 1 : 0, b.ficha_publica === false ? 0 : 1, pais, tz, txt(b.doc1, 40) || P.doc1, txt(b.doc2, 40) || P.doc2, E(u)).run();
  return json({ ok: true, empresa: await env.DB.prepare(PERFIL_EMPRESA).bind(E(u)).first() });
}
