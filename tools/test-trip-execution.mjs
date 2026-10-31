#!/usr/bin/env node
// M1 行中执行质量门：Today 计算、到达/完成/跳过、ChangeEvent/TransitLeg 存储、Diff、核验任务
// 用法: node tools/test-trip-execution.mjs
import { createDay, createItem, createTrip, createVisit, validateChangeEvent, validateTransitLeg, validateVisit } from '../src/pages/trip/schema.js';
import { createMemoryDriver, openTripStore } from '../src/pages/trip/store.js';
import {
  completeItem, dayExecution, diffTrips, executionReport, findTodayDay, nearestDay,
  recordArrival, skipItem, summarizeDiff, verificationTasks,
} from '../src/pages/trip/execution.js';
import { projectVisits } from '../src/pages/visits/repository.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

let clock = Date.parse('2026-07-10T07:00:00Z'); // 莫斯科 10:00
const now = () => clock;
let seq = 0;
const idFn = p => `${p}_t${++seq}`;

const POINTS = {
  p1: { id: 'p1', name: '红场', lat: 55.7539, lon: 37.6208, estimatedDuration: 60, durationBasis: 'measured', openCalendar: 'unknown', ticket: 'free', sources: [] },
  p2: { id: 'p2', name: '克里姆林宫', lat: 55.7520, lon: 37.6175, estimatedDuration: 120, durationBasis: 'estimate', ticket: 'unknown', sources: [{ type: 'official', reviewAfter: '2026-01-01' }] },
  p3: { id: 'p3', name: '古姆百货', lat: 55.7547, lon: 37.6215, openCalendar: { days: 'daily', open: '10:00', close: '22:00' }, sources: [] },
};

function makeTrip() {
  const day = createDay({
    id: 'd1', index: 1, date: '2026-07-10', city: '莫斯科',
    items: [
      createItem({ id: 'i1', dayId: 'd1', type: 'visit', refId: 'p1', order: 0, estimatedDuration: 60, placeNameSnapshot: '红场' }),
      createItem({ id: 'i2', dayId: 'd1', type: 'visit', refId: 'p2', order: 1, estimatedDuration: 120, placeNameSnapshot: '克里姆林宫', mustVisit: false }),
      createItem({ id: 'i3', dayId: 'd1', type: 'visit', refId: 'p3', order: 2, estimatedDuration: 45, placeNameSnapshot: '古姆百货' }),
      createItem({ id: 'i4', dayId: 'd1', type: 'meal', refId: null, order: 3, estimatedDuration: 60, notes: '午餐' }),
    ],
  });
  return createTrip({
    id: 't1', title: '莫斯科 1 日行', status: 'active', dateMode: 'fixed',
    startDate: '2026-07-10', endDate: '2026-07-10', days: [day],
  }, idFn, now());
}

// 1) schema：Visit 执行字段与 ChangeEvent / TransitLeg 校验
{
  const v = createVisit({ placeId: 'p1', status: 'skipped', actualStart: '10:05', actualEnd: '2026-07-10T11:00', reason: '闭馆' });
  const good = validateVisit(v);
  if (good.ok && v.status === 'skipped' && v.actualStart === '10:05') ok('Visit 执行字段（status/actualStart/actualEnd/reason）合法');
  else fail('Visit 执行字段校验错误：' + JSON.stringify(good.errors));

  const badStatus = validateVisit({ id: 'v1', placeId: 'p1', status: 'done' });
  const badTime = validateVisit({ id: 'v1', placeId: 'p1', actualStart: '25:99' });
  if (!badStatus.ok && !badTime.ok) ok('非法 status / 非法 actualStart 被拒绝');
  else fail('Visit 非法值未被拒绝');

  const ev = validateChangeEvent({ id: 'e1', tripId: 't1', at: 1, kind: 'complete', summary: '完成' });
  const badEv = validateChangeEvent({ id: 'e1', tripId: 't1', at: 1, kind: 'hack' });
  const leg = validateTransitLeg({ id: 'l1', tripId: 't1', mode: 'walk', plannedMinutes: 9, actualMinutes: 14, at: 1 });
  const badLeg = validateTransitLeg({ id: 'l1', tripId: 't1', mode: 'rocket', at: 1 });
  if (ev.ok && !badEv.ok && leg.ok && !badLeg.ok) ok('ChangeEvent / TransitLeg 校验通过且拒绝非法枚举');
  else fail('ChangeEvent/TransitLeg 校验错误');
}

