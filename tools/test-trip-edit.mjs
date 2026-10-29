#!/usr/bin/env node
// Trip v2 编辑操作质量门（CI 强制）：每个操作的结果都必须能通过 validateTrip
// 用法: node tools/test-trip-edit.mjs
import {
  addDay, addItem, addPlaceToDay, bindItemPlace, countNeedsConfirm, duplicateTrip,
  itemDateConflicts, joinLocal, moveItemToDay, moveItemWithinDay, normalizeTrip,
  removeDay, removeItem, setDateMode, setDayNote, setDayWindow, setItemMustVisit,
  setItemPinnedStart, shiftTripStart, splitStartLocal, updateTrip,
} from '../src/pages/trip/edit.js';
import { createDay, createItem, createTrip, validateTrip } from '../src/pages/trip/schema.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
let seq = 0;
const idFn = p => `${p}_${++seq}`;
const NOW = 1770000000000;

const P = { id: 'p001', name: '红场', city: '莫斯科', type: '纪念地' };
const P2 = { id: 'p002', name: '圣瓦西里大教堂', city: '莫斯科', type: '教堂' };
const P3 = { id: 'p003', name: '冬宫', city: '圣彼得堡', type: '博物馆' };

function fixture() {
  const t = createTrip({ id: 't1', title: '莫斯科 3 日', dateMode: 'fixed', startDate: '2026-11-01', cities: ['莫斯科'] }, idFn, NOW);
  for (let i = 1; i <= 3; i += 1) t.days.push(createDay({ id: `d${i}`, index: i, date: `2026-11-0${i}`, city: '莫斯科' }, idFn));
  t.days[0].items.push(createItem({ id: 'i1', dayId: 'd1', refId: 'p001', placeNameSnapshot: '红场', order: 0 }, idFn));
  t.days[0].items.push(createItem({ id: 'i2', dayId: 'd1', refId: 'p002', placeNameSnapshot: '圣瓦西里大教堂', order: 1 }, idFn));
  t.days[1].items.push(createItem({ id: 'i3', dayId: 'd2', refId: 'p003', placeNameSnapshot: '冬宫', order: 0 }, idFn));
  t.endDate = '2026-11-03';
  return normalizeTrip(t);
}

const items = t => t.days.flatMap(d => d.items);
const validAll = [];
const keep = (t, label) => { validAll.push({ t, label }); return t; };

// 1) normalizeTrip：固定日期补天日期，相对日期清空
{
  const t = normalizeTrip({ ...fixture(), days: fixture().days.map(d => ({ ...d, date: '' })) });
  if (t.days.map(d => d.date).join() === '2026-11-01,2026-11-02,2026-11-03' && t.endDate === '2026-11-03') ok('normalizeTrip 按出发日重排固定日期');
  else fail(`normalizeTrip 日期错误：${t.days.map(d => d.date).join()} / ${t.endDate}`);
  const r = normalizeTrip({ ...fixture(), dateMode: 'relative', startDate: '' });
  if (r.days.every(d => d.date === '') && r.endDate === '') ok('相对日期行程不写死天日期');
  else fail('相对日期行程仍带日期');
  if (t.days.every((d, i) => d.index === i + 1) && t.days.every(d => d.items.every((it, ii) => it.order === ii && it.dayId === d.id))) ok('normalizeTrip 重排 index/order/dayId');
  else fail('normalizeTrip 序号归一失败');
}

// 2) 加点位
{
  const t = keep(addPlaceToDay(fixture(), P3, { dayIndex: 0, period: 'morning' }, idFn), 'addPlace');
  const add = t.days[0].items[2];
  if (add.refId === 'p003' && add.placeNameSnapshot === '冬宫' && add.period === 'morning' && add.order === 2) ok('加点位写入 refId/名称快照/时段/顺序');
  else fail(`加点位字段错误：${JSON.stringify(add)}`);
  if (t.cities.includes('圣彼得堡')) ok('加点位自动补 cities');
  else fail('加点位未补 cities');
  const dup = addPlaceToDay(t, P3, { dayIndex: 0 }, idFn);
  if (dup.days[0].items.length === 3) ok('同一天重复加点位被忽略');
  else fail(`重复加点位没被忽略：${dup.days[0].items.length}`);
  const again = addPlaceToDay(t, P, { dayIndex: 1 }, idFn);
  if (again.days[1].items.length === 2) ok('不同天可再加一次同一点位');
  else fail('跨天加点位失败');
  const badPlace = addPlaceToDay(fixture(), { name: '没有 id' }, {}, idFn);
  if (items(badPlace).length === 3) ok('无 id 的点位不写入');
  else fail('无 id 的点位被写入');
}

