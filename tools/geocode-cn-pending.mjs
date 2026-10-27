#!/usr/bin/env node
// 补【中国】pending 点位坐标：腾讯 place/suggestion（GCJ-02）→ gcj2wgs（WGS-84）→ 写回
//
// 用法: QQ_LBS_KEY=xxx node tools/geocode-cn-pending.mjs --dry
//       QQ_LBS_KEY=xxx node tools/geocode-cn-pending.mjs --apply
//
// 纪律（与 recalibrate-sanya.mjs 一致）：
//   • 坐标一律 WGS-84：腾讯返回 GCJ-02，必须经 gcj2wgs 转换（项目硬约束）
//   • 匹配门：名称字符覆盖率 ≥1 → confidence 100；≥0.8 → 75；低于 0.8 宁可保持 pending
//   • Key 只从环境变量读，绝不入库；申请的腾讯 Key 务必配 Referer/域名白名单
//   • 中国点位受 check-data「来源门」约束：必须有 confidence 75/100

import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.QQ_LBS_KEY;
if (!KEY) { console.error('缺少环境变量 QQ_LBS_KEY（腾讯地图 Key，只存本机/NAS，不入库）'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const FILE = 'data/points.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GCJ-02 -> WGS-84（与 tools/recalibrate-sanya.mjs 同一份实现）
const PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
function tLat(x, y) { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3; r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3; return r; }
function tLng(x, y) { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3; r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3; return r; }
function gcj2wgs(lat, lng) { if (outOfChina(lat, lng)) return [lat, lng]; let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35); const radLat = lat / 180 * PI; let magic = Math.sin(radLat); magic = 1 - EE * magic * magic; const sq = Math.sqrt(magic); dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sq) * PI); dLng = (dLng * 180) / (A / sq * Math.cos(radLat) * PI); return [lat - dLat, lng - dLng]; }

// 名称相似度：关键词字符在候选标题中的覆盖率
function similarity(kw, title) {
  const chars = [...new Set(kw.replace(/[·•\s（）()]/g, ''))];
  if (!chars.length) return 0;
  return chars.filter((c) => title.includes(c)).length / chars.length;
}

// 从 name 括号里提取真实区域（如「山海浪人（万宁）」→ 万宁）
function regionOf(name, city) {
  const m = name.match(/[（(]([^）)]+)[）)]/);
  if (m) {
    const r = m[1];
    const known = ['万宁', '陵水', '文昌', '琼海', '海口', '三亚', '伊宁', '哈尔滨', '霍尔果斯', '石梅湾', '后海'];
    if (known.includes(r)) return { 后海: '三亚', 石梅湾: '万宁' }[r] || r;
  }
  return city;
}

// 地区 bbox（lat0,lat1,lon0,lon1）：腾讯 suggestion 的 region 只是偏置、不是硬过滤，
// 实测会把「海螺号海鲜店」匹配到福建厦门（距三亚 2000km）。命中必须落在 bbox 内，
// 否则宁可保持 pending —— 画到错误位置比没坐标更糟。
const REGION_BBOX = {
  三亚: [18.10, 18.60, 108.50, 110.00],
  陵水: [18.30, 18.80, 109.70, 110.30],
  万宁: [18.50, 19.10, 110.10, 110.70],
  琼海: [19.10, 19.50, 110.20, 110.70],
  文昌: [19.20, 20.10, 110.30, 111.10],
  海口: [19.80, 20.20, 110.10, 110.70],
  伊宁: [43.50, 44.30, 80.50, 82.00],
  哈尔滨: [45.20, 46.00, 126.20, 127.60],
};
const inBox = (region, la, lo) => {
  const b = REGION_BBOX[region];
  return !b || (la >= b[0] && la <= b[1] && lo >= b[2] && lo <= b[3]);
};

const CN_CITIES = new Set(['三亚', '伊宁', '哈尔滨']);
const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const targets = pts.filter((p) => p.pending && CN_CITIES.has(p.city));

