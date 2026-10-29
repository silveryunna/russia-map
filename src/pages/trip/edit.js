// Trip v2 编辑操作（纯函数，无 DOM / storage / fetch）
// 所有操作返回新对象，不改入参；结果必须能通过 validateTrip（测试逐条断言）。
// 零丢失原则：删天不删点位（转入相邻天），解绑歧义点位不删条目。

import {
  addDays, createDay, createItem, diffDays, isDateString,
} from './schema.js';

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

// startLocal / endLocal 约定：'' | 'HH:MM'（当天时刻）| 'YYYY-MM-DDTHH:MM'（绝对时刻）
export function splitStartLocal(value) {
  if (typeof value !== 'string') return { date: '', time: '' };
  const abs = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (abs && isDateString(abs[1])) return { date: abs[1], time: abs[2] };
  if (/^\d{2}:\d{2}$/.test(value)) return { date: '', time: value };
  return { date: '', time: '' };
}

export function joinLocal(date, time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return '';
  return isDateString(date) ? `${date}T${time}` : time;
}

// 结构归一：序号、dayId、order、固定日期行程的天日期与 endDate
export function normalizeTrip(trip) {
  const next = clone(trip);
  if (!Array.isArray(next.days)) next.days = [];
  const fixed = next.dateMode === 'fixed' && isDateString(next.startDate);
  next.days.forEach((day, di) => {
    day.index = di + 1;
    if (fixed) day.date = addDays(next.startDate, di);
    else day.date = '';
    if (!Array.isArray(day.items)) day.items = [];
    day.items.forEach((item, ii) => {
      item.order = ii;
      item.dayId = day.id;
    });
  });
  if (fixed) next.endDate = addDays(next.startDate, Math.max(0, next.days.length - 1));
  else next.endDate = '';
  return next;
}

export function updateTrip(trip, patch = {}) {
  const next = clone(trip);
  for (const k of ['title', 'status', 'notes', 'currency', 'homeTimeZone']) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  if (Array.isArray(patch.cities)) next.cities = patch.cities.filter(x => typeof x === 'string' && x);
  if (typeof next.title === 'string' && !next.title.trim()) next.title = trip.title;
  return normalizeTrip(next);
}

function findDay(trip, itemId) {
  for (const day of trip.days) {
    const idx = day.items.findIndex(it => it.id === itemId);
    if (idx >= 0) return { day, idx };
  }
  return null;
}

export function addPlaceToDay(trip, place, { dayIndex = 0, period = '', type = 'visit', duration = null } = {}, idFn) {
  if (!isObj(place) || typeof place.id !== 'string' || !place.id) return normalizeTrip(trip);
  const next = clone(trip);
  const day = next.days[dayIndex] || next.days[0];
  if (!day) return normalizeTrip(trip);
  const dup = day.items.find(it => it.refId === place.id);
  if (dup) return normalizeTrip(trip); // 同一天不重复加点，避免误触
  const item = createItem({
    dayId: day.id,
    type,
    refId: place.id,
    order: day.items.length,
    period,
    estimatedDuration: duration,
    placeNameSnapshot: typeof place.name === 'string' ? place.name : '',
  }, idFn);
  day.items.push(item);
  if (typeof place.city === 'string' && place.city && !next.cities.includes(place.city)) next.cities.push(place.city);
  return normalizeTrip(next);
}

export function addItem(trip, dayIndex, patch = {}, idFn) {
  const next = clone(trip);
  const day = next.days[dayIndex];
  if (!day) return normalizeTrip(trip);
  const item = createItem({ ...patch, dayId: day.id, order: day.items.length }, idFn);
  if (item.type === 'visit' && !item.refId) item.confirm = 'needs_confirm';
  day.items.push(item);
  return normalizeTrip(next);
}