// 3) 手工加项：无 placeId 的 visit 自动待确认
{
  const t = keep(addItem(fixture(), 2, { type: 'visit', placeNameSnapshot: '某餐厅' }, idFn), 'addItem');
  const it = t.days[2].items[0];
  if (it.confirm === 'needs_confirm' && it.refId === null) ok('无 refId 的 visit 自动标记待确认');
  else fail(`visit 未标待确认：${JSON.stringify(it)}`);
  const booking = keep(addItem(fixture(), 0, { type: 'reservation', flexibility: 'fixed', startLocal: '2026-11-01T19:30', placeNameSnapshot: '马林斯基' }, idFn), 'addBooking');
  if (booking.days[0].items[2].startLocal === '2026-11-01T19:30') ok('预订可带绝对时刻');
  else fail('预订绝对时刻丢失');
}

// 4) 排序 / 跨天移动 / 删除
{
  const t = moveItemWithinDay(fixture(), 'i1', 1);
  if (t.days[0].items[0].id === 'i2' && t.days[0].items[1].id === 'i1') ok('下移一位交换顺序');
  else fail('下移未生效');
  if (moveItemWithinDay(fixture(), 'i2', 1).days[0].items[1].id === 'i2') ok('末位下移为空操作');
  else fail('末位下移越界');
  const moved = keep(moveItemToDay(fixture(), 'i1', 1), 'moveToDay');
  if (!moved.days[0].items.some(x => x.id === 'i1') && moved.days[1].items[1].dayId === moved.days[1].id) ok('跨天移动更新 dayId');
  else fail('跨天移动失败');
  keep(moveItemToDay(fixture(), 'i1', 9), 'moveToBadDay');
  const del = keep(removeItem(fixture(), 'i1'), 'removeItem');
  if (del.days[0].items.length === 1 && del.days[0].items[0].order === 0) ok('删除点位后重排 order');
  else fail('删除点位失败');
}

// 5) 增删天
{
  const t = keep(addDay(fixture(), { idFn }), 'addDay');
  if (t.days.length === 4 && t.days[3].date === '2026-11-04' && t.endDate === '2026-11-04') ok('加一天同步日期与 endDate');
  else fail(`加天失败：${t.days.length} / ${t.endDate}`);
  const r = keep(removeDay(t, 1), 'removeDay');
  if (r.days.length === 3 && items(r).length === 3) ok('删天把点位并入相邻天，零丢弃');
  else fail(`删天丢数据：${items(r).length}`);
  if (r.days[0].items.length === 3) ok('删中间天并入前一天');
  else fail(`并入位置错误：${r.days[0].items.length}`);
  const first = keep(removeDay(t, 0), 'removeFirstDay');
  if (first.days[0].items.some(x => x.refId === 'p001') && first.days[0].date === '2026-11-01') ok('删第一天把点位并入新首日，出发日期不变');
  else fail('删第一天失败');
  const one = normalizeTrip({ ...fixture(), days: [fixture().days[0]] });
  if (removeDay(one, 0).days.length === 1) ok('最后一天不可删除');
  else fail('唯一一天被删除');
}

