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

// 2) 瓦片白名单 = 实际在用的世界底图；GCJ-02 图商必须排除
{
  const tiles = [
    ['https://tile.openstreetmap.org/5/19/10.png', true, 'OSM 官方'],
    ['https://tile.openstreetmap.de/5/19/10.png', true, 'OSM DE（世界底图实际在用）'],
    ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/5/10/19', true, 'Esri（OSM 失败备用）'],
    ['https://webrd01.is.autonavi.com/appmaptile?x=1&y=2&z=3', false, '高德（GCJ-02）'],
    ['https://rt0.map.gtimg.com/realtimerender?z=3&x=1&y=2', false, '腾讯（GCJ-02/实时）'],
    ['https://julyyunna.art/tdt/DataServer?T=vec_w&x=1&y=2&l=3', false, '天地图（同源 /tdt/，走同源分支）'],
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

if (bad) { console.error(`\n${bad} 项 SW 策略测试失败`); process.exit(1); }
console.log('\nService Worker 策略质量门通过');
