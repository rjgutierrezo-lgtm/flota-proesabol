// Puente entre FlotaControl y el agente de Active Directory, sin dominio ni dirección pública.
// FlotaControl (Pages) llama a este Worker por un "service binding"; el Worker reenvía la consulta al agente
// a través del túnel de Cloudflare ya instalado en la PC de la red, usando Workers VPC (binding AGENTE).
// El agente vuelve a comprobar el secreto compartido (cabecera x-agente-secreto), así que este Worker no lo necesita.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!["/salud", "/validar"].includes(url.pathname)) return Response.json({ ok: false, error: "Ruta no encontrada" }, { status: 404 });
    const init = { method: request.method, headers: { "content-type": "application/json" } };
    const s = request.headers.get("x-agente-secreto"); if (s) init.headers["x-agente-secreto"] = s;
    if (request.method === "POST") init.body = await request.text();
    try {
      // el host de la URL no se usa para enrutar: Workers VPC va siempre al servicio configurado (localhost:8787 en la PC del agente)
      const r = await env.AGENTE.fetch("http://localhost:8787" + url.pathname, init);
      return new Response(r.body, { status: r.status, headers: { "content-type": "application/json; charset=utf-8" } });
    } catch (e) {
      return Response.json({ ok: false, error: "No se pudo llegar al agente de la red: " + String(e && e.message || e) }, { status: 502 });
    }
  }
};
