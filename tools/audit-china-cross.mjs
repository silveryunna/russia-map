#!/usr/bin/env node
// 中国点位多方地图交叉核对（腾讯 + 高德 + 天地图 三源 vs 库存）
// 诊断逻辑：四方的坐标聚类（150m 内算一致）——
//   库存与 ≥2 源一致      → ✅ 铁证，confidence→100（--apply-conf 时）
//   库存与 1 源一致       → 🟢 可信
//   源之间一致但库存落单   → 🔴 库存疑似错误（最高优先级盲区！）
//   四方各说各话          → ❓ 人工
// 用法: QQ_LBS_KEY=xxx AMAP_WEB_KEY=xxx TDT_KEY=xxx node tools/audit-china-cross.mjs [--apply-conf]
// 纪律：只升置信度，不改坐标；坐标错误一律人工（输出带三方建议坐标）
import { readFileSync, writeFileSync } from 'node:fs';
import { gcj2wgs } from '../src/pages/map/coords.js';

const QQ = process.env.QQ_LBS_KEY || '';
const AM = process.env.AMAP_WEB_KEY || '';
const TDT = process.env.TDT_KEY || '';
if (!QQ || !AM || !TDT) { console.error('需要 QQ_LBS_KEY + AMAP_WEB_KEY + TDT_KEY 三个环境变量'); process.exit(1); }
const APPLY = process.argv.includes('--apply-conf');
const FILE = 'data/points.json';
const CN = new Set(['哈尔滨', '伊宁', '三亚', '赛里木湖', '博乐', '阿拉山口', '霍尔果斯', '乌鲁木齐']);
const AGREE = 150;      // 源间一致阈值
const FAR = 400;        // 库存落单阈值

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const distM = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const [a0, a1] = [a.lat ?? a[0], a.lon ?? a[1]];
  const [b0, b1] = [b.lat ?? b[0], b.lon ?? b[1]];
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin((b0 - a0) * r / 2) ** 2 + Math.cos(a0 * r) * Math.cos(b0 * r) * Math.sin((b1 - a1) * r / 2) ** 2));
};
const clean = (name) => name.replace(/（.*?）|\(.*?\)|「|」|№/g, ' ').replace(/[^\p{Script=Han}A-Za-z0-9 ]/gu, ' ').replace(/\s+/g, ' ').trim();

