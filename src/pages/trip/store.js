// Trip v2 本地存储：IndexedDB（浏览器）/ 内存驱动（测试）
// 纯逻辑与驱动分离：修订号、导入合并、迁移一次性都由这里保证，驱动只管读写。
// 数据保留原则：删行程不删 Visit（解绑 tripId 留档），导入冲突保留高 revision。

import { TRIP_SCHEMA_VERSION, validateTrip, validateVisit } from './schema.js';
import { migrateCheckinsToVisits, migratePlansV1 } from './migrate.js';

export const TRIP_DB_NAME = 'travel-trips';
export const TRIP_DB_VERSION = 1;
export const TRIP_STORES = ['trips', 'visits', 'meta'];
export const META_PLANS_MIGRATED = 'migrate:travel-plans-v1';
export const META_CHECKINS_MIGRATED = 'migrate:travel-checkin-v2';
export const META_PLANS_BACKUP = 'backup:travel-plans-v1';
export const META_CHECKINS_BACKUP = 'backup:travel-checkin-v2';
export const META_MIGRATION_REPORT = 'migration:report';

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const keyOf = (store, rec) => (store === 'meta' ? rec.k : rec.id);

export function createMemoryDriver(seed = {}) {
  const data = { trips: new Map(), visits: new Map(), meta: new Map() };
  for (const store of TRIP_STORES) {
    for (const rec of Array.isArray(seed[store]) ? seed[store] : []) {
      if (rec && keyOf(store, rec)) data[store].set(keyOf(store, rec), clone(rec));
    }
  }
  return {
    async get(store, key) { return clone(data[store].get(key)); },
    async put(store, rec) { data[store].set(keyOf(store, rec), clone(rec)); },
    async delete(store, key) { data[store].delete(key); },
    async getAll(store) { return [...data[store].values()].map(clone); },
    async clear(store) { data[store].clear(); },
  };
}

export function createIdbDriver(factory = globalThis.indexedDB, dbName = TRIP_DB_NAME) {
  let opening = null;
  const open = () => {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('当前环境没有 IndexedDB')); return; }
      const req = factory.open(dbName, TRIP_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of TRIP_STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === 'meta' ? 'k' : 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
      req.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用，请关闭后重试'));
    });
    return opening;
  };
  const run = (store, mode, fn) => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let req;
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error || new Error('IndexedDB 事务失败'));
    t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止'));
    try { req = fn(t.objectStore(store)); } catch (err) { try { t.abort(); } catch { /* 已中止 */ } reject(err); }
  }));
  return {
    get: (store, key) => run(store, 'readonly', s => s.get(key)),
    put: (store, rec) => run(store, 'readwrite', s => s.put(rec)),
    delete: (store, key) => run(store, 'readwrite', s => s.delete(key)),
    getAll: (store) => run(store, 'readonly', s => s.getAll()).then(list => list || []),
    clear: (store) => run(store, 'readwrite', s => s.clear()),
  };
}

