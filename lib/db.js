// ---------- Multiempresa: base de datos, sesiones y permisos ----------
export const PERMISOS = {
  registrar: "Registrar combustible, lavados, gastos y kilometraje",
  mantenimiento: "Planes de mantenimiento y registrar mantenimientos",
  vehiculos: "Administrar vehículos, conductores y documentos",
  reportes: "Ver costos, historial completo y reportes (y anular registros)",
  sucursales: "Administrar sucursales o bases",
  usuarios: "Administrar usuarios y datos de la empresa"
};
export const PLANES = {
  basico: { nombre: "Básico", sucursales: 1, usuarios: 5, vehiculos: 5, precio: 99 },
  flota: { nombre: "Flota", sucursales: 3, usuarios: 20, vehiculos: 25, precio: 249 },
  empresa: { nombre: "Empresa", sucursales: null, usuarios: null, vehiculos: null, precio: 499 }
};
export const GRACIA_DIAS = 5, AVISO_DIAS = 7;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS empresas(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, whatsapp TEXT DEFAULT '', direccion TEXT DEFAULT '',
     moneda TEXT DEFAULT 'Bs', tolerancia_consumo INTEGER DEFAULT 20, retencion_fotos INTEGER DEFAULT 365, activo INTEGER DEFAULT 1, vence TEXT, plan TEXT DEFAULT 'basico',
     precio REAL, telefono_admin TEXT DEFAULT '', max_sucursales INTEGER, max_usuarios INTEGER, max_vehiculos INTEGER, creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY, empresa_id INTEGER, usuario TEXT UNIQUE NOT NULL, nombre TEXT, hash TEXT NOT NULL, salt TEXT NOT NULL,
     permisos TEXT NOT NULL DEFAULT '[]', sucursales TEXT NOT NULL DEFAULT '[]', super INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1, creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sesiones(token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, expira TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sucursales(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL, direccion TEXT DEFAULT '', telefono TEXT DEFAULT '', activo INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS conductores(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL, ci TEXT DEFAULT '', telefono TEXT DEFAULT '',
     licencia_cat TEXT DEFAULT '', licencia_vence TEXT, activo INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS vehiculos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, sucursal_id INTEGER NOT NULL, codigo TEXT UNIQUE NOT NULL, placa TEXT NOT NULL,
     marca TEXT DEFAULT '', modelo TEXT DEFAULT '', anio INTEGER, tipo TEXT DEFAULT '', combustible TEXT DEFAULT 'Gasolina', tanque_l REAL DEFAULT 0, rendimiento_esp REAL DEFAULT 0,
     km_actual REAL DEFAULT 0, conductor_id INTEGER, estado TEXT DEFAULT 'activo', soat_vence TEXT, itv_vence TEXT, seguro_vence TEXT, notas TEXT DEFAULT '', foto TEXT,
     creado TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(empresa_id, placa))`,
  `CREATE TABLE IF NOT EXISTS planes(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, vehiculo_id INTEGER NOT NULL, nombre TEXT NOT NULL, cada_km REAL DEFAULT 0,
     cada_dias INTEGER DEFAULT 0, ultimo_km REAL DEFAULT 0, ultima_fecha TEXT, activo INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS eventos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, sucursal_id INTEGER NOT NULL, vehiculo_id INTEGER NOT NULL, tipo TEXT NOT NULL,
     fecha TEXT NOT NULL, km REAL, litros REAL, monto REAL DEFAULT 0, lleno INTEGER DEFAULT 1, proveedor TEXT DEFAULT '', detalle TEXT DEFAULT '', categoria TEXT DEFAULT '',
     plan_id INTEGER, foto1 TEXT, foto2 TEXT, conductor_id INTEGER, usuario_id INTEGER, rendimiento REAL, alerta TEXT, anulado INTEGER DEFAULT 0, creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS fotos(k TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, data TEXT NOT NULL, creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pagos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, fecha TEXT DEFAULT CURRENT_TIMESTAMP, monto REAL NOT NULL, meses INTEGER NOT NULL,
     vence_antes TEXT, vence_nuevo TEXT, metodo TEXT, ref TEXT, nota TEXT, registrado_por INTEGER)`,
  `CREATE INDEX IF NOT EXISTS ix_veh ON vehiculos(empresa_id, sucursal_id)`,
  `CREATE INDEX IF NOT EXISTS ix_ev ON eventos(empresa_id, vehiculo_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS ix_ev_f ON eventos(empresa_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS ix_pl ON planes(vehiculo_id)`,
  `CREATE INDEX IF NOT EXISTS ix_fotos ON fotos(empresa_id, creado)`,
  `CREATE INDEX IF NOT EXISTS ix_pagos ON pagos(empresa_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS ix_usr_emp ON usuarios(empresa_id)`
];
let listo = false;
export async function ensureSchema(env) {
  if (listo) return;
  if (!env.DB) throw new Error("Falta conectar la base de datos D1 con el nombre DB");
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  listo = true;
}
export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const err = (msg, s = 400) => json({ ok: false, error: msg }, s);
export const num = (v, d = 0) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : d; };
export const int = v => parseInt(v, 10) || 0;
export const txt = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export const randomHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };
export async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 20000 }, key, 256));
}
export function sameStr(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
export const validUser = u => /^[a-z0-9._@-]{3,60}$/.test(u);
// Estado de la empresa: null si puede operar, o el motivo si no
export const hoy = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); // hora de Bolivia
export const sumarDias = (f, d) => { const x = new Date(f + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
export const sumarMeses = (f, m) => { const x = new Date(f + "T12:00:00Z"), dia = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + m);
  const fin = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(dia, fin)); return x.toISOString().slice(0, 10); };
export function bloqueo(e) {
  if (!e) return "Empresa no encontrada";
  if (!e.activo) return "La empresa está suspendida. Comunícate con el proveedor del sistema.";
  if (e.vence && sumarDias(e.vence, GRACIA_DIAS) < hoy()) return "La suscripción de la empresa venció el " + e.vence + ". Renueva tu pago para seguir usando el sistema.";
  return null;
}
// Aviso para mostrar dentro del sistema (null si todo está en orden)
export function aviso(e) {
  if (!e?.vence) return null; const h = hoy();
  if (e.vence < h) return { nivel: "bad", texto: `Tu suscripción venció el ${e.vence}. El sistema se bloqueará el ${sumarDias(e.vence, GRACIA_DIAS)} si no se registra el pago.` };
  if (e.vence <= sumarDias(h, AVISO_DIAS)) return { nivel: "warn", texto: `Tu suscripción vence el ${e.vence}. Renueva tu pago para no tener interrupciones.` };
  return null;
}
// Límites efectivos de la empresa (null = ilimitado)
export async function limites(env, empresa_id) {
  const e = await env.DB.prepare("SELECT plan, max_sucursales, max_usuarios, max_vehiculos FROM empresas WHERE id = ?").bind(empresa_id).first();
  const p = PLANES[e?.plan] || PLANES.basico;
  return { plan: e?.plan || "basico", nombre: p.nombre, sucursales: e?.max_sucursales ?? p.sucursales, usuarios: e?.max_usuarios ?? p.usuarios, vehiculos: e?.max_vehiculos ?? p.vehiculos };
}
export async function revisarLimite(env, empresa_id, tipo) {
  const L = await limites(env, empresa_id), max = L[tipo]; if (max == null) return null;
  const q = { sucursales: "SELECT COUNT(*) AS n FROM sucursales WHERE empresa_id = ? AND activo = 1", usuarios: "SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ? AND activo = 1",
    vehiculos: "SELECT COUNT(*) AS n FROM vehiculos WHERE empresa_id = ? AND estado <> 'baja'" }[tipo];
  const c = await env.DB.prepare(q).bind(empresa_id).first();
  return c.n >= max ? `Tu plan ${L.nombre} permite hasta ${max} ${tipo === "sucursales" ? "parqueos" : tipo} activos. Para agregar más, mejora tu plan.` : null;
}
// Usuario de la sesión, con su empresa. Devuelve null si no hay sesión válida.
export async function sesion(request, env) {
  const t = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[0-9a-f]{64}$/.test(t)) return null;
  const u = await env.DB.prepare(`SELECT u.id, u.usuario, u.nombre, u.permisos, u.sucursales, u.super, u.empresa_id,
      e.nombre AS e_nombre, e.slug AS e_slug, e.activo AS e_activo, e.vence AS e_vence
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id LEFT JOIN empresas e ON e.id = u.empresa_id
    WHERE s.token = ? AND s.expira > datetime('now') AND u.activo = 1`).bind(t).first();
  if (!u) return null;
  u.permisos = JSON.parse(u.permisos || "[]"); u.sucursales = JSON.parse(u.sucursales || "[]"); u.token = t; u.super = !!u.super;
  if (!u.super && bloqueo({ activo: u.e_activo, vence: u.e_vence })) return null;
  return u;
}
export const puede = (u, p) => !!u && !u.super && u.permisos.includes(p);
export const E = u => u.empresa_id;
// Sucursales a las que el usuario tiene acceso (todas si su lista está vacía)
export async function misSucursales(env, u) {
  const { results } = await env.DB.prepare("SELECT id, nombre, direccion, telefono, activo FROM sucursales WHERE empresa_id = ? AND activo = 1 ORDER BY id").bind(E(u)).all();
  return u.sucursales.length ? results.filter(s => u.sucursales.includes(s.id)) : results;
}
export async function sucursalOk(env, u, sid) { return (await misSucursales(env, u)).some(s => s.id === sid); }
export const nuevoId = p => p + "-" + Date.now().toString(36).toUpperCase() + randomHex(2).toUpperCase();
export const slugify = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// Hora de Bolivia (UTC-4)
export function ahora() { const d = new Date(Date.now() - 4 * 3600e3); return { fecha: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16) }; }
export const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f || ""), esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || "");

export const PERFIL_EMPRESA = "SELECT id, nombre, slug, whatsapp, direccion, moneda, tolerancia_consumo, retencion_fotos, vence, plan FROM empresas WHERE id = ?";
// ---------- Fotos: R2 si está conectado (binding FOTOS), si no en la base ----------
export async function guardarFoto(env, empresa_id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || ""); if (!m) return null;
  if (m[2].length > 600000) throw new Error("La foto es muy pesada");
  const k = `${empresa_id}/${new Date().toISOString().slice(0, 10)}/${randomHex(10)}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  if (env.FOTOS) await env.FOTOS.put(k, Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)), { httpMetadata: { contentType: "image/" + m[1] } });
  else await env.DB.prepare("INSERT INTO fotos(k, empresa_id, data) VALUES(?,?,?)").bind(k, empresa_id, dataUrl).run();
  return k;
}
export async function limpiarFotos(env, empresa_id, dias) { // borra fotos viejas de la base (en R2 se usa una regla de ciclo de vida)
  if (!env.FOTOS && dias > 0) await env.DB.prepare("DELETE FROM fotos WHERE empresa_id = ? AND creado < datetime('now', ?)").bind(empresa_id, `-${Math.floor(dias)} days`).run();
}
export const normPlaca = p => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
// Planes de mantenimiento con los que arranca cada vehículo nuevo: nombre, cada km, cada días
export const PLANES_INICIALES = [["Cambio de aceite y filtro", 5000, 180], ["Filtro de aire", 10000, 365], ["Rotación y revisión de llantas", 10000, 180], ["Revisión de frenos", 20000, 365]];
export const hoyBO = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
// ---------- Alertas de flota ----------
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
export function estadoPlan(p, km, hoy) {
  const proxKm = p.cada_km > 0 ? (p.ultimo_km || 0) + p.cada_km : null;
  const proxFecha = p.cada_dias > 0 && p.ultima_fecha ? new Date(new Date(p.ultima_fecha + "T12:00:00Z").getTime() + p.cada_dias * 864e5).toISOString().slice(0, 10) : null;
  const faltaKm = proxKm != null ? proxKm - km : null, faltaDias = proxFecha ? diasEntre(hoy, proxFecha) : null;
  let estado = "ok";
  if ((faltaKm != null && faltaKm <= 0) || (faltaDias != null && faltaDias <= 0)) estado = "vencido";
  else if ((faltaKm != null && faltaKm <= Math.max(500, p.cada_km * 0.1)) || (faltaDias != null && faltaDias <= 15)) estado = "proximo";
  if (!p.ultima_fecha && !p.ultimo_km) estado = estado === "ok" ? "sin_registro" : estado;
  return { proxKm, proxFecha, faltaKm, faltaDias, estado };
}
export function estadoDoc(fecha, hoy) { if (!fecha) return null; const d = diasEntre(hoy, fecha); return { dias: d, estado: d < 0 ? "vencido" : d <= 30 ? "proximo" : "ok" }; }
