#!/usr/bin/env node
// Trip v2 契约质量门（CI 强制）：枚举/日期工具/工厂默认值/结构校验
// 用法: node tools/test-trip-schema.mjs
import {
  DAY_TIME_DEFAULTS, TRIP_SCHEMA_VERSION, addDays, createDay, createItem, createTrip, createVisit,
  diffDays, isDateString, isTimeString, tripItemCount, validateTrip, validateVisit,
} from '../src/pages/trip/schema.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

let seq = 0;
const idFn = (p) => `${p}${++seq}`;

// 1) 日期工具
{
  const cases = [
    ['2026-02-28', 1, '2026-03-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-11-01', -1, '2026-10-31'],
  ];
  const wrong = cases.filter(([d, n, exp]) => addDays(d, n) !== exp);
  if (!wrong.length) ok('addDays 跨月/闰年/跨年正确');
  else fail('addDays 错误：' + JSON.stringify(wrong));

  if (isDateString('2026-02-29') === false && isDateString('2024-02-29') === true) ok('isDateString 拒绝非闰年 2/29');
  else fail('isDateString 闰年判断错误');
  if (diffDays('2026-11-01', '2026-11-05') === 4) ok('diffDays 正确');
  else fail('diffDays 错误：' + diffDays('2026-11-01', '2026-11-05'));
  if (addDays('2026-2-1', 1) === '' && addDays('bad', 1) === '') ok('addDays 非法输入返回空串');
  else fail('addDays 非法输入未返回空串');
  if (isTimeString('09:05') && isTimeString('00:00') && !isTimeString('9:05') && !isTimeString('24:00')) ok('isTimeString 严格匹配 HH:MM');
  else fail('isTimeString 判定错误');
}

// 2) Trip 工厂默认值
{
  const t = createTrip({ title: '莫斯科 3 日', startDate: '2026-11-01', days: 3 }, idFn, 1000);
  if (t.schemaVersion === TRIP_SCHEMA_VERSION && t.dateMode === 'fixed' && t.endDate === '2026-11-03') ok('固定日期：自动算 endDate');
  else fail(`固定日期 endDate 错误：${t.endDate}`);
  if (t.status === 'draft' && t.revision === 1 && t.currency === 'RUB' && t.createdAt === 1000) ok('Trip 默认值（draft/revision=1/RUB/createdAt）');
  else fail('Trip 默认值错误：' + JSON.stringify(t));

  const rel = createTrip({ title: '无日期', days: 2 }, idFn, 1000);
  if (rel.dateMode === 'relative' && rel.startDate === '' && rel.endDate === '') ok('无日期 → relative 且不写日期');
  else fail('relative 行程错误：' + JSON.stringify(rel));

  const noTitle = createTrip({}, idFn, 1000);
  if (noTitle.title === '未命名行程') ok('缺标题回落"未命名行程"');
  else fail('缺标题未回落：' + noTitle.title);
}

