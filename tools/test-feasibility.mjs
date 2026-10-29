#!/usr/bin/env node
// P2 可行性引擎质量门：硬约束（闭馆/最后入场/超时/重叠/跨日/重复/缺时长）+ 修复建议 + 确定性
// 用法: node tools/test-feasibility.mjs
import {
  DEFAULT_DAY, calendarState, distanceMeters, estimateLeg, evaluateDay, formatMinutes,
  parseDays, parseMinutes, suggestFixes, weekdayKey,
} from '../src/pages/plan/feasibility.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// ── 夹具 ──
const P = (id, name, lat, lon, extra = {}) => ({
  id, name, lat, lon, type: '景点', estimatedDuration: 60, openCalendar: 'unknown', ...extra,
});
const places = new Map([
  ['p1', P('p1', '红场', 55.753591, 37.621501, { estimatedDuration: 45 })],
  ['p2', P('p2', '克里姆林宫', 55.751621, 37.618122, { estimatedDuration: 180 })],
  ['p3', P('p3', '某博物馆', 55.760000, 37.630000, {
    estimatedDuration: 120,
    openCalendar: { days: 'Mo-Su', open: '10:00', close: '18:00', lastEntry: '17:00' },
  })],
  ['p4', P('p4', '周一闭馆馆', 55.765000, 37.640000, {
    estimatedDuration: 90,
    openCalendar: { days: 'Tu-Su', open: '10:00', close: '18:00' },
  })],
  ['p5', P('p5', '无坐标点位', null, null, { estimatedDuration: 30 })],
  ['p6', P('p6', '没填时长的点位', 55.770000, 37.650000, { estimatedDuration: undefined })],
]);

const it = (id, refId, extra = {}) => ({
  id, refId, type: 'visit', order: 0, startLocal: '', endLocal: '', flexibility: 'flexible',
  mustVisit: false, estimatedDuration: null, placeNameSnapshot: '', plannedStatus: 'planned', confirm: 'ok', ...extra,
});

// ── 1) 时间与日历基础函数 ──
{
  assert(parseMinutes('09:30') === 570 && parseMinutes('24:00') === null && parseMinutes('9:30') === null,
    'parseMinutes 只接受 HH:MM');
  assert(formatMinutes(570) === '09:30' && formatMinutes(1440) === '00:00', 'formatMinutes 归一化');
  assert(weekdayKey('2026-11-09') === 'Mo' && weekdayKey('bad') === null, 'weekdayKey 取星期（2026-11-09 = 周一）');
  const days = parseDays('Mo-Fr,Sa');
  assert(days.length === 6 && days.includes('Mo') && days.includes('Sa') && !days.includes('Su'),
    'parseDays 支持区间+逗号');
  const closed = calendarState({ days: 'Tu-Su', open: '10:00', close: '18:00' }, '2026-11-09');
  assert(closed.state === 'closed', '周一对 Tu-Su 的馆判为闭馆');
  const unk = calendarState('unknown', '2026-11-09');
  assert(unk.state === 'unknown', 'unknown 日历保持 unknown（不当成全天开放）');
}

// ── 2) 交通估算：步行/地铁/同点 ──
{
  const a = { id: 'a', lat: 55.7558, lon: 37.6173 };
  const b = { id: 'b', lat: 55.7559, lon: 37.6175 };
  const near = estimateLeg(a, b);
  assert(near.mode === 'walk' && near.minutes >= 1 && near.source === 'estimate', '近距默认步行，标记 estimate');
  assert(estimateLeg(a, { ...a }).minutes === 0, '同一点位通行 0 分钟');
  const far = estimateLeg(a, { id: 'c', lat: 55.7100, lon: 37.5000 });
  assert(far.mode === 'metro' && far.minutes > 10, '远距走地铁估算（含进出站开销）');
  assert(estimateLeg(a, { id: 'x', lat: null, lon: null }) === null, '缺坐标返回 null，不冒充 0 分钟');
  assert(distanceMeters(a, a) === 0, 'haversine 同点距离 0');
}

