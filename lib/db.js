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
  flota: { nombre: "Flota", sucursales: 5, usuarios: 50, vehiculos: 50, precio: 249 },
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
  `CREATE TABLE IF NOT EXISTS intentos(clave TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, hasta TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS proveedores(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, tipo TEXT NOT NULL DEFAULT 'taller', nombre TEXT NOT NULL, telefono TEXT DEFAULT '',
     nota TEXT DEFAULT '', activo INTEGER DEFAULT 1)`,
  `CREATE INDEX IF NOT EXISTS ix_prov ON proveedores(empresa_id, tipo)`,
  `CREATE TABLE IF NOT EXISTS activos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, vehiculo_id INTEGER NOT NULL, tipo TEXT NOT NULL DEFAULT 'llanta', marca TEXT DEFAULT '', detalle TEXT DEFAULT '',
     posicion TEXT DEFAULT '', fecha_instalacion TEXT, km_instalacion REAL DEFAULT 0, costo REAL DEFAULT 0, vida_km REAL DEFAULT 0, vida_meses INTEGER DEFAULT 0, estado TEXT DEFAULT 'activo',
     fecha_retiro TEXT, km_retiro REAL, motivo_retiro TEXT DEFAULT '', nota TEXT DEFAULT '', creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS ix_act ON activos(empresa_id, vehiculo_id)`,
  `CREATE TABLE IF NOT EXISTS repuestos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL, codigo TEXT DEFAULT '', unidad TEXT DEFAULT 'unidad', stock REAL DEFAULT 0,
     minimo REAL DEFAULT 0, costo REAL DEFAULT 0, activo INTEGER DEFAULT 1)`,
  `CREATE INDEX IF NOT EXISTS ix_rep ON repuestos(empresa_id)`,
  `CREATE TABLE IF NOT EXISTS movimientos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, repuesto_id INTEGER NOT NULL, fecha TEXT DEFAULT CURRENT_TIMESTAMP, tipo TEXT NOT NULL, cantidad REAL NOT NULL,
     costo REAL DEFAULT 0, vehiculo_id INTEGER, evento_id INTEGER, usuario_id INTEGER, nota TEXT DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS ix_mov ON movimientos(empresa_id, repuesto_id, fecha)`,
  `CREATE TABLE IF NOT EXISTS recordatorios(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, fecha TEXT NOT NULL, canal TEXT NOT NULL, destino TEXT DEFAULT '', resumen TEXT DEFAULT '', ok INTEGER DEFAULT 1,
     creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS ix_rec ON recordatorios(empresa_id, fecha)`,
  `CREATE TABLE IF NOT EXISTS ajustes(k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subs(id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL, empresa_id INTEGER, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
     equipo TEXT DEFAULT '', creado TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS ix_push ON push_subs(usuario_id)`,
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
  // Migraciones de columnas (SQLite no tiene ADD COLUMN IF NOT EXISTS)
  for (const [tabla, col, def] of [["usuarios", "iter", "INTEGER NOT NULL DEFAULT 20000"], ["eventos", "plan_km_antes", "REAL"], ["eventos", "plan_fecha_antes", "TEXT"],
    ["eventos", "factura", "TEXT DEFAULT ''"], ["vehiculos", "presupuesto_mes", "REAL DEFAULT 0"], ["sucursales", "presupuesto_mes", "REAL DEFAULT 0"],
    ["empresas", "email_avisos", "TEXT DEFAULT ''"], ["empresas", "foto_obligatoria", "INTEGER DEFAULT 0"], ["empresas", "ficha_publica", "INTEGER DEFAULT 1"],
    ["empresas", "pais", "TEXT DEFAULT 'BO'"], ["empresas", "tz", "REAL DEFAULT -4"], ["empresas", "doc1", "TEXT DEFAULT 'SOAT'"], ["empresas", "doc2", "TEXT DEFAULT 'Inspección técnica'"],
    ["empresas", "origen", "TEXT DEFAULT ''"], ["empresas", "email", "TEXT DEFAULT ''"], ["usuarios", "conductor_id", "INTEGER"], ["usuarios", "vehiculo_id", "INTEGER"], ["proveedores", "nit", "TEXT DEFAULT ''"], ["eventos", "cuf", "TEXT"], ["conductores", "sucursal_id", "INTEGER"], ["usuarios", "email", "TEXT DEFAULT ''"], ["usuarios", "ms_oid", "TEXT"]]) {
    try { await env.DB.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${def}`).run();
      // conductores existentes: se les asigna el parqueo del vehículo que manejan
      if (tabla === "conductores" && col === "sucursal_id") await env.DB.prepare("UPDATE conductores SET sucursal_id = (SELECT v.sucursal_id FROM vehiculos v WHERE v.conductor_id = conductores.id AND v.estado <> 'baja' ORDER BY v.id LIMIT 1) WHERE sucursal_id IS NULL").run();
    } catch (e) { if (!/duplicate column/i.test(String(e))) throw e; }
  }
  listo = true;
}
export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const err = (msg, s = 400) => json({ ok: false, error: msg }, s);
export const num = (v, d = 0) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : d; };
export const int = v => parseInt(v, 10) || 0;
export const txt = (v, max = 200) => String(v ?? "").trim().slice(0, max);
// Catálogo de proveedores: qué tipo de proveedor usa cada tipo de registro y cómo se llama en pantalla
export const TIPOS_PROV = { combustible: "surtidor", mantenimiento: "taller", lavado: "lavadero", gasto: "proveedor" };
export const NOMBRE_PROV = { surtidor: "la estación de servicio", taller: "el taller", lavadero: "el lavadero", proveedor: "el proveedor" };
// Resuelve el proveedor de un registro. Si la empresa ya tiene proveedores de ese tipo, solo se aceptan los de la lista
// (por id o por nombre exacto); si todavía no tiene ninguno, se acepta texto libre. `actual` es el valor guardado al editar.
export async function resolverProveedor(env, empresaId, tipoEvento, b, actual = null) {
  const tp = TIPOS_PROV[tipoEvento]; if (!tp) return { nombre: "" };
  const nombre = txt(b.proveedor, 80);
  if (b.proveedor_id) {
    const p = await env.DB.prepare("SELECT nombre FROM proveedores WHERE id = ? AND empresa_id = ? AND tipo = ? AND activo = 1").bind(int(b.proveedor_id), empresaId, tp).first();
    return p ? { nombre: p.nombre } : { error: `Ese ${NOMBRE_PROV[tp].replace(/^(el|la) /, "")} ya no está en la lista. Elige otro.` };
  }
  if (!nombre || nombre === actual) return { nombre };
  const p = await env.DB.prepare("SELECT nombre FROM proveedores WHERE empresa_id = ? AND tipo = ? AND activo = 1 AND lower(nombre) = lower(?)").bind(empresaId, tp, nombre).first();
  if (p) return { nombre: p.nombre };
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM proveedores WHERE empresa_id = ? AND tipo = ? AND activo = 1").bind(empresaId, tp).first();
  return n.n > 0 ? { error: `Elige ${NOMBRE_PROV[tp]} de la lista. Si falta, pide que lo agreguen en Proveedores.` } : { nombre };
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export const randomHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };
// Iteraciones de PBKDF2 para contraseñas nuevas. Las antiguas (columna usuarios.iter) se actualizan solas al iniciar sesión.
export const ITER = 60000;
export async function hashPass(pass, salt, iter = ITER) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: iter }, key, 256));
}
// Límite de intentos de login: máximo MAX_INTENTOS fallos por clave (usuario o IP) en BLOQUEO_MIN minutos
export const MAX_INTENTOS = 6, BLOQUEO_MIN = 15;
export async function intentosBloqueado(env, claves) {
  const ph = claves.map(() => "?").join(",");
  const r = await env.DB.prepare(`SELECT MAX(n) AS n, MAX(hasta) AS hasta FROM intentos WHERE clave IN (${ph}) AND hasta > datetime('now')`).bind(...claves).first();
  if (r && r.n >= MAX_INTENTOS) { const min = Math.max(1, Math.ceil((new Date(r.hasta + "Z") - Date.now()) / 60000)); return `Demasiados intentos. Espera ${min} minuto${min === 1 ? "" : "s"} y vuelve a probar.`; }
  return null;
}
export async function intentoFallido(env, claves) {
  await env.DB.batch(claves.map(k => env.DB.prepare(`INSERT INTO intentos(clave, n, hasta) VALUES(?, 1, datetime('now', '+${BLOQUEO_MIN} minutes'))
    ON CONFLICT(clave) DO UPDATE SET n = CASE WHEN hasta > datetime('now') THEN n + 1 ELSE 1 END, hasta = datetime('now', '+${BLOQUEO_MIN} minutes')`).bind(k)));
}
export async function intentosLimpiar(env, claves) {
  await env.DB.batch([env.DB.prepare("DELETE FROM intentos WHERE hasta < datetime('now')"), ...claves.map(k => env.DB.prepare("DELETE FROM intentos WHERE clave = ?").bind(k))]);
}
export function sameStr(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
export const validUser = u => /^[a-z0-9._@-]{3,60}$/.test(u);
// Estado de la empresa: null si puede operar, o el motivo si no
export const hoy = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); // hora de Bolivia (plataforma)
// Zona horaria por empresa: `tz` son horas respecto a UTC (Bolivia -4). Los registros se guardan en UTC; estas funciones convierten días locales.
export const TZ_DEF = -4;
const tzN = tz => (tz == null || !isFinite(+tz)) ? TZ_DEF : Math.max(-12, Math.min(14, +tz));
export const tzStr = tz => { const t = tzN(tz), a = Math.abs(t); return `${t < 0 ? "-" : "+"}${String(Math.floor(a)).padStart(2, "0")}:${a % 1 ? "30" : "00"}`; }; // "-04:00"
export const tzSql = tz => `${tzN(tz) >= 0 ? "+" : ""}${tzN(tz)} hours`; // para datetime(fecha, '-4 hours')
export const hoyTZ = tz => new Date(Date.now() + tzN(tz) * 3600e3).toISOString().slice(0, 10);
export const inicioDia = (f, tz) => new Date(f + "T00:00:00" + tzStr(tz)).toISOString();
export const finDia = (f, tz) => new Date(new Date(f + "T00:00:00" + tzStr(tz)).getTime() + 864e5).toISOString();
export const mediodia = (f, tz) => new Date(f + "T12:00:00" + tzStr(tz)).toISOString();
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
  const u = await env.DB.prepare(`SELECT u.id, u.usuario, u.nombre, u.permisos, u.sucursales, u.super, u.empresa_id, u.conductor_id, u.vehiculo_id,
      e.nombre AS e_nombre, e.slug AS e_slug, e.activo AS e_activo, e.vence AS e_vence, e.tz, e.doc1, e.doc2, e.foto_obligatoria, e.moneda
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

export const PERFIL_EMPRESA = "SELECT id, nombre, slug, whatsapp, direccion, moneda, tolerancia_consumo, retencion_fotos, vence, plan, email_avisos, email, foto_obligatoria, ficha_publica, pais, tz, doc1, doc2, origen FROM empresas WHERE id = ?";
// País: moneda, zona horaria (horas respecto a UTC) y nombres de los dos documentos obligatorios del vehículo
export const PAISES = {
  BO: { nombre: "Bolivia", moneda: "Bs", tz: -4, doc1: "SOAT", doc2: "Inspección técnica" },
  PE: { nombre: "Perú", moneda: "S/", tz: -5, doc1: "SOAT", doc2: "Revisión técnica" },
  AR: { nombre: "Argentina", moneda: "$", tz: -3, doc1: "Seguro obligatorio", doc2: "VTV" },
  CL: { nombre: "Chile", moneda: "$", tz: -4, doc1: "SOAP", doc2: "Revisión técnica" },
  CO: { nombre: "Colombia", moneda: "$", tz: -5, doc1: "SOAT", doc2: "Revisión técnico-mecánica" },
  EC: { nombre: "Ecuador", moneda: "$", tz: -5, doc1: "SPPAT", doc2: "Revisión vehicular" },
  PY: { nombre: "Paraguay", moneda: "Gs", tz: -4, doc1: "Seguro obligatorio", doc2: "Inspección técnica" },
  UY: { nombre: "Uruguay", moneda: "$", tz: -3, doc1: "SOA", doc2: "Inspección técnica" },
  MX: { nombre: "México", moneda: "$", tz: -6, doc1: "Seguro obligatorio", doc2: "Verificación vehicular" },
  OT: { nombre: "Otro país", moneda: "$", tz: 0, doc1: "Seguro obligatorio", doc2: "Inspección técnica" }
};
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
// Llantas y baterías: km y meses de uso, porcentaje de vida consumido y estado
export function estadoActivo(a, kmVeh, hoy) {
  const kmFin = a.estado === "retirado" ? (a.km_retiro ?? kmVeh) : kmVeh, km = Math.max(0, (kmFin || 0) - (a.km_instalacion || 0));
  const fin = a.estado === "retirado" && a.fecha_retiro ? a.fecha_retiro : hoy;
  const meses = a.fecha_instalacion ? Math.max(0, (new Date(fin + "T12:00:00Z") - new Date(a.fecha_instalacion + "T12:00:00Z")) / (30.44 * 864e5)) : 0;
  const pct = Math.max(a.vida_km > 0 ? km / a.vida_km : 0, a.vida_meses > 0 ? meses / a.vida_meses : 0);
  return { km_recorrido: Math.round(km), meses: Math.round(meses * 10) / 10, pct: Math.round(pct * 100), estado_vida: a.estado === "retirado" ? "retirado" : pct >= 1 ? "vencido" : pct >= 0.85 ? "proximo" : "ok" };
}
export const NOM_ACTIVO = { llanta: "Llanta", bateria: "Batería" };
// Recalcula, a partir de los registros no anulados, el kilometraje actual del vehículo, el rendimiento de cada carga
// de tanque lleno y el último mantenimiento de cada plan. Se usa al anular o corregir un registro.
export async function recalcularVehiculo(env, vid) {
  const v = await env.DB.prepare("SELECT v.*, e.tolerancia_consumo FROM vehiculos v JOIN empresas e ON e.id = v.empresa_id WHERE v.id = ?").bind(vid).first(); if (!v) return;
  const { results: todos } = await env.DB.prepare("SELECT id, tipo, km, litros, lleno, rendimiento, alerta, plan_id, fecha, anulado, plan_km_antes, plan_fecha_antes FROM eventos WHERE vehiculo_id = ? ORDER BY km, fecha, id").bind(vid).all();
  const ev = todos.filter(e => !e.anulado), st = [];
  const maxKm = ev.reduce((m, e) => e.km != null && e.km > m ? e.km : m, 0);
  if (maxKm > 0 && maxKm !== v.km_actual) st.push(env.DB.prepare("UPDATE vehiculos SET km_actual = ? WHERE id = ?").bind(maxKm, vid));
  // rendimiento entre cargas de tanque lleno
  let prevKm = null, litrosParciales = 0;
  const sinRend = a => (a || "").split(" · ").filter(s => s && !/^Rendimiento (bajo|muy alto)/.test(s));
  for (const e of ev.filter(x => x.tipo === "combustible" && x.km != null)) {
    if (!e.lleno) { if (prevKm != null) litrosParciales += e.litros || 0; continue; }
    let r = null; if (prevKm != null && e.km > prevKm) { const l = litrosParciales + (e.litros || 0); if (l > 0) r = Math.round((e.km - prevKm) / l * 100) / 100; }
    const al = sinRend(e.alerta);
    if (r != null && v.rendimiento_esp > 0 && r < v.rendimiento_esp * (1 - v.tolerancia_consumo / 100)) al.push(`Rendimiento bajo: ${r} km/l (esperado ${v.rendimiento_esp})`);
    if (r != null && v.rendimiento_esp > 0 && r > v.rendimiento_esp * 1.6) al.push(`Rendimiento muy alto (${r} km/l): puede faltar registrar alguna carga`);
    const alerta = al.join(" · ") || null;
    if (r !== e.rendimiento || alerta !== e.alerta) st.push(env.DB.prepare("UPDATE eventos SET rendimiento = ?, alerta = ? WHERE id = ?").bind(r, alerta, e.id));
    prevKm = e.km; litrosParciales = 0;
  }
  // último mantenimiento de cada plan
  const { results: planes } = await env.DB.prepare("SELECT id, ultimo_km, ultima_fecha FROM planes WHERE vehiculo_id = ? AND activo = 1").bind(vid).all();
  for (const p of planes) {
    const m = ev.filter(e => e.tipo === "mantenimiento" && e.plan_id === p.id).sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0];
    let uk, uf;
    if (m) { uk = m.km ?? p.ultimo_km; uf = m.fecha.slice(0, 10); }
    else { // no queda ningún mantenimiento vigente: volver a lo que tenía el plan antes del primer registro anulado
      const an = todos.filter(e => e.anulado && e.plan_id === p.id && (e.plan_km_antes != null || e.plan_fecha_antes)).sort((a, b) => a.id - b.id)[0]; if (!an) continue;
      uk = an.plan_km_antes ?? p.ultimo_km; uf = an.plan_fecha_antes; }
    if (uk !== p.ultimo_km || uf !== p.ultima_fecha) st.push(env.DB.prepare("UPDATE planes SET ultimo_km = ?, ultima_fecha = ? WHERE id = ?").bind(uk, uf, p.id));
  }
  if (st.length) await env.DB.batch(st);
}
export function estadoDoc(fecha, hoy) { if (!fecha) return null; const d = diasEntre(hoy, fecha); return { dias: d, estado: d < 0 ? "vencido" : d <= 30 ? "proximo" : "ok" }; }
