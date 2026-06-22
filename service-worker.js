/* imports: 无 */

const CACHE_VERSION = "paopao-pwa-v1";
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/manifest.json",

  "/core/storage.js",
  "/core/theme.js",
  "/core/api.js",
  "/core/ui.js",
  "/core/memory.js",
  "/core/tts.js",
  "/core/mcp.js",

  "/apps/settings.js",
  "/apps/characters.js",
  "/apps/chat.js",
  "/apps/moments.js",
  "/apps/worldbook.js",
  "/apps/wallet.js",
  "/apps/shop.js",
  "/apps/memo.js",
  "/apps/anniversary.js",
  "/apps/games.js",

  "https://i.postimg.cc/sDhhgcFL/IMG-6643.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then(async (cache) => {
      await Promise.allSettled(
        CORE_ASSETS.map((asset) =>
          cache.add(asset).catch(() => null)
        )
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => null);
    }

    return response;
  } catch (error) {
    const cachedResponse =
      (await cache.match(request)) ||
      (await caches.match(request)) ||
      (await caches.match("/index.html"));

    if (cachedResponse) return cachedResponse;

    throw error;
  }
}

// 依赖：浏览器 Service Worker Cache API / fetch 事件