// 2) store：events / legs 读写、导出导入（含旧备份兼容与 replace 清理）
{
  const driver = createMemoryDriver();
  const store = await openTripStore({ driver, now, idFn });
  const trip = makeTrip();
  await store.saveTrip(trip);

  const ev = { id: 'e1', tripId: 't1', at: now(), kind: 'complete', summary: '完成「红场」', affected: ['i1'] };
  const leg = { id: 'l1', tripId: 't1', dayId: 'd1', toItemId: 'i2', mode: 'walk', plannedMinutes: 9, actualMinutes: 14, at: now() };
  const r1 = await store.saveEvent(ev);
  const r2 = await store.saveLeg(leg);
  const bad = await store.saveEvent({ id: 'e2', tripId: 't1', at: now(), kind: 'nope' });
  if (r1.ok && r2.ok && !bad.ok) ok('saveEvent / saveLeg 落库并校验');
  else fail('事件/交通段写入错误');

  const events = await store.listEvents({ tripId: 't1' });
  const legs = await store.listLegs({ tripId: 't1' });
  if (events.length === 1 && legs.length === 1) ok('listEvents / listLegs 按行程过滤');
  else fail('事件/交通段查询错误');

  const exported = await store.exportAll();
  if (exported.events.length === 1 && exported.legs.length === 1) ok('exportAll 包含 events 与 legs');
  else fail('导出缺少 events/legs');

  // merge 到空库：完整恢复
  const store2 = await openTripStore({ driver: createMemoryDriver(), now, idFn });
  const merged = await store2.importAll(exported, { mode: 'merge' });
  const legs2 = await store2.listLegs({ tripId: 't1' });
  if (merged.ok && merged.eventsAdded === 1 && merged.legsAdded === 1 && legs2.length === 1) ok('merge 导入恢复 events/legs');
  else fail('merge 导入 events/legs 错误：' + JSON.stringify(merged));

  // 旧备份（无 events/legs 字段）仍可导入
  const legacy = { trips: exported.trips, visits: exported.visits };
  const store3 = await openTripStore({ driver: createMemoryDriver(), now, idFn });
  const legacyImport = await store3.importAll(legacy, { mode: 'merge' });
  if (legacyImport.ok && legacyImport.eventsAdded === 0) ok('旧备份（无 events/legs）兼容导入');
  else fail('旧备份兼容导入失败');

  // replace 会清空旧 events/legs
  const replaced = await store2.importAll({ trips: [], visits: [], events: [], legs: [] }, { mode: 'replace' });
  const legsAfter = await store2.listLegs();
  if (replaced.ok && legsAfter.length === 0) ok('replace 导入原子清空 events/legs');
  else fail('replace 清理 events/legs 错误');
}

// 3) Today 执行状态：当前/下一项/缓冲/进度
{
  const trip = makeTrip();
  const today = findTodayDay(trip, '2026-07-10');
  if (today && today.day.id === 'd1') ok('findTodayDay 命中当天');
  else fail('findTodayDay 未命中');
  const past = nearestDay(trip, '2026-08-01');
  if (past && past.relation === 'past') ok('nearestDay 行程后回退最后一天');
  else fail('nearestDay 回退错误');

  // 莫斯科 10:00 = 600 分钟：红场（09:00–10:00 结束）刚过，下一项应是克里姆林宫
  const state = dayExecution({ trip, day: today.day, places: POINTS, nowMinutes: 600 });
  if (state.next && state.next.itemId === 'i2') ok('下一项计算正确（克里姆林宫）');
  else fail('下一项错误：' + JSON.stringify(state.next && state.next.itemId));
  if (Number.isFinite(state.bufferMinutes) && state.bufferMinutes === state.next.arrive - state.next.transitMinutes - 600) {
    ok('缓冲时间口径正确（到场 − 路上 − 现在）');
  } else fail('缓冲时间错误：' + JSON.stringify(state.bufferMinutes));
  if (state.progress.total === 4 && state.progress.pending === 4) ok('进度统计正确');
  else fail('进度统计错误：' + JSON.stringify(state.progress));
}

