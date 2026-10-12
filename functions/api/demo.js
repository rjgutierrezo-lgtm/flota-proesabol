// POST (solo el dueño de la plataforma) → crea o regenera la empresa "Transportes Demo" con 6 meses de datos ficticios
import { json, err, sesion, hashPass, randomHex, PERMISOS, PLANES_INICIALES, ITER } from "../../lib/db.js";
const SLUG = "demo-flota", CLAVE = "demo1234";
export async function onRequestPost({ request, env }) {
  const u = await sesion(request, env); if (!u?.super) return err("Solo el dueño de la plataforma", 403);
  for (const us of ["demo.admin", "demo.chofer"]) { const x = await env.DB.prepare("SELECT u.id FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.usuario = ? AND (e.slug IS NULL OR e.slug <> ?)").bind(us, SLUG).first();
    if (x) return err(`El usuario ${us} ya existe en otra empresa`); }
  // 1) borrar la demo anterior
  const prev = await env.DB.prepare("SELECT id FROM empresas WHERE slug = ?").bind(SLUG).first();
  if (prev) { const id = prev.id;
    await env.DB.batch(["eventos", "planes", "vehiculos", "conductores", "sucursales", "fotos", "pagos"].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE empresa_id = ?`).bind(id))
      .concat([env.DB.prepare("DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = ?)").bind(id), env.DB.prepare("DELETE FROM usuarios WHERE empresa_id = ?").bind(id), env.DB.prepare("DELETE FROM empresas WHERE id = ?").bind(id)])); }
  // 2) empresa, parqueos, usuarios y conductores
  const eid = (await env.DB.prepare("INSERT INTO empresas(nombre, slug, plan, telefono_admin) VALUES('Transportes Demo', ?, 'empresa', '')").bind(SLUG).run()).meta.last_row_id;
  const p1 = (await env.DB.prepare("INSERT INTO sucursales(empresa_id, nombre, direccion) VALUES(?, 'Parqueo Central', 'Av. Cristo Redentor, 4to anillo')").bind(eid).run()).meta.last_row_id;
  const p2 = (await env.DB.prepare("INSERT INTO sucursales(empresa_id, nombre, direccion) VALUES(?, 'Parqueo Norte', 'Carretera a Warnes km 8')").bind(eid).run()).meta.last_row_id;
  const s1 = randomHex(16), s2 = randomHex(16), hoyD = new Date(), dia = 864e5, iso = d => new Date(d).toISOString(), f10 = d => iso(d).slice(0, 10), mas = n => f10(hoyD.getTime() + n * dia);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, sucursales, iter) VALUES(?,?,?,?,?,?,?,?)").bind(eid, "demo.admin", "Ana Demo (jefa de flota)", await hashPass(CLAVE, s1), s1, JSON.stringify(Object.keys(PERMISOS)), "[]", ITER),
    env.DB.prepare("INSERT INTO usuarios(empresa_id, usuario, nombre, hash, salt, permisos, sucursales, iter) VALUES(?,?,?,?,?,?,?,?)").bind(eid, "demo.chofer", "Carlos Demo (conductor)", await hashPass(CLAVE, s2), s2, JSON.stringify(["registrar"]), JSON.stringify([p2]), ITER)]);
  const conds = [["Carlos Mamani", "C", mas(12)], ["Luis Rojas", "C", mas(400)], ["Miguel Vargas", "B", mas(220)], ["José Flores", "C", mas(-5)], ["Pedro Gutiérrez", "B", mas(300)]];
  const cid = []; for (const [n, c, v] of conds) cid.push((await env.DB.prepare("INSERT INTO conductores(empresa_id, nombre, ci, telefono, licencia_cat, licencia_vence) VALUES(?,?,?,?,?,?)").bind(eid, n, String(4000000 + cid.length * 13571), "7" + (1000000 + cid.length * 2471), c, v).run()).meta.last_row_id);
  // 3) vehículos: placa, parqueo, marca, modelo, año, tipo, combustible, tanque, km/l esperado, km/día, conductor, soat, itv, "problema"
  const V = [["2847KLM", p1, "Toyota", "Hilux", 2021, "Camioneta", "Diésel", 80, 10, 160, 0, mas(150), mas(90), ""], ["3159PRT", p1, "Nissan", "Frontier", 2020, "Camioneta", "Diésel", 80, 9.5, 140, 1, mas(9), mas(200), ""],
    ["4512GHJ", p1, "Hyundai", "H100", 2019, "Furgón", "Diésel", 65, 8.5, 190, 2, mas(240), mas(-20), "consumo"], ["1986BNM", p2, "Isuzu", "NPR", 2018, "Camión", "Diésel", 100, 6, 210, 3, mas(60), mas(120), "mant"],
    ["5520XYZ", p2, "Toyota", "Hiace", 2022, "Furgón", "Diésel", 70, 9, 170, 4, mas(-3), mas(300), ""], ["6034QWE", p2, "Suzuki", "Swift", 2023, "Automóvil", "Gasolina", 37, 15, 90, null, mas(320), mas(180), ""]];
  const precio = c => c === "Gasolina" ? 3.74 : 3.72, rnd = (a, b) => a + Math.random() * (b - a), st = [];
  for (const [placa, sid, marca, modelo, anio, tipo, comb, tanque, rend, kmd, ci, soat, itv, prob] of V) {
    let km = Math.round(rnd(30000, 120000)); const inicio = hoyD.getTime() - 180 * dia;
    const vid = (await env.DB.prepare(`INSERT INTO vehiculos(empresa_id, sucursal_id, codigo, placa, marca, modelo, anio, tipo, combustible, tanque_l, rendimiento_esp, km_actual, conductor_id, soat_vence, itv_vence, seguro_vence)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(eid, sid, randomHex(5), placa, marca, modelo, anio, tipo, comb, tanque, rend, km, ci == null ? null : cid[ci], soat, itv, mas(Math.round(rnd(30, 300)))).run()).meta.last_row_id;
    const planes = PLANES_INICIALES.map(([n, k, d]) => ({ n, k, d, uk: km - Math.round(rnd(0, k * 0.3)), uf: f10(inicio - rnd(0, 30) * dia) }));
    let ultKm = km, litrosAcum = 0, ev = [];
    for (let t = inicio; t <= hoyD.getTime() - dia / 2; t += dia) {
      const dow = new Date(t).getUTCDay(); if (dow === 0) continue; // domingos sin uso
      const recorrido = Math.round(kmd * rnd(0.6, 1.3)); km += recorrido;
      const malo = prob === "consumo" && t > hoyD.getTime() - 25 * dia; // últimas semanas consume de más
      litrosAcum += recorrido / (rend * (malo ? 0.68 : rnd(0.93, 1.06)));
      const fecha = iso(t + rnd(8, 18) * 3600e3);
      if (litrosAcum >= tanque * rnd(0.55, 0.8)) { const l = Math.round(litrosAcum * 10) / 10, r = Math.round((km - ultKm) / l * 100) / 100;
        const alerta = r < rend * 0.8 ? `Rendimiento bajo: ${r} km/l (esperado ${rend})` : null;
        ev.push(["combustible", fecha, km, l, Math.round(l * precio(comb) * 100) / 100, 1, ["YPFB Av. Banzer", "Surtidor El Trompillo", "YPFB Carretera Norte", "Estación Los Pozos"][Math.floor(rnd(0, 4))], "", "", null, r, alerta]);
        ultKm = km; litrosAcum = 0; }
      for (const p of planes) { const vence = km >= p.uk + p.k || (p.d && t >= new Date(p.uf).getTime() + p.d * dia);
        if (vence && !(prob === "mant" && p.n.startsWith("Cambio de aceite") && t > hoyD.getTime() - 40 * dia)) { // el camión tiene el aceite atrasado a propósito
          const costo = { "Cambio de aceite y filtro": [350, 520], "Filtro de aire": [90, 160], "Rotación y revisión de llantas": [80, 150], "Revisión de frenos": [300, 900] }[p.n];
          ev.push(["mantenimiento", fecha, km, null, Math.round(rnd(...costo)), 0, ["Taller Mecánico Rojas", "Servicio Toyota", "Taller Hermanos Vaca", "Lubricentro Norte"][Math.floor(rnd(0, 4))], "", "", p.n, null, null]);
          p.uk = km; p.uf = f10(t); } }
      if (dow === 6 && Math.random() < 0.55) ev.push(["lavado", fecha, km, null, Math.round(rnd(30, 70)), 0, "Lavadero Express", ["Lavado simple", "Lavado completo"][Math.floor(rnd(0, 2))], "", null, null, null]);
      if (Math.random() < 0.06) ev.push(["gasto", fecha, km, null, Math.round(rnd(10, 40)), 0, "", "", "Peaje", null, null, null]);
      if (Math.random() < 0.012) ev.push(["mantenimiento", fecha, km, null, Math.round(rnd(250, 1400)), 0, "Taller Mecánico Rojas", ["Cambio de batería", "Reparación de embrague", "Alineación y balanceo", "Cambio de amortiguadores"][Math.floor(rnd(0, 4))], "", null, null, null]);
      if (Math.random() < 0.01) ev.push(["gasto", fecha, km, null, Math.round(rnd(150, 900)), 0, "Importadora de repuestos", "", ["Repuesto", "Llantas"][Math.floor(rnd(0, 2))], null, null, null]);
    }
    const pid = {}; for (const p of planes) pid[p.n] = (await env.DB.prepare("INSERT INTO planes(empresa_id, vehiculo_id, nombre, cada_km, cada_dias, ultimo_km, ultima_fecha) VALUES(?,?,?,?,?,?,?)").bind(eid, vid, p.n, p.k, p.d, p.uk, p.uf).run()).meta.last_row_id;
    for (const [tipo, fecha, k, l, monto, lleno, prov, det, cat, plan, rend2, alerta] of ev)
      st.push(env.DB.prepare(`INSERT INTO eventos(empresa_id, sucursal_id, vehiculo_id, tipo, fecha, km, litros, monto, lleno, proveedor, detalle, categoria, plan_id, conductor_id, rendimiento, alerta, creado)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(eid, sid, vid, tipo, fecha, k, l, monto, lleno, prov, det, cat, plan ? pid[plan] : null, ci == null ? null : cid[ci], rend2, alerta, fecha.replace("T", " ").slice(0, 19)));
    st.push(env.DB.prepare("UPDATE vehiculos SET km_actual = ? WHERE id = ?").bind(km, vid));
  }
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
  return json({ ok: true, empresa: "Transportes Demo", registros: st.length - V.length, usuarios: [{ usuario: "demo.admin", clave: CLAVE, perfil: "Administradora: ve todo (dashboard, costos)" }, { usuario: "demo.chofer", clave: CLAVE, perfil: "Conductor del Parqueo Norte: solo registra y ve sus vehículos" }] });
}
