// Service Worker - 牛马打工人的旅行笔记
// 策略：页面与同源资源网络优先（离线回退缓存）+ 白名单底图瓦片缓存优先（运行时缓存，上限 TILE_CACHE_MAX 块）
// 新版本激活后通知页面提示刷新；保留上一代缓存，避免旧标签页懒加载旧哈希 chunk 时 404。
//
// 【更新发布流程】VERSION 由 tools/publish.mjs 在构建期自动注入当前 git short sha（tn-v<sha>），
// 不要手改——手改也会在下次 publish 时被覆盖。用户打开页面时 SW 检测到新值即自动刷新缓存。
const VERSION = 'tn-v7c489de';
const SHELL_CACHE = 'tn-shell-' + VERSION;
const RUNTIME_CACHE = 'tn-runtime-' + VERSION;
const PHOTO_CACHE = 'tn-photos';       // 照片跨版本保留（审计 P1-2：更新不再清空离线相册）
const META_CACHE = 'tn-meta';          // 记录上一版 VERSION，用于保留上一代缓存
const META_KEY = './__sw-active-version__';
const SHELL_RUNTIME_MAX = 400;         // 同源运行时资源上限（壳预缓存不在此列）
const PHOTO_CACHE_MAX = 300;           // 照片缓存条数上限

// 应用外壳（HTML 入口 + 清单 + 图标 + 关键数据；JS/CSS 带内容哈希，由运行时缓存自动覆盖）
const SHELL_ASSETS = [
  './',
  './index.html',
  './map.html',
  './list.html',
  './notes.html',
  './album.html',
  './plan.html',
  './today.html',
  './friend.html',
  './account.html',
  './admin.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
  // 审计 P1-2：安装后直接断网也要能看到点位/城市/动线，而不是空页
  './data/points.json',
  './data/meta.json',
  './data/routes.json',
  './data/transit-matrix.json',
  './data/ratings.json',
  './data/facts/manifest.json',
  './content/notes/index.json',
];

// 瓦片缓存白名单：WGS84 的 OSM 系与 Esri（世界底图）+ 同源 /tdt/ 天地图反代（中国底图）。
// - 天地图是同源请求，hostname 是本站，须按路径前缀匹配（isTileUrl 内处理）
// - 高德(autonavi)/腾讯(gtimg) 是 GCJ-02 瓦片且为跨域 opaque 响应：按服务条款不落盘，
//   且它们在境内本就要求在线，离线时用天地图缓存代替
// - 政策变更（2026-11-02 站长裁决）：天地图纳入运行时缓存——中国区域离线可用
//   （本项目用户核心场景：国外漫游/飞行中打开中国记忆；天地图为官方公共服务，
//   个人非商业用途缓存浏览过的瓦片属合理使用范畴）
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'tile.openstreetmap.de',
  'server.arcgisonline.com',
];
const TILE_PATH_PREFIXES = ['/tdt/']; // 同源天地图反代
const TILE_CACHE_MAX = 6000; // 天地图双层 + OSM/Esri 混用，较纯 OSM 时期上调

function isTileUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (TILE_HOSTS.includes(u.hostname)) return true;
  if (u.origin === self.location.origin) {
    return TILE_PATH_PREFIXES.some((p) => u.pathname.startsWith(p));
  }
  return false;
}

async function postToClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage(msg);
}

// 安装：缓存应用外壳 + 关键数据（含事实账本；账本清单来自 manifest，浏览器不能列目录）
// cache:'reload' 绕过 HTTP 缓存，保证拿到的是当前部署的最新文件
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_ASSETS.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    try {
      const res = await cache.match('./data/facts/manifest.json');
      const manifest = res ? await res.json() : null;
      const files = Array.isArray(manifest && manifest.files) ? manifest.files : [];
      await Promise.allSettled(files.map(f => cache.add(new Request(`./data/facts/${f}`, { cache: 'reload' }))));
    } catch { /* 账本缺失不影响外壳安装 */ }
  })());
  self.skipWaiting();
});

