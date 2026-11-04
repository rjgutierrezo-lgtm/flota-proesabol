// Lector mínimo de .xlsx en el navegador, sin librerías: descomprime con DecompressionStream y lee las hojas como tablas de texto.
// También devuelve las fotos pegadas DENTRO de las celdas (Excel 365: "Colocar en celda"), por celda: { "O4": Blob }.
// leerXlsx(file) → [{ nombre, filas: [[valor, ...], ...], fotos: { "O4": Blob } }]   (valor: texto, número o null)

async function unzip(buf) {
  const d = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), out = {};
  let e = buf.byteLength - 22; while (e >= 0 && d.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("El archivo no es un Excel (.xlsx) válido");
  let p = d.getUint32(e + 16, true); const n = d.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const metodo = d.getUint16(p + 10, true), tam = d.getUint32(p + 20, true), ln = d.getUint16(p + 28, true), lx = d.getUint16(p + 30, true), lc = d.getUint16(p + 32, true), loc = d.getUint32(p + 42, true);
    const nombre = dec.decode(u8.subarray(p + 46, p + 46 + ln)); p += 46 + ln + lx + lc;
    const ini = loc + 30 + d.getUint16(loc + 26, true) + d.getUint16(loc + 28, true), datos = u8.subarray(ini, ini + tam);
    out[nombre] = async () => metodo === 0 ? datos : new Uint8Array(await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  }
  return out;
}
const xml = async (z, n) => z[n] ? new DOMParser().parseFromString(new TextDecoder().decode(await z[n]()), "application/xml") : null;
const hijos = (el, tag) => el ? [...el.getElementsByTagName("*")].filter(x => x.localName === tag) : [];
const ruta = (base, t) => { if (t.startsWith("/")) return t.slice(1); const p = base.split("/").slice(0, -1); for (const s of t.split("/")) s === ".." ? p.pop() : p.push(s); return p.join("/"); };
const rels = async (z, archivo) => { const r = await xml(z, archivo.replace(/([^/]+)$/, "_rels/$1.rels")), o = {};
  for (const x of hijos(r, "Relationship")) o[x.getAttribute("Id")] = ruta(archivo, x.getAttribute("Target")); return o; };
const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export async function leerXlsx(file) {
  const z = await unzip(await file.arrayBuffer());
  const ss = hijos(await xml(z, "xl/sharedStrings.xml"), "si").map(si => hijos(si, "t").map(t => t.textContent).join(""));
  // fotos en celda: vm → metadata → rich value → relación → imagen
  const fotoDeVm = {};
  const md = await xml(z, "xl/metadata.xml"), rv = await xml(z, "xl/richData/rdrichvalue.xml");
  if (md && rv) {
    const est = hijos(await xml(z, "xl/richData/rdrichvaluestructure.xml"), "s").map(s => hijos(s, "k").map(k => k.getAttribute("n")));
    const rvs = hijos(rv, "rv"), relList = hijos(await xml(z, "xl/richData/richValueRel.xml"), "rel").map(r => [...r.attributes].find(a => a.localName === "id")?.value);
    const relMap = await rels(z, "xl/richData/richValueRel.xml");
    const fut = hijos(hijos(md, "futureMetadata")[0], "rvb").map(x => +x.getAttribute("i")), vmd = hijos(hijos(md, "valueMetadata")[0], "bk");
    vmd.forEach((bk, i) => { const rc = hijos(bk, "rc")[0], r = rvs[fut[+rc?.getAttribute("v")]]; if (!r) return;
      const claves = est[+r.getAttribute("s")] || [], k = Math.max(0, claves.indexOf("_rvRel:LocalImageIdentifier")), v = hijos(r, "v")[k];
      const media = relMap[relList[+v?.textContent]]; if (media) fotoDeVm[i + 1] = media; });
  }
  const wb = await xml(z, "xl/workbook.xml"), wbRels = await rels(z, "xl/workbook.xml"), hojas = [];
  for (const s of hijos(wb, "sheet")) {
    const archivo = wbRels[[...s.attributes].find(a => a.localName === "id")?.value], doc = await xml(z, archivo); if (!doc) continue;
    const filas = [], fotos = {};
    for (const c of hijos(doc, "c")) {
      const ref = c.getAttribute("r"), f = +ref.replace(/\D+/g, "") - 1, t = c.getAttribute("t"), v = hijos(c, "v")[0]?.textContent;
      let val = t === "s" ? ss[+v] : t === "inlineStr" ? hijos(c, "t").map(x => x.textContent).join("") : t === "e" ? null : t === "str" || t === "b" ? v : v != null && v !== "" ? +v : null;
      const vm = c.getAttribute("vm"); if (vm && fotoDeVm[vm] && z[fotoDeVm[vm]]) { fotos[ref] = new Blob([await z[fotoDeVm[vm]]()], { type: "image/" + (fotoDeVm[vm].endsWith(".png") ? "png" : "jpeg") }); val = null; }
      (filas[f] = filas[f] || [])[col(ref)] = typeof val === "string" ? val.trim() || null : val;
    }
    hojas.push({ nombre: s.getAttribute("name"), filas: Array.from(filas, r => r ? Array.from(r, x => x ?? null) : []), fotos });
  }
  return hojas;
}
// fecha de Excel (número de serie) o texto dd/mm/aaaa → aaaa-mm-dd
export function fechaXlsx(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  // texto dd/mm/aaaa; si el segundo número pasa de 12 es mm/dd/aaaa (2/16/2027)
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(v ?? "").trim());
  if (m) { let [d, mes] = [+m[1], +m[2]]; if (mes > 12 && d <= 12) [d, mes] = [mes, d]; return mes >= 1 && mes <= 12 && d >= 1 && d <= 31 ? `${m[3]}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null; }
  return /^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : null;
}
