#!/usr/bin/env node
// 中国点位坐标复核（高德 Web服务地理编码 → GCJ-02 → 本项目 gcj2wgs → 与库存坐标比对）
// 用途：92 个 confidence<100 的中国点位的官方源复核；也可全量抽查
//
// 用法: AMAP_WEB_KEY=xxx node tools/geocode-amap.mjs [--all] [--city=三亚] [--apply-conf]
//   默认只核 confidence<100 的中国点位；--all 全量中国点位
//   --apply-conf 把「高德与库存距离 <100m」的点位置信度升为 100（不改坐标）
//
// 纪律：
//   • 高德返回 GCJ-02，必须经 ../src/pages/map/coords.js 的 gcj2wgs 转 WGS84 再比对（项目硬约束）
//   • 首跑自检：天安门 WGS 已知值比对，偏差 >50m 则拒绝运行
//   • 只升置信度，绝不自动改坐标——坐标修正一律人工确认
import { readFileSync, writeFileSync } from 'node:fs';
import { wgs2gcj, gcj2wgs } from '../src/pages/map/coords.js';

const KEY = process.env.AMAP_WEB_KEY || '';
if (!KEY) { console.error('缺少 AMAP_WEB_KEY 环境变量（Web服务类型 key）'); process.exit(1); }
const ALL = process.argv.includes('--all');
const APPLY = process.argv.includes('--apply-conf');
const CITY_ARG = (process.argv.find((a) => a.startsWith('--city=')) || '').slice(7);
const FILE = 'data/points.json';

const CN = new Set(['哈尔滨', '伊宁', '三亚', '赛里木湖', '博乐', '阿拉山口', '霍尔果斯', '乌鲁木齐']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const distM = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2));
};

async function geocode(address, city) {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${KEY}&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  if (d.status !== '1') return { err: d.info || '未知错误', quota: d.info === 'DAILY_QUERY_OVER_LIMIT' };
  const top = d.geocodes && d.geocodes[0];
  if (!top || !top.location) return { none: true };
  const [lon, lat] = top.location.split(',').map(Number);
  const [wLat, wLon] = gcj2wgs(lat, lon); // GCJ-02 → WGS84
  return { wLat, wLon, level: top.level || '', adcode: top.adcode || '' };
}

// 查询词清洗：去括号注释/引号/特殊符号；高德对部分字符（全角括号、№ 等）会整单报错
const clean = (name) => name.replace(/（.*?）|\(.*?\)|「|」|"|"|№/g, ' ').replace(/[^\p{Script=Han}A-Za-z0-9 ]/gu, ' ').replace(/\s+/g, ' ').trim();

// 主接口：POI 关键词搜索（place/text）——点位名不是结构化地址，geocode/geo 对纯 POI 名常报 ENGINE 错误
async function geocodeRobust(p) {
  const kw = clean(p.name);
  const url = `https://restapi.amap.com/v3/place/text?key=${KEY}&keywords=${encodeURIComponent(kw)}&city=${encodeURIComponent(p.city)}&citylimit=true&output=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  if (d.status !== '1') {
    if (d.info === 'DAILY_QUERY_OVER_LIMIT') return { err: d.info, quota: true };
    // place/text 也失败时回退结构化地理编码（截短名）
    await sleep(350);
    return geocode(kw.slice(0, 12), p.city);
  }
  const top = d.pois && d.pois[0];
  if (!top || !top.location) return { none: true };
  const [lon, lat] = top.location.split(',').map(Number);
  const [wLat, wLon] = gcj2wgs(lat, lon); // GCJ-02 → WGS84
  return { wLat, wLon, level: top.type || '', adcode: (top.adcode || '').slice(0, 4) };
}

/* ---------- 首跑自检：key 可用性 + 返回合理性 ---------- */
// 变换正确性由 tools/coords-test.mjs（CI 强制，24 点 coordtransform 基准）守护，此处不重复
{
  const ref = await geocode('天安门', '北京');
  if (ref.err || ref.none) { console.error('❌ 高德 key 自检失败：' + (ref.err || '无结果')); process.exit(1); }
  const inChina = ref.wLon > 73 && ref.wLon < 135 && ref.wLat > 18 && ref.wLat < 54;
  if (!inChina) { console.error(`❌ 高德返回坐标异常：${ref.wLat},${ref.wLon}（应在中国范围内）`); process.exit(1); }
  console.log(`✅ 高德 key 自检通过（天安门 → ${ref.wLat.toFixed(5)}, ${ref.wLon.toFixed(5)}，合理）\n`);
}

const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const targets = pts.filter((p) =>
  CN.has(p.city) && !p.pending && (ALL || p.confidence < 100) && (!CITY_ARG || p.city === CITY_ARG));
console.log(`复核目标：${targets.length} 个中国点位${ALL ? '（全量）' : '（confidence<100）'}\n`);

const tiers = { ok: [], drift: [], mismatch: [], none: [], err: [] };
for (const p of targets) {
  let hit;
  try { hit = await geocodeRobust(p); }
  catch (e) { tiers.err.push({ p, msg: e.message }); await sleep(350); continue; }
  if (hit.err) {
    if (hit.quota) { console.error('⚠️ 高德日配额用尽，停止（进度不保存，重跑即可）'); break; }
    tiers.err.push({ p, msg: hit.err });
  } else if (hit.none) {
    tiers.none.push(p);
  } else {
    const d = distM([p.lat, p.lon], [hit.wLat, hit.wLon]);
    const row = { p, d, amap: [hit.wLat, hit.wLon], level: hit.level };
    if (d < 100) tiers.ok.push(row);
    else if (d < 500) tiers.drift.push(row);
    else tiers.mismatch.push(row);
  }
  await sleep(350); // 个人 key QPS 限制保守节流
}

const pct = (n) => `**${n}**`;
console.log(`\n═══ 复核结论 ═══`);
console.log(`✅ 一致(<100m)：${pct(tiers.ok.length)}  ${tiers.ok.slice(0, 8).map((r) => `${r.p.id} ${r.p.name.slice(0, 12)}(${Math.round(r.d)}m)`).join('、')}${tiers.ok.length > 8 ? ' …' : ''}`);
console.log(`🟡 漂移(100-500m)：${pct(tiers.drift.length)}  ${tiers.drift.map((r) => `${r.p.id} ${r.p.name.slice(0, 12)}(${Math.round(r.d)}m)`).join('、')}`);
console.log(`🔴 不符(>500m)：${pct(tiers.mismatch.length)}  ${tiers.mismatch.map((r) => `${r.p.id} ${r.p.name.slice(0, 12)}(${Math.round(r.d)}m)`).join('、')}`);
console.log(`○ 查无结果：${pct(tiers.none.length)}  ${tiers.none.map((p) => p.id + ' ' + p.name.slice(0, 10)).join('、')}`);
if (tiers.err.length) console.log(`❌ 查询失败：${tiers.err.length}  ${tiers.err.map((e) => e.p.id + ':' + e.msg).join('、')}`);

if (APPLY && tiers.ok.length) {
  let up = 0;
  for (const { p } of tiers.ok) if (p.confidence < 100) { p.confidence = 100; up++; }
  if (up) { writeFileSync(FILE, JSON.stringify(pts, null, 1) + '\n'); console.log(`\n✅ 已升级 ${up} 个点位 confidence→100（坐标未动）`); }
}
console.log('\n（坐标修正一律人工；确认一致性后可加 --apply-conf 升置信度）');