// 3) Day / Item / Visit 工厂
{
  const d = createDay({ index: 2, date: '2026-11-02' }, idFn);
  if (d.index === 2 && d.items.length === 0 && d.date === '2026-11-02') ok('createDay 基本字段');
  else fail('createDay 错误：' + JSON.stringify(d));
  if (d.startTime === DAY_TIME_DEFAULTS.startTime && d.endTime === DAY_TIME_DEFAULTS.endTime) ok('createDay 默认钟点窗口 09:00–21:00');
  else fail('createDay 默认钟点窗口错误：' + JSON.stringify({ s: d.startTime, e: d.endTime }));
  const win = createDay({ startTime: '10:30', endTime: '23:15' }, idFn);
  if (win.startTime === '10:30' && win.endTime === '23:15') ok('createDay 保留合法钟点窗口');
  else fail('createDay 自定义窗口丢失：' + JSON.stringify(win));
  const badWin = createDay({ startTime: '9:00', endTime: '25:00' }, idFn);
  if (badWin.startTime === DAY_TIME_DEFAULTS.startTime && badWin.endTime === DAY_TIME_DEFAULTS.endTime) ok('createDay 非法钟点回落默认');
  else fail('createDay 非法钟点未回落：' + JSON.stringify(badWin));
  if (d.transportMode === 'transit') ok('createDay 默认公交优先');
  else fail('createDay 默认交通方式错误：' + d.transportMode);
  const taxiDay = createDay({ transportMode: 'taxi' }, idFn);
  const badModeDay = createDay({ transportMode: 'rocket' }, idFn);
  if (taxiDay.transportMode === 'taxi' && badModeDay.transportMode === 'transit') ok('createDay 交通方式校验');
  else fail('createDay 交通方式回落错误');

  const i = createItem({ type: 'transit', refId: 'p1', order: 0, estimatedDuration: 30.6, period: 'morning' }, idFn);
  if (i.type === 'transit' && i.estimatedDuration === 31 && i.period === 'morning' && i.confirm === 'ok') ok('createItem 类型/时长取整/时段');
  else fail('createItem 错误：' + JSON.stringify(i));
  if (i.mustVisit === true) ok('createItem 默认必去（mustVisit=true）');
  else fail('createItem mustVisit 默认值错误：' + i.mustVisit);
  const opt = createItem({ mustVisit: false }, idFn);
  if (opt.mustVisit === false) ok('createItem 保留显式 mustVisit=false');
  else fail('createItem 显式可删丢失');
  if (i.pinnedStart === '') ok('createItem 默认不锁定时刻');
  else fail('createItem pinnedStart 默认值错误：' + i.pinnedStart);
  const pinned = createItem({ pinnedStart: '10:05' }, idFn);
  if (pinned.pinnedStart === '10:05') ok('createItem 保留合法锁定时点');
  else fail('createItem 锁定时点丢失：' + pinned.pinnedStart);
  const badPin = createItem({ pinnedStart: '9:05' }, idFn);
  if (badPin.pinnedStart === '') ok('createItem 非法锁定时点回落空串');
  else fail('createItem 非法锁定时点未回落：' + badPin.pinnedStart);
  const durBad = createItem({ estimatedDuration: 0 }, idFn);
  const durHuge = createItem({ estimatedDuration: 721 }, idFn);
  if (durBad.estimatedDuration === null && durHuge.estimatedDuration === null) ok('createItem 非法停留时长回落 null');
  else fail('createItem 停留时长未回落：' + JSON.stringify([durBad.estimatedDuration, durHuge.estimatedDuration]));
  const brk = createItem({ type: 'break', estimatedDuration: 20 }, idFn);
  if (brk.type === 'break' && brk.estimatedDuration === 20) ok('createItem 支持休息块类型');
  else fail('createItem 休息块类型丢失：' + JSON.stringify(brk));

  const badEnum = createItem({ type: 'nope', flexibility: 'x', plannedStatus: 'y', period: 'z' }, idFn);
  if (badEnum.type === 'visit' && badEnum.flexibility === 'flexible' && badEnum.plannedStatus === 'planned' && badEnum.period === '') ok('createItem 非法枚举回落默认值');
  else fail('createItem 枚举回落错误：' + JSON.stringify(badEnum));

  const v = createVisit({ placeId: 'p1', date: '2026-11-01', note: 'x'.repeat(600) }, idFn, 5);
  if (v.placeId === 'p1' && v.note.length === 500 && v.tripId === null && v.countIndex === 1) ok('createVisit 截断笔记/无 Trip 合法');
  else fail('createVisit 错误：' + JSON.stringify(v));
}

// 4) 合法 Trip 通过校验
{
  const day = createDay({ index: 1, date: '2026-11-01' }, idFn);
  day.items.push(createItem({ dayId: day.id, type: 'visit', refId: 'p1', order: 0 }, idFn));
  const trip = createTrip({ title: '莫斯科', startDate: '2026-11-01', days: 1, daysCount: 1 }, idFn, 1);
  trip.days = [day];
  const r = validateTrip(trip);
  if (r.ok) ok('合法 Trip 通过校验');
  else fail('合法 Trip 未通过：' + JSON.stringify(r.errors));
  if (tripItemCount(trip) === 1) ok('tripItemCount 正确');
  else fail('tripItemCount 错误：' + tripItemCount(trip));
}

