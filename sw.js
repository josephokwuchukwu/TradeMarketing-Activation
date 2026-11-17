// Trade Activate service worker: keeps the app opening when the network is weak.
// The page and config.js are fetched fresh when online and served from cache when not.
// Calls to the API (sign-in, sync, photos, live updates) always go straight to the network.
const CACHE = "trade-activate-v6";
const SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js",
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
];
const CDN = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|fonts\.g/;
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const fresh = (req, key) => fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key || req, copy)); } return r; }).catch(() => caches.match(key || req));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const same = url.origin === self.location.origin;
  if (!same && !CDN.test(url.hostname)) return;              // API and anything else: network only
  if (same && /\/(api|health|lb)\b/.test(url.pathname)) return;
  if (req.mode === "navigate") return e.respondWith(fresh(req, "./index.html"));
  if (same && url.pathname.endsWith("/config.js")) return e.respondWith(fresh(req));
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
