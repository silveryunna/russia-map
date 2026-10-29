#!/usr/bin/env node
// 旧数据迁移质量门（CI 强制）：名称→placeId、歧义队列、零丢失、打卡→Visit
// 用法: node tools/test-trip-migrate.mjs
import {
  CITY_TIME_ZONES, indexPlaces, migrateCheckinsToVisits, migratePlansV1, resolvePlaceName,
} from '../src/pages/trip/migrate.js';
import { validateTrip } from '../src/pages/trip/schema.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

let seq = 0;
const idFn = (p) => `${p}${++seq}`;

const points = [
  { id: 'p1', name: '红场', city: '莫斯科' },
  { id: 'p2', name: '圣瓦西里大教堂', city: '莫斯科' },
  { id: 'p3', name: '同名点', city: '莫斯科' },
  { id: 'p4', name: '同名点', city: '莫斯科' },
];

// 1) 名称索引与解析
{
  const idx = indexPlaces(points);
  if (idx.byId.size === 4 && resolvePlaceName(idx, '红场').placeId === 'p1') ok('唯一名称解析到 placeId');
  else fail('唯一名称解析失败');

  const amb = resolvePlaceName(idx, '同名点');
  if (!amb.placeId && amb.candidates.length === 2) ok('同名点进入歧义（保留候选）');
  else fail('同名点解析错误：' + JSON.stringify(amb));

  const none = resolvePlaceName(idx, '不存在的点');
  if (!none.placeId && none.candidates.length === 0) ok('未知名称为 unresolved');
  else fail('未知名解析错误：' + JSON.stringify(none));

  const broken = indexPlaces([{ name: '无 id' }, null, { id: 'p9', name: '' }]);
  if (broken.byId.size === 1 && broken.byName.size === 0) ok('索引跳过缺 id / 缺名称的点位');
  else fail('索引容错错误');
}

// 2) 计划迁移：跨时段顺序、日期连续、来源与城市
{
  const plan = {
    id: 'px1', name: '莫斯科 2 日', city: '莫斯科', date: '2026-11-01', source: 'ai', channel: 'custom', model: 'm1',
    note: '天数不足提示', createdAt: 111,
    days: [
      { day: 1, slots: { morning: ['红场', '圣瓦西里大教堂'], afternoon: ['同名点'], evening: [] }, tip: '周一闭馆' },
      { day: 2, slots: { morning: [], afternoon: [], evening: ['红场'] }, tip: '' },
    ],
  };
  const r = migratePlansV1({ plans: [plan], points, idFn, now: 999 });
  const t = r.trips[0];
  if (r.stats.trips === 1 && r.stats.days === 2 && r.stats.items === 4) ok('2 日计划 → 2 day / 4 item（零丢失）');
  else fail('计划迁移计数错误：' + JSON.stringify(r.stats));

  const day1 = t.days[0];
  if (day1.date === '2026-11-01' && t.days[1].date === '2026-11-02' && t.endDate === '2026-11-02') ok('日期按出发日连续生成');
  else fail('日期生成错误：' + JSON.stringify(t.days.map(d => d.date)) + ' end=' + t.endDate);

  const periods = day1.items.map(i => i.period);
  if (periods.join(',') === 'morning,morning,afternoon' && day1.items.map(i => i.order).join(',') === '0,1,2') ok('时段与 order 保序');
  else fail('时段/顺序错误：' + JSON.stringify(periods) + ' / ' + JSON.stringify(day1.items.map(i => i.order)));

  if (day1.items[0].refId === 'p1' && day1.items[1].refId === 'p2') ok('名称映射到 placeId');
  else fail('placeId 映射错误：' + JSON.stringify(day1.items.map(i => i.refId)));

  const ambItem = day1.items[2];
  if (ambItem.refId === null && ambItem.confirm === 'needs_confirm' && ambItem.placeNameSnapshot === '同名点') ok('歧义点位保留为 needs_confirm + 名称快照');
  else fail('歧义点位处理错误：' + JSON.stringify(ambItem));

  if (r.ambiguities.length === 1 && r.ambiguities[0].candidates.join(',') === 'p3,p4' && r.stats.ambiguous === 1) ok('歧义队列记录候选');
  else fail('歧义队列错误：' + JSON.stringify(r.ambiguities));

  if (t.origin.source === 'ai' && t.origin.channel === 'custom' && t.origin.model === 'm1' && t.origin.legacyPlanId === 'px1') ok('生成来源完整保留');
  else fail('来源丢失：' + JSON.stringify(t.origin));

  if (t.homeTimeZone === 'Europe/Moscow' && t.cities[0] === '莫斯科' && t.notes === '天数不足提示' && day1.note === '周一闭馆') ok('时区/城市/备注/tip 保留');
  else fail('城市相关信息丢失：' + JSON.stringify({ tz: t.homeTimeZone, cities: t.cities, notes: t.notes, tip: day1.note }));

  if (t.createdAt === 111 && t.updatedAt === 999 && t.revision === 1) ok('时间戳与 revision 正确');
  else fail('时间戳错误：' + JSON.stringify({ c: t.createdAt, u: t.updatedAt, r: t.revision }));

  const v = validateTrip(t);
  if (v.ok) ok('迁移结果通过 Trip v2 校验');
  else fail('迁移结果校验失败：' + JSON.stringify(v.errors));
}