// 保留当前版 + 上一版缓存（审计 P1-1：旧标签页懒加载旧哈希 chunk 时还能命中）；
// 照片缓存跨版本保留；上一版版本号写进 tn-meta，下次激活才知道该留哪一代。
async function pruneOldCaches() {
  const keys = await caches.keys();
  const meta = await caches.open(META_CACHE);
  let prev = '';
  try {
    const res = await meta.match(META_KEY);
    if (res) prev = (await res.text()).trim();
  } catch { /* 元数据损坏按无上一版处理 */ }
  if (!prev) {
    // 首次升级到「保留上一版」逻辑时没有 meta：若只剩一个旧壳缓存，它就是上一版
    const oldShells = keys.filter(k => k.startsWith('tn-shell-') && k !== SHELL_CACHE);
    if (oldShells.length === 1) prev = oldShells[0].slice('tn-shell-'.length);
  }
  const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, PHOTO_CACHE, META_CACHE]);
  if (prev) {
    keep.add('tn-shell-' + prev);
    keep.add('tn-runtime-' + prev);
  }
  await Promise.all(keys
    .filter(k => k.startsWith('tn-') && !keep.has(k))
    .map(k => caches.delete(k)));
  try { await meta.put(META_KEY, new Response(VERSION)); } catch { /* 配额不足不影响激活 */ }
}

// 缓存写入统一收口：配额失败时通知页面（不要让离线能力静默消失）
let shellPuts = 0;
async function cachePut(cache, req, res) {
  try {
    await cache.put(req, res);
    return true;
  } catch (err) {
    const text = String((err && err.name) || '') + ' ' + String((err && err.message) || '');
    if (/quota|exceed|storage/i.test(text)) await postToClients({ type: 'sw-quota' });
    return false;
  }
}

// 激活：保留上一代缓存，清理更老的版本，并通知页面当前版本号
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await pruneOldCaches();
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
          await cachePut(cache, req.url, res.clone()); // 配额已满时不影响本次网络响应
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

  // 白名单瓦片（OSM 系 / Esri / 同源天地图）：缓存优先，浏览过的区域离线可用（运行时缓存，上限 TILE_CACHE_MAX）
  // ⚠️ 必须在同源分支之前判断：/tdt/ 是天地图同源反代，否则会被同源分支网络优先拦走、永远不进运行时缓存
  if (isTileUrl(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(url, { cacheName: RUNTIME_CACHE });
      if (hit) return hit;
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(RUNTIME_CACHE);
          if (await cachePut(cache, url, res.clone())) await trimCache(RUNTIME_CACHE, TILE_CACHE_MAX);
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  // 同源资源：网络优先（强制回源校验，避免数据 JSON 被浏览器旧缓存顶住），离线回退缓存
  // API 响应（含鉴权数据/投稿照片）永不落缓存，防共享设备上登出后仍可脱机读取
  // 照片单独放 PHOTO_CACHE（跨版本保留 + 条数上限）；其余同源资源进 SHELL_CACHE（限 400 条）
  if (new URL(url).origin === self.location.origin) {
    const pathname = new URL(url).pathname;
    const isApi = pathname.startsWith('/api/');
    const isPhoto = pathname.startsWith('/photos/');
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok && !isApi) {
          const cache = await caches.open(isPhoto ? PHOTO_CACHE : SHELL_CACHE);
          await cachePut(cache, req, res.clone());
          if (isPhoto) await trimCache(PHOTO_CACHE, PHOTO_CACHE_MAX);
          else if (++shellPuts % 20 === 0) await trimShellCache(SHELL_RUNTIME_MAX);
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

// 壳缓存上限：只裁掉运行时资源，绝不删预缓存入口（HTML/数据 JSON/图标）
// —— trimCache 按插入顺序删，预缓存恰好排在最前，直接复用它会把离线首页删掉
function isPrecached(url) {
  try {
    const path = new URL(url, 'https://x/').pathname;
    if (path === '/') return true;
    return SHELL_ASSETS.includes('./' + path.replace(/^\/+/, ''));
  } catch { return false; }
}
async function trimShellCache(max) {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const keys = await cache.keys();
    const excess = keys.length - max;
    if (excess <= 0) return;
    const removable = keys.filter(k => !isPrecached(k.url || k));
    for (const k of removable.slice(0, excess + Math.floor(max / 8))) {
      await cache.delete(k);
    }
  } catch (e) {}
}

// SW 是 classic script（不能 import），把策略挂到 self 上供 tools/sw-policy-test.mjs 在 VM 中校验
self.__SW_POLICY__ = {
  VERSION, SHELL_CACHE, RUNTIME_CACHE, PHOTO_CACHE, META_CACHE,
  SHELL_ASSETS, SHELL_RUNTIME_MAX, PHOTO_CACHE_MAX,
  TILE_HOSTS, TILE_CACHE_MAX, isTileUrl,
};
