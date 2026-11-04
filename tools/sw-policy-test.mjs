#!/usr/bin/env node
// Service Worker 策略质量门（CI 强制）：缓存范围必须与实际底图/页面一致
// 历史 bug：SW 只认 tile.openstreetmap.org，而站内实际用 tile.openstreetmap.de + Esri，
// 结果"离线可看地图"名不副实；同时 plan/friend 等页面不在外壳里，离线打开是空白。
// 用法: node tools/sw-policy-test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

const SRC = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const sandbox = {
  self: {
    addEventListener() {},
    skipWaiting() {},
    clients: { matchAll: async () => [], claim: async () => {} },
    location: { origin: 'https://julyyunna.art' },
  },
  caches: { open: async () => ({ add: async () => {}, put: async () => {}, keys: async () => [], delete: async () => {} }), match: async () => null, keys: async () => [] },
  fetch: async () => new Response(''),
  Request: class { constructor(u) { this.url = u; } },
  Response: class { constructor(b, i = {}) { this.body = b; this.status = i.status || 200; this.ok = (i.status || 200) < 400; } static error() { return new Response('', { status: 0 }); } },
  URL,
  console,
};
runInNewContext(SRC, sandbox);
const policy = sandbox.self.__SW_POLICY__;
if (!policy) { console.error('❌ sw.js 未导出 __SW_POLICY__'); process.exit(1); }

// 1) 外壳必须覆盖 src/ 下所有页面（缺页 = 离线打开空白）
{
  const pages = readdirSync(new URL('../src/', import.meta.url)).filter(f => f.endsWith('.html'));
  const shell = new Set(policy.SHELL_ASSETS);
  const missing = pages.filter(p => !shell.has('./' + p));
  if (!missing.length) ok(`外壳覆盖全部 ${pages.length} 个页面（${pages.join(', ')}）`);
  else fail(`外壳缺少页面：${missing.join('、')}（离线打开会空白）`);
  const stray = policy.SHELL_ASSETS.filter(a => a.endsWith('.html') && !pages.includes(a.slice(2)));
  if (!stray.length) ok('外壳无失效页面条目');
  else fail(`外壳引用了不存在的页面：${stray.join('、')}`);
}

// 2) 瓦片白名单 = 实际在用的世界底图 + 同源天地图反代；GCJ-02 图商（高德/腾讯）必须排除
//    政策（2026-11-02 站长裁决）：天地图纳入运行时缓存（中国区域离线可用）；
//    同源前缀匹配必须精确——/api/ 等其它本站路径不得混入
{
  const tiles = [
    ['https://tile.openstreetmap.org/5/19/10.png', true, 'OSM 官方'],
    ['https://tile.openstreetmap.de/5/19/10.png', true, 'OSM DE（世界底图实际在用）'],
    ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/5/10/19', true, 'Esri（OSM 失败备用）'],
    ['https://webrd01.is.autonavi.com/appmaptile?x=1&y=2&z=3', false, '高德（GCJ-02）'],
    ['https://rt0.map.gtimg.com/realtimerender?z=3&x=1&y=2', false, '腾讯（GCJ-02/实时）'],
    ['https://julyyunna.art/tdt/DataServer?T=vec_w&x=1&y=2&l=3', true, '天地图（同源 /tdt/，2026-11-02 起纳入缓存）'],
    ['https://julyyunna.art/api/submit', false, '本站 /api/ 不得被瓦片分支拦走'],
    ['https://julyyunna.art/assets/map.js', false, '本站静态资源仍走同源分支'],
    ['https://evil.com/tdt/x.png', false, '他站 /tdt/ 路径不得匹配（origin 必须同源）'],
  ];
  for (const [url, want, label] of tiles) {
    const got = policy.isTileUrl(url);
    if (got === want) ok(`${label} → ${got ? '缓存' : '不缓存'}（符合预期）`);
    else fail(`${label} 判定为 ${got ? '缓存' : '不缓存'}，期望 ${want ? '缓存' : '不缓存'}`);
  }
}

// 3) 域名匹配必须精确，不能被路径/子域伪装绕过
{
  const spoof = [
    'https://evil.com/?u=tile.openstreetmap.org',
    'https://tile.openstreetmap.org.evil.com/5/1/1.png',
    'https://notserver.arcgisonline.com/5/1/1.png',
  ];
  const leaked = spoof.filter(u => policy.isTileUrl(u));
  if (!leaked.length) ok('伪装域名（路径参数/前缀子域）不会被误判为瓦片');
  else fail(`伪装域名被缓存：${leaked.join('、')}`);
}

// 4) 上限与版本号
{
  if (policy.TILE_CACHE_MAX > 0 && policy.TILE_CACHE_MAX <= 20000) ok(`瓦片缓存上限 ${policy.TILE_CACHE_MAX} 块`);
  else fail(`瓦片缓存上限异常：${policy.TILE_CACHE_MAX}`);
  if (/^tn-v[0-9a-z]{7,}$/.test(policy.VERSION)) ok(`VERSION=${policy.VERSION}（tn-v<sha>，由 publish 注入）`);
  else fail(`VERSION 格式异常：${policy.VERSION}（应为 tn-v<sha>，由 assemble 构建期注入）`);
  if (policy.SHELL_RUNTIME_MAX >= 100 && policy.SHELL_RUNTIME_MAX <= 2000) ok(`同源运行时资源上限 ${policy.SHELL_RUNTIME_MAX} 条`);
  else fail(`同源运行时资源上限异常：${policy.SHELL_RUNTIME_MAX}`);
  if (policy.PHOTO_CACHE_MAX >= 50 && policy.PHOTO_CACHE_MAX <= 1000) ok(`照片缓存上限 ${policy.PHOTO_CACHE_MAX} 条`);
  else fail(`照片缓存上限异常：${policy.PHOTO_CACHE_MAX}`);
}