// 4) 完成 / 跳过：Visit 链接、幂等、投影排除 skipped
{
  const trip = makeTrip();
  const done = completeItem(trip, 'i1', { at: now(), actualStart: '09:05', actualEnd: '10:02', idFn, now });
  if (!done.ok || !done.visit) { fail('completeItem 失败'); }
  else {
    const item = done.trip.days[0].items.find(i => i.id === 'i1');
    if (item.plannedStatus === 'done' && item.actualVisitId === done.visit.id
      && done.visit.plannedItemId === 'i1' && done.visit.status === 'visited'
      && done.visit.dateSource === 'actual' && done.visit.source === 'plan'
      && done.event.kind === 'complete') ok('完成：状态 + Visit 链接 + ChangeEvent 一致');
    else fail('完成结果不一致：' + JSON.stringify({ item, visit: done.visit }));
  }
  const again = completeItem(done.trip, 'i1', { at: now(), idFn, now });
  if (!again.ok) ok('重复完成被拒绝（幂等）');
  else fail('重复完成未被拒绝');

  // 页面调用时不传 idFn（today.js 的真实调用方式）：条目仍必须回链到实际创建的 Visit
  // —— 旧实现用 `visitId || 原值`，没有 idFn 时得到 undefined，链接被静默丢掉。
  const noIdFn = completeItem(makeTrip(), 'i1', { at: now(), actualEnd: '10:02' });
  if (noIdFn.ok && noIdFn.visit && noIdFn.trip.days[0].items.find(i => i.id === 'i1').actualVisitId === noIdFn.visit.id) {
    ok('不传 idFn 时条目仍回链到 Visit');
  } else fail('不传 idFn 时 actualVisitId 未建立链接：' + JSON.stringify({ item: noIdFn.trip?.days?.[0]?.items?.[0], visit: noIdFn.visit }));
  const skipNoIdFn = skipItem(makeTrip(), 'i2', { reason: '' });
  if (skipNoIdFn.ok && skipNoIdFn.trip.days[0].items.find(i => i.id === 'i2').actualVisitId === skipNoIdFn.visit.id) {
    ok('跳过（不传 idFn）同样回链到 Visit');
  } else fail('跳过路径的 actualVisitId 未建立链接');

  // 无点位条目（午餐）完成不产生 Visit，但有事件
  const meal = completeItem(done.trip, 'i4', { at: now(), idFn, now });
  if (meal.ok && !meal.visit && meal.event.kind === 'complete') ok('无点位条目完成只记事件');
  else fail('无点位条目完成处理错误');

  const skipped = skipItem(meal.trip, 'i2', { reason: '排队太长', at: now(), idFn, now });
  if (skipped.ok && skipped.visit.status === 'skipped' && skipped.visit.reason === '排队太长'
    && skipped.event.kind === 'skip') ok('跳过：skipped Visit 留痕 + 原因');
  else fail('跳过处理错误');

  // 投影：skipped 不计入打卡，visited 计入
  const projection = projectVisits([done.visit, skipped.visit]);
  if (projection.p1?.n === 1 && !projection.p2) ok('打卡投影排除 skipped Visit');
  else fail('投影未排除 skipped：' + JSON.stringify(projection));

  // Today 视图：skipped 条目仍可见（置灰 ⏭），不凭空消失
  const execState = dayExecution({ trip: skipped.trip, day: skipped.trip.days[0], places: POINTS, nowMinutes: 600 });
  const skippedRow = execState.rows.find(r => r.itemId === 'i2');
  if (skippedRow && skippedRow.status === 'skipped' && execState.progress.skipped === 1
    && execState.progress.done === 2 && execState.progress.total === 4) {
    ok('Today 中 skipped 条目可见且进度统计正确');
  } else fail('skipped 条目在 Today 中丢失：' + JSON.stringify(execState.progress));

  // countIndex 续接已有打卡
  const existing = [createVisit({ placeId: 'p1', countIndex: 2 })];
  const third = completeItem(trip, 'i1', { at: now(), existingVisits: existing, idFn, now });
  if (third.visit.countIndex === 3) ok('完成时 countIndex 续接历史次数');
  else fail('countIndex 续接错误：' + third.visit.countIndex);
}

