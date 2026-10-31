// M1 行中执行（纯函数，无 DOM / storage / fetch）
// Today 视图与"到达/完成/跳过"的领域逻辑：只产出新 Trip / Visit / ChangeEvent / TransitLeg，
// 落库由调用方（页面）经 Trip store 完成，便于测试与撤销。

import { createChangeEvent, createTransitLeg, createVisit, isDateString } from './schema.js';
import { evaluateDay } from '../plan/feasibility.js';

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function dayItems(day) {
  return (Array.isArray(day?.items) ? day.items : []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function findItem(trip, itemId) {
  for (let di = 0; di < (trip?.days || []).length; di += 1) {
    const day = trip.days[di];
    const item = dayItems(day).find(it => it.id === itemId);
    if (item) return { day, dayIndex: di, item };
  }
  return null;
}

// 固定日期行程：找到 dateStr 对应的那天；相对日期/无匹配返回 null
export function findTodayDay(trip, dateStr) {
  if (!trip || !isDateString(dateStr)) return null;
  for (let di = 0; di < (trip.days || []).length; di += 1) {
    if (trip.days[di].date === dateStr) return { day: trip.days[di], dayIndex: di };
  }
  return null;
}

// 现场兜底：今天没排到就返回最近的一天（行程前=第一天，行程后=最后一天，行程中=下一个未来日）
export function nearestDay(trip, dateStr) {
  const days = Array.isArray(trip?.days) ? trip.days : [];
  if (!days.length) return null;
  const exact = findTodayDay(trip, dateStr);
  if (exact) return { ...exact, relation: 'today' };
  if (isDateString(dateStr) && days[0].date && dateStr < days[0].date) return { day: days[0], dayIndex: 0, relation: 'upcoming' };
  if (isDateString(dateStr) && days[days.length - 1].date && dateStr > days[days.length - 1].date) return { day: days[days.length - 1], dayIndex: days.length - 1, relation: 'past' };
  for (let di = 0; di < days.length; di += 1) {
    if (days[di].date && days[di].date >= dateStr) return { day: days[di], dayIndex: di, relation: 'upcoming' };
  }
  return { day: days[0], dayIndex: 0, relation: 'relative' };
}

const EXECUTED_STATUS = new Set(['done', 'skipped']);

// 一天在某时刻的执行状态：每行的计划时刻来自与 CI 相同的 evaluateDay，
// 完成/跳过以 Trip 的 plannedStatus 与关联 Visit 为准（双保险：手动打卡也算完成）。
export function dayExecution({ trip, day, visits = [], places = null, options = {}, nowMinutes = null } = {}) {
  const items = dayItems(day);
  const result = evaluateDay({ day, items, places, options });
  const doneByVisit = new Set(
    (Array.isArray(visits) ? visits : [])
      .filter(v => v && v.plannedItemId && v.status !== 'skipped')
      .map(v => v.plannedItemId));
  // evaluateDay 会把 skipped（以及缺坐标/缺时长）的条目移出排程，但 Today 必须如实展示：
  // 以日顺序为准合并回 rows，未排程的标 unscheduled
  const byItemId = new Map(result.timeline.map(row => [row.itemId, row]));
  const placeOf = id => (places instanceof Map ? places.get(id) : (places || {})[id]) || null;
  const rows = items.map(item => {
    const scheduled = byItemId.get(item.id);
    const place = item.refId ? placeOf(item.refId) : null;
    const base = scheduled || {
      itemId: item.id, placeId: item.refId || null, name: place?.name || item.placeNameSnapshot || item.id,
      arrive: null, start: null, end: null,
      duration: Number.isFinite(item.estimatedDuration) ? item.estimatedDuration
        : (Number.isFinite(place?.estimatedDuration) ? place.estimatedDuration : null),
      transitMinutes: 0, mode: 'none', transitSource: 'none', transitSourceKind: 'none',
      calendar: 'unknown', unscheduled: true,
    };
    const status = EXECUTED_STATUS.has(item.plannedStatus) ? item.plannedStatus
      : (doneByVisit.has(item.id) ? 'done' : 'pending');
    return { ...base, item, status };
  });
  const pending = rows.filter(r => r.status === 'pending' && r.item && (r.item.type === 'visit' || r.item.type === 'reservation') && Number.isFinite(r.arrive));
  let current = null;
  let next = null;
  if (Number.isFinite(nowMinutes)) {
    current = [...pending].reverse().find(r => r.arrive <= nowMinutes && nowMinutes < r.end) || null;
    next = pending.find(r => r.arrive > nowMinutes) || null;
  } else {
    next = pending[0] || null;
  }
  // 缓冲 = 下一项到场时刻 − 路上时间 − 现在；负数表示已经吃紧
  const bufferMinutes = Number.isFinite(nowMinutes) && next
    ? (next.arrive - (next.transitMinutes || 0)) - nowMinutes
    : null;
  const actionable = rows.filter(r => r.item);
  return {
    result,
    rows,
    current,
    next,
    bufferMinutes,
    progress: {
      total: actionable.length,
      done: actionable.filter(r => r.status === 'done').length,
      skipped: actionable.filter(r => r.status === 'skipped').length,
      pending: actionable.filter(r => r.status === 'pending').length,
    },
  };
}

const nextCountIndex = (visits, placeId) => {
  let max = 0;
  for (const v of Array.isArray(visits) ? visits : []) {
    if (v && v.placeId === placeId && Number.isInteger(v.countIndex) && v.countIndex > max) max = v.countIndex;
  }
  return max + 1;
};

const itemName = item => (item && (item.placeNameSnapshot || item.notes)) || '未命名条目';

// 完成：plannedStatus=done + 实际 Visit（status=visited，链接 plannedItemId）+ ChangeEvent。
// existingVisits 用于续接该点位的 countIndex；幂等——已完成直接拒绝，不重复记 Visit。
export function completeItem(trip, itemId, { at, actualStart = '', actualEnd = '', existingVisits = [], idFn, now } = {}) {
  const found = findItem(trip, itemId);
  if (!found) return { ok: false, error: '找不到该条目' };
  const { day, item } = found;
  if (item.plannedStatus === 'done') return { ok: false, error: '该条目已完成，不重复记录' };
  const stamp = Number.isFinite(at) ? at : (typeof now === 'function' ? now() : Date.now());
  const visitId = idFn ? idFn('v') : undefined;
  const next = clone(trip);
  const nextItem = findItem(next, itemId).item;
  nextItem.plannedStatus = 'done';
  let visit = null;
  if (item.refId) {
    visit = createVisit({
      id: visitId,
      placeId: item.refId,
      tripId: trip.id,
      plannedItemId: item.id,
      date: day.date || new Date(stamp).toISOString().slice(0, 10),
      dateSource: 'actual',
      countIndex: nextCountIndex(existingVisits, item.refId),
      source: 'plan',
      status: 'visited',
      actualStart,
      actualEnd,
      createdAt: stamp,
    }, idFn, stamp);
    // 链接必须取「实际创建出来的 Visit id」：页面调用时通常不传 idFn，
    // 旧的 `visitId || 原值` 会得到 undefined，条目永远不回链到打卡记录。
    nextItem.actualVisitId = visit.id;
  }
  const event = createChangeEvent({
    tripId: trip.id,
    at: stamp,
    kind: 'complete',
    summary: `完成「${itemName(item)}」`,
    affected: [item.id],
    after: { plannedStatus: 'done', actualStart, actualEnd },
  }, idFn, stamp);
  return { ok: true, trip: next, visit, event };
}

// 跳过：plannedStatus=skipped；有点位的记一条 status=skipped 的 Visit（留痕，不计入打卡数投影）。
export function skipItem(trip, itemId, { reason = '', at, existingVisits = [], idFn, now } = {}) {
  const found = findItem(trip, itemId);
  if (!found) return { ok: false, error: '找不到该条目' };
  const { day, item } = found;
  if (item.plannedStatus === 'skipped') return { ok: false, error: '该条目已跳过，不重复记录' };
  const stamp = Number.isFinite(at) ? at : (typeof now === 'function' ? now() : Date.now());
  const visitId = idFn ? idFn('v') : undefined;
  const next = clone(trip);
  const nextItem = findItem(next, itemId).item;
  nextItem.plannedStatus = 'skipped';
  let visit = null;
  if (item.refId) {
    visit = createVisit({
      id: visitId,
      placeId: item.refId,
      tripId: trip.id,
      plannedItemId: item.id,
      date: day.date || new Date(stamp).toISOString().slice(0, 10),
      dateSource: 'actual',
      countIndex: nextCountIndex(existingVisits, item.refId),
      source: 'plan',
      status: 'skipped',
      reason,
      createdAt: stamp,
    }, idFn, stamp);
    // 同 completeItem：回链用创建出来的 Visit id
    nextItem.actualVisitId = visit.id;
  }
  const event = createChangeEvent({
    tripId: trip.id,
    at: stamp,
    kind: 'skip',
    summary: `跳过「${itemName(item)}」${reason ? `：${reason}` : ''}`,
    reason,
    affected: [item.id],
    after: { plannedStatus: 'skipped' },
  }, idFn, stamp);
  return { ok: true, trip: next, visit, event };
}

const LEG_MODE_MAP = { walk: 'walk', transit: 'transit', taxi: 'taxi', metro: 'transit', none: 'other' };

// 到达打点：为「上一项 → 本项」回收一条实际 TransitLeg（第一方实测通行数据）。
// plannedMinutes/mode 由调用方从 evaluateDay 的 timeline 行传入，保证与计划口径一致。
export function recordArrival(trip, day, item, { plannedMinutes = null, mode = 'other', actualMinutes, at, idFn, now } = {}) {
  if (!item) return { ok: false, error: '找不到该条目' };
  const stamp = Number.isFinite(at) ? at : (typeof now === 'function' ? now() : Date.now());
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) return { ok: false, error: '缺少实际通行分钟数' };
  const leg = createTransitLeg({
    tripId: trip.id,
    dayId: day ? day.id : '',
    toItemId: item.id,
    mode: LEG_MODE_MAP[mode] || 'other',
    plannedMinutes,
    actualMinutes: Math.round(actualMinutes),
    at: stamp,
  }, idFn, stamp);
  const event = createChangeEvent({
    tripId: trip.id,
    at: stamp,
    kind: 'arrive',
    summary: `到达「${itemName(item)}」· 路上 ${Math.round(actualMinutes)} 分钟${Number.isFinite(plannedMinutes) ? `（计划 ${plannedMinutes}）` : ''}`,
    affected: [item.id],
    after: { actualMinutes: Math.round(actualMinutes), plannedMinutes },
  }, idFn, stamp);
  return { ok: true, leg, event };
}

/* ---------- 行程 Diff（M1：每次编辑可见"改了什么、影响谁"） ---------- */

const itemSignature = item => [
  item.refId || '', item.type, item.startLocal || '', item.endLocal || '',
  item.pinnedStart || '', item.estimatedDuration ?? '', item.mustVisit !== false,
  item.plannedStatus, item.notes || '',
].join('|');

// 返回结构化 diff：added/removed/changed（item 级）、dayChanges、reordered、tripChanges
export function diffTrips(before, after) {
  const diff = { tripChanges: [], dayChanges: [], added: [], removed: [], changed: [], reordered: false };
  if (!before || !after) return diff;
  for (const key of ['title', 'status', 'startDate', 'endDate', 'notes']) {
    if ((before[key] || '') !== (after[key] || '')) {
      diff.tripChanges.push({ field: key, before: before[key] || '', after: after[key] || '' });
    }
  }
  const beforeDays = before.days || [];
  const afterDays = after.days || [];
  if (beforeDays.length !== afterDays.length) {
    diff.dayChanges.push({ field: 'count', before: beforeDays.length, after: afterDays.length });
  }
  const beforeItems = new Map();
  const beforeOrder = new Map();
  beforeDays.forEach((day, di) => dayItems(day).forEach((item, ii) => {
    beforeItems.set(item.id, { item, day, dayIndex: di, position: ii });
    beforeOrder.set(item.id, `${di}:${ii}`);
  }));
  const afterItems = new Map();
  const afterOrder = new Map();
  afterDays.forEach((day, di) => dayItems(day).forEach((item, ii) => {
    afterItems.set(item.id, { item, day, dayIndex: di, position: ii });
    afterOrder.set(item.id, `${di}:${ii}`);
  }));
  for (const [id, cur] of afterItems) {
    const prev = beforeItems.get(id);
    if (!prev) { diff.added.push({ id, name: itemName(cur.item), dayIndex: cur.dayIndex }); continue; }
    if (itemSignature(prev.item) !== itemSignature(cur.item)) {
      const fields = [];
      if ((prev.item.estimatedDuration ?? null) !== (cur.item.estimatedDuration ?? null)) fields.push('停留');
      if ((prev.item.pinnedStart || '') !== (cur.item.pinnedStart || '')) fields.push('锁定时刻');
      if ((prev.item.startLocal || '') !== (cur.item.startLocal || '')) fields.push('开始时间');
      if ((prev.item.plannedStatus || '') !== (cur.item.plannedStatus || '')) fields.push('状态');
      if ((prev.item.mustVisit !== false) !== (cur.item.mustVisit !== false)) fields.push('必去');
      diff.changed.push({ id, name: itemName(cur.item), fields, dayIndex: cur.dayIndex });
    }
    if (prev.dayIndex !== cur.dayIndex) {
      diff.changed.push({ id, name: itemName(cur.item), fields: [`移到第 ${cur.dayIndex + 1} 天`], dayIndex: cur.dayIndex, moved: true });
    } else if (beforeOrder.get(id) !== afterOrder.get(id)) {
      diff.reordered = true;
    }
  }
  for (const [id, prev] of beforeItems) {
    if (!afterItems.has(id)) diff.removed.push({ id, name: itemName(prev.item), dayIndex: prev.dayIndex });
  }
  return diff;
}

export function summarizeDiff(diff) {
  const parts = [];
  if (diff.added.length) parts.push(`加 ${diff.added.length} 项`);
  if (diff.removed.length) parts.push(`删 ${diff.removed.length} 项`);
  if (diff.changed.length) parts.push(`改 ${diff.changed.length} 项`);
  if (diff.reordered) parts.push('调整顺序');
  if (diff.dayChanges.length) parts.push('增删天数');
  if (diff.tripChanges.length) parts.push(`改行程信息（${diff.tripChanges.map(c => c.field).join('、')}）`);
  return parts.join('，') || '无可见变更';
}

/* ---------- 出发前核验任务（M1：把这次 Trip 的 unknown 变成按影响排序的清单） ---------- */

const IMPACT_ORDER = { high: 0, medium: 1, low: 2 };

// pointsById: Map 或普通对象 {id: point}；today 用于判断资料是否过期
export function verificationTasks(trip, pointsById, { today = '' } = {}) {
  const getPoint = id => (pointsById instanceof Map ? pointsById.get(id) : (pointsById || {})[id]) || null;
  const tasks = [];
  const seen = new Set();
  const push = (key, task) => {
    if (seen.has(key)) return;
    seen.add(key);
    tasks.push(task);
  };
  (trip?.days || []).forEach((day, dayIndex) => {
    dayItems(day).forEach(item => {
      if (item.type !== 'visit' || !item.refId) return;
      const point = getPoint(item.refId);
      const name = point?.name || item.placeNameSnapshot || item.refId;
      const must = item.mustVisit !== false;
      const base = { pointId: item.refId, name, dayIndex, date: day.date || '' };
      const cal = point?.openCalendar;
      if (cal === 'unknown' || cal === undefined) {
        push(`${item.refId}:hours`, {
          ...base, field: 'openCalendar', impact: must ? 'high' : 'medium',
          question: `确认「${name}」的开放时间${day.date ? `（${day.date} 是否开放、最后入场）` : ''}`,
        });
      }
      if (!Number.isFinite(point?.estimatedDuration) && !Number.isFinite(item.estimatedDuration)) {
        push(`${item.refId}:duration`, {
          ...base, field: 'estimatedDuration', impact: 'medium',
          question: `确认「${name}」需要逛多久（当前按默认停留排程）`,
        });
      }
      if (point?.ticket === 'unknown') {
        push(`${item.refId}:ticket`, {
          ...base, field: 'ticket', impact: must ? 'medium' : 'low',
          question: `确认「${name}」是否需要门票/预约`,
        });
      }
      const stalest = (Array.isArray(point?.sources) ? point.sources : [])
        .filter(s => s && s.reviewAfter && today && s.reviewAfter < today)
        .sort((a, b) => String(a.reviewAfter).localeCompare(String(b.reviewAfter)))[0];
      if (stalest) {
        push(`${item.refId}:stale`, {
          ...base, field: 'sources', impact: 'low',
          question: `复核「${name}」的资料（${stalest.reviewAfter} 到期，来源 ${stalest.type || '未知'}）`,
        });
      }
    });
  });
  return tasks.sort((a, b) =>
    (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9)
    || a.dayIndex - b.dayIndex
    || String(a.name).localeCompare(String(b.name), 'zh'));
}

// 误差回收（M1 退出条件用）：对比实际与计划，输出每项偏差，不修改原始记录
export function executionReport(trip, { visits = [], legs = [] } = {}) {
  const byItem = new Map();
  for (const v of Array.isArray(visits) ? visits : []) {
    if (v && v.plannedItemId) byItem.set(v.plannedItemId, v);
  }
  const rows = [];
  (trip?.days || []).forEach((day, dayIndex) => {
    dayItems(day).forEach(item => {
      const visit = byItem.get(item.id);
      if (!visit) return;
      rows.push({
        dayIndex,
        itemId: item.id,
        name: itemName(item),
        status: visit.status,
        plannedDuration: item.estimatedDuration ?? null,
        actualStart: visit.actualStart || '',
        actualEnd: visit.actualEnd || '',
        reason: visit.reason || '',
      });
    });
  });
  const legRows = (Array.isArray(legs) ? legs : []).filter(l => l && l.tripId === trip.id).map(l => ({
    id: l.id,
    toItemId: l.toItemId,
    mode: l.mode,
    plannedMinutes: l.plannedMinutes,
    actualMinutes: l.actualMinutes,
    errorMinutes: Number.isFinite(l.plannedMinutes) && Number.isFinite(l.actualMinutes) ? l.actualMinutes - l.plannedMinutes : null,
  }));
  return { visits: rows, legs: legRows };
}
