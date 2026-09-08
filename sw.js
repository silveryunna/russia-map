// Service Worker - 牛马打工人的旅行笔记
// 策略：页面与同源资源网络优先（离线回退缓存）+ OSM 瓦片缓存优先（运行时缓存，上限 4000 块）
// 新版本激活后通知页面自动刷新
//
// 【更新发布流程】每次部署新版本时，把下面的 VERSION 改一个新值（如 tn-v2、tn-v3…），
// 用户打开页面时会自动检测并刷新到新版本。
const VERSION = 'tn-v1';
const SHELL_CACHE = 'tn-shell-' + VERSION;
const RUNTIME_CACHE = 'tn-runtime-' + VERSION;

// 应用外壳（HTML 入口 + 清单 + 图标；JS/CSS 带内容哈希，由运行时缓存自动覆盖）
const SHELL_ASSETS = [
  './',
  './index.html',
  './map.html',
  './list.html',
  './notes.html',
  './album.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
];

function isTileUrl(url) {
  return /tile\.openstreetmap\.org/.test(url);
}

async function postToClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage(msg);
}

// 安装：缓存应用外壳
// cache:'reload' 绕过 HTTP 缓存，保证拿到的是当前部署的最新文件
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_ASSETS.map(u => cache.add(new Request(u, { cache: 'reload' }))));
  })());
  self.skipWaiting();
});

// 激活：清理旧版本缓存，并通知页面当前版本号
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k =>
      k.startsWith('tn-') && !k.endsWith(VERSION)
    ).map(k => caches.delete(k)));
    await self.clients.claim();
    await postToClients({ type: 'sw-activated', version: VERSION });
  })());
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // 页面导航：网络优先，离线回退到对应页面缓存，最后回退首页
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(req.url, res.clone());
        return res;
      } catch (e) {
        return (await caches.match(req)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          new Response('<h1>离线且无缓存</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // 同源资源：网络优先，离线回退缓存
  if (new URL(url).origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return (await caches.match(req)) ||
          (await caches.match(req, { ignoreSearch: true })) ||
          Response.error();
      }
    })());
    return;
  }

  // OSM 瓦片：缓存优先，浏览过的区域离线可用（运行时缓存，上限 4000 块）
  if (isTileUrl(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(url, { cacheName: RUNTIME_CACHE });
      if (hit) return hit;
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(url, res.clone()).then(() => trimCache(RUNTIME_CACHE, 4000));
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }
});

// 运行时缓存上限：超出时删除最早一半
async function trimCache(name, max) {
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (keys.length > max) {
      for (const k of keys.slice(0, keys.length - max + Math.floor(max / 2))) {
        await cache.delete(k);
      }
    }
  } catch (e) {}
}
