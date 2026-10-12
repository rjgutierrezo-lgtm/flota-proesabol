// Service worker: deja la app usable sin conexión (la pantalla se sirve desde caché) y siempre al día cuando hay red.
// Las llamadas al API nunca se guardan en caché: si no hay red, fallan y la app encola los registros.
const CACHE = "flota-v1";
const SHELL = ["/", "/index.html", "/app.js", "/style.css", "/qrcode.js", "/manifest.json", "/icon.svg", "/logo.svg", "/logo-oscuro.svg", "/icon-192.png", "/icon-512.png", "/favicon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Red primero (siempre la versión nueva); si falla, caché
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === "navigate" ? caches.match("/index.html") : Response.error()))));
});
