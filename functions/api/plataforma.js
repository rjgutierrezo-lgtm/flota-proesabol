// Panel del dueño de la plataforma (super)
// GET: empresas con plan, uso y cobros | GET ?pagos=ID: historial de pagos
// POST {nombre, slug?, plan, precio?, telefono_admin?, vence?, admin_usuario, admin_nombre, admin_password} → crea empresa
// POST {id, nombre?, activo?, vence?, plan?, precio?, telefono_admin?, max_sucursales?, max_usuarios?, } → edita
// POST {id, pago:{monto, meses, metodo, ref, nota}} → registra pago y extiende el vencimiento
// POST {id, reset_usuario, reset_password} → restablece contraseña
// POST {id, importar: {conductores, vehiculos}} → carga masiva desde Excel (ver importar; un conductor con usuario+password crea su usuario "registrar") | GET ?importar=ID: parqueos, conductores y placas de la empresa
// POST {id, limpiar: "registros"|"todo", confirmar: nombre de la empresa} → deja la empresa en blanco (ver limpiarEmpresa)
import { json, err, txt, int, num, sesion, hashPass, randomHex, validUser, slugify, hoy, sumarMeses, limpiarEmpresa, guardarFoto, normPlaca, revisarLimite, hoyTZ, PLANES_INICIALES, PERMISOS, PLANES, GRACIA_DIAS, ITER } from "../../lib/db.js";
export async function onRequestGet({ request, env }) {
  const u = await sesion(request, env); if (!u?.super) return err("Solo el dueño de la plataforma", 403);
  const q = new URL(request.url).searchParams;
  if (q.get("pagos")) { const { results } = await env.DB.prepare("SELECT * FROM pagos WHERE empresa_id = ? ORDER BY fecha DESC").bind(int(q.get("pagos"))).all(); return json({ ok: true, pagos: results }); }
  if (q.get("importar")) { // lo que ya tiene la empresa, para la vista previa de la importación
    const id = int(q.get("importar")), [s, c, v, u] = await env.DB.batch([env.DB.prepare("SELECT id, nombre FROM sucursales WHERE empresa_id = ? AND activo = 1 ORDER BY id").bind(id),
      env.DB.prepare("SELECT id, nombre, sucursal_id FROM conductores WHERE empresa_id = ?").bind(id), env.DB.prepare("SELECT placa FROM vehiculos WHERE empresa_id = ?").bind(id),
      env.DB.prepare("SELECT usuario FROM usuarios WHERE empresa_id = ?").bind(id)]);
    return json({ ok: true, sucursales: s.results, conductores: c.results, placas: v.results.map(x => x.placa), usuarios: u.results.map(x => x.usuario) });
  }
  if (q.get("almacenamiento")) { // uso de R2 (fotos) y de D1 por empresa. R2 se recorre objeto por objeto (máximo 100 páginas de 1000)
    const emp = Object.fromEntries((await env.DB.prepare("SELECT id, nombre FROM empresas").all()).results.map(e => [e.id, e.nombre]));
    const por = {}; const add = (id, k, n) => { por[id] = por[id] || { empresa_id: +id || 0, nombre: emp[id] || "(sin empresa)", r2_objetos: 0, r2_bytes: 0, d1_fotos: 0, d1_bytes: 0, registros: 0 }; por[id][k] += n; };
    let r2 = null;
    if (env.FOTOS) { r2 = { objetos: 0, bytes: 0, completo: true }; let cursor; for (let i = 0; i < 100; i++) {
        const l = await env.FOTOS.list({ cursor, limit: 1000 }); for (const o of l.objects) { r2.objetos++; r2.bytes += o.size; const id = o.key.split("/")[0]; add(id, "r2_objetos", 1); add(id, "r2_bytes", o.size); }
        if (!l.truncated) break; cursor = l.cursor; if (i === 99) r2.completo = false; } }
    const f = await env.DB.prepare("SELECT empresa_id, COUNT(*) AS n, COALESCE(SUM(length(data)), 0) AS bytes FROM fotos GROUP BY empresa_id").all();
    for (const x of f.results) { add(x.empresa_id, "d1_fotos", x.n); add(x.empresa_id, "d1_bytes", x.bytes); }
    const ev = await env.DB.prepare("SELECT empresa_id, COUNT(*) AS n FROM eventos GROUP BY empresa_id").all(); for (const x of ev.results) add(x.empresa_id, "registros", x.n);
    const d1 = { fotos: f.results.reduce((a, x) => a + x.n, 0), fotos_bytes: f.results.reduce((a, x) => a + x.bytes, 0), registros: ev.results.reduce((a, x) => a + x.n, 0) };
    return json({ ok: true, r2, d1, empresas: Object.values(por).sort((a, b) => (b.r2_bytes + b.d1_bytes) - (a.r2_bytes + a.d1_bytes)), gratis: { r2_bytes: 10 * 1024 ** 3, d1_bytes: 500 * 1024 ** 2 } });
  }
  const mes = hoy().slice(0, 7);
  const { results } = await env.DB.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM usuarios x WHERE x.empresa_id = e.id AND x.activo = 1) AS usuarios,
      (SELECT COUNT(*) FROM sucursales x WHERE x.empresa_id = e.id AND x.activo = 1) AS sucursales,
      (SELECT COUNT(*) FROM vehiculos x WHERE x.empresa_id = e.id AND x.estado <> 'baja') AS vehiculos,
      (SELECT COUNT(*) FROM eventos x WHERE x.empresa_id = e.id AND x.creado >= datetime('now','-30 days')) AS eventos_30d,
      (SELECT MAX(fecha) FROM pagos x WHERE x.empresa_id = e.id) AS ultimo_pago,
      (SELECT GROUP_CONCAT(usuario, ', ') FROM usuarios x WHERE x.empresa_id = e.id AND x.permisos LIKE '%"usuarios"%') AS admins
    FROM empresas e ORDER BY e.vence IS NULL, e.vence`).all();
  const cob = await env.DB.prepare("SELECT COALESCE(SUM(monto),0) AS total, COUNT(*) AS n FROM pagos WHERE substr(fecha,1,7) = ?").bind(mes).first();
  return json({ ok: true, empresas: results, planes: PLANES, hoy: hoy(), gracia: GRACIA_DIAS, cobrado_mes: cob });
}
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u?.super) return err("Solo el dueño de la plataforma", 403);
  const b = await request.json().catch(() => ({}));
  const vence = b.vence === "" || b.vence === null ? null : (/^\d{4}-\d{2}-\d{2}$/.test(b.vence || "") ? b.vence : undefined);
  const plan = b.plan in PLANES ? b.plan : undefined;
  if (b.id) {
    const id = int(b.id), e = await env.DB.prepare("SELECT * FROM empresas WHERE id = ?").bind(id).first(); if (!e) return err("Empresa no encontrada", 404);
    if (b.pago) {
      const monto = num(b.pago.monto), meses = int(b.pago.meses);
      if (!(monto > 0)) return err("Escribe el monto pagado"); if (![1, 2, 3, 6, 12].includes(meses)) return err("Elige cuántos meses cubre el pago");
      const base = e.vence && e.vence >= hoy() ? e.vence : hoy(), nuevo = sumarMeses(base, meses);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO pagos(empresa_id, monto, meses, vence_antes, vence_nuevo, metodo, ref, nota, registrado_por) VALUES(?,?,?,?,?,?,?,?,?)")
          .bind(id, monto, meses, e.vence, nuevo, txt(b.pago.metodo, 30), txt(b.pago.ref, 80), txt(b.pago.nota, 200), u.id),
        env.DB.prepare("UPDATE empresas SET vence = ?, activo = 1 WHERE id = ?").bind(nuevo, id)]);
      return json({ ok: true, vence: nuevo });
    }
    if (b.reset_usuario) {
      if (String(b.reset_password || "").length < 8) return err("La contraseña debe tener al menos 8 caracteres");
      const salt = randomHex(16);
      const r = await env.DB.prepare("UPDATE usuarios SET salt = ?, hash = ?, iter = ?, activo = 1 WHERE usuario = ? AND empresa_id = ?").bind(salt, await hashPass(String(b.reset_password), salt), ITER, txt(b.reset_usuario, 60).toLowerCase(), id).run();
      if (!r.meta.changes) return err("Ese usuario no pertenece a la empresa"); return json({ ok: true });
    }
    if (b.limpiar !== undefined) {
      if (!["registros", "todo"].includes(b.limpiar)) return err("Elige qué borrar");
      if (txt(b.confirmar, 100).toLowerCase() !== String(e.nombre).trim().toLowerCase()) return err("Escribe el nombre de la empresa exactamente para confirmar");
      return json({ ok: true, borrados: await limpiarEmpresa(env, id, b.limpiar) });
    }
    if (b.importar) return json({ ok: true, ...(await importar(env, id, b.importar)) });
    const sets = [], vals = [];
    const lim = k => b[k] === "" || b[k] === null ? null : Math.max(0, int(b[k]));
    if (b.nombre !== undefined) { sets.push("nombre = ?"); vals.push(txt(b.nombre, 100)); }
    if (b.activo !== undefined) { sets.push("activo = ?"); vals.push(b.activo ? 1 : 0); }
    if (vence !== undefined) { sets.push("vence = ?"); vals.push(vence); }
    if (plan) { sets.push("plan = ?"); vals.push(plan); }
    if (b.precio !== undefined) { sets.push("precio = ?"); vals.push(b.precio === "" ? null : Math.max(0, num(b.precio))); }
    if (b.telefono_admin !== undefined) { sets.push("telefono_admin = ?"); vals.push(txt(b.telefono_admin, 20).replace(/\D/g, "")); }
    for (const k of ["max_sucursales", "max_usuarios", "max_vehiculos"]) if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(lim(k)); }
    if (!sets.length) return err("Nada que cambiar");
    await env.DB.prepare(`UPDATE empresas SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
    return json({ ok: true });
  }
  const nombre = txt(b.nombre, 100); if (!nombre) return err("Falta el nombre de la empresa");
  const slug = slugify(b.slug || nombre); if (slug.length < 3) return err("El identificador web debe tener al menos 3 letras");
  const au = txt(b.admin_usuario, 60).toLowerCase(), ap = String(b.admin_password || "");
  if (!validUser(au)) return err("Usuario del administrador: 3 a 60 letras, números, punto, guion o @");
  if (ap.length < 8) return err("La contraseña del administrador debe tener al menos 8 caracteres");
  if (await env.DB.prepare("SELECT 1 FROM empresas WHERE slug = ?").bind(slug).first()) return err("Ese identificador web ya está en uso");
  if (await env.DB.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").bind(au).first()) return err("Ese usuario ya existe en la plataforma");
  const e = await env.DB.prepare("INSERT INTO empresas(nombre, slug, vence, plan, precio, telefono_admin) VALUES(?,?,?,?,?,?)")
    .bind(nombre, slug, vence ?? null, plan || "basico", b.precio === "" || b.precio == null ? null : Math.max(0, num(b.precio)), txt(b.telefono_admin, 20).replace(/\D/g, "")).run();
  const eid = e.meta.last_row_id, salt = randomHex(16);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sucursales(empresa_id, nombre) VALUES(?, 'Principal')").bind(eid),
    env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, iter) VALUES(?,?,?,?,?,?,?)")
      .bind(eid, au, txt(b.admin_nombre, 80) || au, await hashPass(ap, salt), salt, JSON.stringify(Object.keys(PERMISOS)), ITER)]);
  return json({ ok: true, id: eid, slug });
}