/* ---------- 三个源（统一返回 {lat, lon} WGS84 或 null） ---------- */
async function fromQQ(name, city) {
  const url = `https://apis.map.qq.com/ws/place/v1/search?boundary=region(${encodeURIComponent(city)},0)&keyword=${encodeURIComponent(clean(name).slice(0, 20))}&page_size=5&key=${QQ}`;
  // key 白名单按域名校验，node 无浏览器 Referer 会被 110 拒绝
  const d = await (await fetch(url, { headers: { Referer: 'https://julyyunna.art/' }, signal: AbortSignal.timeout(20000) })).json();
  if (d.status !== 0 || !d.data?.length) throw new Error(`QQ:${d.status} ${d.message || ''}`.slice(0, 60));
  const kw = clean(name);
  const best = d.data.slice().sort((a, b) => score(b.title, kw) - score(a.title, kw))[0];
  const [wLat, wLon] = gcj2wgs(best.location.lat, best.location.lng);
  return { lat: wLat, lon: wLon, label: best.title };
}
async function fromAM(name, city) {
  const url = `https://restapi.amap.com/v3/place/text?key=${AM}&keywords=${encodeURIComponent(clean(name))}&city=${encodeURIComponent(city)}&citylimit=true&output=json`;
  const d = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
  if (d.status !== '1') throw new Error(`AM:${d.info || d.infocode}`.slice(0, 60));
  // 首条可能是无坐标的父 POI（风景名胜聚合条目 location 为空），取第一条有坐标的
  const poi = (d.pois || []).find((x) => x.location && String(x.location).includes(','));
  if (!poi) return null;
  const [lon, lat] = poi.location.split(',').map(Number);
  const [wLat, wLon] = gcj2wgs(lat, lon);
  return { lat: wLat, lon: wLon, label: poi.name };
}
// 城市中心（供天地图 mapBound；范围 ±0.35°，足够城市级 POI 搜索）
const CITY_CENTER = {
  哈尔滨: [126.53, 45.80], 伊宁: [81.32, 43.91], 三亚: [109.51, 18.25],
  赛里木湖: [81.20, 44.60], 博乐: [82.07, 44.90], 阿拉山口: [82.57, 45.17],
  霍尔果斯: [80.42, 44.21], 乌鲁木齐: [87.62, 43.83],
};
async function fromTDT(name, city) {
  const c = CITY_CENTER[city];
  if (!c) return null;
  const bound = `${c[0] - 0.35},${c[1] - 0.35},${c[0] + 0.35},${c[1] + 0.35}`;
  // 天地图搜索必须有 mapBound，否则空返回
  const postStr = JSON.stringify({ keyWord: clean(name).slice(0, 20), level: 12, mapBound: bound, queryType: 4, start: 0, count: 10 });
  const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(postStr)}&type=query&tk=${TDT}`;
  const d = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
  const list = d.suggests || [];
  const hit = list.find((s) => (s.address || '').includes(city) && s.lonlat) || null;
  if (!hit) return null;
  const [lon, lat] = hit.lonlat.split(',').map(Number);
  return { lat, lon, label: hit.name }; // 天地图 CGCS2000 ≈ WGS84，不转换
}
const score = (title, kw) => {
  let s = 0; for (const ch of new Set(kw.replace(/ /g, ''))) if (title.includes(ch)) s++;
  return s;
};

/* ---------- 主流程 ---------- */
const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const targets = pts.filter((p) => CN.has(p.city) && !p.pending);
console.log(`交叉核对目标：${targets.length} 个中国点位（腾讯+高德+天地图 三源）\n`);

const iron = [], good = [], storedWrong = [], chaos = [], srcFail = [];
let done = 0;
for (const p of targets) {
  const r = { p };
  try { r.qq = await fromQQ(p.name, p.city); } catch { r.qqErr = 1; }
  await sleep(120);
  try { r.am = await fromAM(p.name, p.city); } catch { r.amErr = 1; }
  await sleep(120);
  try { r.tdt = await fromTDT(p.name, p.city); } catch { r.tdtErr = 1; }
  await sleep(120);

  const stored = { lat: p.lat, lon: p.lon };
  const srcs = [['qq', r.qq], ['am', r.am], ['tdt', r.tdt]].filter(([, v]) => v);
  const okSrcs = srcs.filter(([, v]) => distM(stored, v) < AGREE);
  const nearSrcs = srcs.filter(([, v]) => distM(stored, v) < FAR);
  // 源间聚类：找彼此 <AGREE 的源组
  let srcCluster = [];
  for (const [n1, v1] of srcs) {
    const grp = [n1];
    for (const [n2, v2] of srcs) if (n1 !== n2 && distM(v1, v2) < AGREE) grp.push(n2);
    if (grp.length > srcCluster.length) srcCluster = grp;
  }
  if (!srcs.length) { srcFail.push(p); }
  else if (okSrcs.length >= 2) iron.push({ ...r, d: Math.min(...okSrcs.map(([, v]) => distM(stored, v))) });
  else if (okSrcs.length === 1 || nearSrcs.length >= 1) good.push({ ...r, d: Math.min(...nearSrcs.map(([, v]) => distM(stored, v))) });
  else if (srcCluster.length >= 2) storedWrong.push({ ...r, cluster: srcCluster, d: Math.min(...srcs.filter(([n]) => srcCluster.includes(n)).map(([, v]) => distM(stored, v))) });
  else chaos.push(r);
  if (++done % 20 === 0) console.log(`  …进度 ${done}/${targets.length}`);
}

const fmt = (r) => {
  const parts = [`${r.p.id} ${r.p.name.slice(0, 16)}`];
  for (const [n, v] of [['qq', r.qq], ['am', r.am], ['tdt', r.tdt]]) {
    parts.push(v ? `${n}:${distM([r.p.lat, r.p.lon], v).toFixed(0)}m` : `${n}:无`);
  }
  return '  ' + parts.join(' | ') + (r.d != null ? `（最近 ${r.d.toFixed(0)}m）` : '');
};

console.log(`\n═══ 交叉核对结论（${targets.length} 点）═══`);
console.log(`🛡️ 铁证一致(库存+≥2源<150m)：${iron.length}`); iron.slice(0, 6).forEach((r) => console.log(fmt(r))); if (iron.length > 6) console.log(`  …共 ${iron.length} 个`);
console.log(`🟢 可信(库存与某源<400m)：${good.length}`); good.slice(0, 5).forEach((r) => console.log(fmt(r))); if (good.length > 5) console.log(`  …共 ${good.length} 个`);
console.log(`🔴🔴 库存疑似错误（≥2源互相一致、库存落单）：${storedWrong.length}`); storedWrong.forEach((r) => console.log(fmt(r)));
console.log(`❓ 各说各话：${chaos.length}`); chaos.slice(0, 8).forEach((r) => console.log(fmt(r))); if (chaos.length > 8) console.log(`  …共 ${chaos.length} 个`);
console.log(`⚪ 三源全查不到：${srcFail.length}（${srcFail.map((p) => p.id + p.name.slice(0, 8)).join('、') || '无'}）`);

if (APPLY) {
  let up = 0;
  for (const { p } of iron) if (p.confidence < 100) { p.confidence = 100; up++; }
  if (up) { writeFileSync(FILE, JSON.stringify(pts, null, 1) + '\n'); console.log(`\n✅ 已升级 ${up} 个 confidence→100（仅铁证档）`); }
}

// 明细落盘（供人工裁决与后续对比）
writeFileSync('tools/audit-china-cross-report.json', JSON.stringify({
  date: new Date().toISOString().slice(0, 10), agree: AGREE, far: FAR,
  iron: iron.map((r) => ({ id: r.p.id, name: r.p.name, d: Math.round(r.d), conf: r.p.confidence })),
  storedWrong: storedWrong.map((r) => ({
    id: r.p.id, name: r.p.name, city: r.p.city, stored: [r.p.lat, r.p.lon], d: Math.round(r.d),
    qq: r.qq && [+r.qq.lat.toFixed(6), +r.qq.lon.toFixed(6), r.qq.label],
    am: r.am && [+r.am.lat.toFixed(6), +r.am.lon.toFixed(6), r.am.label],
    tdt: r.tdt && [+r.tdt.lat.toFixed(6), +r.tdt.lon.toFixed(6), r.tdt.label],
  })),
  chaos: chaos.map((r) => ({ id: r.p.id, name: r.p.name, stored: [r.p.lat, r.p.lon],
    qq: r.qq && [+r.qq.lat.toFixed(6), +r.qq.lon.toFixed(6)], am: r.am && [+r.am.lat.toFixed(6), +r.am.lon.toFixed(6)], tdt: r.tdt && [+r.tdt.lat.toFixed(6), +r.tdt.lon.toFixed(6)] })),
}, null, 1));
console.log('\n明细 → tools/audit-china-cross-report.json');
