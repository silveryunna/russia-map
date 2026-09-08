// Service Worker - 苏联现代主义·俄罗斯打卡地图 离线版
// 应用外壳网络优先（?v= 版本参数生效）+ OSM/Esri 瓦片运行时缓存 + 新版本激活后通知页面自动刷新
// 注：历史版本曾预缓存 562 块高德瓦片，实测高德无俄罗斯数据（莫斯科瓦片为 179 字节纯色空白图），已移除
const VERSION = 'v24';
const SHELL_CACHE = 'ru-map-shell-' + VERSION;
const RUNTIME_CACHE = 'ru-map-runtime-' + VERSION;

// 应用外壳
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/index-v13.js',
  './assets/index-D58Egvz-.css'
];

function isTileUrl(url) {
  return /tile\.openstreetmap\.org/.test(url)
    || /server\.arcgisonline\.com/.test(url);
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

// 激活：清理旧版本缓存（含历史高德瓦片缓存），并通知页面当前版本号
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k =>
      k.startsWith('ru-map-') && !k.endsWith(VERSION)
    ).map(k => caches.delete(k)));
    await self.clients.claim();
    await postToClients({ type: 'sw-activated', version: VERSION });
  })());
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // 页面导航：网络优先，离线回退缓存
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          new Response('<h1>离线且无缓存</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // 同源资源：网络优先（保证 ?v= 新版本参数生效），离线回退缓存
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

  // OSM/Esri 瓦片：缓存优先，浏览过的区域离线可用（运行时缓存，上限 4000 块）
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
