#!/usr/bin/env node
// 交通矩阵异常复核报告：只报告可疑样本，不直接判错（入口/围栏/单行路都可能造成合理偏差）
// 用法: node tools/check-transit-matrix-anomalies.mjs [数据目录，默认 ./data]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { distanceMeters } from '../src/pages/plan/feasibility.js';

const dir = resolve(process.argv[2] || './data');
const read = (file) => JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
const points = read('points.json');
const matrix = read('transit-matrix.json');
const byId = new Map(points.map((p) => [p.id, p]));
const entries = Array.isArray(matrix.entries) ? matrix.entries : [];
const keyOf = (e) => `${e.from}|${e.to}|${e.mode}`;
const byKey = new Map(entries.map((e) => [keyOf(e), e]));

const anomalies = [];
for (const entry of entries) {
  const from = byId.get(entry.from);
  const to = byId.get(entry.to);
  if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) continue;
  const straight = distanceMeters(from, to);
  if (!straight) continue;
  const ratio = entry.meters / straight;
  const speed = (entry.meters / 1000) / (entry.minutes / 60);
  const reasons = [];
  const maxRatio = entry.mode === 'car' ? 4.5 : 4;
  const minSpeed = entry.mode === 'car' ? 8 : 1.5;
  const maxSpeed = entry.mode === 'car' ? 70 : 8;
  if (ratio > maxRatio) reasons.push(`路线/直线比 ${ratio.toFixed(1)}`);
  if (speed < minSpeed || speed > maxSpeed) reasons.push(`速度 ${speed.toFixed(1)}km/h`);

  const reverse = byKey.get(`${entry.to}|${entry.from}|${entry.mode}`);
  if (reverse) {
    const diff = Math.abs(reverse.minutes - entry.minutes);
    const pct = diff / Math.max(entry.minutes, reverse.minutes);
    if (diff > 5 && pct > 0.3) reasons.push(`反向差 ${diff} 分钟`);
  }
  if (reasons.length) {
    anomalies.push({ from: from.name, to: to.name, mode: entry.mode, minutes: entry.minutes, meters: entry.meters, straight, reasons });
  }
}

console.log(`\n交通矩阵异常复核（${entries.length} 条，只报告不判死）`);
if (!anomalies.length) console.log('未发现路线/直线比、速度或反向差异常');
for (const a of anomalies) {
  console.log(`· ${a.from} → ${a.to}（${a.mode}，${a.minutes}m/${a.meters}m，直线 ${a.straight}m）：${a.reasons.join('；')}`);
}
console.log(`\n合计 ${anomalies.length} 条待人工复核；这些数据不自动修改`);
