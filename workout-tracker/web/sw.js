// Offline support. App files: served from cache, refreshed in the background, so
// the app opens instantly at the gym and picks up a new deploy on the next launch.
// Calls to the Google Sheet are never cached here (the app keeps its own copy).

const CACHE = "wt-shell-v2";
const RUNTIME = "wt-runtime-v1";
const SHELL = [
  "./",
  "./styles.css",
  "./app.js",
  "./api.js",
  "./logic.js",
  "./body.js",
  "./icons.js",
  "./config.js",
  "./demo-data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/apple-touch-icon.png",
];
const RUNTIME_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "i.ytimg.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function unwrap(res) {
  if (!res.redirected) return res;
  return res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}

function staleWhileRevalidate(req, cacheName, opts) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req, opts).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Every client's link is the same page with a different ?u=, so all pages are "./".
    // Hosts like Cloudflare Pages redirect /index.html → /, and a page load can't be
    // answered with a redirected response, hence "./" and the unwrap.
    const isPage = req.mode === "navigate";
    e.respondWith(
      isPage
        ? staleWhileRevalidate(new Request("./"), CACHE).then((r) => (r ? unwrap(r) : fetch(req)))
        : staleWhileRevalidate(req, CACHE, { ignoreSearch: true }),
    );
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req, RUNTIME));
});
