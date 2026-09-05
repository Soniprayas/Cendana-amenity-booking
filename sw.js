// Cendana Craig Ranch resident PWA -- service worker
//
// Design goal: this exists only so the app is installable ("Add to Home Screen"),
// not to cache the app itself. HTML/app logic is ALWAYS fetched fresh from the
// network -- it is never cached -- so a new deploy is visible immediately on next
// load, with no stale-UI risk and no manual cache-version bump needed per release.
// Only genuinely static, rarely-changing assets (icons, manifest) are cached.

const STATIC_CACHE = "ccr-static-v1";
const STATIC_ASSETS = ["icon-192.png", "icon-512.png", "manifest.json"];

self.addEventListener("install", (event) => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => { /* non-critical if a static asset fails to precache */ })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes

  const url = new URL(req.url);

  // Cross-origin requests (Supabase API calls, etc.) -- always pass straight through,
  // never cached, never intercepted.
  if (url.origin !== self.location.origin) return;

  // HTML documents / navigations -- ALWAYS network-first. This is the part that
  // guarantees a deploy is never masked by a stale cached page. Cache is only a
  // fallback for genuinely offline use, not a substitute for a fresh fetch.
  const isHtmlRequest = req.mode === "navigate" || url.pathname.endsWith(".html");
  if (isHtmlRequest) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Known static assets -- cache-first, since these essentially never change.
  const isStaticAsset = STATIC_ASSETS.some((asset) => url.pathname.endsWith(asset));
  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Anything else on this origin -- just let it pass through normally.
});
