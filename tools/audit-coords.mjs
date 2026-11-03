#!/usr/bin/env node
// 坐标审计统一入口（坐标类工具五合一后的主工具）
//   cross  — 腾讯+高德+天地图三源 vs 库存交叉核对（少数服从多数诊断，明细落盘）
//   verify — Yandex 逆地理核对「城市归属」（修 city 字段误挂）
// 用法:
//   node tools/audit-coords.mjs cross [--city=三亚] [--apply-conf]
//   node tools/audit-coords.mjs verify --city=伊宁 [--apply-fix]
// 环境: QQ_LBS_KEY + AMAP_WEB_KEY + TDT_KEY（cross）/ YANDEX_GEO_KEY（verify）
// 被本工具取代的旧脚本（git 历史可查）：audit-china-cross.mjs / geocode-amap.mjs / verify-coords-yandex.mjs
// 另有单职工具保留：audit-baidu.mjs（第四商业源，独立计费）、geocode-yandex.mjs（俄区 pending 正查）
import { readFileSync, writeFileSync } from 'node:fs';
import { gcj2wgs } from '../src/pages/map/coords.js';
import { CN_CITIES, CITY_REGION, PROVINCE, AGREE, FAR, distM, cleanName, coreName, nameScore } from './lib/audit-shared.mjs';

const MODE = process.argv[2] || 'cross';
const CITY = (process.argv.find((a) => a.startsWith('--city=')) || '').slice(7);
const APPLY = process.argv.includes('--apply-conf') || process.argv.includes('--apply-fix');
const FILE = 'data/points.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= 源插件（统一返回 {lat, lon, label} WGS84 或 null，失败抛错） ================= */

// 跨县市点位（三亚行程里的陵水/万宁等）按省级 scope 查；市内 POI 必须市级 scope，否则省级会拉回同名异地街
const COUNTIES = /（(陵水|万宁|保亭|文昌|琼海|澄迈|临高|昌江|乐东|五指山|琼中|屯昌|定安)）/;
const scopeOf = (name, city) => (COUNTIES.test(name) ? (PROVINCE[city] || city) : (CITY_REGION[city] || city));

async function fromQQ(name, city, QQ) {
  const region = scopeOf(name, city);
  const url = `https://apis.map.qq.com/ws/place/v1/search?boundary=region(${encodeURIComponent(region)},0)&keyword=${encodeURIComponent(coreName(name, city).slice(0, 20))}&page_size=8&key=${QQ}`;
  const d = await (await fetch(url, { headers: { Referer: 'https://julyyunna.art/' }, signal: AbortSignal.timeout(20000) })).json();
  if (d.status !== 0) throw new Error(`QQ:${d.status} ${(d.message || '').slice(0, 40)}`);
  const kw = coreName(name, city);
  const best = (d.data || []).filter((x) => nameScore(x.title, kw) >= 0.7)
    .sort((a, b) => nameScore(b.title, kw) - nameScore(a.title, kw))[0];
  if (!best) return null;
  const [wLat, wLon] = gcj2wgs(best.location.lat, best.location.lng);
  return { lat: wLat, lon: wLon, label: best.title };
}

async function fromAM(name, city, AM) {
  const scope = scopeOf(name, city);
  const url = `https://restapi.amap.com/v3/place/text?key=${AM}&keywords=${encodeURIComponent(cleanName(name))}&city=${encodeURIComponent(scope)}&citylimit=true&output=json`;
  const d = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
  if (d.status !== '1') throw new Error(`AM:${(d.info || d.infocode || '').slice(0, 40)}`);
  const kw = coreName(name, city);
  const poi = (d.pois || []).filter((x) => x.location && nameScore(x.name, kw) >= 0.7)
    .sort((a, b) => nameScore(b.name, kw) - nameScore(a.name, kw))[0];
  if (!poi) return null;
  const [lon, lat] = poi.location.split(',').map(Number);
  const [wLat, wLon] = gcj2wgs(lat, lon);
  return { lat: wLat, lon: wLon, label: poi.name };
}