// 6) 备注 / 改字段 / 绑定歧义点 / 钟点窗口 / 必去
{
  const t = setDayNote(fixture(), 0, '早点出门');
  if (t.days[0].note === '早点出门') ok('日备注可写');
  else fail('日备注未写入');
  const win = keep(setDayWindow(fixture(), 0, { startTime: '10:00', endTime: '22:30' }), 'setDayWindow');
  if (win.days[0].startTime === '10:00' && win.days[0].endTime === '22:30') ok('当天钟点窗口可改');
  else fail(`钟点窗口未写入：${JSON.stringify({ s: win.days[0].startTime, e: win.days[0].endTime })}`);
  const badWin = setDayWindow(win, 0, { startTime: '18:00', endTime: '09:00' });
  if (badWin.days[0].startTime === '10:00') ok('endTime 早于 startTime 的窗口被拒绝');
  else fail('非法窗口被写入');
  const legacyDay = normalizeTrip({ ...fixture(), days: fixture().days.map(({ startTime, endTime, ...d }) => d) });
  if (legacyDay.days.every(d => d.startTime === '09:00' && d.endTime === '21:00')) ok('normalizeTrip 为旧数据补默认钟点窗口');
  else fail('旧数据未补默认窗口');

  const must = keep(setItemMustVisit(fixture(), 'i1', false), 'setMustVisit');
  if (must.days[0].items[0].mustVisit === false) ok('条目可标为可删（mustVisit=false）');
  else fail('mustVisit 未写入');
  const badMust = setItemMustVisit(must, 'i1', 'no');
  if (badMust.days[0].items[0].mustVisit === false) ok('非布尔 mustVisit 被拒绝');
  else fail('非布尔 mustVisit 被接受');
  const pinned = keep(setItemPinnedStart(fixture(), 'i1', '10:05'), 'setPinnedStart');
  if (pinned.days[0].items[0].pinnedStart === '10:05') ok('条目可锁定当天开始时刻');
  else fail('pinnedStart 未写入');
  const badPin = setItemPinnedStart(pinned, 'i1', '25:00');
  if (badPin.days[0].items[0].pinnedStart === '10:05') ok('非法 pinnedStart 被拒绝');
  else fail('非法 pinnedStart 被接受');
  const cleared = keep(setItemPinnedStart(pinned, 'i1', ''), 'clearPinnedStart');
  if (cleared.days[0].items[0].pinnedStart === '') ok('空串可清除锁定时点');
  else fail('pinnedStart 清除失败');
  const legacyPin = normalizeTrip({
    ...fixture(),
    days: fixture().days.map((d, i) => (i === 0 ? { ...d, items: d.items.map(({ pinnedStart, ...it }) => it) } : d)),
  });
  if (legacyPin.days[0].items.every(it => it.pinnedStart === '')) ok('缺 pinnedStart 的旧条目按未锁定处理');
  else fail('旧条目 pinnedStart 默认值错误');
  const legacyItem = normalizeTrip({
    ...fixture(),
    days: fixture().days.map((d, i) => (i === 0 ? { ...d, items: d.items.map(({ mustVisit, ...it }) => it) } : d)),
  });
  if (legacyItem.days[0].items.every(it => it.mustVisit === true)) ok('缺 mustVisit 的旧条目按必去处理');
  else fail('旧条目 mustVisit 默认值错误');

  const u = updateTrip(fixture(), { title: '  ', status: 'planned' });
  if (u.title === '莫斯科 3 日' && u.status === 'planned') ok('空标题回退、状态可改');
  else fail(`updateTrip 异常：${u.title} / ${u.status}`);
  const ambiguous = normalizeTrip({ ...fixture(), days: fixture().days.map((d, i) => (i === 0 ? { ...d, items: [...d.items, createItem({ id: 'ix', dayId: d.id, refId: null, confirm: 'needs_confirm', placeNameSnapshot: '红场（歧义）' }, idFn)] } : d)) });
  const bound = keep(bindItemPlace(ambiguous, 'ix', P), 'bindItem');
  const it = bound.days[0].items.find(x => x.id === 'ix');
  if (it.refId === 'p001' && it.confirm === 'ok' && it.placeNameSnapshot === '红场') ok('人工绑定后 refId/名称/确认态同步');
  else fail(`绑定失败：${JSON.stringify(it)}`);
  const unbound = bindItemPlace(bound, 'ix', null);
  const it2 = unbound.days[0].items.find(x => x.id === 'ix');
  if (it2.refId === null && it2.confirm === 'needs_confirm') ok('解绑退回待确认，名称快照保留');
  else fail('解绑状态错误');
  if (countNeedsConfirm(ambiguous) === 1 && countNeedsConfirm(bound) === 0) ok('待确认计数正确');
  else fail('待确认计数错误');
}

// 7) 相对 ⇄ 固定日期
{
  const rel = normalizeTrip({ ...fixture(), dateMode: 'relative', startDate: '' });
  const fixed = keep(setDateMode(rel, 'fixed', '2026-12-24'), 'setFixed');
  if (fixed.dateMode === 'fixed' && fixed.days[0].date === '2026-12-24' && fixed.endDate === '2026-12-26') ok('无日期行程可落到具体日期');
  else fail('落日期失败');
  const back = setDateMode(fixed, 'relative');
  if (back.dateMode === 'relative' && back.days.every(d => d.date === '')) ok('可退回无日期行程');
  else fail('退回无日期失败');
  if (setDateMode(rel, 'fixed', '2026-13-01').dateMode === 'relative') ok('非法日期不改模式');
  else fail('非法日期被接受');
}