// ── 3) 正常一天：可行 + 统计自洽 ──
{
  const r = evaluateDay({
    day: { id: 'd1', date: '2026-11-10' },
    items: [it('i1', 'p1'), it('i2', 'p2')],
    places,
  });
  assert(r.feasible && r.timeline.length === 2, '红场+克里姆林宫在 09:00–21:00 内可行');
  assert(r.stats.dwellMinutes === 225 && r.stats.transitMinutes > 0, '停留/通行分钟数被正确累计');
  const t = r.timeline;
  assert(t[0].start <= t[1].start && t[0].end <= t[1].start, '时间线按顺序推进、不重叠');
  assert(r.stats.unknownHours === 2 && r.errors.length === 0, '未知开放时间只是 warn，不阻断可行性');
  assert(r.conflicts.some((c) => c.kind === 'hours-unknown' && /不等于全天开放/.test(c.message)),
    'unknown 明确提示"不等于全天开放"');
}

// ── 4) 闭馆日：报错 + 有修复建议 ──
{
  const r = evaluateDay({ day: { id: 'd', date: '2026-11-09' }, items: [it('i1', 'p4')], places });
  const c = r.conflicts.find((x) => x.kind === 'closed');
  assert(!r.feasible && c && c.severity === 'error', '周一去闭馆馆判为不可行');
  const fixes = suggestFixes(r, { items: [it('i1', 'p4')] });
  assert(fixes.length > 0 && fixes[0].kind === 'reschedule', '闭馆给出"换开放日"的可执行修复');
}

// ── 5) 最后入场 / 关门时间 ──
{
  const late = evaluateDay({
    day: { id: 'd', date: '2026-11-10' },
    items: [it('i1', 'p3', { startLocal: '17:30' })],
    places,
  });
  assert(late.conflicts.some((c) => c.kind === 'after-last-entry'), '17:30 到达 17:00 最后入场的馆 → 报错');
  const closing = evaluateDay({
    day: { id: 'd', date: '2026-11-10' },
    items: [it('i1', 'p3', { startLocal: '17:00' })],
    places,
  });
  assert(closing.conflicts.some((c) => c.kind === 'after-close'),
    '17:00 入场但停留 120 分钟跨过 18:00 闭馆 → 报错');
  const early = evaluateDay({
    day: { id: 'd', date: '2026-11-10' },
    items: [it('i1', 'p3', { startLocal: '08:30' })],
    places,
  });
  assert(early.feasible && early.conflicts.some((c) => c.kind === 'before-open' && c.severity === 'warn'),
    '早到只等待并提示，不算不可行');
}

// ── 6) 固定预订重叠 ──
{
  const r = evaluateDay({
    day: { id: 'd', date: '2026-11-10' },
    items: [
      it('i1', 'p2'), // 09:00 起 180 分钟 → 12:00
      it('i2', 'p3', { flexibility: 'fixed', startLocal: '2026-11-10T10:00' }),
    ],
    places,
  });
  const c = r.conflicts.find((x) => x.kind === 'overlap');
  assert(!r.feasible && c && c.fixedAt === '10:00' && c.earliestArrival, '固定预订与前面行程重叠 → 冲突链带最早到达时间');
  assert(suggestFixes(r, { items: [it('i1', 'p2'), it('i2', 'p3')] }).some((f) => f.kind === 'move-item'),
    '重叠给出"挪到预订之后"的修复');
}