const CITY_CENTER = {
  哈尔滨: [126.53, 45.80], 伊宁: [81.32, 43.91], 三亚: [109.80, 18.45],
  赛里木湖: [81.20, 44.60], 博乐: [82.07, 44.90], 阿拉山口: [82.57, 45.17],
  霍尔果斯: [80.42, 44.21], 乌鲁木齐: [87.62, 43.83],
};
async function fromTDT(name, city, TDT) {
  const c = CITY_CENTER[city];
  if (!c) return null;
  const bound = `${c[0] - 0.6},${c[1] - 0.45},${c[0] + 0.6},${c[1] + 0.45}`;
  const postStr = JSON.stringify({ keyWord: coreName(name, city).slice(0, 20), level: 12, mapBound: bound, queryType: 4, start: 0, count: 10 });
  const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(postStr)}&type=query&tk=${TDT}`;
  const d = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
  const kw = coreName(name, city);
  const hit = (d.suggests || []).filter((s) => s.lonlat &&
      ((s.address || '').includes(city) || (s.address || '').includes((PROVINCE[city] || '').slice(0, 2))))
    .sort((a, b) => nameScore(b.name, kw) - nameScore(a.name, kw))[0];
  if (!hit) return null;
  const [lon, lat] = hit.lonlat.split(',').map(Number);
  return { lat, lon, label: hit.name }; // CGCS2000 ≈ WGS84
}

/* ================= cross：三源交叉核对 ================= */

async function cross() {
  const QQ = process.env.QQ_LBS_KEY, AM = process.env.AMAP_WEB_KEY, TDT = process.env.TDT_KEY;
  if (!QQ || !AM || !TDT) { console.error('cross 需要 QQ_LBS_KEY + AMAP_WEB_KEY + TDT_KEY'); process.exit(1); }
  const pts = JSON.parse(readFileSync(FILE, 'utf8'));
  const targets = pts.filter((p) => CN_CITIES.has(p.city) && !p.pending && (!CITY || p.city === CITY));
  console.log(`cross：${targets.length} 个中国点位（${AGREE}m 一致 / ${FAR}m 落单阈值）\n`);

  const iron = [], good = [], storedWrong = [], chaos = [], srcFail = [];
  let done = 0;
  for (const p of targets) {
    const r = { p };
    for (const [key, fn] of [['qq', fromQQ], ['am', fromAM], ['tdt', fromTDT]]) {
      try { r[key] = await fn(p.name, p.city, { qq: QQ, am: AM, tdt: TDT }[key]); }
      catch (e) { r[key + 'Err'] = e.message; }
      await sleep(120);
    }
    const stored = { lat: p.lat, lon: p.lon };
    const srcs = [['qq', r.qq], ['am', r.am], ['tdt', r.tdt]].filter(([, v]) => v);
    const okSrcs = srcs.filter(([, v]) => distM(stored, v) < AGREE);
    const nearSrcs = srcs.filter(([, v]) => distM(stored, v) < FAR);
    let srcCluster = [];
    for (const [n1, v1] of srcs) {
      const grp = [n1];
      for (const [n2, v2] of srcs) if (n1 !== n2 && distM(v1, v2) < AGREE) grp.push(n2);
      if (grp.length > srcCluster.length) srcCluster = grp;
    }
    if (!srcs.length) srcFail.push(p);
    else if (okSrcs.length >= 2) iron.push({ ...r, d: Math.min(...okSrcs.map(([, v]) => distM(stored, v))) });
    else if (nearSrcs.length >= 1) good.push({ ...r, d: Math.min(...nearSrcs.map(([, v]) => distM(stored, v))) });
    else if (srcCluster.length >= 2) storedWrong.push({ ...r, cluster: srcCluster, d: Math.min(...srcs.filter(([n]) => srcCluster.includes(n)).map(([, v]) => distM(stored, v))) });
    else chaos.push(r);
    if (++done % 30 === 0) console.log(`  …${done}/${targets.length}`);
  }

  const fmt = (r) => '  ' + [`${r.p.id} ${r.p.name.slice(0, 14)}`,
    ...[['qq', r.qq], ['am', r.am], ['tdt', r.tdt]].map(([n, v]) => v ? `${n}:${distM([r.p.lat, r.p.lon], v).toFixed(0)}m` : `${n}:${r[n + 'Err'] ? '错' : '无'}`),
  ].join(' | ') + (r.d != null ? `（最近 ${r.d.toFixed(0)}m）` : '');
  console.log(`\n═══ cross 结论 ═══`);
  console.log(`🛡️ 铁证：${iron.length}  🟢 可信：${good.length}  🔴🔴 库存疑似错误：${storedWrong.length}  ❓ 各说各话：${chaos.length}  ⚪ 三源全无：${srcFail.length}`);
  storedWrong.slice(0, 10).forEach((r) => console.log(fmt(r)));
  chaos.slice(0, 10).forEach((r) => console.log(fmt(r)));

  if (APPLY) {
    let up = 0;
    for (const { p } of iron) if (p.confidence < 100) { p.confidence = 100; up++; }
    if (up) { writeFileSync(FILE, JSON.stringify(pts, null, 1) + '\n'); console.log(`\n✅ 已升级 ${up} 个 confidence→100`); }
  }
  writeFileSync('tools/audit-coords-report.json', JSON.stringify({
    date: new Date().toISOString().slice(0, 10), city: CITY || 'all', agree: AGREE, far: FAR,
    iron: iron.map((r) => ({ id: r.p.id, d: Math.round(r.d), conf: r.p.confidence })),
    storedWrong: storedWrong.map((r) => ({ id: r.p.id, name: r.p.name, d: Math.round(r.d),
      qq: r.qq && [+r.qq.lat.toFixed(6), +r.qq.lon.toFixed(6), r.qq.label],
      am: r.am && [+r.am.lat.toFixed(6), +r.am.lon.toFixed(6), r.am.label],
      tdt: r.tdt && [+r.tdt.lat.toFixed(6), +r.tdt.lon.toFixed(6), r.tdt.label] })),
  }, null, 1));
  console.log('明细 → tools/audit-coords-report.json');
}

/* ================= verify：Yandex 逆地理核对城市归属 ================= */

async function verify() {
  const KEY = process.env.YANDEX_GEO_KEY;
  if (!KEY) { console.error('verify 需要 YANDEX_GEO_KEY'); process.exit(1); }
  if (!CITY) { console.error('verify 必须指定 --city='); process.exit(1); }
  // 县市级关键词必须排在州级前（「博尔塔拉蒙古自治州」含「боро-тала」会吞掉阿拉山口）
  const CITY_KEYS = {
    阿拉山口: ['алашанькоу', 'alashankou', '阿拉山口'],
    霍尔果斯: ['хоргос', 'khorgos', 'hor', '霍尔果斯'],
    赛里木湖: ['сайрам', 'sayram', '赛里木湖'],
    伊宁: ['инин', 'yin', 'ghulja', 'кульджа', '伊宁'],
    乌鲁木齐: ['урумчи', 'urumqi', '乌鲁木齐'],
    博乐: ['bole', '博尔塔拉', '博乐', 'bortala', 'боро-тала'],
  };
  const BBOX = {
    伊宁: [43.80, 44.05, 81.15, 81.55], 博乐: [44.80, 45.05, 81.95, 82.35],
    阿拉山口: [45.10, 45.25, 82.45, 82.75], 霍尔果斯: [44.10, 44.30, 80.30, 80.55],
    乌鲁木齐: [43.70, 44.10, 87.30, 87.75], 赛里木湖: [44.45, 44.75, 81.00, 81.60],
  };
  const pts = JSON.parse(readFileSync(FILE, 'utf8'));
  const list = pts.filter((p) => p.city === CITY && !p.pending);
  console.log(`verify：${CITY} ${list.length} 个点位，Yandex 逆地理核对归属\n`);
  const wrong = [];
  for (const p of list) {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${KEY}&format=json&results=1&geocode=${p.lon},${p.lat}`;
    let hit = null;
    try {
      const d = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
      const g = d.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
      hit = g ? (JSON.stringify(g.metaDataProperty?.GeocoderMetaData?.AddressDetails?.Country || {}) + ' ' + (g.description || '')).toLowerCase() : '';
    } catch (e) { console.log(`❌ ${p.id} ${e.message}`); await sleep(300); continue; }
    const matched = Object.entries(CITY_KEYS).find(([, keys]) => keys.some((k) => hit.includes(k.toLowerCase())))?.[0] || null;
    console.log(`${matched === CITY ? '✅' : matched ? '⛔' : '❓'} ${p.id} (${p.lat.toFixed(4)},${p.lon.toFixed(4)}) ${p.name.slice(0, 18)}${matched && matched !== CITY ? ' → 疑似 ' + matched : ''}`);
    if (matched && matched !== CITY) wrong.push({ p, matched });
    await sleep(300);
  }
  console.log(`\n═══ verify 结论 ═══ 疑似误挂 ${wrong.length} 个`);
  if (APPLY && wrong.length) {
    let fixed = 0;
    for (const { p, matched } of wrong) {
      const bb = BBOX[matched];
      const inBox = bb && p.lat >= bb[0] && p.lat <= bb[1] && p.lon >= bb[2] && p.lon <= bb[3];
      if (p.confidence === 100 && inBox) { p.city = matched; fixed++; console.log(`🔧 ${p.id} → ${matched}`); }
      else console.log(`⚠️ ${p.id} 疑似 ${matched}（conf=${p.confidence}${inBox ? '' : '，bbox 外'}），留人工`);
    }
    if (fixed) { writeFileSync(FILE, JSON.stringify(pts, null, 1) + '\n'); console.log(`✅ 已修正 ${fixed} 个`); }
  }
}

if (MODE === 'cross') await cross();
else if (MODE === 'verify') await verify();
else { console.error('用法: audit-coords.mjs cross|verify [--city=X] [--apply-conf|--apply-fix]'); process.exit(1); }