// 8) 改期策略
{
  const withBooking = keep(normalizeTrip({
    ...fixture(),
    days: fixture().days.map((d, i) => (i === 0
      ? { ...d, items: [...d.items, createItem({ id: 'b1', dayId: d.id, type: 'reservation', flexibility: 'fixed', startLocal: '2026-11-01T19:30', order: 2 }, idFn),
        createItem({ id: 'c1', dayId: d.id, type: 'meal', startLocal: '12:00', order: 3 }, idFn)] }
      : d)),
  }), 'withBooking');

  const shift = shiftTripStart(withBooking, '2026-11-08', { policy: 'shift_all' });
  keep(shift.trip, 'shiftAll');
  if (shift.ok && shift.trip.days[0].date === '2026-11-08' && shift.trip.endDate === '2026-11-10') ok('整体平移：天日期与 endDate 同步');
  else fail(`整体平移日期错误：${shift.trip.days[0].date} / ${shift.trip.endDate}`);
  const b1 = items(shift.trip).find(x => x.id === 'b1');
  const c1 = items(shift.trip).find(x => x.id === 'c1');
  if (b1.startLocal === '2026-11-08T19:30') ok('整体平移会把绝对时刻预订一起移动');
  else fail(`预订未平移：${b1.startLocal}`);
  if (c1.startLocal === '12:00') ok('当天的纯时刻不参与平移');
  else fail(`纯时刻被改写：${c1.startLocal}`);
  if (itemDateConflicts(shift.trip).length === 0 && shift.conflicts.length === 0) ok('整体平移无预订冲突');
  else fail('整体平移产生假冲突');

  const keepB = shiftTripStart(withBooking, '2026-11-08', { policy: 'keep_bookings' });
  keep(keepB.trip, 'keepBookings');
  const kb = items(keepB.trip).find(x => x.id === 'b1');
  if (kb.startLocal === '2026-11-01T19:30') ok('保留已订：预订时刻不动');
  else fail(`预订被移动：${kb.startLocal}`);
  if (keepB.pinned.length === 1 && keepB.conflicts.length === 1 && keepB.conflicts[0].itemId === 'b1') ok('保留已订会把冲突显式报出');
  else fail(`冲突未报：${JSON.stringify(keepB.conflicts)}`);
  if (itemDateConflicts(keepB.trip).length === 1) ok('冲突可从行程本身重算（刷新后仍提示）');
  else fail('冲突重算失败');
  const meal = items(keepB.trip).find(x => x.id === 'c1');
  if (meal.startLocal === '12:00') ok('保留已订不影响灵活项目');
  else fail('灵活项目被改');

  const badDate = shiftTripStart(withBooking, '2026-02-30', {});
  if (!badDate.ok && badDate.error) ok('非法日期拒绝改期');
  else fail('非法日期被接受');
  const relShift = shiftTripStart(normalizeTrip({ ...fixture(), dateMode: 'relative', startDate: '' }), '2026-11-08', {});
  if (!relShift.ok) ok('无日期行程不允许改期（应走落日期）');
  else fail('无日期行程被改期');
  const same = shiftTripStart(fixture(), '2026-11-01', {});
  if (same.ok && same.movedDays === 0) ok('同日期改期是空操作');
  else fail('同日期改期异常');
}

// 9) local 时间格式工具
{
  const a = splitStartLocal('2026-11-01T19:30');
  const b = splitStartLocal('19:30');
  const c = splitStartLocal('乱码');
  if (a.date === '2026-11-01' && a.time === '19:30' && b.date === '' && b.time === '19:30' && c.time === '') ok('splitStartLocal 三种输入都安全');
  else fail(`splitStartLocal 异常：${JSON.stringify([a, b, c])}`);
  if (joinLocal('2026-11-01', '09:05') === '2026-11-01T09:05' && joinLocal('', '09:05') === '09:05' && joinLocal('', '') === '') ok('joinLocal 与 split 可互逆');
  else fail('joinLocal 异常');
}

// 10) 复制行程
{
  const src = fixture();
  const copy = keep(duplicateTrip(src, { idFn, now: NOW }), 'duplicate');
  if (copy.id !== src.id && copy.revision === 1 && copy.origin.fromTripId === 't1' && /副本/.test(copy.title)) ok('复制生成新行程并标记来源');
  else fail(`复制元信息错误：${copy.id}/${copy.revision}/${copy.title}`);
  const srcIds = new Set([src.id, ...src.days.map(d => d.id), ...items(src).map(i => i.id)]);
  const copyIds = [copy.id, ...copy.days.map(d => d.id), ...items(copy).map(i => i.id)];
  if (!copyIds.some(id => srcIds.has(id)) && new Set(copyIds).size === copyIds.length) ok('复制后所有 id 全新且不重复');
  else fail('复制出现 id 复用');
  if (items(copy).map(x => x.refId).join() === items(src).map(x => x.refId).join()) ok('复制保留点位引用');
  else fail('复制丢失点位引用');
  if (!copy.days[0].items.includes(src.days[0].items[0])) ok('复制是深拷贝，不共享对象');
  else fail('复制共享了对象引用');
}

// 11) 所有操作结果都必须通过 validateTrip
{
  const badOnes = validAll.filter(({ t }) => !validateTrip(t).ok);
  if (!badOnes.length) ok(`${validAll.length} 个操作结果全部通过 validateTrip`);
  else fail(`非法结果：${badOnes.map(b => b.label + ' → ' + JSON.stringify(validateTrip(b.t).errors[0])).join('；')}`);
}

if (bad) { console.error(`\n${bad} 处编辑操作不符合契约`); process.exit(1); }
console.log('\nTrip 编辑质量门通过');
