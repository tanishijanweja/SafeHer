/* SafeHer service worker: offline-first caching for the app shell, data,
   and map tiles. During local dev (`localhost`) it stays a thin network
   pass-through so it never fights Turbopack's hot reload; full offline
   caching activates on deployed / production hosts (Vercel or `next start`). */

const VERSION = "safeher-v2";

const PAGES_CACHE = `${VERSION}-pages`;
const STATIC_CACHE = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;
const TILES_CACHE = `${VERSION}-tiles`;

/* Public data / assets we precache and refresh in the background. */
const PRECACHE_STATIC = ["/icon.svg", "/delhi-safety-data.json"];

/* Public GET endpoints that are safe to serve back offline. */
const API_URL_PATTERN = /^\/(heatmap|reports|news)$/;

const IS_DEV =
  ["localhost", "127.0.0.1", "::1"].includes(self.location.hostname) &&
  self.location.port === "3001";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_STATIC))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([PAGES_CACHE, STATIC_CACHE, API_CACHE, TILES_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isTileRequest(url) {
  return /tile\.openstreetmap\.org/.test(url.hostname);
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return PRECACHE_STATIC.some((p) => url.pathname === p);
}

function isApiData(url) {
  return url.origin === self.location.origin && API_URL_PATTERN.test(url.pathname);
}

async function cacheFirst(event, cacheName) {
  const cached = await caches.match(event.request, { cacheName });
  if (cached) return cached;
  const res = await fetch(event.request);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(event.request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const cached = await caches.match(event.request, { cacheName });
  if (cached) {
    // Serve the stale copy instantly and refresh the cache out-of-band.
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          return caches
            .open(cacheName)
            .then((cache) => cache.put(event.request, res.clone()));
        }
      })
      .catch(() => {});
    return cached;
  }
  // No cached copy: do a normal network fetch. A failed fetch rejects the
  // response chain (a network error) rather than returning null.
  const res = await fetch(event.request);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(event.request, res.clone());
  }
  return res;
}

async function networkFirstNavigation(event) {
  try {
    const res = await fetch(event.request);
    if (res.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(event.request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(event.request, { cacheName: PAGES_CACHE });
    if (cached) return cached;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const req = event.request;

  if (req.method !== "GET") return;
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/auth")) return;

  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(event, TILES_CACHE));
    return;
  }

  if (isApiData(url)) {
    event.respondWith(staleWhileRevalidate(event, API_CACHE));
    return;
  }

  if (IS_DEV) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE));
    return;
  }
});
