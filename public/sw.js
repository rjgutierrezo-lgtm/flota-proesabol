// Service worker: deja la app usable sin conexión (la pantalla se sirve desde caché) y siempre al día cuando hay red.
// Las llamadas al API nunca se guardan en caché: si no hay red, fallan y la app encola los registros.
const CACHE = "flota-v3";
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
// Notificaciones push: se muestran aunque la app esté cerrada; al tocarlas se abre (o enfoca) la app en la pantalla indicada
self.addEventListener("push", e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (x) { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "FlotaControl", { body: m.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: m.tag, renotify: !!m.tag, data: { url: m.url || "/" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.location.origin)); if (c) { c.postMessage({ ir: new URL(url).hash.slice(1) }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
