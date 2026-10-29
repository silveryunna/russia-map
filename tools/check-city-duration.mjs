#!/usr/bin/env node
// 城市排程字段覆盖门：指定城市的非 pending 点位必须有坐标、停留时长与时长依据
// 用法: node tools/check-city-duration.mjs [数据目录，默认 ./data] [城市，默认 三亚]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || './data');
const city = process.argv[3] || '三亚';
const points = JSON.parse(readFileSync(resolve(dir, 'points.json'), 'utf8'));
const list = (Array.isArray(points) ? points : points.points).filter((p) => p && p.city === city);

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };

if (!list.length) fail(`${city} 没有任何点位`);
let schedulable = 0;
for (const p of list) {
  if (p.pending) continue;
  schedulable += 1;
  const where = `${p.id}（${p.name || '?'}）`;
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number') fail(`${where} 缺坐标`);
  if (!Number.isInteger(p.estimatedDuration) || p.estimatedDuration <= 0 || p.estimatedDuration > 720) {
    fail(`${where} estimatedDuration 必须是 1–720 的整数分钟，实际 ${p.estimatedDuration}`);
  }
  if (!['estimate', 'measured'].includes(p.durationBasis)) fail(`${where} durationBasis 必须是 estimate/measured`);
}

if (bad) { console.error(`\n${bad} 处排程字段缺失`); process.exit(1); }
console.log(`✅ ${city} ${schedulable} 个可排程点位均有坐标、停留时长与依据（pending ${list.length - schedulable} 个跳过）`);
