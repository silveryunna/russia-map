#!/usr/bin/env node
// 莫斯科样板数据门槛（ROADMAP 附录 C）：动线覆盖的点位必须能支撑排程
//   • 硬性：id/name/name_en/name_local、受控 type、坐标+置信度、停留时长+依据、开放日历（或显式 unknown）、
//           票价/预约（或显式 unknown）、来源条目（collectedAt + url/note）、城市时区已知
//   • 软性：已知开放日历/票价的比例（只报告，不阻断）——unknown 允许，但必须显式写出来，不许留空
// 用法: node tools/check-sample-data.mjs [数据目录，默认 ./data] [城市，默认 莫斯科]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TYPE_VOCAB } from './type-vocab.mjs';
import { CITY_TIME_ZONES } from '../src/pages/trip/migrate.js';

const dir = resolve(process.argv[2] || './data');
const city = process.argv[3] || '莫斯科';
const read = (f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));

const points = read('points.json');
const routes = read('routes.json');
const byId = new Map(points.map((p) => [p.id, p]));

let fail = 0;
const err = (m) => { console.error('❌ ' + m); fail++; };
const ok = (m) => console.log('✅ ' + m);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = new Set(['official', 'curated', 'estimate', 'measured', 'user']);

const cityRoutes = routes.filter((r) => r.city === city);
if (!cityRoutes.length) { err(`${city} 没有任何动线，样板集为空`); }
const scope = [...new Set(cityRoutes.flatMap((r) => r.steps.map((s) => s.pointId)).filter(Boolean))];

// --- 时区：排程的硬前提 ---
if (!CITY_TIME_ZONES[city]) err(`${city} 未在 migrate.js 的 CITY_TIME_ZONES 里登记时区，无法排程`);
else ok(`${city} 时区 ${CITY_TIME_ZONES[city]} 已登记`);

// --- 逐点位契约 ---
let calendarKnown = 0;
let ticketKnown = 0;
for (const id of scope) {
  const p = byId.get(id);
  if (!p) { err(`动线引用的点位 ${id} 不存在`); continue; }
  const where = `${p.id}（${p.name || '?'}）`;
  for (const f of ['name', 'name_en', 'name_local']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) err(`${where} 缺 ${f}`);
  }
  if (!TYPE_VOCAB.includes(p.type)) err(`${where} type 不在受控词表：${p.type}`);
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number') err(`${where} 缺坐标（WGS84）`);
  if (![75, 100].includes(p.confidence)) err(`${where} confidence 必须是 75/100，实际 ${p.confidence}`);

  if (!Number.isInteger(p.estimatedDuration) || p.estimatedDuration <= 0 || p.estimatedDuration > 720) {
    err(`${where} estimatedDuration 必须是 1–720 的整数分钟，实际 ${p.estimatedDuration}`);
  }
  if (!['estimate', 'measured'].includes(p.durationBasis)) err(`${where} durationBasis 必须是 estimate/measured`);

  if (p.openCalendar === 'unknown') { /* 显式未知：允许，排程按宽边界处理 */ }
  else if (p.openCalendar && typeof p.openCalendar === 'object') {
    const c = p.openCalendar;
    if (!c.days || !c.open || !c.close) err(`${where} openCalendar 需要 days/open/close`);
    else calendarKnown += 1;
  } else err(`${where} 缺 openCalendar（没有就写 "unknown"，不许留空）`);

  if (typeof p.ticket !== 'string' || !p.ticket.trim()) err(`${where} 缺 ticket（没有就写 "unknown"）`);
  else if (p.ticket !== 'unknown') ticketKnown += 1;

  if (!Array.isArray(p.sources) || !p.sources.length) err(`${where} 缺 sources`);
  else {
    for (const s of p.sources) {
      if (!s || !SOURCE_TYPES.has(s.type)) err(`${where} sources.type 非法：${s && s.type}`);
      if (!DATE.test(s?.collectedAt || '')) err(`${where} sources.collectedAt 需 YYYY-MM-DD`);
      if (!s?.url && !s?.note) err(`${where} sources 条目需要 url 或 note`);
      if (s?.url && !/^https?:\/\//i.test(s.url)) err(`${where} sources.url 必须是 http(s)`);
    }
    if (p.durationBasis === 'measured' && !p.sources.some((s) => s.type === 'measured')) {
      err(`${where} durationBasis=measured 但没有 measured 来源`);
    }
  }
}

// --- 逐条动线：步骤可解析 + 排程总量 ---
for (const r of cityRoutes) {
  let stepN = 0;
  let unresolved = 0;
  let minutes = 0;
  for (const s of r.steps || []) {
    if (!s.point) continue;
    stepN += 1;
    const p = (s.pointId && byId.get(s.pointId)) || null;
    if (!p) { unresolved += 1; continue; }
    minutes += Number.isInteger(p.estimatedDuration) ? p.estimatedDuration : 0;
  }
  if (unresolved) err(`动线「${r.name}」有 ${unresolved}/${stepN} 步无法按 pointId 解析`);
  const h = (minutes / 60).toFixed(1);
  console.log(`   · ${r.day || ''} ${r.name}：${stepN} 步，点位停留合计 ${h} 小时`);
}

// --- 覆盖率（软门槛，只报告）---
const n = scope.length || 1;
const pct = (k) => Math.round((k / n) * 100);
console.log(`\n覆盖：点位 ${scope.length} 个 / 动线 ${cityRoutes.length} 条`);
console.log(`   开放日历已知 ${calendarKnown}/${scope.length}（${pct(calendarKnown)}%），其余显式 unknown`);
console.log(`   票价/预约已知 ${ticketKnown}/${scope.length}（${pct(ticketKnown)}%），其余显式 unknown`);

if (fail) { console.error(`\n${fail} 处不满足样板数据契约`); process.exit(1); }
ok(`${city}样板数据契约通过（${scope.length} 个点位 / ${cityRoutes.length} 条动线）`);
