// sw.js — Service Worker
// App Shell 模型 + 离线优先。Phase 1：缓存核心资源，离线可解锁/换壁纸/切主题。
// 依赖：无（独立运行）

const CACHE_VERSION = 'popo-v1-2026-07';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './apps-registry.js',
  './desktop.js',
  './core/storage.js',
  './core/storage-keys.js',
  './core/storage-manager.js',
  './core/util.js',
  './core/config.js',
  './core/events.js',
  './core/router.js',
  './core/theme.js',
  './core/ui.js',
  './core/api.js',
  './core/memory.js',
  './core/tts.js',
  './core/mcp.js',
  './core/seed.js',
  './apps/settings/index.js',
  './apps/calculator/index.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS).catch((e) => {
        // 单个文件失败不阻塞安装
        console.warn('[sw] 部分资源缓存失败', e);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只处理同源 GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // 跨域：直接放行（不缓存）
    return;
  }

  // 导航请求：网络优先，失败回退到缓存的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 静态资源：缓存优先，回退网络
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // 缓存新资源
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// 接收消息：强制更新
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
