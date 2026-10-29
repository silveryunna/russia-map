#!/usr/bin/env node
// Trip v2 存储质量门（CI 强制）：revision、删除解绑、导入合并、迁移一次性 + 备份
// 用法: node tools/test-trip-store.mjs
import {
  META_CHECKINS_BACKUP, META_CHECKINS_MIGRATED, META_PLANS_BACKUP, META_PLANS_MIGRATED,
  createMemoryDriver, openTripStore,
} from '../src/pages/trip/store.js';
import { createDay, createItem, createTrip, createVisit } from '../src/pages/trip/schema.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

let clock = 1000;
const now = () => clock;

function makeTrip(id = 't1', title = '莫斯科 1 日') {
  const day = createDay({ id: `d_${id}`, index: 1, date: '2026-11-01' });
  day.items.push(createItem({ id: `i_${id}`, dayId: day.id, refId: 'p1', order: 0 }));
  const trip = createTrip({ id, title, startDate: '2026-11-01', days: 1 }, undefined, 1);
  trip.days = [day];
  return trip;
}

const points = [
  { id: 'p1', name: '红场' },
  { id: 'p2', name: '红场' },
  { id: 'p3', name: '圣瓦西里大教堂' },
];

// 1) 保存与 revision
{
  const store = await openTripStore({ driver: createMemoryDriver(), now });
  const badTrip = { ...makeTrip('bad'), title: '' };
  const r = await store.saveTrip(badTrip);
  if (!r.ok && r.errors.some(e => e.code === 'required')) ok('非法 Trip 拒绝入库并返回错误路径');
  else fail('非法 Trip 未拒绝：' + JSON.stringify(r));

  const s1 = await store.saveTrip(makeTrip('t1'));
  clock += 10;
  const s2 = await store.saveTrip(makeTrip('t1', '改名后'));
  if (s1.ok && s1.trip.revision === 1 && s2.ok && s2.trip.revision === 2) ok('revision 逐次递增');
  else fail('revision 错误：' + JSON.stringify([s1.trip?.revision, s2.trip?.revision]));

  const got = await store.getTrip('t1');
  if (got.title === '改名后' && got.updatedAt === clock && got.createdAt === 1) ok('更新覆盖标题且保留 createdAt');
  else fail('更新结果错误：' + JSON.stringify(got));
}

// 2) 列表排序
{
  const store = await openTripStore({ driver: createMemoryDriver(), now });
  await store.saveTrip(makeTrip('old'));
  clock += 100;
  await store.saveTrip(makeTrip('new'));
  const list = await store.listTrips();
  if (list.length === 2 && list[0].id === 'new') ok('listTrips 按 updatedAt 倒序');
  else fail('排序错误：' + JSON.stringify(list.map(t => t.id)));
}

// 3) 删除行程解绑 Visit（不删回忆）
{
  const store = await openTripStore({ driver: createMemoryDriver(), now });
  await store.saveTrip(makeTrip('t1'));
  await store.saveVisit(createVisit({ id: 'v1', placeId: 'p1', tripId: 't1' }));
  await store.saveVisit(createVisit({ id: 'v2', placeId: 'p1', tripId: null }));
  const r = await store.deleteTrip('t1');
  const visits = await store.listVisits();
  if (r.ok && r.detachedVisits === 1 && (await store.getTrip('t1')) === undefined) ok('删除行程：Visit 解绑保留，行程消失');
  else fail('删除行程错误：' + JSON.stringify(r));

  const v1 = visits.find(v => v.id === 'v1');
  if (v1 && v1.tripId === null && v1.detachedFromTripId === 't1' && visits.length === 2) ok('解绑记录来源 tripId，无 Visit 丢失');
  else fail('Visit 解绑结果错误：' + JSON.stringify(v1));
}