// 5) 校验反例
{
  const mk = (mut) => {
    const day = createDay({ index: 1, date: '2026-11-01' }, idFn);
    const trip = createTrip({ title: 'T', startDate: '2026-11-01', days: 1 }, idFn, 1);
    trip.days = [day];
    mut(trip);
    return validateTrip(trip);
  };
  const cases = [
    ['schemaVersion', mk(t => { t.schemaVersion = 1; }), 'version'],
    ['空标题', mk(t => { t.title = '  '; }), 'required'],
    ['非法 status', mk(t => { t.status = 'flying'; }), 'enum'],
    ['固定日期缺 startDate', mk(t => { t.startDate = ''; }), 'date'],
    ['endDate 早于 startDate', mk(t => { t.endDate = '2026-10-31'; }), 'range'],
    ['天数与跨度不一致', mk(t => { t.endDate = '2026-11-05'; }), 'range'],
    ['day.index 非连续', mk(t => { t.days[0].index = 2; }), 'sequence'],
    ['day.date 不连续', mk(t => { t.days[0].date = '2026-11-02'; }), 'range'],
    ['item 类型非法', mk(t => { t.days[0].items.push({ ...createItem({ type: 'visit', refId: 'p1', order: 0 }, idFn), type: 'nope' }); }), 'enum'],
    ['startTime 格式非法', mk(t => { t.days[0].startTime = '9:00'; }), 'time'],
    ['endTime 不晚于 startTime', mk(t => { t.days[0].startTime = '18:00'; t.days[0].endTime = '09:00'; }), 'range'],
    ['钟点窗口只写一半', mk(t => { delete t.days[0].endTime; }), 'required'],
    ['mustVisit 非布尔', mk(t => { t.days[0].items.push({ ...createItem({ type: 'visit', refId: 'p1', order: 0 }, idFn), mustVisit: 'yes' }); }), 'type'],
    ['pinnedStart 非法', mk(t => { t.days[0].items.push({ ...createItem({ type: 'visit', refId: 'p1', order: 0 }, idFn), pinnedStart: '25:00' }); }), 'time'],
    ['estimatedDuration 为 0', mk(t => { t.days[0].items.push({ ...createItem({ type: 'visit', refId: 'p1', order: 0 }, idFn), estimatedDuration: 0 }); }), 'duration'],
    ['estimatedDuration 超上限', mk(t => { t.days[0].items.push({ ...createItem({ type: 'visit', refId: 'p1', order: 0 }, idFn), estimatedDuration: 721 }); }), 'duration'],
    ['transportMode 非法', mk(t => { t.days[0].transportMode = 'rocket'; }), 'enum'],
  ];
  const wrong = [];
  for (const [label, r, code] of cases) {
    if (r.ok || !r.errors.some(e => e.code === code)) wrong.push(`${label}（期望 ${code}，实际 ${JSON.stringify(r.errors)}）`);
  }
  if (!wrong.length) ok(`${cases.length} 个校验反例全部捕获`);
  else fail('校验反例漏报：\n  ' + wrong.join('\n  '));

  const legacy = mk(t => { delete t.days[0].startTime; delete t.days[0].endTime; });
  if (legacy.ok) ok('旧数据缺钟点窗口仍通过校验（按默认 09:00–21:00 处理）');
  else fail('旧数据兼容失败：' + JSON.stringify(legacy.errors));

  const dup = mk(t => {
    const d = createDay({ id: 'same', index: 2, date: '2026-11-02' }, idFn);
    t.days = [createDay({ id: 'same', index: 1, date: '2026-11-01' }, idFn), d];
    t.endDate = '2026-11-02';
  });
  if (!dup.ok && dup.errors.some(e => e.code === 'duplicate')) ok('day id 重复被捕获');
  else fail('day id 重复未捕获：' + JSON.stringify(dup.errors));

  const missingRef = mk(t => { t.days[0].items.push(createItem({ type: 'visit', refId: null, order: 0, confirm: 'ok' }, idFn)); });
  if (!missingRef.ok && missingRef.errors.some(e => e.code === 'ref')) ok('visit 缺 placeId 且未标记待确认被捕获');
  else fail('缺 refId 未捕获：' + JSON.stringify(missingRef.errors));

  const badVisit = validateVisit({ id: '', placeId: '', date: '2026-13-01' });
  if (!badVisit.ok && badVisit.errors.length >= 2) ok('Visit 反例被捕获');
  else fail('Visit 反例漏报：' + JSON.stringify(badVisit.errors));
}

if (bad) { console.error(`\n${bad} 项 Trip 契约测试失败`); process.exit(1); }
console.log('\nTrip 契约测试通过');
