#!/usr/bin/env node
// Visit repository 质量门：IndexedDB 是唯一事实源，travel-checkin-v2 只是派生缓存
// 用法: node tools/test-visit-repository.mjs
import { CHECKIN_KEY } from '../src/modules/checkin.js';
import { createMemoryDriver, openTripStore, META_CHECKINS_BACKUP } from '../src/pages/trip/store.js';
import { createVisitRepository } from '../src/pages/visits/repository.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

let clock = Date.parse('2026-11-01T00:00:00Z');
const now = () => clock;

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

// 1) 旧缓存一次性迁入 IndexedDB；缓存随后只是投影
{
  const driver = createMemoryDriver();
  const store = await openTripStore({ driver, now });
  const storage = memoryStorage({
    [CHECKIN_KEY]: JSON.stringify({ p1: { n: 2, last: '2026-05-01', note: '好' } }),
  });
  const repo = await createVisitRepository({ store, storage, now });
  const state = repo.getCheckins();
  const visits = await store.listVisits({ placeId: 'p1' });
  const backup = await store.getMeta(META_CHECKINS_BACKUP);
  const cache = JSON.parse(storage.dump()[CHECKIN_KEY]);

  if (state.p1?.n === 2 && visits.length === 2 && cache.p1?.note === '好') ok('旧打卡迁入 Visit 并生成一致缓存投影');
  else fail('迁移投影错误：' + JSON.stringify({ state, visits, cache }));
  if (typeof backup === 'string' && JSON.parse(backup).p1.n === 2) ok('迁移前 localStorage 原文已备份');
  else fail('迁移原文备份缺失');
}

// 2) toggle / update 只通过 repository，多次打卡完整落 Visit
{
  const driver = createMemoryDriver();
  const store = await openTripStore({ driver, now });
  const storage = memoryStorage();
  const repo = await createVisitRepository({ store, storage, now });

  const added = await repo.toggle('p2');
  if (added && repo.getCheckins().p2?.n === 1 && repo.getCheckins().p2?.last === '2026-11-01') ok('首次打卡写入 Visit repository');
  else fail('首次打卡错误：' + JSON.stringify(repo.getCheckins()));

  await repo.update('p2', { n: 3, last: '2026-10-02', note: '第三次补记' });
  const visits = (await store.listVisits({ placeId: 'p2' })).sort((a, b) => a.countIndex - b.countIndex);
  const state = repo.getCheckins();
  if (visits.length === 3 && visits[2].date === '2026-10-02' && visits[2].note === '第三次补记'
    && visits[0].date === '' && state.p2?.n === 3) ok('更新次数/日期/感想：Visit 次数完整，缓存只是汇总');
  else fail('更新打卡错误：' + JSON.stringify({ visits, state }));

  const removed = await repo.toggle('p2');
  const archived = await store.listVisits({ placeId: 'p2', includeDeleted: true });
  if (!removed && !repo.getCheckins().p2
    && archived.length === 3 && archived.every(v => Number.isFinite(v.deletedAt))) {
    ok('取消打卡只做软删除：投影清零，3 条 Visit 全部留档');
  } else fail('取消打卡软删除错误：' + JSON.stringify({ state: repo.getCheckins(), archived }));

  // 5 分钟窗口内可撤销：一次误触只减一次，恢复后次数仍是 3
  const undo = await repo.undoDelete('p2');
  if (undo.ok && undo.restored === 3 && repo.getCheckins().p2?.n === 3
    && (await store.listVisits({ placeId: 'p2' })).length === 3) ok('撤销取消打卡：3 条 Visit 恢复，次数回到 3');
  else fail('撤销失败：' + JSON.stringify({ undo, state: repo.getCheckins() }));

  // 再取消一次 → 超过 5 分钟后不可撤销，但记录仍在（不物理删除）
  await repo.toggle('p2');
  clock += 6 * 60 * 1000;
  const expired = await repo.undoDelete('p2');
  const stillArchived = await store.listVisits({ placeId: 'p2', includeDeleted: true });
  if (!expired.ok && expired.reason === 'expired'
    && stillArchived.length === 3 && stillArchived.every(v => Number.isFinite(v.deletedAt))) {
    ok('超过 5 分钟不可撤销，历史记录仍留档');
  } else fail('撤销窗口失效逻辑错误：' + JSON.stringify({ expired, count: stillArchived.length }));
  // 备份不导出已取消的打卡（否则导出计数虚高，导入后还会"复活"）
  const backup = await store.exportAll();
  if (!backup.visits.some(v => v.placeId === 'p2')) ok('备份不含已取消（软删除）的打卡');
  else fail('备份仍包含软删除打卡：' + JSON.stringify(backup.visits.filter(v => v.placeId === 'p2')));
  clock = Date.parse('2026-11-01T00:00:00Z');
}

// 3) 两个页面实例共享同一事实源；BroadcastChannel 让另一页自动刷新
{
  const driver = createMemoryDriver();
  const storeA = await openTripStore({ driver, now });
  const storeB = await openTripStore({ driver, now });
  const repoA = await createVisitRepository({ store: storeA, storage: memoryStorage(), now });
  let notified = false;
  const repoB = await createVisitRepository({
    store: storeB,
    storage: memoryStorage(),
    now,
    onChange: () => { notified = true; },
  });

  await repoA.toggle('p3');
  await new Promise(resolve => setTimeout(resolve, 30));
  if (notified && repoB.getCheckins().p3?.n === 1) ok('另一页面经 BroadcastChannel 自动读到同一 Visit 事实源');
  else fail('跨实例同步失败：' + JSON.stringify({ notified, state: repoB.getCheckins() }));

  const exported = await storeA.exportAll();
  if (exported.visits.some(v => v.placeId === 'p3' && v.source === 'manual')) ok('exportAll 包含 repository 写入的 Visit');
  else fail('exportAll 缺少 Visit：' + JSON.stringify(exported.visits));
}

// 4) 打卡日期按本地日历日取（不是 UTC 日期）
{
  const store = await openTripStore({ driver: createMemoryDriver(), now });
  const repo = await createVisitRepository({
    store, storage: memoryStorage(), now, timeZone: 'Asia/Shanghai',
  });
  clock = Date.parse('2026-10-31T17:30:00Z'); // 上海 2026-11-01 01:30
  await repo.toggle('p4');
  const v = (await store.listVisits({ placeId: 'p4' }))[0];
  if (v && v.date === '2026-11-01' && repo.getCheckins().p4?.last === '2026-11-01') {
    ok('打卡日期按时区取日历日（UTC 会落到 10-31）');
  } else fail('打卡日期未按本地时区：' + JSON.stringify(v));
  clock = Date.parse('2026-11-01T00:00:00Z');
}

if (bad) { console.error(`\n${bad} 项 Visit repository 测试失败`); process.exit(1); }
console.log('\nVisit repository 测试通过');
