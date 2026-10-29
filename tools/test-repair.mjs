#!/usr/bin/env node
// 可执行修复质量门：自动减负只删"可删且未锁定、非固定"的条目，按停留从长到短
// 用法: node tools/test-repair.mjs
import { planAutoTrim } from '../src/pages/plan/repair.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const places = new Map();
const P = (id, duration) => {
  places.set(id, { id, name: id, lat: 55.75, lon: 37.62, estimatedDuration: duration, openCalendar: 'unknown' });
  return { id, refId: id, type: 'visit', plannedStatus: 'planned', confirm: 'ok' };
};
const day = { id: 'd1', date: '2026-11-10', startTime: '09:00', endTime: '21:00' };

// 1) 超时：跳过必去/锁定/固定，按停留从长到短删到可行
{
  const a = { ...P('a', 240), id: 'a', mustVisit: true };
  const b = { ...P('b', 240), id: 'b', mustVisit: false };
  const c = { ...P('c', 300), id: 'c', mustVisit: false, pinnedStart: '10:00' };
  const d = { ...P('d', 240), id: 'd', mustVisit: false };
  const r = planAutoTrim({ day, items: [a, b, c, d], places });
  assert(r.dropIds.length === 2 && r.dropIds.includes('b') && r.dropIds.includes('d'),
    '只删未锁定、非固定的可删项（跳过 pinnedStart）');
  assert(r.resolved && !r.after.errors.some(e => e.kind === 'day-overrun'), '删到可行即停止');
  assert(r.before.errors.some(e => e.kind === 'day-overrun'), '修复前确实超时');
}

// 2) 没有可删项：不硬删必去/固定/锁定
{
  const a = { ...P('a', 400), id: 'a', mustVisit: true };
  const f = { ...P('f', 300), id: 'f', mustVisit: false, flexibility: 'fixed' };
  const p = { ...P('p', 200), id: 'p', mustVisit: false, pinnedStart: '12:00' };
  const r = planAutoTrim({ day, items: [a, f, p], places });
  assert(r.dropIds.length === 0 && !r.resolved, '无可删项时报仍超时，不误删');
}

// 3) 不超时：空操作
{
  const a = { ...P('a', 240), id: 'a', mustVisit: true };
  const r = planAutoTrim({ day, items: [a], places });
  assert(r.dropIds.length === 0 && r.resolved, '可行的一天不做任何删除');
}

if (bad) { console.error(`\n${bad} 项修复逻辑测试失败`); process.exit(1); }
console.log('\n可执行修复质量门通过');