// 5) 到达打点：实际 TransitLeg + 事件；非法输入拒绝
{
  const trip = makeTrip();
  const arrived = recordArrival(trip, trip.days[0], trip.days[0].items[1], { plannedMinutes: 9, mode: 'walk', actualMinutes: 14, at: now(), idFn, now });
  if (arrived.ok && arrived.leg.plannedMinutes === 9 && arrived.leg.actualMinutes === 14
    && arrived.leg.mode === 'walk' && arrived.event.kind === 'arrive') ok('到达打点回收实际 TransitLeg');
  else fail('到达打点错误');
  const invalid = recordArrival(trip, trip.days[0], trip.days[0].items[1], { actualMinutes: -3, idFn, now });
  if (!invalid.ok) ok('非法实际分钟数被拒绝');
  else fail('非法 actualMinutes 未被拒绝');
}

// 6) diffTrips：增删改/移动/重排/行程字段；摘要可读
{
  const before = makeTrip();
  const after = JSON.parse(JSON.stringify(before));
  after.title = '莫斯科 1 日行（改）';
  const moved = after.days[0].items.splice(1, 1)[0]; // 克里姆林宫移到末尾
  after.days[0].items.push(moved);
  after.days[0].items.forEach((it, i) => { it.order = i; });
  after.days[0].items[0].estimatedDuration = 90;

  const d = diffTrips(before, after);
  if (d.tripChanges.some(c => c.field === 'title')) ok('diff 捕获标题变更');
  else fail('diff 未捕获标题变更');
  if (d.changed.some(c => c.id === 'i1' && c.fields.includes('停留'))) ok('diff 捕获停留时长变更');
  else fail('diff 未捕获停留变更：' + JSON.stringify(d.changed));
  if (d.reordered) ok('diff 捕获顺序调整');
  else fail('diff 未捕获重排');
  const summary = summarizeDiff(d);
  if (/改 1 项/.test(summary) && /调整顺序/.test(summary) && /行程信息/.test(summary)) ok('Diff 摘要可读：' + summary);
  else fail('Diff 摘要异常：' + summary);

  const added = JSON.parse(JSON.stringify(before));
  added.days[0].items.push(createItem({ id: 'i9', dayId: 'd1', type: 'visit', refId: 'p3', order: 4, placeNameSnapshot: '古姆百货 2' }));
  const d2 = diffTrips(before, added);
  if (d2.added.length === 1 && d2.added[0].id === 'i9') ok('diff 捕获新增条目');
  else fail('diff 未捕获新增');
}

// 7) 核验任务：unknown 按影响排序、去重、必去升级
{
  const trip = makeTrip();
  // 让 p3 的条目不带停留覆盖，触发"点位与条目都缺停留"的核验任务
  trip.days[0].items.find(i => i.id === 'i3').estimatedDuration = null;
  const tasks = verificationTasks(trip, POINTS, { today: '2026-07-01' });
  const hours = tasks.find(t => t.field === 'openCalendar' && t.pointId === 'p1');
  const hoursOptional = tasks.find(t => t.field === 'openCalendar' && t.pointId === 'p2');
  const duration = tasks.find(t => t.field === 'estimatedDuration' && t.pointId === 'p3');
  const ticket = tasks.find(t => t.field === 'ticket' && t.pointId === 'p2');
  const stale = tasks.find(t => t.field === 'sources' && t.pointId === 'p2');
  if (hours?.impact === 'high') ok('必去点位开放时间 unknown = 高影响');
  else fail('高影响判定错误：' + JSON.stringify(hours));
  if (hoursOptional?.impact === 'medium' && duration?.impact === 'medium' && ticket?.impact === 'low' && stale?.impact === 'low') {
    ok('中/低影响分级正确（可去点位降权、缺停留、门票待核、资料过期）');
  } else fail('影响分级错误：' + JSON.stringify(tasks));
  if (tasks[0].impact === 'high') ok('核验任务按影响排序');
  else fail('核验任务排序错误');
  const keys = tasks.map(t => `${t.pointId}:${t.field}`);
  if (new Set(keys).size === keys.length) ok('核验任务去重');
  else fail('核验任务存在重复');
}