export async function openTripStore({ driver = createMemoryDriver(), now = () => Date.now(), idFn } = {}) {
  const getMeta = (k) => driver.get('meta', k).then(r => (r ? r.v : null));
  const setMeta = (k, v, at = now()) => driver.put('meta', { k, v, updatedAt: at });

  async function listTrips() {
    const trips = await driver.getAll('trips');
    return trips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  async function getTrip(id) {
    return driver.get('trips', id);
  }

  async function saveTrip(trip) {
    const incoming = clone(trip);
    const existing = await getTrip(incoming.id);
    incoming.schemaVersion = TRIP_SCHEMA_VERSION;
    incoming.revision = existing ? existing.revision + 1 : 1;
    incoming.updatedAt = now();
    if (!Number.isFinite(incoming.createdAt)) incoming.createdAt = incoming.updatedAt;
    const check = validateTrip(incoming);
    if (!check.ok) return { ok: false, errors: check.errors };
    await driver.put('trips', incoming);
    return { ok: true, trip: incoming };
  }

  async function deleteTrip(id) {
    if (!id) return { ok: false, detachedVisits: 0 };
    const visits = await driver.getAll('visits');
    let detached = 0;
    for (const v of visits) {
      if (v.tripId === id) {
        await driver.put('visits', { ...v, tripId: null, detachedFromTripId: id });
        detached += 1;
      }
    }
    await driver.delete('trips', id);
    return { ok: true, detachedVisits: detached };
  }

  async function listVisits(filter = {}) {
    const visits = await driver.getAll('visits');
    return visits.filter(v =>
      (filter.tripId === undefined || v.tripId === filter.tripId)
      && (filter.placeId === undefined || v.placeId === filter.placeId));
  }

  async function saveVisit(visit) {
    const incoming = clone(visit);
    const check = validateVisit(incoming);
    if (!check.ok) return { ok: false, errors: check.errors };
    await driver.put('visits', incoming);
    return { ok: true, visit: incoming };
  }

  async function exportAll() {
    return {
      schemaVersion: TRIP_SCHEMA_VERSION,
      exportedAt: now(),
      trips: await driver.getAll('trips'),
      visits: await driver.getAll('visits'),
    };
  }

  // mode=merge：同 id 保留 revision 更高的一方；mode=replace：先清空再写入
  async function importAll(payload, { mode = 'merge' } = {}) {
    const trips = Array.isArray(payload && payload.trips) ? payload.trips : null;
    const visits = Array.isArray(payload && payload.visits) ? payload.visits : null;
    if (!trips || !visits) return { ok: false, error: '备份文件缺少 trips/visits 数组' };

    const badTrips = trips.map(validateTrip).filter(r => !r.ok);
    const badVisits = visits.map(validateVisit).filter(r => !r.ok);
    if (badTrips.length || badVisits.length) {
      return { ok: false, error: '备份数据未通过校验', tripErrors: badTrips.map(r => r.errors), visitErrors: badVisits.map(r => r.errors) };
    }
    if (mode === 'replace') {
      await driver.clear('trips');
      await driver.clear('visits');
      for (const t of trips) await driver.put('trips', t);
      for (const v of visits) await driver.put('visits', v);
      return { ok: true, added: trips.length, updated: 0, skipped: 0, visitsAdded: visits.length };
    }

    let added = 0; let updated = 0; let skipped = 0; let visitsAdded = 0; let visitsSkipped = 0;
    for (const t of trips) {
      const cur = await getTrip(t.id);
      if (!cur) { await driver.put('trips', t); added += 1; }
      else if ((t.revision || 0) > (cur.revision || 0)) { await driver.put('trips', t); updated += 1; }
      else skipped += 1;
    }
    for (const v of visits) {
      const cur = await driver.get('visits', v.id);
      if (!cur) { await driver.put('visits', v); visitsAdded += 1; }
      else visitsSkipped += 1;
    }
    return { ok: true, added, updated, skipped, visitsAdded, visitsSkipped };
  }

  // 一次性迁移：先备份原始数据 → 全量校验 → 全部通过才落库（失败零写入，可重试）
  async function migrateLegacy({ plans, checkins, points } = {}) {
    const report = { ran: false, reasons: [], plans: null, checkins: null, ambiguities: [], issues: [] };
    const plansKey = await getMeta(META_PLANS_MIGRATED);
    const checkinsKey = await getMeta(META_CHECKINS_MIGRATED);
    const doPlans = !plansKey && Array.isArray(plans) && plans.length > 0;
    const doCheckins = !checkinsKey && checkins && typeof checkins === 'object' && Object.keys(checkins).length > 0;
    if (!doPlans && !doCheckins) return { ...report, ran: false };

    let planResult = null;
    let visitResult = null;
    if (doPlans) {
      planResult = migratePlansV1({ plans, points, idFn, now: now() });
      const bad = planResult.trips.map(validateTrip).filter(r => !r.ok);
      if (bad.length) {
        report.reasons.push('计划迁移结果未通过校验，已放弃写入（原数据未改动）');
        report.issues = bad.map(r => r.errors);
        return report;
      }
    }
    if (doCheckins) {
      visitResult = migrateCheckinsToVisits({ checkins, now: now() });
      const bad = visitResult.visits.map(validateVisit).filter(r => !r.ok);
      if (bad.length) {
        report.reasons.push('打卡迁移结果未通过校验，已放弃写入（原数据未改动）');
        report.issues = bad.map(r => r.errors);
        return report;
      }
    }

    if (doPlans) await setMeta(META_PLANS_BACKUP, JSON.stringify(plans));
    if (doCheckins) await setMeta(META_CHECKINS_BACKUP, JSON.stringify(checkins));
    if (planResult) {
      for (const t of planResult.trips) await driver.put('trips', t);
      await setMeta(META_PLANS_MIGRATED, { at: now(), stats: planResult.stats });
      report.plans = planResult.stats;
      report.ambiguities = planResult.ambiguities;
      report.issues = planResult.issues;
    }
    if (visitResult) {
      for (const v of visitResult.visits) await driver.put('visits', v);
      await setMeta(META_CHECKINS_MIGRATED, { at: now(), stats: visitResult.stats });
      report.checkins = visitResult.stats;
    }
    await setMeta(META_MIGRATION_REPORT, {
      at: now(),
      plans: report.plans,
      checkins: report.checkins,
      ambiguityCount: report.ambiguities.length,
      ambiguities: report.ambiguities.slice(0, 300),
    });
    return { ...report, ran: true };
  }

  return {
    driver,
    listTrips,
    getTrip,
    saveTrip,
    deleteTrip,
    listVisits,
    saveVisit,
    exportAll,
    importAll,
    migrateLegacy,
    getMeta,
    setMeta,
  };
}
