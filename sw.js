// Service Worker - 牛马打工人的旅行笔记
// 策略：页面与同源资源网络优先（离线回退缓存）+ 白名单底图瓦片缓存优先（运行时缓存，上限 TILE_CACHE_MAX 块）
// 新版本激活后通知页面自动刷新
//
// 【更新发布流程】每次部署新版本时，把下面的 VERSION 改一个新值（如 tn-v2、tn-v3…），
// 用户打开页面时会自动检测并刷新到新版本。
const VERSION = 'tn-v6adb3f2';
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
  './plan.html',
  './friend.html',
  './account.html',
  './admin.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
];

// 瓦片缓存白名单：只缓存 WGS84 的 OSM 系与 Esri（实际在用的两张世界底图）。
// - 天地图走同源 /tdt/ 反代，由上面的同源分支处理（网络优先 + 离线回退）
// - 高德(autonavi)/腾讯(gtimg) 是 GCJ-02 瓦片且为跨域 opaque 响应：按服务条款不落盘，
//   且它们在境内本就要求在线，离线时用天地图缓存代替
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'tile.openstreetmap.de',
  'server.arcgisonline.com',
];
const TILE_CACHE_MAX = 4000;

function isTileUrl(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return false; }
  return TILE_HOSTS.includes(host);
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
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req.url, res.clone());
        }
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

  // 同源资源：网络优先（强制回源校验，避免数据 JSON 被浏览器旧缓存顶住），离线回退缓存
  // API 响应（含鉴权数据/投稿照片）永不落缓存，防共享设备上登出后仍可脱机读取
  if (new URL(url).origin === self.location.origin) {
    const isApi = new URL(url).pathname.startsWith('/api/');
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok && !isApi) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        if (isApi) return Response.error();
        return (await caches.match(req)) ||
          (await caches.match(req, { ignoreSearch: true })) ||
          Response.error();
      }
    })());
    return;
  }

  // 白名单瓦片（OSM 系 / Esri）：缓存优先，浏览过的区域离线可用（运行时缓存，上限 TILE_CACHE_MAX）
  if (isTileUrl(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(url, { cacheName: RUNTIME_CACHE });
      if (hit) return hit;
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(url, res.clone()).then(() => trimCache(RUNTIME_CACHE, TILE_CACHE_MAX));
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

// SW 是 classic script（不能 import），把策略挂到 self 上供 tools/sw-policy-test.mjs 在 VM 中校验
self.__SW_POLICY__ = { VERSION, SHELL_ASSETS, TILE_HOSTS, TILE_CACHE_MAX, isTileUrl };