// Carga masiva desde Excel (la lee el navegador). Conductores: se actualizan por nombre o se crean. Vehículos: se actualizan por placa o se crean con sus planes de ejemplo.
// v.conductor es el nombre de un conductor de la empresa (ya existente o de esta misma carga). Solo se cambian los campos que vienen con valor; la foto, solo si el vehículo no tiene.
// usuario para que el conductor registre (permiso "registrar"), enlazado a su ficha. Si ya existe en la empresa solo se enlaza: su contraseña no se cambia
async function usuarioConductor(env, e, c, cid, nombre, sid, res) {
  const usuario = txt(c.usuario, 60).toLowerCase(), pass = String(c.password || ""), quien = `${nombre} (${usuario})`;
  if (!validUser(usuario)) return res.errores.push(`${quien}: usuario no válido (3 a 60 letras, números, punto, guion o @)`);
  let em = txt(c.email, 120).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) em = "";
  const cur = await env.DB.prepare("SELECT id, empresa_id FROM usuarios WHERE usuario = ?").bind(usuario).first();
  if (cur && cur.empresa_id !== e) return res.errores.push(`${quien}: ese usuario ya está en uso en otra empresa`);
  if (em && await env.DB.prepare("SELECT 1 FROM usuarios WHERE lower(email) = ? AND usuario <> ?").bind(em, usuario).first()) { res.errores.push(`${quien}: el correo ${em} ya está en otro usuario`); em = ""; if (!cur) return; }
  if (cur) { await env.DB.prepare("UPDATE usuarios SET conductor_id = COALESCE(?, conductor_id), email = COALESCE(NULLIF(?, ''), email) WHERE id = ?").bind(cid, em, cur.id).run(); return res.usuarios.actualizados++; }
  // entra con "Iniciar sesión con Microsoft", que lo reconoce por el correo o, sin correo, por el usuario (lo que va antes de la @ de su cuenta):
  // la contraseña del Excel no se usa y queda una al azar que nadie conoce (el administrador puede restablecerla si hace falta)
  const clave = randomHex(16); void pass;
  const lim = await revisarLimite(env, e, "usuarios"); if (lim) return res.errores.push(`${quien}: ${lim}`);
  const salt = randomHex(16);
  await env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, sucursales, iter, conductor_id, email) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(e, usuario, nombre, await hashPass(clave, salt), salt, JSON.stringify(["registrar"]), JSON.stringify(sid ? [sid] : []), ITER, cid, em).run();
  res.usuarios.nuevos++;
}
async function importar(env, e, { conductores = [], vehiculos = [], soloUsuarios = false }) {
  const emp = await env.DB.prepare("SELECT tz FROM empresas WHERE id = ?").bind(e).first(), hoy = hoyTZ(emp?.tz);
  const sucs = new Set((await env.DB.prepare("SELECT id FROM sucursales WHERE empresa_id = ?").bind(e).all()).results.map(x => x.id));
  const f = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null, sid = x => sucs.has(int(x)) ? int(x) : null, clave = s => txt(s, 80).toLowerCase().replace(/\s+/g, " ");
  const res = { conductores: { nuevos: 0, actualizados: 0 }, usuarios: { nuevos: 0, actualizados: 0 }, vehiculos: { nuevos: 0, actualizados: 0 }, errores: [] };
  const filasC = (await env.DB.prepare("SELECT id, nombre, sucursal_id FROM conductores WHERE empresa_id = ?").bind(e).all()).results;
  const cond = new Map(filasC.map(x => [clave(x.nombre), x.id])), nomDe = new Map(filasC.map(x => [x.id, x.nombre])), sucDe = new Map(filasC.map(x => [x.id, x.sucursal_id]));
  for (const c of conductores.slice(0, 500)) {
    const nombre = txt(c.nombre, 80).replace(/\s+/g, " "); if (!nombre) continue;
    const vals = [txt(c.ci, 20), txt(c.telefono, 20), txt(c.licencia_cat, 10), f(c.licencia_vence), sid(c.sucursal_id)];
    // c.id: conductor que ya existe con un nombre parecido (lo elige la vista previa); queda el nombre más completo
    let id = cond.get(clave(nombre)) || (nomDe.has(int(c.id)) ? int(c.id) : null);
    if (soloUsuarios) { // solo usuarios: no se crean ni se tocan las fichas de conductor
      if (!c.usuario) continue; if (!id) res.errores.push(`${nombre}: no encontré su ficha de conductor; el usuario se crea sin enlazar`);
      await usuarioConductor(env, e, c, id, nombre, sucDe.get(id) || vals[4], res); continue;
    }
    if (id) { const nom = nombre.length > (nomDe.get(id) || "").length ? nombre : nomDe.get(id);
      await env.DB.prepare(`UPDATE conductores SET nombre = ?, ci = COALESCE(NULLIF(?, ''), ci), telefono = COALESCE(NULLIF(?, ''), telefono), licencia_cat = COALESCE(NULLIF(?, ''), licencia_cat),
        licencia_vence = COALESCE(?, licencia_vence), sucursal_id = COALESCE(?, sucursal_id), activo = 1 WHERE id = ?`).bind(nom, ...vals, id).run(); cond.set(clave(nom), id); nomDe.set(id, nom); res.conductores.actualizados++; }
    else { id = (await env.DB.prepare("INSERT INTO conductores(nombre, ci, telefono, licencia_cat, licencia_vence, sucursal_id, activo, empresa_id) VALUES(?,?,?,?,?,?,1,?)")
        .bind(nombre, ...vals, e).run()).meta.last_row_id; cond.set(clave(nombre), id); nomDe.set(id, nombre); res.conductores.nuevos++; }
    if (c.usuario) await usuarioConductor(env, e, c, id, nombre, vals[4], res);
  }
  for (const v of vehiculos.slice(0, 200)) {
    const placa = normPlaca(v.placa), s = sid(v.sucursal_id); if (placa.length < 3) continue;
    if (!s) { res.errores.push(`${placa}: falta el parqueo`); continue; }
    const cur = await env.DB.prepare("SELECT id, km_actual, foto FROM vehiculos WHERE empresa_id = ? AND placa = ?").bind(e, placa).first();
    let foto = null; if (!cur?.foto && typeof v.foto === "string" && v.foto.startsWith("data:")) try { foto = await guardarFoto(env, e, v.foto); } catch (x) { res.errores.push(`${placa}: foto no guardada (${x.message})`); }
    const cid = v.conductor ? cond.get(clave(v.conductor)) || null : null, km = Math.max(0, num(v.km_actual));
    const vals = [txt(v.marca, 40), txt(v.modelo, 40), int(v.anio) || null, txt(v.tipo, 30), txt(v.combustible, 20), Math.max(0, num(v.tanque_l)) || null, Math.max(0, num(v.rendimiento_esp)) || null,
      cid, f(v.soat_vence), f(v.itv_vence), f(v.seguro_vence)];
    if (cur) {
      await env.DB.prepare(`UPDATE vehiculos SET sucursal_id = ?, marca = COALESCE(NULLIF(?, ''), marca), modelo = COALESCE(NULLIF(?, ''), modelo), anio = COALESCE(?, anio), tipo = COALESCE(NULLIF(?, ''), tipo),
        combustible = COALESCE(NULLIF(?, ''), combustible), tanque_l = COALESCE(?, tanque_l), rendimiento_esp = COALESCE(?, rendimiento_esp), conductor_id = COALESCE(?, conductor_id),
        soat_vence = COALESCE(?, soat_vence), itv_vence = COALESCE(?, itv_vence), seguro_vence = COALESCE(?, seguro_vence), foto = COALESCE(?, foto), km_actual = MAX(km_actual, ?) WHERE id = ?`)
        .bind(s, ...vals, foto, km, cur.id).run(); res.vehiculos.actualizados++; continue;
    }
    const lim = await revisarLimite(env, e, "vehiculos"); if (lim) { res.errores.push(`${placa}: ${lim}`); continue; }
    const id = (await env.DB.prepare(`INSERT INTO vehiculos(sucursal_id, placa, marca, modelo, anio, tipo, combustible, tanque_l, rendimiento_esp, conductor_id, soat_vence, itv_vence, seguro_vence, foto, km_actual, estado, codigo, empresa_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'activo',?,?)`).bind(s, placa, vals[0], vals[1], vals[2], vals[3], vals[4] || "Gasolina", vals[5] || 0, vals[6] || 0, ...vals.slice(7), foto, km, randomHex(5), e).run()).meta.last_row_id;
    await env.DB.batch(PLANES_INICIALES.map(([n, k, d]) => env.DB.prepare("INSERT INTO planes(empresa_id, vehiculo_id, nombre, cada_km, cada_dias, ultimo_km, ultima_fecha) VALUES(?,?,?,?,?,?,?)").bind(e, id, n, k, d, km, hoy)));
    res.vehiculos.nuevos++;
  }
  return res;
}
