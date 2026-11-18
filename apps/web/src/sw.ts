// D§3.13 service worker: precache this build's hashed assets; cache-first /data/* (PD JSON and search
// indexes) only. Never /api/*, /esv/*, navigations, or credentialed requests. Kill switch: /sw-kill.json.
declare const self: ServiceWorkerGlobalScope;
declare const __BUILD__: string;
declare const __PRECACHE__: string[];

const PRECACHE = `quiet-static-${__BUILD__}`;
const DATA = "quiet-data-v1";
const DATA_MAX = 200;
const DATA_MAX_AGE = 30 * 24 * 3600 * 1000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(__PRECACHE__)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== PRECACHE && k !== DATA) await caches.delete(k);
      await self.clients.claim();
      await killSwitch();
    })(),
  );
});

async function killSwitch(): Promise<void> {
  try {
    const r = await fetch("/sw-kill.json", { cache: "no-store" });
    if (r.ok && ((await r.json()) as { disabled?: boolean }).disabled) {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
    }
  } catch {
    /* offline: keep running */
  }
}

async function trim(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - DATA_MAX))) await cache.delete(k);
}

async function dataFirst(req: Request): Promise<Response> {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const at = Number(hit?.headers.get("x-sw-at") ?? 0);
  if (hit && Date.now() - at < DATA_MAX_AGE) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      const headers = new Headers(res.headers);
      headers.set("x-sw-at", String(Date.now()));
      await cache.put(req, new Response(await res.clone().blob(), { status: res.status, headers }));
      void trim(cache);
    }
    return res;
  } catch (err) {
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.mode === "navigate" || req.headers.has("Authorization")) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/api/") || p.startsWith("/esv/") || p === "/sw-kill.json") return;
  if (p.startsWith("/data/") && !p.startsWith("/data/esv/")) {
    e.respondWith(dataFirst(req));
    return;
  }
  if (p.startsWith("/_astro/") || p.startsWith("/fonts/")) {
    e.respondWith(caches.match(req, { cacheName: PRECACHE }).then((r) => r ?? fetch(req)));
  }
});
