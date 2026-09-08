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
}
const pend = points.filter(p => p.pending).length;
ok(`点位 ${points.length} 个（待核 ${pend}），id/name 无重复`);

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

if (fail) {
  console.error(`\n${fail} 个问题，请修复后再发布`);
  process.exit(1);
}
console.log('\n全部校验通过');