// 8) executionReport：实际 vs 计划，误差只报告不改原始记录
{
  const trip = makeTrip();
  const visit = createVisit({ id: 'v1', placeId: 'p1', tripId: 't1', plannedItemId: 'i1', status: 'visited', actualStart: '09:05', actualEnd: '10:02' });
  const report = executionReport(trip, {
    visits: [visit],
    legs: [{ id: 'l1', tripId: 't1', toItemId: 'i2', mode: 'walk', plannedMinutes: 9, actualMinutes: 14, at: now() }],
  });
  if (report.visits.length === 1 && report.visits[0].actualEnd === '10:02'
    && report.legs.length === 1 && report.legs[0].errorMinutes === 5) ok('误差回收：通行偏差 +5 分钟如实呈现');
  else fail('误差回收错误：' + JSON.stringify(report));
}

// 9) applyExecution：Trip+Visit+Event+Leg 一个事务原子落库；revision 冲突整笔不写
{
  const driver = createMemoryDriver();
  const store = await openTripStore({ driver, now, idFn });
  const trip = makeTrip();
  const saved = await store.saveTrip(trip);
  const exec = completeItem(saved.trip, 'i1', { at: now(), actualEnd: '10:02', idFn, now });
  const applied = await store.applyExecution({ trip: exec.trip, visit: exec.visit, event: exec.event });
  if (applied.ok && applied.trip.revision === 2) ok('applyExecution 原子写入行程+Visit+事件');
  else fail('applyExecution 写入失败：' + JSON.stringify(applied));

  const visits = await store.listVisits({ tripId: 't1' });
  const events = await store.listEvents({ tripId: 't1' });
  if (visits.length === 1 && events.length === 1 && visits[0].plannedItemId === 'i1') ok('applyExecution 写入的 Visit/事件可查');
  else fail('applyExecution 查询错误');

  // 用旧 revision 再写：整笔拒绝，Visit 不半截落库
  const stale = completeItem(saved.trip, 'i2', { at: now(), idFn, now });
  const conflict = await store.applyExecution({ trip: stale.trip, visit: stale.visit, event: stale.event });
  const visitsAfter = await store.listVisits({ tripId: 't1' });
  if (!conflict.ok && conflict.code === 'revision-conflict' && visitsAfter.length === 1) {
    ok('revision 冲突时整笔回滚（Visit 不半截落库）');
  } else fail('applyExecution 冲突处理错误：' + JSON.stringify({ conflict, count: visitsAfter.length }));

  // 到达打点：只写 leg+event，不动行程
  const arr = recordArrival(applied.trip, applied.trip.days[0], applied.trip.days[0].items[1], { plannedMinutes: 9, mode: 'walk', actualMinutes: 12, at: now(), idFn, now });
  const arrSaved = await store.applyExecution({ leg: arr.leg, event: arr.event });
  const legs = await store.listLegs({ tripId: 't1' });
  const tripAfter = await store.getTrip('t1');
  if (arrSaved.ok && legs.length === 1 && tripAfter.revision === 2) ok('到达打点只写 leg+event，行程 revision 不变');
  else fail('到达打点落库错误');
}

console.log(bad ? `\n${bad} 项失败` : '\nM1 行中执行质量门全部通过');
process.exit(bad ? 1 : 0);