// 4) 导出 / 导入（merge）
{
  const store = await openTripStore({ driver: createMemoryDriver(), now });
  await store.saveTrip(makeTrip('t1'));
  await store.saveVisit(createVisit({ id: 'v1', placeId: 'p1', tripId: 't1' }));

  const exported = await store.exportAll();
  if (exported.trips.length === 1 && exported.visits.length === 1 && exported.schemaVersion === 2) ok('exportAll 结构完整');
  else fail('exportAll 错误：' + JSON.stringify(exported).slice(0, 120));

  const older = { ...makeTrip('t1', '旧版本'), revision: 1 };
  const newer = { ...makeTrip('t2', '新行程'), revision: 1 };
  const r = await store.importAll({
    trips: [older, newer],
    visits: [createVisit({ id: 'v1', placeId: 'p1' }), createVisit({ id: 'v2', placeId: 'p3' })],
  });
  const t1 = await store.getTrip('t1');
  if (r.ok && r.added === 1 && r.updated === 0 && r.skipped === 1 && r.visitsAdded === 1 && r.visitsSkipped === 1) ok('merge 导入：新增/跳过/去重计数正确');
  else fail('merge 导入计数错误：' + JSON.stringify(r));
  if (t1.title === '莫斯科 1 日' && (await store.getTrip('t2'))) ok('低 revision 不覆盖本地，新 id 正常写入');
  else fail('merge 覆盖策略错误：' + t1.title);

  const higher = { ...makeTrip('t1', '远端更新'), revision: 9 };
  const r2 = await store.importAll({ trips: [higher], visits: [] });
  if (r2.ok && r2.updated === 1 && (await store.getTrip('t1')).title === '远端更新') ok('高 revision 覆盖本地');
  else fail('高 revision 未覆盖：' + JSON.stringify(r2));

  const badPayload = await store.importAll({ trips: [{ id: 'x' }], visits: [] });
  if (!badPayload.ok && badPayload.error) ok('非法备份拒绝导入');
  else fail('非法备份未拒绝');

  const r3 = await store.importAll({ trips: [makeTrip('t3')], visits: [] }, { mode: 'replace' });
  if (r3.ok && (await store.listTrips()).length === 1 && (await store.getTrip('t1')) === undefined) ok('replace 模式清空后写入');
  else fail('replace 导入错误：' + JSON.stringify(r3));
}

// 5) 迁移：一次性、备份、歧义保留、幂等
{
  const plans = [{
    id: 'p9', name: '莫斯科 1 日', city: '莫斯科', date: '2026-11-01', source: 'rule',
    days: [{ day: 1, slots: { morning: ['红场'], afternoon: ['不存在点'], evening: [] }, tip: '' }],
  }];
  const checkins = { p3: { n: 2, last: '2026-05-01', note: '好' } };
  const store = await openTripStore({ driver: createMemoryDriver(), now });
  const r = await store.migrateLegacy({ plans, checkins, points });

  if (r.ran && r.plans.trips === 1 && r.checkins.visits === 2) ok('迁移写入 1 个 Trip + 2 个 Visit');
  else fail('迁移写入错误：' + JSON.stringify(r));

  if (r.ambiguities.length === 2) ok('歧义与未知名都进确认队列（同名 1 + 未知 1）');
  else fail('确认队列错误：' + JSON.stringify(r.ambiguities));

  const backup = await store.getMeta(META_PLANS_BACKUP);
  if (typeof backup === 'string' && JSON.parse(backup)[0].id === 'p9') ok('迁移前原始计划已备份');
  else fail('原始计划备份缺失');

  const ckBackup = await store.getMeta(META_CHECKINS_BACKUP);
  if (typeof ckBackup === 'string' && JSON.parse(ckBackup).p3.n === 2) ok('迁移前原始打卡已备份');
  else fail('原始打卡备份缺失');

  if (await store.getMeta(META_PLANS_MIGRATED) && await store.getMeta(META_CHECKINS_MIGRATED)) ok('迁移标记落库（后续不重复迁移）');
  else fail('迁移标记缺失');

  const before = (await store.listTrips()).length;
  const again = await store.migrateLegacy({ plans, checkins, points });
  if (!again.ran && (await store.listTrips()).length === before) ok('重复调用不再迁移（幂等）');
  else fail('迁移不幂等：' + JSON.stringify(again));

  const empty = await openTripStore({ driver: createMemoryDriver(), now });
  const none = await empty.migrateLegacy({ plans: [], checkins: {}, points });
  if (!none.ran) ok('空数据不写迁移标记');
  else fail('空数据误触发迁移');
}

if (bad) { console.error(`\n${bad} 项存储测试失败`); process.exit(1); }
console.log('\n存储测试通过');