// ── 7) 跨日 / 重复 / 缺时长 / 未绑定 / 缺坐标 ──
{
  const cross = evaluateDay({
    day: { id: 'd', date: '2026-11-10' },
    items: [it('i1', 'p1', { flexibility: 'fixed', startLocal: '2026-11-11T10:00' })],
    places,
  });
  assert(cross.conflicts.some((c) => c.kind === 'cross-day' && c.itemDate === '2026-11-11'),
    '预订日期不属于当天 → cross-day');

  const dup = evaluateDay({ day: { date: '2026-11-10' }, items: [it('i1', 'p1'), it('i2', 'p1')], places });
  assert(dup.conflicts.some((c) => c.kind === 'duplicate-place'), '同一天重复点位被识别');

  // 环线闭合：最后一步回到起点、且中间去过别处 → 只提示，不判重复
  const loop = evaluateDay({
    day: { date: '2026-11-10' },
    items: [it('i1', 'p1'), it('i2', 'p2'), it('i3', 'p1')],
    places,
  });
  const loopC = loop.conflicts.find((c) => c.kind === 'loop-closure');
  assert(loop.feasible && loopC && loopC.severity === 'warn' && loopC.backMinutes >= 0,
    '回到起点的闭合回路只给提示（计通行、不计停留）');

  const noDur = evaluateDay({ day: { date: '2026-11-10' }, items: [it('i1', 'p6')], places });
  assert(noDur.conflicts.some((c) => c.kind === 'missing-duration'), '没有停留时长 → 报错而不是按 0 分钟排');

  const unbound = evaluateDay({ day: { date: '2026-11-10' }, items: [it('i1', null, { placeNameSnapshot: '某处' })], places });
  assert(unbound.conflicts.some((c) => c.kind === 'unresolved-place'), '未绑定点位 → 报错');

  const noCoord = evaluateDay({ day: { date: '2026-11-10' }, items: [it('i1', 'p1'), it('i2', 'p5')], places });
  assert(noCoord.conflicts.some((c) => c.kind === 'missing-coords'), '上一站/本站缺坐标 → 报错');
}

// ── 8) 超时一天：报错 + 优先删非必去的最长项 ──
{
  const big = new Map([
    ['b1', P('b1', '大馆 1', 55.75, 37.62, { estimatedDuration: 240 })],
    ['b2', P('b2', '大馆 2', 55.76, 37.63, { estimatedDuration: 240 })],
    ['b3', P('b3', '大馆 3', 55.77, 37.64, { estimatedDuration: 240 })],
  ]);
  const items = [
    it('i1', 'b1', { mustVisit: true }),
    it('i2', 'b2'),
    it('i3', 'b3', { flexibility: 'fixed' }),
  ];
  const r = evaluateDay({ day: { date: '2026-11-10' }, items, places: big });
  const over = r.conflicts.find((c) => c.kind === 'day-overrun');
  assert(!r.feasible && over && over.severity === 'error', '12 小时点位 + 通行超出 09:00–21:00 → day-overrun');
  const fixes = suggestFixes(r, { items });
  const drop = fixes.find((f) => f.kind === 'drop');
  assert(drop && /大馆 2/.test(drop.label), '修复建议跳过必去/固定项，优先删最长的可删项');
}

// ── 9) 确定性：同输入两次结果一致 ──
{
  const args = {
    day: { id: 'd', date: '2026-11-10' },
    items: [it('i1', 'p1'), it('i2', 'p3', { startLocal: '13:00' })],
    places,
  };
  const a = JSON.stringify(evaluateDay(args));
  const b = JSON.stringify(evaluateDay(args));
  assert(a === b, '同输入两次评估结果完全一致（可复现）');
}

// ── 10) 空天：不冒充成功 ──
{
  const r = evaluateDay({ day: { date: '2026-11-10' }, items: [], places });
  assert(r.empty === true && r.feasible === false, '空行程不算可行（避免"看起来成功"）');
  assert(DEFAULT_DAY.start === '09:00' && DEFAULT_DAY.end === '21:00', '默认时间窗 09:00–21:00');
}

if (bad) { console.error(`\n${bad} 项可行性测试失败`); process.exit(1); }
console.log('\n可行性引擎质量门通过');
