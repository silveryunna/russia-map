#!/usr/bin/env node
// 补 pending 点位坐标（Yandex Geocoder API，俄/哈 POI 覆盖率远好于 Nominatim）
// 返回坐标为 WGS-84（与项目坐标系一致；首跑会自检红场已知坐标验证这一点）
//
// 用法: YANDEX_GEO_KEY=xxx node tools/geocode-yandex.mjs --dry
//       YANDEX_GEO_KEY=xxx node tools/geocode-yandex.mjs --apply
//
// 纪律（与 geocode-pending.mjs 相同）：
//   • 命中必须落在目标城市 bbox 内，否则宁可保持 pending（画错比没有更糟）
//   • 查询词表 hi=true 表示名称足够精确 → confidence=100；否则 75（待人工复核）
//   • Yandex 免费档限速宽松，仍节流 300ms；node fetch 需 NODE_USE_ENV_PROXY=1 走代理
import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const FILE = 'data/points.json';
const KEY = process.env.YANDEX_GEO_KEY || '';
if (!KEY) { console.error('缺少 YANDEX_GEO_KEY 环境变量'); process.exit(1); }

// 查询词与置信度（与 geocode-pending.mjs 同源；Nominatim 查不到的在这里兜底）
// noAuto=true：Yandex 只会返回城市/街区级中心或疑似错配，拒绝自动落点，保持 pending 人工处理
const QUERIES = {
  p304: { q: 'Средний проспект Васильевского острова, Санкт-Петербург', hi: true },
  p319: { q: 'книжный магазин Достоевский, Москва', hi: false },
  p323: { q: 'МАНИЯ кофейня, Москва', hi: false, noAuto: true },
  p330: { q: 'Барыс бизнес центр, Алматы', hi: false, noAuto: true },
  p332: { q: 'Асан Спа, Алматы', hi: false, noAuto: true },
  p333: { q: 'Арбат Алматы башни', hi: false },
  p500: { q: 'улица Тулебаева, Алматы', hi: true },
  p507: { q: 'Музей книги Республики Казахстан, Алматы', hi: false },
  p508: { q: 'Retro Vinyl, Алматы', hi: false, noAuto: true },
};

const BBOX = {
  莫斯科: [55.5, 56.0, 37.3, 37.9],
  圣彼得堡: [59.7, 60.1, 29.6, 30.6],
  阿拉木图: [43.1, 43.4, 76.7, 77.2],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q) {
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${KEY}&format=json&results=3&geocode=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return (d.response?.GeoObjectCollection?.featureMember || []).map((m) => {
    const g = m.GeoObject;
    const [lon, lat] = (g.Point?.pos || '').split(' ').map(Number);
    return { lat, lon, name: g.name || '', desc: g.description || '', kind: g.metaDataProperty?.GeocoderMetaData?.kind || '' };
  }).filter((h) => Number.isFinite(h.lat));
}

/* ---------- 首跑自检：Yandex 返回必须是 WGS-84 ---------- */
{
  const ref = await search('Красная площадь, Москва');
  const top = ref[0];
  const dLat = Math.abs(top.lat - 55.753930), dLon = Math.abs(top.lon - 37.620795);
  if (dLat > 0.002 || dLon > 0.002) {
    console.error(`❌ 坐标系自检失败：红场应 ≈55.753930,37.620795（WGS84），实际 ${top.lat},${top.lon}`);
    console.error('   Yandex 返回可能不是 WGS84 或有偏，禁止 --apply');
    process.exit(1);
  }
  console.log(`✅ 坐标系自检通过（红场偏差 ${(dLat * 111000).toFixed(0)}m / ${(dLon * 85000).toFixed(0)}m）\n`);
}

const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const byId = new Map(pts.map((p) => [p.id, p]));
const pending = pts.filter((p) => p.pending);
console.log(`pending 共 ${pending.length} 个；QUERIES 覆盖 ${Object.keys(QUERIES).length} 个\n`);

const writable = [];
for (const [id, cfg] of Object.entries(QUERIES)) {
  const p = byId.get(id);
  if (!p) { console.log(`⚠️ ${id} 不在 points.json`); continue; }
  if (!p.pending) { console.log(`ℹ️ ${id} 已有坐标，跳过`); continue; }
  let hits = [];
  try {
    hits = await search(cfg.q);
  } catch (e) {
    console.log(`❌ ${id} 查询失败：${e.message}`);
    await sleep(300);
    continue;
  }
  const bb = BBOX[p.city];
  const inCity = bb ? hits.filter((h) => h.lat >= bb[0] && h.lat <= bb[1] && h.lon >= bb[2] && h.lon <= bb[3]) : hits;
  const top = inCity[0];
  const rejectReason = cfg.noAuto ? '该点 Yandex 只回城市/街区级结果或疑似错配（noAuto）'
    : top && top.kind === 'locality' ? '结果为城市级中心点（kind=locality），无定位价值' : null;
  if (top && !rejectReason) {
    console.log(`✅ ${id} ${p.name}`);
    console.log(`    → ${top.lat.toFixed(6)}, ${top.lon.toFixed(6)}  ${top.name} | ${top.desc} | kind=${top.kind}`);
    writable.push({ p, lat: top.lat, lon: top.lon, conf: cfg.hi ? 100 : 75 });
  } else if (top) {
    console.log(`🚫 ${id} ${p.name} → ${rejectReason}（${top.name} | ${top.desc}），保持 pending`);
  } else {
    const o = hits[0];
    console.log(`⚠️ ${id} ${p.name} → ${o ? `落在城市外：${o.lat.toFixed(4)},${o.lon.toFixed(4)}（${o.name}）` : '无结果'}，保持 pending`);
  }
  await sleep(300);
}

console.log(`\n可写入 ${writable.length} 个：`);
for (const w of writable) console.log(`  ${w.p.id} ${w.p.name} → ${w.lat.toFixed(6)}, ${w.lon.toFixed(6)} (conf=${w.conf})`);

if (APPLY && writable.length) {
  for (const w of writable) {
    w.p.lat = +w.lat.toFixed(6);
    w.p.lon = +w.lon.toFixed(6);
    w.p.confidence = w.conf;
    delete w.p.pending;
  }
  writeFileSync(FILE, JSON.stringify(pts, null, 1) + '\n');
  console.log('\n✅ 已写回 points.json（--apply）');
} else {
  console.log('\n（dry-run，未改文件；确认后加 --apply）');
}