console.log(`中国 pending 共 ${targets.length} 个\n`);

const results = [];
for (const p of targets) {
  const { region, kw } = (() => {
    const r = regionOf(p.name, p.city);
    return { region: r, kw: p.name.replace(/[（(].*?[）)]/g, '').trim() };
  })();
  // place/search + boundary=region(xxx,0)：0 表示不自动扩大范围，比 suggestion 严格
  const url = `https://apis.map.qq.com/ws/place/v1/search?keyword=${encodeURIComponent(kw)}&boundary=region(${encodeURIComponent(region)},0)&page_size=10&key=${KEY}`;
  let data = [];
  try {
    const res = await fetch(url, { headers: { Referer: 'https://julyyunna.art/' }, signal: AbortSignal.timeout(15000) });
    const j = await res.json();
    data = j.data || [];
  } catch (e) {
    console.log(`❌ ${p.id} ${p.name} 请求失败：${e.message}`);
    await sleep(250);
    continue;
  }
  const all = data.map((x) => ({
    t: x.title, a: x.address, cat: x.category,
    lat: x.location.lat, lng: x.location.lng,
    s: similarity(kw, x.title),
    box: inBox(region, x.location.lat, x.location.lng),
  }));
  const scored = all.filter((c) => c.box).sort((a, b) => b.s - a.s);
  const dropped = all.filter((c) => !c.box);

  const top = scored[0];
  console.log(`${top && top.s >= 0.8 ? '✅' : '⚠️'} ${p.id} ${p.name}   [region=${region} kw=${kw}]`);
  for (const c of scored.slice(0, 3)) {
    const [wla, wlo] = gcj2wgs(c.lat, c.lng);
    console.log(`    ${c.s.toFixed(2)}  ${c.t} | ${c.a} | ${c.cat}`);
    console.log(`         GCJ ${c.lat},${c.lng} → WGS ${wla.toFixed(6)},${wlo.toFixed(6)}`);
  }
  for (const c of dropped.slice(0, 3)) {
    console.log(`    ✗ 已剔除（落在 ${region} 范围外）${c.s.toFixed(2)} ${c.t} | ${c.a}`);
  }
  if (!all.length) console.log('    → 无结果');
  // 只有字符完全覆盖（s>=1）才自动写入。0.8~1.0 区间实测会假阳性：
  // 「海螺号海鲜店」被匹配到「四川小海螺海鲜餐厅(老码头店)」——靠「店」字命中「码头店」。
  // 宁可保持 pending，也不把点位画到错误店铺上。
  if (top && top.s >= 1) {
    const [wla, wlo] = gcj2wgs(top.lat, top.lng);
    results.push({ id: p.id, lat: wla, lon: wlo, conf: 100, matched: top.t });
  } else if (top && top.s >= 0.8) {
    console.log(`    ⚠️ 相似度 ${top.s.toFixed(2)}（疑似假阳性），需人工确认，不自动写入`);
  } else {
    console.log('    → 匹配度不足，保持 pending');
  }
  await sleep(250);
}

console.log(`\n可写入 ${results.length} 个：`);
for (const r of results) console.log(`  ${r.id} ${r.lat.toFixed(6)},${r.lon.toFixed(6)} conf=${r.conf}  ← ${r.matched}`);

if (!APPLY) { console.log('\n（dry-run，未改文件；确认后加 --apply）'); process.exit(0); }

const byId = new Map(pts.map((p) => [p.id, p]));
let n = 0;
for (const r of results) {
  const p = byId.get(r.id);
  p.lat = r.lat; p.lon = r.lon; p.confidence = r.conf; delete p.pending; n++;
}
writeFileSync(FILE, JSON.stringify(pts, null, 2) + '\n');
console.log(`\n已写回 ${n} 个坐标到 ${FILE}；请跑 node tools/check-data.mjs ./data 复核`);