// 5) API 响应永不落缓存（共享设备登出后可脱机读鉴权数据）
{
  if (/isApi/.test(SRC) && /!isApi/.test(SRC)) ok('API 分支显式排除缓存');
  else fail('sw.js 未显式排除 /api/ 缓存');
}

// 6) 仓库内不允许出现天地图 Key 明文
{
  if (/tk=[0-9a-f]{16,}/i.test(SRC)) fail('sw.js 疑似硬编码天地图 Key');
  else ok('sw.js 无 Key 明文');
}

// 7) 离线数据：外壳必须预缓存点位/城市/动线/交通矩阵/评分/事实账本清单/笔记索引（P1-2）
{
  const dataFiles = [
    './data/points.json', './data/meta.json', './data/routes.json',
    './data/transit-matrix.json', './data/ratings.json',
    './data/facts/manifest.json', './content/notes/index.json',
  ];
  const missing = dataFiles.filter(f => !policy.SHELL_ASSETS.includes(f));
  if (!missing.length) ok(`外壳预缓存 ${dataFiles.length} 个关键数据文件`);
  else fail(`外壳缺少离线数据：${missing.join('、')}（断网首开会是空页）`);
  if (SRC.includes('data/facts/${f}')) ok('事实账本按 manifest 逐文件预缓存（浏览器不能列目录）');
  else fail('sw.js 未按 data/facts/manifest.json 预缓存事实账本');
  const stray = policy.SHELL_ASSETS.filter(a => a.startsWith('./data/') && !/\.(json|geojson)$/.test(a));
  if (!stray.length) ok('预缓存数据条目均为 JSON');
  else fail(`外壳引用了非数据文件：${stray.join('、')}`);
}

// 8) 更新保留上一代缓存 + 照片缓存跨版本（P1-1/P1-2）
{
  if (policy.PHOTO_CACHE && !policy.PHOTO_CACHE.includes(policy.VERSION)) ok(`照片缓存跨版本保留：${policy.PHOTO_CACHE}`);
  else fail('照片缓存仍带版本号（每次更新都会清空离线相册）');
  if (/META_CACHE/.test(SRC) && /keep\.add\('tn-shell-' \+ prev\)/.test(SRC)) ok('激活时保留上一版 shell 缓存');
  else fail('sw.js 未保留上一版缓存（旧标签页懒加载旧哈希 chunk 会 404）');
  if (/keep\.add\('tn-runtime-' \+ prev\)/.test(SRC)) ok('激活时保留上一版运行时缓存');
  else fail('sw.js 未保留上一版运行时缓存');
  if (/keep\s*=\s*new Set\(\[[^\]]*PHOTO_CACHE/.test(SRC)) ok('照片缓存不会被版本清理误删');
  else fail('版本清理未把 PHOTO_CACHE 列入保留集合');
  if (/skipWaiting/.test(SRC) && /sw-activated/.test(SRC)) ok('skipWaiting 与页面「有新版本」提示配套');
  else fail('缺少 skipWaiting 或激活通知');
}

// 9) 缓存写入必须 await + 配额失败通知页面（P1-2）
{
  if (!/void cache\.put/.test(SRC)) ok('缓存写入不再 fire-and-forget');
  else fail('仍有 void cache.put(...)（SW 被终止时可能丢缓存写入）');
  if (/type: 'sw-quota'/.test(SRC)) ok('缓存配额失败时通知页面');
  else fail('缓存配额失败被静默吞掉');
  if (/async function cachePut/.test(SRC) && /await cache\.put/.test(SRC)) ok('写入统一走 cachePut()');
  else fail('sw.js 未收口缓存写入');
  if (/async function trimShellCache/.test(SRC) && /isPrecached/.test(SRC)) ok('壳缓存裁剪保护预缓存入口');
  else fail('壳缓存裁剪可能删掉预缓存 HTML/数据（离线首页会消失）');
}

// 10) 每个页面入口都注册 SW（P1-7：today/plan/friend/account/admin 曾经完全离线不可用）
{
  const htmls = readdirSync(new URL('../src/', import.meta.url)).filter(f => f.endsWith('.html'));
  const notRegistered = [];
  for (const h of htmls) {
    const html = readFileSync(new URL('../src/' + h, import.meta.url), 'utf8');
    const m = html.match(/<script[^>]+type="module"[^>]+src="\.\/([^"]+)"/);
    if (!m) { notRegistered.push(`${h}（无 module 入口）`); continue; }
    const entry = readFileSync(new URL('../src/' + m[1], import.meta.url), 'utf8');
    if (!/registerSW\s*\(\s*\)/.test(entry)) notRegistered.push(`${h} → ${m[1]}`);
  }
  if (!notRegistered.length) ok(`全部 ${htmls.length} 个页面都注册 SW`);
  else fail(`未注册 SW 的页面：${notRegistered.join('、')}`);
}

// 11) SW 注册器必须提示更新、且不自动 reload（编辑中的行程不能被打断）
{
  const reg = readFileSync(new URL('../src/shared/sw-register.js', import.meta.url), 'utf8');
  if (/sw-update/.test(reg) && /showTopBanner/.test(reg)) ok('SW 更新走统一顶部横幅');
  else fail('sw-register.js 未显示更新提示');
  if (/hadController/.test(reg)) ok('首次安装不误报「有新版本」');
  else fail('首次安装会误报更新');
  if (/sw-quota/.test(reg)) ok('SW 配额失败在页面可见');
  else fail('SW 配额失败没有页面提示');
}

if (bad) { console.error(`\n${bad} 项 SW 策略测试失败`); process.exit(1); }
console.log('\nService Worker 策略质量门通过');