export function removeItem(trip, itemId) {
  const next = clone(trip);
  for (const day of next.days) {
    const idx = day.items.findIndex(it => it.id === itemId);
    if (idx >= 0) { day.items.splice(idx, 1); break; }
  }
  return normalizeTrip(next);
}

export function moveItemWithinDay(trip, itemId, delta) {
  if (!Number.isInteger(delta) || !delta) return normalizeTrip(trip);
  const next = clone(trip);
  const hit = findDay(next, itemId);
  if (!hit) return normalizeTrip(next);
  const to = hit.idx + delta;
  if (to < 0 || to >= hit.day.items.length) return normalizeTrip(next);
  const [item] = hit.day.items.splice(hit.idx, 1);
  hit.day.items.splice(to, 0, item);
  return normalizeTrip(next);
}

export function moveItemToDay(trip, itemId, toDayIndex) {
  const next = clone(trip);
  const hit = findDay(next, itemId);
  const target = next.days[toDayIndex];
  if (!hit || !target || hit.day === target) return normalizeTrip(next);
  const [item] = hit.day.items.splice(hit.idx, 1);
  item.dayId = target.id;
  target.items.push(item);
  return normalizeTrip(next);
}

export function addDay(trip, { idFn, city = '' } = {}) {
  const next = clone(trip);
  const lastCity = next.days.length ? next.days[next.days.length - 1].city : '';
  next.days.push(createDay({ index: next.days.length + 1, city: city || lastCity || next.cities[0] || '' }, idFn));
  return normalizeTrip(next);
}

// 删天：至少保留一天；被删天的点位转入相邻天，绝不丢
export function removeDay(trip, dayIndex) {
  if (!Array.isArray(trip.days) || trip.days.length <= 1) return normalizeTrip(trip);
  const next = clone(trip);
  if (dayIndex < 0 || dayIndex >= next.days.length) return normalizeTrip(next);
  const [removed] = next.days.splice(dayIndex, 1);
  const target = next.days[dayIndex > 0 ? dayIndex - 1 : 0];
  if (removed && Array.isArray(removed.items)) {
    for (const item of removed.items) target.items.push({ ...item, dayId: target.id });
  }
  return normalizeTrip(next);
}

export function setDayNote(trip, dayIndex, note) {
  const next = clone(trip);
  const day = next.days[dayIndex];
  if (!day) return normalizeTrip(next);
  day.note = typeof note === 'string' ? note : '';
  return normalizeTrip(next);
}

export function bindItemPlace(trip, itemId, place) {
  const next = clone(trip);
  const hit = findDay(next, itemId);
  if (!hit) return normalizeTrip(next);
  const item = hit.day.items[hit.idx];
  if (!isObj(place) || typeof place.id !== 'string' || !place.id) {
    // 解绑：退回待确认，名称快照保留
    item.refId = null;
    item.confirm = 'needs_confirm';
    return normalizeTrip(next);
  }
  item.refId = place.id;
  item.confirm = 'ok';
  if (typeof place.name === 'string' && place.name) item.placeNameSnapshot = place.name;
  if (typeof place.city === 'string' && place.city && !next.cities.includes(place.city)) next.cities.push(place.city);
  return normalizeTrip(next);
}

// 行程改为固定日期（相对日期行程也走这里）
export function setDateMode(trip, mode, startDate) {
  const next = clone(trip);
  if (mode !== 'fixed') {
    next.dateMode = 'relative';
    next.startDate = '';
    next.endDate = '';
    return normalizeTrip(next);
  }
  if (!isDateString(startDate)) return normalizeTrip(trip);
  next.dateMode = 'fixed';
  next.startDate = startDate;
  return normalizeTrip(next);
}

