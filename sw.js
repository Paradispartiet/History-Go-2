/* ============================================================
   HISTORY GO – SERVICE WORKER (NY VERSJON)
   Rask, stabil, offline-klar, ingen cache-bugs.
   ============================================================ */

const CACHE_NAME = "history-go-v6";  // øk versjonsnummer ved endringer

// Filer vi alltid vil ha tilgjengelig offline
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/profile.html",
  "/offline.html",
  "/theme.css",
  "/app.js",
  "/profile.js",
  "/popup-utils.js",
  "/manifest.json",

  // Data
  "/data/places.json",
  "/data/people.json",
  "/data/badges.json",
  "/data/routes.json",
  "/data/quiz_historie.json",
  "/data/quiz_vitenskap.json",
  "/data/quiz_kunst.json",
  "/data/quiz_musikk.json",
  "/data/quiz_natur.json",
  "/data/quiz_sport.json",
  "/data/quiz_by.json",
  "/data/quiz_politikk.json",
  "/data/quiz_populaerkultur.json",
  "/data/quiz_subkultur.json",

  // Logo
  "/bilder/logo_historygo.PNG"
];

/* ------------------------------------------------------------
   INSTALL – cache alt
   ------------------------------------------------------------ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

/* ------------------------------------------------------------
   ACTIVATE – fjern gammel cache
   ------------------------------------------------------------ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ------------------------------------------------------------
   FETCH – Network first, fallback cache
   ------------------------------------------------------------ */
self.addEventListener("fetch", event => {
  const req = event.request;

  // Bare GET-requests skal caches
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    fetch(req)
      .then(response => {
        // legg i cache i bakgrunnen
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return response;
      })
      .catch(() => {
        // fallback til cache
        return caches.match(req).then(found => {
          return found || caches.match("/offline.html");
        });
      })
  );
});