// 3) 未知名 / 无日期 / 未知城市 / 无效计划
{
  const plan = {
    id: 'px2', name: '', city: '海参崴', date: '', days: [
      { day: 1, slots: { morning: ['不存在点'], afternoon: [], evening: [] }, tip: '' },
    ],
  };
  const r = migratePlansV1({ plans: [plan, null, { id: 'px3', days: [] }], points, idFn, now: 1 });
  const t = r.trips[0];
  if (t.dateMode === 'relative' && t.startDate === '' && t.days[0].date === '') ok('无日期行程迁移为 relative');
  else fail('无日期迁移错误：' + JSON.stringify(t));

  if (t.homeTimeZone === '' && t.title === '海参崴行程') ok('未知城市不猜时区；空标题回落到城市');
  else fail('未知城市/空标题处理错误：' + JSON.stringify({ tz: t.homeTimeZone, title: t.title }));

  if (r.ambiguities[0].kind === 'unresolved' && r.ambiguities[0].candidates.length === 0 && r.stats.unresolved === 1) ok('未知名进入 unresolved 队列');
  else fail('未知名队列错误：' + JSON.stringify(r.ambiguities));

  if (r.stats.skipped === 2 && r.issues.length === 2 && r.trips.length === 1) ok('无效计划不丢：进 issues（原数据由调用方备份）');
  else fail('无效计划处理错误：' + JSON.stringify({ skipped: r.stats.skipped, issues: r.issues.length }));
}

// 4) 打卡 → Visit
{
  const checkins = {
    p1: { n: 3, last: '2026-05-01', note: '排队久' },
    p2: { n: 1, last: 'bad-date' },
    p3: { n: 0, last: '' },
    '': { n: 2, last: '2026-01-01' },
  };
  const r = migrateCheckinsToVisits({ checkins, now: 7, idFn });
  if (r.stats.places === 3 && r.stats.visits === 5) ok('打卡次数完整迁移（3+1+1，空 id 忽略）');
  else fail('打卡计数错误：' + JSON.stringify(r.stats));

  const p1 = r.visits.filter(v => v.placeId === 'p1');
  if (p1.length === 3 && p1[0].date === '' && p1[2].date === '2026-05-01' && p1[2].note === '排队久') ok('多次打卡：仅最后一次带日期与感想，次数不丢');
  else fail('多次打卡迁移错误：' + JSON.stringify(p1));

  const p2 = r.visits.find(v => v.placeId === 'p2');
  if (p2.date === '' && p2.dateSource === 'unknown') ok('非法日期不伪造，标 unknown');
  else fail('非法日期处理错误：' + JSON.stringify(p2));

  if (r.visits.every(v => v.tripId === null && v.source === 'legacy-checkin')) ok('历史 Visit 不带 Trip、来源标记 legacy-checkin');
  else fail('Visit 来源/归属错误');

  const ids = new Set(r.visits.map(v => v.id));
  if (ids.size === r.visits.length) ok('Visit id 唯一（重复迁移不产生同 id 冲突）');
  else fail('Visit id 重复');

  const again = migrateCheckinsToVisits({ checkins, now: 7, idFn });
  if (again.visits.map(v => v.id).join('|') === r.visits.map(v => v.id).join('|')) ok('重复迁移 id 稳定');
  else fail('重复迁移 id 不稳定');
}

// 5) 城市时区表覆盖数据里的主要城市
{
  const expected = ['莫斯科', '圣彼得堡', '哈尔滨', '伊宁', '三亚', '阿拉木图'];
  const missing = expected.filter(c => !CITY_TIME_ZONES[c]);
  if (!missing.length) ok('主要城市时区表齐全');
  else fail('时区表缺：' + missing.join('、'));
}

if (bad) { console.error(`\n${bad} 项迁移测试失败`); process.exit(1); }
console.log('\n迁移测试通过');
