const CACHE_PREFIX = "codex-confirmation-ios-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260824-v200",
  "./app.js?v=20260824-v200",
  "./app.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(new URL("./", self.location).pathname)) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(async error => {
      if (event.request.mode !== "navigate") throw error;
      const fallback = await caches.match("./index.html");
      if (!fallback) throw error;
      return fallback;
    })),
  );
});
