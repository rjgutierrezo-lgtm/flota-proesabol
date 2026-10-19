// Graba marketing/spot.html a video con Chrome sin ventana (sin ffmpeg ni librerías).
// Uso: node render.mjs spot.html salida.mp4            → video completo
//      node render.mjs spot.html cuadros --t 1,5,12    → capturas PNG de esos segundos (para revisar)
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [html, salida] = process.argv.slice(2), ti = process.argv.indexOf("--t"), tiempos = ti > 0 ? process.argv[ti + 1].split(",").map(Number) : null;
const perfil = mkdtempSync(join(tmpdir(), "spot-")), PORT = 9300 + Math.floor(Math.random() * 400);
const ch = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${perfil}`, "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows", "--window-size=1080,1920", "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
let lista = []; for (let i = 0; i < 60 && !lista.length; i++) { try { lista = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter(t => t.type === "page"); } catch (e) { } if (!lista.length) await new Promise(r => setTimeout(r, 250)); }
if (!lista.length) { console.error("Chrome no respondió"); ch.kill(); process.exit(1); }
const ws = new WebSocket(lista[0].webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800)); return r.result?.result?.value; };
await cdp("Page.enable"); await cdp("Page.navigate", { url: pathToFileURL(resolve(html)).href + "#render" });
for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 250)); if (await ev("typeof window.renderVideo === 'function'").catch(() => false)) break; }
await ev("window.listo");
try {
  if (tiempos) {
    for (const t of tiempos) { const png = await ev(`(()=>{ frame(${t}); return document.getElementById("c").toDataURL("image/png").split(",")[1]; })()`);
      const f = join(salida, `cuadro-${String(t).replace(".", "_")}.png`); writeFileSync(f, Buffer.from(png, "base64")); console.log("captura", f); }
  } else {
    const t0 = Date.now(), v = await ev("window.renderVideo()"), buf = Buffer.from(v.b64, "base64");
    writeFileSync(salida, buf); console.log(`video ${salida} · ${v.mime} · ${v.cuadros} cuadros · lentos ${v.lentos} · ${(buf.length / 1048576).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally { ws.close(); ch.kill(); setTimeout(() => { try { rmSync(perfil, { recursive: true, force: true }); } catch (e) { } }, 1500); }