// 改出发日期：shift_all=整体平移（含绝对时刻的预订）；keep_bookings=日期平移但已订项目保留原时刻
export function shiftTripStart(trip, newStart, { policy = 'shift_all' } = {}) {
  const report = { ok: false, policy, movedDays: 0, pinned: [], conflicts: [] };
  if (!isDateString(newStart)) return { ...report, trip: normalizeTrip(trip), error: '出发日期非法' };
  if (trip.dateMode !== 'fixed' || !isDateString(trip.startDate)) return { ...report, trip: normalizeTrip(trip), error: '只有固定日期行程才能改期' };

  const delta = diffDays(trip.startDate, newStart);
  if (!Number.isFinite(delta) || delta === 0) return { ...report, trip: normalizeTrip(trip), ok: true };

  const next = clone(trip);
  next.days.forEach(day => {
    for (const item of day.items) {
      const s = splitStartLocal(item.startLocal);
      const e = splitStartLocal(item.endLocal);
      const hasAbs = !!s.date || !!e.date;
      if (!hasAbs) continue;
      const pin = policy === 'keep_bookings' && item.flexibility === 'fixed';
      if (pin) {
        report.pinned.push({ itemId: item.id, name: item.placeNameSnapshot || '', date: s.date || e.date });
        continue;
      }
      if (s.date) item.startLocal = joinLocal(addDays(s.date, delta), s.time);
      if (e.date) item.endLocal = joinLocal(addDays(e.date, delta), e.time);
    }
  });
  next.startDate = newStart;
  const normalized = normalizeTrip(next);

  for (const day of normalized.days) {
    for (const item of day.items) {
      const s = splitStartLocal(item.startLocal);
      const e = splitStartLocal(item.endLocal);
      const pinnedDate = s.date || e.date;
      if (pinnedDate && pinnedDate !== day.date) {
        report.conflicts.push({ itemId: item.id, name: item.placeNameSnapshot || '', itemDate: pinnedDate, dayDate: day.date, dayIndex: day.index });
      }
    }
  }
  report.ok = true;
  report.movedDays = delta;
  return { ...report, trip: normalized };
}

// 预订日与所在天日期不一致（改期后保留预订的结果，界面必须提示）
export function itemDateConflicts(trip) {
  const out = [];
  for (const day of Array.isArray(trip.days) ? trip.days : []) {
    for (const item of Array.isArray(day.items) ? day.items : []) {
      const s = splitStartLocal(item.startLocal);
      const e = splitStartLocal(item.endLocal);
      const pinned = s.date || e.date;
      if (pinned && day.date && pinned !== day.date) {
        out.push({ itemId: item.id, itemDate: pinned, dayDate: day.date, dayIndex: day.index });
      }
    }
  }
  return out;
}

export function countNeedsConfirm(trip) {
  let n = 0;
  for (const day of Array.isArray(trip.days) ? trip.days : []) {
    for (const item of Array.isArray(day.items) ? day.items : []) {
      if (item.confirm === 'needs_confirm') n += 1;
    }
  }
  return n;
}

// 复制为新行程：全新 id、revision 归 1，点位引用保留
export function duplicateTrip(trip, { idFn, now = Date.now() } = {}) {
  const next = clone(trip);
  const newId = idFn ? idFn('t') : `t_copy_${now.toString(36)}`;
  next.id = newId;
  next.title = `${trip.title || '未命名行程'}（副本）`;
  next.revision = 1;
  next.createdAt = now;
  next.updatedAt = now;
  next.origin = { source: 'copy', fromTripId: trip.id, copiedAt: now };
  next.days = (Array.isArray(trip.days) ? trip.days : []).map((day, di) => {
    const nd = createDay({ ...day, id: idFn ? idFn('d') : `${newId}_d${di + 1}`, index: di + 1 }, idFn);
    nd.items = (Array.isArray(day.items) ? day.items : []).map((item, ii) => createItem({
      ...item,
      id: idFn ? idFn('i') : `${newId}_i${di + 1}_${ii + 1}`,
      dayId: nd.id,
      order: ii,
    }, idFn));
    return nd;
  });
  return normalizeTrip(next);
}
