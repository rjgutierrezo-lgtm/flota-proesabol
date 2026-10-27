// Arma un SQL para restaurar FlotaControl a partir del repo de backups de GitHub (clonado o descargado como ZIP y descomprimido).
// Uso:  node restaurar.mjs <carpeta del repo> [AAAA-MM-DD]   (sin fecha: el backup más reciente)
//       La clave se pide por la variable BACKUP_CLAVE:  $env:BACKUP_CLAVE="..."  (PowerShell)  o  BACKUP_CLAVE=... node restaurar.mjs ...
// Genera restaurar-AAAA-MM-DD.sql con todos los datos y las fotos. Luego:
//       npx wrangler d1 execute <base> --remote --file restaurar-AAAA-MM-DD.sql
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { webcrypto as crypto } from "node:crypto";

const [carpeta, fecha] = process.argv.slice(2), CLAVE = process.env.BACKUP_CLAVE || "";
if (!carpeta || !existsSync(join(carpeta, "datos"))) { console.error("Uso: node restaurar.mjs <carpeta del repo de backups> [AAAA-MM-DD]"); process.exit(1); }
if (!CLAVE) { console.error("Falta la clave: define la variable BACKUP_CLAVE"); process.exit(1); }

const archivos = readdirSync(join(carpeta, "datos")).filter(f => /^\d{4}-\d{2}-\d{2}\.sql\.gz\.enc$/.test(f)).sort();
const elegido = fecha ? `${fecha}.sql.gz.enc` : archivos[archivos.length - 1];
if (!elegido || !archivos.includes(elegido)) { console.error("No encuentro el backup" + (fecha ? " del " + fecha : "") + ". Hay: " + archivos.slice(-10).join(", ")); process.exit(1); }

const raw = readFileSync(join(carpeta, "datos", elegido));
if (raw.subarray(0, 4).toString() !== "FLB1") { console.error("El archivo no es un backup cifrado de FlotaControl"); process.exit(1); }
const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CLAVE)), "AES-GCM", false, ["decrypt"]);
let gz; try { gz = Buffer.from(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(4, 16) }, key, raw.subarray(16))); }
catch (e) { console.error("No se pudo descifrar: la clave BACKUP_CLAVE no es la correcta"); process.exit(1); }
const partes = [gunzipSync(gz).toString("utf8")];

// fotos: fotos/<empresa>/<fecha>/<archivo>.<ext> → tabla fotos (k, empresa_id, data como data URL)
const tipos = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" }; let nf = 0;
const recorrer = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { recorrer(p); continue; }
  const k = relative(join(carpeta, "fotos"), p).split(sep).join("/"), ext = (n.split(".").pop() || "").toLowerCase(); if (!tipos[ext]) continue;
  const data = `data:image/${tipos[ext]};base64,${readFileSync(p).toString("base64")}`, emp = parseInt(k.split("/")[0], 10) || 0;
  partes.push(`INSERT OR REPLACE INTO "fotos" ("k", "empresa_id", "data") VALUES ('${k.replace(/'/g, "''")}', ${emp}, '${data}');\n`); nf++; } };
if (existsSync(join(carpeta, "fotos"))) recorrer(join(carpeta, "fotos"));

const salida = `restaurar-${elegido.slice(0, 10)}.sql`; writeFileSync(salida, partes.join(""));
console.log(`Listo: ${salida} (backup del ${elegido.slice(0, 10)}, ${nf} fotos). Ahora:\n  npx wrangler d1 execute <base> --remote --file ${salida}`);
