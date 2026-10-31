// Visit repository：Trip/打卡事实的唯一写入入口。
// IndexedDB(travel-trips.visits) 是事实源；travel-checkin-v2 只是给旧 UI 读取的派生缓存。

import { CHECKIN_KEY, LEGACY_CHECKIN_KEY } from '../../modules/checkin.js';
import { createIdbDriver, createMemoryDriver, openTripStore } from '../trip/store.js';
import { createVisit, isDateString } from '../trip/schema.js';

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const clampCount = n => Math.max(1, Math.min(99, Number(n) || 1));

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readCache(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CHECKIN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
    const legacyRaw = storage.getItem(LEGACY_CHECKIN_KEY);
    if (legacyRaw) {
      const arr = JSON.parse(legacyRaw) || [];
      const out = {};
      for (const id of Array.isArray(arr) ? arr : []) if (id) out[id] = { n: 1, last: '' };
      return out;
    }
  } catch { /* 缓存损坏时以 IndexedDB 为准 */ }
  return {};
}

function writeCache(storage, value) {
  if (!storage) return;
  try { storage.setItem(CHECKIN_KEY, JSON.stringify(value)); } catch { /* 缓存不可写不影响事实源 */ }
}

export function projectVisits(visits) {
  const byPlace = new Map();
  for (const visit of Array.isArray(visits) ? visits : []) {
    if (!visit || typeof visit.placeId !== 'string' || !visit.placeId) continue;
    if (!byPlace.has(visit.placeId)) byPlace.set(visit.placeId, []);
    byPlace.get(visit.placeId).push(visit);
  }
  const out = {};
  for (const [placeId, list] of byPlace) {
    list.sort((a, b) => (a.countIndex || 0) - (b.countIndex || 0) || (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
    const n = Math.max(...list.map(v => Number.isInteger(v.countIndex) && v.countIndex > 0 ? v.countIndex : 1), list.length);
    const dated = [...list].reverse().find(v => isDateString(v.date));
    const noted = [...list].reverse().find(v => typeof v.note === 'string' && v.note);
    out[placeId] = { n, last: dated ? dated.date : '', note: noted ? noted.note : '' };
  }
  return out;
}

function buildVisits(placeId, info, existing, now, idFn) {
  const count = clampCount(info.n);
  const date = isDateString(info.last) ? info.last : '';
  const note = typeof info.note === 'string' ? info.note.slice(0, 500) : '';
  const old = new Map((Array.isArray(existing) ? existing : []).map(v => [v.countIndex, v]));
  const visits = [];
  for (let index = 1; index <= count; index += 1) {
    const prev = old.get(index);
    const isLast = index === count;
    visits.push(createVisit({
      id: prev?.id || `v_${placeId}_${index}`,
      placeId,
      tripId: prev?.tripId || null,
      plannedItemId: prev?.plannedItemId || null,
      date: isLast ? date : '',
      dateSource: isLast && date ? (prev?.dateSource && prev.dateSource !== 'unknown' ? prev.dateSource : 'manual') : 'unknown',
      note: isLast ? note : '',
      countIndex: index,
      source: prev?.source || 'manual',
      createdAt: Number.isFinite(prev?.createdAt) ? prev.createdAt : now(),
    }, idFn, now()));
  }
  return visits;
}

export async function createVisitRepository({ store, storage = defaultStorage(), now = () => Date.now(), idFn, onChange } = {}) {
  if (!store) throw new Error('createVisitRepository 需要 Trip store');
  let cache = {};
  const listeners = new Set();
  if (typeof onChange === 'function') listeners.add(onChange);
  const emit = () => {
    const state = getCheckins();
    for (const listener of listeners) {
      try { listener(state); } catch { /* 页面渲染异常不影响 repository */ }
    }
  };

  async function refresh() {
    cache = projectVisits(await store.listVisits());
    writeCache(storage, cache);
    emit();
    return getCheckins();
  }

  if (typeof store.subscribe === 'function') {
    store.subscribe((change) => {
      if (!change || change.origin === store.clientId) return;
      if (change.area === 'visits' || change.area === 'import' || change.area === 'migration') refresh();
    });
  }

  async function initialize() {
    const existing = await store.listVisits();
    const legacy = readCache(storage);
    if (!existing.length && Object.keys(legacy).length) {
      await store.migrateLegacy({ plans: [], checkins: legacy, points: [] });
    }
    return refresh();
  }

  function getCheckins() {
    return clone(cache) || {};
  }

  async function toggle(placeId) {
    if (!placeId) return false;
    if (cache[placeId]) {
      await store.deleteVisitsByPlace(placeId);
      await refresh();
      return false;
    }
    const visits = buildVisits(placeId, { n: 1, last: new Date(now()).toISOString().slice(0, 10), note: '' }, [], now, idFn);
    const result = await store.replaceVisitsForPlace(placeId, visits);
    if (!result.ok) throw new Error(result.errors?.[0]?.message || '打卡写入失败');
    await refresh();
    return true;
  }

  async function update(placeId, info = {}) {
    if (!placeId) return getCheckins();
    const current = cache[placeId] || { n: 1, last: '', note: '' };
    const next = {
      n: info.n !== undefined ? info.n : current.n,
      last: info.last !== undefined ? info.last : current.last,
      note: info.note !== undefined ? info.note : current.note,
    };
    const existing = await store.listVisits({ placeId });
    const visits = buildVisits(placeId, next, existing, now, idFn);
    const result = await store.replaceVisitsForPlace(placeId, visits);
    if (!result.ok) throw new Error(result.errors?.[0]?.message || '打卡更新失败');
    return refresh();
  }

  await initialize();
  return {
    getCheckins,
    refresh,
    toggle,
    update,
    store,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export async function openVisitRepository({ now = () => Date.now(), idFn, storage = defaultStorage(), onChange } = {}) {
  let store;
  try {
    store = await openTripStore({ driver: createIdbDriver(), now, idFn });
    await store.getMeta('__probe');
  } catch {
    store = await openTripStore({ driver: createMemoryDriver(), now, idFn });
  }
  return createVisitRepository({ store, storage, now, idFn, onChange });
}
