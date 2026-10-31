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
    async transact(stores, mode, fn) {
      const names = Array.isArray(stores) ? stores : [stores];
      const backups = new Map(names.map(name => [name, new Map([...data[name]].map(([k, v]) => [k, clone(v)]))]));
      const tx = {
        get: (store, key) => this.get(store, key),
        put: (store, rec) => this.put(store, rec),
        delete: (store, key) => this.delete(store, key),
        getAll: (store) => this.getAll(store),
        clear: (store) => this.clear(store),
      };
      try {
        return await fn(tx);
      } catch (err) {
        for (const [name, backup] of backups) {
          data[name].clear();
          for (const [k, v] of backup) data[name].set(k, clone(v));
        }
        throw err;
      }
    },
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
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 请求失败'));
  });
  const transact = (stores, mode, fn) => open().then(db => new Promise((resolve, reject) => {
    const names = Array.isArray(stores) ? stores : [stores];
    const t = db.transaction(names, mode);
    const api = {
      get: (store, key) => request(t.objectStore(store).get(key)),
      put: (store, rec) => request(t.objectStore(store).put(rec)),
      delete: (store, key) => request(t.objectStore(store).delete(key)),
      getAll: (store) => request(t.objectStore(store).getAll()).then(list => list || []),
      clear: (store) => request(t.objectStore(store).clear()),
    };
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('IndexedDB 事务失败'));
    t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止'));
    try {
      Promise.resolve(fn(api)).then(value => { result = value; }, err => {
        try { t.abort(); } catch { /* 已中止 */ }
        reject(err);
      });
    } catch (err) {
      try { t.abort(); } catch { /* 已中止 */ }
      reject(err);
    }
  }));
  return {
    lockName: `${TRIP_DB_NAME}:write:${dbName}`,
    get: (store, key) => run(store, 'readonly', s => s.get(key)),
    put: (store, rec) => run(store, 'readwrite', s => s.put(rec)),
    delete: (store, key) => run(store, 'readwrite', s => s.delete(key)),
    getAll: (store) => run(store, 'readonly', s => s.getAll()).then(list => list || []),
    clear: (store) => run(store, 'readwrite', s => s.clear()),
    transact,
  };
}

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const comparableTrip = (trip) => {
  const copy = clone(trip) || {};
  delete copy.revision;
  delete copy.updatedAt;
  return copy;
};

const revisionConflict = (current) => ({
  ok: false,
  code: 'revision-conflict',
  errors: [{ path: 'revision', code: 'revision-conflict', message: '行程已在其它标签页更新，请刷新后再改' }],
  current,
});

let storeClientSeq = 0;
function defaultIdSafe() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  storeClientSeq += 1;
  return `client_${Date.now().toString(36)}_${storeClientSeq}`;
}

async function withNavigatorLock(name, fn) {
  const locks = globalThis.navigator && globalThis.navigator.locks;
  if (!locks || typeof locks.request !== 'function') return fn();
  return locks.request(name, fn);
}

