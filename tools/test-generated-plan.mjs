#!/usr/bin/env node
// 生成计划平衡回归（CI 强制）：7 个起始星期 × 1–7 天，锁定逐日可执行性与最小点位
// 断言：天数足额、无任何 evaluateDay 硬错误（含超收工线）、每日点位不少于 MIN_DAY_POINTS
// 用法: node tools/test-generated-plan.mjs [数据目录，默认 ./data] [起始日，默认 2026-11-09 周一]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MIN_FILLED_DAY, PLAN_DAYS_MAX, ruleEngine } from '../src/pages/plan/engine.js';
import { addDays } from '../src/pages/trip/schema.js';
import { migratePlansV1 } from '../src/pages/trip/migrate.js';
import { evaluateDay, formatMinutesCrossDay, weekdayKey } from '../src/pages/plan/feasibility.js';
import { indexTransitMatrix } from '../src/pages/plan/transit-matrix.js';

const dir = resolve(process.argv[2] || './data');
const start = process.argv[3] || '2026-11-09';
const minPoints = Math.max(1, MIN_FILLED_DAY - 1);
const points = JSON.parse(readFileSync(resolve(dir, 'points.json'), 'utf8'));
const routes = JSON.parse(readFileSync(resolve(dir, 'routes.json'), 'utf8'));
const places = new Map(points.map((p) => [p.id, p]));
let matrix = null;
try { matrix = indexTransitMatrix(JSON.parse(readFileSync(resolve(dir, 'transit-matrix.json'), 'utf8'))); } catch { matrix = null; }

let bad = 0;
const fail = (message) => { console.error(`❌ ${message}`); bad += 1; };
const starts = Array.from({ length: 7 }, (_, i) => addDays(start, i));

for (const date of starts) {
  for (let dayCount = 1; dayCount <= PLAN_DAYS_MAX; dayCount += 1) {
    const plan = ruleEngine({ city: '莫斯科', date, days: dayCount }, { pts: points, rts: routes, matrix });
    const trip = migratePlansV1({ plans: [plan], points }).trips[0];
    if (!trip || trip.days.length !== dayCount) {
      fail(`${date} ${dayCount} 天：期望 ${dayCount} 天，实际 ${trip ? trip.days.length : 0} 天`);
      continue;
    }
    const counts = [];
    const errors = [];
    let latestEnd = null;
    for (const day of trip.days) {
      const items = [...day.items].sort((a, b) => a.order - b.order);
      const result = evaluateDay({ day, items, places, options: { matrix } });
      counts.push(items.length);
      if (result.timeline.length) {
        const end = result.timeline[result.timeline.length - 1].end;
        latestEnd = latestEnd === null ? end : Math.max(latestEnd, end);
      }
      if (result.errors.length) {
        errors.push(`D${day.index}:${result.errors.map((e) => e.kind).join('+')}`);
      }
    }
    const minCount = Math.min(...counts);
    const short = counts.map((n, i) => (n < minPoints ? `D${i + 1}` : '')).filter(Boolean);
    const status = errors.length || short.length ? '❌' : '✅';
    console.log(`${date} ${weekdayKey(date)} ${String(dayCount).padStart(2)} 天｜${counts.join('/')}｜收工 ${latestEnd === null ? '-' : formatMinutesCrossDay(latestEnd)}｜${status}${errors.length ? ` ${errors.join(',')}` : ''}${short.length ? ` 少于 ${minPoints} 项：${short.join(',')}` : ''}`);
    if (errors.length) fail(`${date} ${dayCount} 天存在硬错误：${errors.join(',')}`);
    if (short.length) fail(`${date} ${dayCount} 天 ${short.join(',')} 少于 ${minPoints} 项`);
  }
}

if (bad) {
  console.error(`\n生成计划平衡回归失败：${bad} 项`);
  process.exit(1);
}
console.log(`\n生成计划平衡回归通过（${starts.length} 个起始星期 × 1–${PLAN_DAYS_MAX} 天，每日 ≥${minPoints} 项，无硬错误）`);
