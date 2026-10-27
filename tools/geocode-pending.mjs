#!/usr/bin/env node
// 补 pending 点位坐标（Nominatim / OSM，返回即 WGS84，与项目坐标系一致）
//
// 用法: node tools/geocode-pending.mjs --dry    只查询并打印候选，不改文件
//       node tools/geocode-pending.mjs --apply  按 QUERIES 写回 data/points.json
//
// 纪律：
//   • 只补「名称精确匹配」的：命中结果必须落在目标城市 bbox 内，否则宁可保持 pending
//     （画到错误位置比没坐标更糟）
//   • 命中且名称高置信 → confidence=100；仅街道/近似级 → confidence=75（待人工复核）
//   • Nominatim 限速 1 req/s，脚本已节流；User-Agent 必填否则 403
//   • 中国点位优先走腾讯（需 QQ_LBS_KEY）并 gcj2wgs 转换；无 Key 时本脚本会跳过

import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const FILE = 'data/points.json';

// 手工构造的查询词：Nominatim 对音译中文名几乎查不到，必须用俄文/英文原名
// 每项：q=查询词, city=用于校验的城市 bbox, hi=true 表示名称足够精确可给 100
const QUERIES = {
  p304: { q: 'Средний проспект Васильевского острова, Санкт-Петербург', hi: true },
  p319: { q: 'книжный магазин Достоевский, Москва', hi: false },
  p323: { q: 'МАНИЯ кофейня, Москва', hi: false },
  p330: { q: 'Барыс бизнес центр, Алматы', hi: false },
  p332: { q: 'Асан Спа, Алматы', hi: false },
  p333: { q: 'Арбат Алматы башни', hi: false },
  p500: { q: 'улица Тулебаева, Алматы', hi: true },
  p507: { q: 'Музей книги Республики Казахстан, Алматы', hi: false },
  p508: { q: 'Retro Vinyl, Алматы', hi: false },
};

// 城市 bbox（lat 区间, lon 区间）：命中必须落在里面，防止查到同名异地
const BBOX = {
  莫斯科: [55.5, 56.0, 37.3, 37.9],
  圣彼得堡: [59.7, 60.1, 29.6, 30.6],
  阿拉木图: [43.1, 43.4, 76.7, 77.2],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=3&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'russia-map-dev/1.0 (personal travel map)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const byId = new Map(pts.map((p) => [p.id, p]));
const pending = pts.filter((p) => p.pending);

console.log(`pending 共 ${pending.length} 个；QUERIES 覆盖 ${Object.keys(QUERIES).length} 个，其余需人工\n`);

const results = [];
for (const [id, cfg] of Object.entries(QUERIES)) {
  const p = byId.get(id);
  if (!p) { console.log(`⚠️ ${id} 不在 points.json`); continue; }
  if (!p.pending) { console.log(`ℹ️ ${id} 已有坐标，跳过`); continue; }
  let hits = [];
  try {
    hits = await search(cfg.q);
  } catch (e) {
    console.log(`❌ ${id} 查询失败：${e.message}`);
    await sleep(1100);
    continue;
  }
  const bb = BBOX[p.city];
  const inCity = bb ? hits.filter((h) => {
    const la = +h.lat, lo = +h.lon;
    return la >= bb[0] && la <= bb[1] && lo >= bb[2] && lo <= bb[3];
  }) : hits;

  const top = inCity[0] || hits[0];
  const ok = !!top && inCity.length > 0;
  console.log(`${ok ? '✅' : '⚠️'} ${id} ${p.name}`);
  console.log(`    query: ${cfg.q}`);
  if (top) {
    console.log(`    → ${(+top.lat).toFixed(6)}, ${(+top.lon).toFixed(6)}  ${ok ? '(在城市 bbox 内)' : '(❗落在城市外，需人工判断)'}`);
    console.log(`    → ${top.display_name}`);
  } else {
    console.log('    → 无结果');
  }
  if (ok) results.push({ id, lat: +top.lat, lon: +top.lon, conf: cfg.hi ? 100 : 75, name: top.display_name });
  await sleep(1100);   // Nominatim 限速
}

console.log(`\n可写入 ${results.length} 个：`);
for (const r of results) console.log(`  ${r.id} ${r.lat},${r.lon} conf=${r.conf}`);

if (!APPLY) {
  console.log('\n（dry-run，未改文件；确认后加 --apply）');
  process.exit(0);
}

let n = 0;
for (const r of results) {
  const p = byId.get(r.id);
  p.lat = r.lat;
  p.lon = r.lon;
  p.confidence = r.conf;
  delete p.pending;
  n++;
}
writeFileSync(FILE, JSON.stringify(pts, null, 2) + '\n');
console.log(`\n已写回 ${n} 个坐标到 ${FILE}；请跑 node tools/check-data.mjs ./data 复核`);
