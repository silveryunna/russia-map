#!/usr/bin/env node
// 数据校验：发布前跑 `npm run check-data`，CI 也跑同一份
// 用法：node tools/check-data.mjs [数据目录，默认 ./public/data]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || './public/data');
let fail = 0;
const err = (msg) => { console.error('❌ ' + msg); fail++; };
const ok = (msg) => console.log('✅ ' + msg);

const read = (f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));

const points = read('points.json');
const routes = read('routes.json');
const meta = read('meta.json');

// --- 点位 ---
if (!Array.isArray(points) || !points.length) err('points.json 不是非空数组');

const ids = new Map(), names = new Map();
for (const [i, p] of points.entries()) {
  const where = `points[${i}]（${p?.name ?? '?'}）`;
  if (!p.id || !/^p\d{3}$/.test(p.id)) err(`${where} 缺少 id 或格式不对（应为 pNNN）`);
  if (ids.has(p.id)) err(`${where} id 重复：${p.id}（与 ${ids.get(p.id)}）`);
  ids.set(p.id, p.name);
  if (!p.name) err(`${where} 缺少 name`);
  if (names.has(p.name)) err(`${where} name 重复：${p.name}`);
  names.set(p.name, i);
  if (!p.city) err(`${where} 缺少 city`);
  if (!p.cluster) err(`${where} 缺少 cluster`);
  const hasCoord = typeof p.lat === 'number' && typeof p.lon === 'number';
  if (hasCoord) {
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) err(`${where} 坐标越界 ${p.lat},${p.lon}`);
    if (p.pending) err(`${where} 有坐标但 pending=true（应为 false/缺省）`);
  } else if (!p.pending) {
    err(`${where} 无坐标且未标记 pending（会画到 (0,0)）`);
  }
  if (p.confidence !== undefined && ![0, 75, 100].includes(p.confidence)) {
    err(`${where} confidence 取值非法：${p.confidence}（应为 0/75/100 或缺省）`);
  }
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags) || p.tags.some(t => typeof t !== 'string' || !t.trim())) {
      err(`${where} tags 必须是字符串数组`);
    }
  }
  // 扩展展示字段（可选，均字符串；rating=大众点评分/携程星级，url=官网）
  for (const f of ['hours', 'ticket', 'mustOrder', 'rating', 'url']) {
    if (p[f] !== undefined && typeof p[f] !== 'string') {
      err(`${where} ${f} 必须是字符串`);
    }
  }
  // url 白名单：只允许 http/https（弹窗直接拼进 href，防 javascript: 注入）
  if (p.url && !/^https?:\/\//i.test(p.url)) err(`${where} url 必须是 http(s) 链接：${p.url}`);
}
const pend = points.filter(p => p.pending).length;
ok(`点位 ${points.length} 个（待核 ${pend}），id/name 无重复`);

// name_en 完整性（三语搜索不遗漏）
{
  const noEn = points.filter(p => !p.pending && p.name && !p.name_en);
  if (noEn.length) {
    console.warn(`⚠️ ${noEn.length} 个点位缺少 name_en（英文/俄文搜索会漏）：` +
      noEn.slice(0, 12).map(p => `${p.id} ${p.name}`).join('、') + (noEn.length > 12 ? ' …' : ''));
  }
  ok(`name_en 覆盖 ${points.length - noEn.length}/${points.length}`);
}

// --- 离群坐标校验（防"坐标写错城市/经纬度写反"，源自 travel-plan-viz validate.js 的思路）---
// 按城市分组取坐标中位数，与中位点偏差 >3° 即警告（仅警告不阻断）
{
  const byCity = new Map();
  for (const p of points) {
    if (typeof p.lat === 'number' && typeof p.lon === 'number' && !p.pending) {
      if (!byCity.has(p.city)) byCity.set(p.city, []);
      byCity.get(p.city).push(p);
    }
  }
  let outliers = 0;
  for (const [city, ps] of byCity) {
    if (ps.length < 5) continue; // 样本太少不做离群判断
    const lats = ps.map(p => p.lat).sort((a, b) => a - b);
    const lons = ps.map(p => p.lon).sort((a, b) => a - b);
    const mlat = lats[Math.floor(lats.length / 2)], mlon = lons[Math.floor(lons.length / 2)];
    for (const p of ps) {
      if (Math.abs(p.lat - mlat) > 3 || Math.abs(p.lon - mlon) > 3) {
        console.warn(`⚠️ 离群坐标：${p.id}（${p.name}）${p.lat},${p.lon} 偏离 ${city} 中位点 ${mlat},${mlon} 超 3°`);
        outliers++;
      }
    }
  }
  ok(`离群坐标检查完成（${outliers} 个警告，仅提示不阻断）`);
}

// --- 动线引用 ---
let badRefs = 0;
for (const r of routes) {
  if (!r.id || !r.name) err(`动线缺少 id/name：${JSON.stringify(r).slice(0, 60)}`);
  for (const s of r.steps || []) {
    if (s.point && !names.has(s.point)) { err(`动线「${r.name}」引用了不存在的点位「${s.point}」`); badRefs++; }
  }
}
if (!badRefs) ok(`动线 ${routes.length} 条，步骤引用全部有效`);

// --- 城市配色 ---
const cities = new Set(points.map(p => p.city));
for (const c of cities) if (!meta.cityColors?.[c]) err(`城市「${c}」在 meta.cityColors 中无配色`);
ok(`城市 ${cities.size} 个，配色覆盖检查完成`);

// --- 地图覆盖层（overlays.json，可选文件）---
import { existsSync } from 'node:fs';
if (existsSync(resolve(dir, 'overlays.json'))) {
  const overlays = read('overlays.json');
  if (!Array.isArray(overlays) || !overlays.length) {
    err('overlays.json 不是非空数组');
  } else {
    const oid = new Set();
    for (const [i, o] of overlays.entries()) {
      const where = `overlays[${i}]（${o?.id ?? '?'}）`;
      if (!o.id || typeof o.id !== 'string') err(`${where} 缺少 id`);
      else if (oid.has(o.id)) err(`${where} id 重复：${o.id}`);
      oid.add(o.id);
      if (!/^#[0-9A-Fa-f]{6}$/.test(o.color || '')) err(`${where} color 非法：${o.color}`);
      if (!Array.isArray(o.pts) || o.pts.length < 2 || o.pts.some(p => !Array.isArray(p) || p.length !== 2 || p.some(Number.isNaN))) err(`${where} pts 必须是 [[lat,lon],...] 且至少 2 点`);
      if (o.stops !== undefined && (!Array.isArray(o.stops) || o.stops.some(s => typeof s.label !== 'string' || Number.isNaN(s.lat) || Number.isNaN(s.lon)))) err(`${where} stops 字段格式不对`);
      if (typeof o.popup !== 'string' || !o.popup) err(`${where} 缺少 popup 文案`);
    }
    ok(`覆盖层 ${overlays.length} 条，格式检查完成`);
  }
}

if (fail) {
  console.error(`\n${fail} 个问题，请修复后再发布`);
  process.exit(1);
}
console.log('\n全部校验通过');