export async function openTripStore({ driver = createMemoryDriver(), now = () => Date.now(), idFn } = {}) {
  let writeQueue = Promise.resolve();
  const clientId = defaultIdSafe();
  const lockName = driver.lockName || 'travel-trips:write';
  const listeners = new Set();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${lockName}:changes`) : null;
  if (channel && typeof channel.unref === 'function') channel.unref();
  const emitLocal = (change) => {
    for (const listener of listeners) {
      try { listener(change); } catch { /* 页面监听器异常不影响存储 */ }
    }
  };
  if (channel) {
    channel.onmessage = (event) => {
      const change = event && event.data;
      if (change && change.origin !== clientId) emitLocal(change);
    };
  }
  const notify = (area, detail = {}) => {
    const change = { area, detail, origin: clientId, at: now() };
    emitLocal(change);
    try { channel && channel.postMessage(change); } catch { /* 跨标签页通知失败不影响本地写入 */ }
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const enqueueWrite = (fn) => {
    const task = writeQueue.then(() => withNavigatorLock(lockName, fn));
    writeQueue = task.catch(() => {});
    return task;
  };
  const transact = (stores, fn) => driver.transact(stores, 'readwrite', fn);
  const getMeta = (k) => driver.get('meta', k).then(r => (r ? r.v : null));
  const setMeta = (k, v, at = now()) => enqueueWrite(async () => {
    const result = await driver.put('meta', { k, v, updatedAt: at });
    notify('meta', { key: k });
    return result;
  });

  async function listTrips() {
    const trips = await driver.getAll('trips');
    return trips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  async function getTrip(id) {
    return driver.get('trips', id);
  }

  async function saveTrip(trip) {
    const incoming = clone(trip);
    incoming.schemaVersion = TRIP_SCHEMA_VERSION;
    return enqueueWrite(() => transact(['trips'], async (tx) => {
      const existing = await tx.get('trips', incoming.id);
      if (existing) {
        if (incoming.revision !== existing.revision) return revisionConflict(existing);
        incoming.revision = existing.revision + 1;
        incoming.createdAt = Number.isFinite(existing.createdAt) ? existing.createdAt : now();
      } else {
        if (incoming.revision !== 1) return revisionConflict(null);
        incoming.revision = 1;
        if (!Number.isFinite(incoming.createdAt)) incoming.createdAt = now();
      }
      incoming.updatedAt = now();
      const check = validateTrip(incoming);
      if (!check.ok) return { ok: false, errors: check.errors };
      await tx.put('trips', incoming);
      notify('trips', { id: incoming.id, revision: incoming.revision });
      return { ok: true, trip: incoming };
    }));
  }

  async function deleteTrip(id) {
    if (!id) return { ok: false, detachedVisits: 0 };
    return enqueueWrite(() => transact(['trips', 'visits'], async (tx) => {
      const visits = await tx.getAll('visits');
      let detached = 0;
      for (const v of visits) {
        if (v.tripId === id) {
          await tx.put('visits', { ...v, tripId: null, detachedFromTripId: id });
          detached += 1;
        }
      }
      await tx.delete('trips', id);
      notify('trips', { id, deleted: true, detachedVisits: detached });
      return { ok: true, detachedVisits: detached };
    }));
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
    return enqueueWrite(async () => {
      await driver.put('visits', incoming);
      notify('visits', { id: incoming.id, placeId: incoming.placeId });
      return { ok: true, visit: incoming };
    });
  }

  async function deleteVisitsByPlace(placeId) {
    if (!placeId) return { ok: false, removed: 0 };
    return enqueueWrite(() => transact(['visits'], async (tx) => {
      const visits = await tx.getAll('visits');
      let removed = 0;
      for (const visit of visits) {
        if (visit.placeId === placeId) {
          await tx.delete('visits', visit.id);
          removed += 1;
        }
      }
      notify('visits', { placeId, removed });
      return { ok: true, removed };
    }));
  }

  async function replaceVisitsForPlace(placeId, visits) {
    if (!placeId || !Array.isArray(visits)) return { ok: false, errors: [{ path: 'placeId', code: 'required', message: '缺少 placeId 或 visits 数组' }] };
    const incoming = visits.map(clone);
    const errors = incoming.flatMap((visit, index) => {
      const check = validateVisit(visit);
      return check.ok ? [] : check.errors.map(error => ({ ...error, path: `visits[${index}].${error.path}` }));
    });
    if (incoming.some(visit => visit.placeId !== placeId)) {
      errors.push({ path: 'visits', code: 'ref', message: 'visits 中存在不属于该 placeId 的记录' });
    }
    if (errors.length) return { ok: false, errors };
    return enqueueWrite(() => transact(['visits'], async (tx) => {
      const existing = await tx.getAll('visits');
      for (const visit of existing) {
        if (visit.placeId === placeId) await tx.delete('visits', visit.id);
      }
      for (const visit of incoming) await tx.put('visits', visit);
      notify('visits', { placeId, count: incoming.length });
      return { ok: true, visits: incoming, replaced: existing.filter(visit => visit.placeId === placeId).length };
    }));
  }

  async function exportAll() {
    return {
      schemaVersion: TRIP_SCHEMA_VERSION,
      exportedAt: now(),
      trips: await driver.getAll('trips'),
      visits: await driver.getAll('visits'),
    };
  }

  // mode=merge：同 id 保留 revision 更高的一方；同 revision 异文显式冲突。replace/merge 都在一个事务内完成。
  async function importAll(payload, { mode = 'merge' } = {}) {
    const trips = Array.isArray(payload && payload.trips) ? payload.trips : null;
    const visits = Array.isArray(payload && payload.visits) ? payload.visits : null;
    if (!trips || !visits) return { ok: false, error: '备份文件缺少 trips/visits 数组' };

    const badTrips = trips.map(validateTrip).filter(r => !r.ok);
    const badVisits = visits.map(validateVisit).filter(r => !r.ok);
    if (badTrips.length || badVisits.length) {
      return { ok: false, error: '备份数据未通过校验', tripErrors: badTrips.map(r => r.errors), visitErrors: badVisits.map(r => r.errors) };
    }

    try {
      return await enqueueWrite(() => transact(['trips', 'visits'], async (tx) => {
        if (mode === 'replace') {
          await tx.clear('trips');
          await tx.clear('visits');
          for (const t of trips) await tx.put('trips', t);
          for (const v of visits) await tx.put('visits', v);
          notify('import', { mode: 'replace', trips: trips.length, visits: visits.length });
          return {
            ok: true, added: trips.length, updated: 0, skipped: 0,
            conflicts: 0, conflictItems: [], visitsAdded: visits.length, visitsSkipped: 0, visitConflicts: 0, visitConflictItems: [],
          };
        }

        let added = 0; let updated = 0; let skipped = 0; let conflicts = 0;
        let visitsAdded = 0; let visitsSkipped = 0; let visitConflicts = 0;
        const conflictItems = [];
        const visitConflictItems = [];
        for (const t of trips) {
          const cur = await tx.get('trips', t.id);
          if (!cur) { await tx.put('trips', t); added += 1; }
          else if ((t.revision || 0) > (cur.revision || 0)) { await tx.put('trips', t); updated += 1; }
          else if ((t.revision || 0) < (cur.revision || 0)) skipped += 1;
          else if (stableStringify(comparableTrip(t)) === stableStringify(comparableTrip(cur))) skipped += 1;
          else {
            conflicts += 1;
            conflictItems.push({ id: t.id, localRevision: cur.revision || 0, remoteRevision: t.revision || 0 });
          }
        }
        for (const v of visits) {
          const cur = await tx.get('visits', v.id);
          if (!cur) { await tx.put('visits', v); visitsAdded += 1; }
          else if (stableStringify(v) === stableStringify(cur)) visitsSkipped += 1;
          else {
            visitConflicts += 1;
            visitConflictItems.push({ id: v.id });
          }
        }
        notify('import', { mode: 'merge', added, updated, skipped, conflicts, visitsAdded, visitsSkipped, visitConflicts });
        return { ok: true, added, updated, skipped, conflicts, conflictItems, visitsAdded, visitsSkipped, visitConflicts, visitConflictItems };
      }));
    } catch (err) {
      return { ok: false, error: `导入失败，已回滚：${err && err.message ? err.message : '未知错误'}` };
    }
  }

  // 一次性迁移：先备份原始数据 → 全量校验 → 全部通过才在同一个事务落库（失败零写入，可重试）
  async function migrateLegacy({ plans, checkins, points } = {}) {
    return enqueueWrite(() => transact(TRIP_STORES, async (tx) => {
      const report = { ran: false, reasons: [], plans: null, checkins: null, ambiguities: [], issues: [] };
      const plansMeta = await tx.get('meta', META_PLANS_MIGRATED);
      const checkinsMeta = await tx.get('meta', META_CHECKINS_MIGRATED);
      const plansKey = plansMeta ? plansMeta.v : null;
      const checkinsKey = checkinsMeta ? checkinsMeta.v : null;
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

      const putMeta = (k, v) => tx.put('meta', { k, v, updatedAt: now() });
      if (doPlans) await putMeta(META_PLANS_BACKUP, JSON.stringify(plans));
      if (doCheckins) await putMeta(META_CHECKINS_BACKUP, JSON.stringify(checkins));
      if (planResult) {
        for (const t of planResult.trips) await tx.put('trips', t);
        await putMeta(META_PLANS_MIGRATED, { at: now(), stats: planResult.stats });
        report.plans = planResult.stats;
        report.ambiguities = planResult.ambiguities;
        report.issues = planResult.issues;
      }
      if (visitResult) {
        for (const v of visitResult.visits) await tx.put('visits', v);
        await putMeta(META_CHECKINS_MIGRATED, { at: now(), stats: visitResult.stats });
        report.checkins = visitResult.stats;
      }
      await putMeta(META_MIGRATION_REPORT, {
        at: now(),
        plans: report.plans,
        checkins: report.checkins,
        ambiguityCount: report.ambiguities.length,
        ambiguities: report.ambiguities.slice(0, 300),
      });
      notify('migration', { plans: !!(planResult), checkins: !!(visitResult) });
      return { ...report, ran: true };
    }));
  }

  return {
    driver,
    clientId,
    subscribe,
    listTrips,
    getTrip,
    saveTrip,
    deleteTrip,
    listVisits,
    saveVisit,
    deleteVisitsByPlace,
    replaceVisitsForPlace,
    exportAll,
    importAll,
    migrateLegacy,
    getMeta,
    setMeta,
  };
}
