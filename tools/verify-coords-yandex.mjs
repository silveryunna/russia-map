#!/usr/bin/env node
// 坐标反向核查：对指定城市的每个点位做 Yandex 逆地理编码，校验「坐标落在哪座城市」
// 用途：发现归属错误（城市字段说 A、坐标实际在 B）、坐标漂移、空挂点位
// 用法: YANDEX_GEO_KEY=xxx node tools/verify-coords-yandex.mjs --city=伊宁 [--apply-fix]
//   --apply-fix 把明确归属错误（confidence=100 且目标城市有 bbox 表）的点位城市字段改过来
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.YANDEX_GEO_KEY || '';
if (!KEY) { console.error('缺少 YANDEX_GEO_KEY 环境变量'); process.exit(1); }
const CITY = (process.argv.find((a) => a.startsWith('--city=')) || '').slice(7) || '伊宁';
const APPLY = process.argv.includes('--apply-fix');
const FILE = 'data/points.json';

// 已知城市 → 该城在 Yandex 地址里的关键词（大小写不敏感子串）
// 顺序即优先级：县市级关键词在前（避免「博尔塔拉蒙古自治州」把阿拉山口误判成博乐）
const CITY_KEYS = {
  阿拉山口: ['алашанькоу', 'alashankou', '阿拉山口'],
  霍尔果斯: ['хоргос', 'khorgos', 'hor', '霍尔果斯'],
  赛里木湖: ['сайрам', 'sayram', '赛里木湖'],
  伊宁: ['инин', 'yin', 'ghulja', 'кульджа', '伊宁'],
  乌鲁木齐: ['урумчи', 'urumqi', '乌鲁木齐'],
  博乐: ['bole', '博尔塔拉', '博乐', 'bortala', 'боро-тала', 'boro-tala'],
};
// 这些城市的参考 bbox（lat1,lat2,lon1,lon2），供 apply-fix 二次确认
const BBOX = {
  伊宁: [43.80, 44.05, 81.15, 81.55],
  博乐: [44.80, 45.05, 81.95, 82.35],
  阿拉山口: [45.10, 45.25, 82.45, 82.75],
  霍尔果斯: [44.10, 44.30, 80.30, 80.55],
  乌鲁木齐: [43.70, 44.10, 87.30, 87.75],
  赛里木湖: [44.45, 44.75, 81.00, 81.60],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reverse(lat, lon) {
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${KEY}&format=json&results=1&geocode=${lon},${lat}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const g = d.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  if (!g) return null;
  const det = g.metaDataProperty?.GeocoderMetaData?.AddressDetails?.Country || {};
  // 直接序列化整个地址结构做关键词匹配（比逐层 walk 稳健，俄/中/英混排都能命中）
  const text = (JSON.stringify(det) + ' ' + (g.description || '') + ' ' + (g.name || '')).toLowerCase();
  return { text, kind: g.metaDataProperty?.GeocoderMetaData?.kind || '' };
}

const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const list = pts.filter((p) => p.city === CITY && !p.pending);
console.log(`${CITY} 共 ${list.length} 个有坐标点位，逐一反查 Yandex 地址：\n`);

const rows = [];
for (const p of list) {
  let hit = null;
  try { hit = await reverse(p.lat, p.lon); }
  catch (e) { console.log(`❌ ${p.id} 查询失败：${e.message}`); await sleep(300); continue; }
  const text = (hit?.text || '').toLowerCase();
  // 命中哪个已知城市
  const matched = Object.entries(CITY_KEYS).find(([, keys]) => keys.some((k) => text.includes(k.toLowerCase())))?.[0] || null;
  const verdict = matched === CITY ? '✅' : matched ? `⛔归属(${matched})` : '❓未识别';
  console.log(`${verdict} ${p.id} (${p.lat.toFixed(4)},${p.lon.toFixed(4)}) ${p.name}`);
  console.log(`    ${(hit?.text || '').slice(0, 130)}`);
  rows.push({ p, matched, hit });
  await sleep(300);
}

// 汇总与修复建议
const wrong = rows.filter((r) => r.matched && r.matched !== CITY);
const unknown = rows.filter((r) => !r.matched);
console.log(`\n═══ 结论 ═══ 正确 ${rows.length - wrong.length - unknown.length} · 归属错误 ${wrong.length} · 未识别 ${unknown.length}`);

if (APPLY && wrong.length) {
  let fixed = 0;
  for (const { p, matched } of wrong) {
    const bb = BBOX[matched];
    const inBox = bb && p.lat >= bb[0] && p.lat <= bb[1] && p.lon >= bb[2] && p.lon <= bb[3];
    if (p.confidence === 100 && inBox) { p.city = matched; fixed++; console.log(`🔧 ${p.id} → city=${matched}`); }
    else console.log(`⚠️ ${p.id} 疑似应归 ${matched}，但 conf=${p.confidence}${inBox ? '' : ' 且坐标在目标城市 bbox 外'}，不改，留人工`);
  }
  if (fixed) { writeFileSync(FILE, JSON.stringify(pts, null, 1) + '\n'); console.log(`\n✅ 已修正 ${fixed} 个（--apply-fix）`); }
} else if (wrong.length) {
  console.log('（复查确认后加 --apply-fix 修正城市字段）');
}
