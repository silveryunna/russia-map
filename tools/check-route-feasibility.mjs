#!/usr/bin/env node
// 真实动线可行性验收（P2 验收项）：把莫斯科每条动线当成一天，用真实点位数据跑硬约束校验
//   • 数据完整性错误（缺点位/缺时长/缺坐标/重复/跨日/闭馆）→ 退出码 1
//   • 时段冲突（最后入场/关门/重叠）与天数超时 → 只报告 + 修复建议，算动线设计问题（要调整顺序或删减）
// 用法: node tools/check-route-feasibility.mjs [数据目录，默认 ./data] [城市，默认 莫斯科]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_DAY, evaluateDay, formatMinutesCrossDay, suggestFixes, weekdayKey,
} from '../src/pages/plan/feasibility.js';

const dir = resolve(process.argv[2] || './data');
const city = process.argv[3] || '莫斯科';
const read = (f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));

const points = read('points.json');
const routes = read('routes.json').filter((r) => r.city === city);
const places = new Map(points.map((p) => [p.id, p]));

// 固定验收日（周三，避开历史博物馆周二闭馆与圣瓦西里每月第一个周三）
const DAY = { id: 'acceptance', date: '2026-11-11' };

let structural = 0;
const rows = [];
for (const r of routes) {
  const steps = (r.steps || []).filter((s) => s.pointId);
  const items = steps.map((s, i) => ({
    id: `${r.id}-${i + 1}`, refId: s.pointId, type: 'visit', order: i,
    startLocal: '', flexibility: 'flexible', mustVisit: false,
    estimatedDuration: null, placeNameSnapshot: '', plannedStatus: 'planned', confirm: 'ok',
  }));
  const res = evaluateDay({ day: DAY, items, places });
  const overrun = res.conflicts.filter((c) => c.kind === 'day-overrun');
  const DATA_ERROR_KINDS = new Set(['unresolved-place', 'missing-duration', 'missing-coords', 'duplicate-place', 'cross-day', 'closed']);
  const dataErrs = res.errors.filter((c) => DATA_ERROR_KINDS.has(c.kind));
  const hourErrs = res.errors.filter((c) => !DATA_ERROR_KINDS.has(c.kind) && c.kind !== 'day-overrun');
  structural += dataErrs.length;

  const end = res.timeline.length ? res.timeline[res.timeline.length - 1].end : null;
  let verdict;
  if (dataErrs.length) verdict = `❌ ${dataErrs.map((c) => c.kind).join('/')}`;
  else if (hourErrs.length) verdict = `⚠️ 时段冲突（${hourErrs.map((c) => c.kind).join('/')}）`;
  else if (overrun.length) {
    const wide = evaluateDay({ day: DAY, items, places, options: { start: '07:00', end: '23:00' } });
    verdict = `⚠️ 超时（收工 ${end ? formatMinutesCrossDay(end) : '?'}）${wide.errors.length ? '，07:00–23:00 也走不完' : '，07:00–23:00 可完成'}`;
  } else verdict = '✅ 可行';

  rows.push({
    route: `${r.day || ''} ${r.name}`.trim(),
    steps: `${res.timeline.length}/${steps.length}`,
    dwell: `${(res.stats.dwellMinutes / 60).toFixed(1)}h`,
    transit: `${res.stats.transitMinutes}m`,
    end: end ? formatMinutesCrossDay(end) : '-',
    unknown: `${res.stats.unknownHours}/${res.timeline.length}`,
    verdict,
    res, items,
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${city}动线可行性验收（验收日 ${DAY.date} ${weekdayKey(DAY.date)}，时间窗 ${DEFAULT_DAY.start}–${DEFAULT_DAY.end}）\n`);
console.log(pad('动线', 30) + pad('点位', 8) + pad('停留', 8) + pad('通行', 8) + pad('结束', 14) + pad('未知日历', 10) + '结论');
for (const r of rows) {
  console.log(pad(r.route, 30) + pad(r.steps, 8) + pad(r.dwell, 8) + pad(r.transit, 8) + pad(r.end, 14) + pad(r.unknown, 10) + r.verdict);
}

for (const r of rows) {
  if (r.res.errors.length) {
    console.log(`\n${r.route}：`);
    for (const c of r.res.errors) console.log(`   · [${c.kind}] ${c.message}`);
    for (const f of suggestFixes(r.res, { items: r.items })) console.log(`   ↳ 修复：${f.label}${f.detail ? `（${f.detail}）` : ''}`);
  }
}

const warnOnly = rows.filter((r) => !r.res.errors.length && r.res.conflicts.some((c) => c.severity === 'warn')).length;
console.log(`\n合计 ${rows.length} 条动线：${rows.filter((r) => !r.res.errors.length).length} 条无硬冲突，${warnOnly} 条仅有提示，${structural} 处结构性错误`);

if (structural) {
  console.error('\n结构性错误必须先在 data/ 修复（缺点位/时长/坐标或日期不对）');
  process.exit(1);
}
console.log('动线可行性验收通过（结构性约束）');
