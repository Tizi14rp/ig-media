// Service worker: guarda solo la "cáscara" de la app para que abra rápido e instalable.
// Nunca cachea llamadas a la API de GitHub (posts, imágenes privadas ni el token).
const VERSION = "aprobar-v1";
const CASCARA = ["./", "index.html", "app.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CASCARA)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return; // API de GitHub: siempre red
  // red primero (para recibir actualizaciones), cache si no hay conexión
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
