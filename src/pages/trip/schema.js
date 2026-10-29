// Trip v2 领域契约（纯函数，无 DOM / storage / fetch）
// 依据 ROADMAP §3：Trip / TripDay / ItineraryItem / Visit / Assertion 的稳定 id 与版本入口。
// 在 ROADMAP 骨架之外的扩展字段（UI 需要，随 schemaVersion 一起演进）：
//   Trip.cities[]            单城市多日 / 多城市扩展位（按访问顺序）
//   Trip.notes               行程级提醒（旧计划 note 的落点）
//   Trip.origin              生成来源与旧计划 id（可追溯，不影响业务逻辑）
//   TripDay.note             当天的提示（旧计划 tip 的落点）
//   TripDay.startTime/endTime 当天可用的钟点窗口（HH:MM，默认 09:00–21:00；旧数据缺失按默认处理）
//   TripDay.transportMode    transit|taxi（打车优先＝用更高费用换时间，费用未建模）
//   ItineraryItem.period     morning|afternoon|evening|''（旧计划的时段信息，不塞进 startLocal）
//   ItineraryItem.placeNameSnapshot  点位改名/删除后仍能读出当时的名字
//   ItineraryItem.confirm    ok|needs_confirm（名称迁移歧义待人工确认，不静默丢弃）
//   ItineraryItem.mustVisit  必去=true（默认）/可删=false；自动减负只动 false 的条目
//   ItineraryItem.pinnedStart  当天锁定的开始时刻（HH:MM，空串=不锁；预订的绝对 startLocal 优先）

export const TRIP_SCHEMA_VERSION = 2;

export const TRIP_STATUS = ['draft', 'planned', 'active', 'completed', 'archived'];
export const DATE_MODES = ['fixed', 'relative'];
export const ITEM_TYPES = ['visit', 'transit', 'lodging', 'meal', 'break', 'reservation', 'task', 'note'];
export const ITEM_PERIODS = ['morning', 'afternoon', 'evening', ''];
export const PLANNED_STATUS = ['planned', 'done', 'skipped', 'moved'];
export const FLEXIBILITY = ['fixed', 'flexible', 'optional'];
export const CONFIRM_STATUS = ['ok', 'needs_confirm'];
export const VISIT_SOURCES = ['manual', 'legacy-checkin', 'plan'];
export const DAY_TRANSPORT_MODES = ['transit', 'taxi'];
// 新字段对旧数据保持"缺失按默认"兼容，因此不升 schemaVersion：旧备份与旧 IndexedDB 记录仍可读写
export const DAY_TIME_DEFAULTS = { startTime: '09:00', endTime: '21:00' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateString(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function isTimeString(s) {
  return typeof s === 'string' && TIME_RE.test(s);
}

// 纯日期加减（UTC 归一，避开夏令时）；非法输入返回空串而不是抛错
export function addDays(date, n) {
  if (!isDateString(date) || !Number.isInteger(n)) return '';
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  if (!isDateString(from) || !isDateString(to)) return NaN;
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

let fallbackSeq = 0;
export function defaultId(prefix = 'x') {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`;
  fallbackSeq += 1;
  return `${prefix}_${Date.now().toString(36)}${fallbackSeq.toString(36)}`;
}

export function createTrip(input = {}, idFn = defaultId, now = Date.now()) {
  const startDate = isDateString(input.startDate) ? input.startDate : '';
  const dateMode = DATE_MODES.includes(input.dateMode) ? input.dateMode : (startDate ? 'fixed' : 'relative');
  const nDays = Number.isInteger(input.days) && input.days > 0 ? input.days : 1;
  const endDate = isDateString(input.endDate) ? input.endDate
    : (dateMode === 'fixed' && startDate ? addDays(startDate, nDays - 1) : '');
  return {
    id: input.id || idFn('t'),
    schemaVersion: TRIP_SCHEMA_VERSION,
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : '未命名行程',
    status: TRIP_STATUS.includes(input.status) ? input.status : 'draft',
    startDate: dateMode === 'fixed' ? startDate : '',
    endDate: dateMode === 'fixed' ? endDate : '',
    dateMode,
    homeTimeZone: typeof input.homeTimeZone === 'string' ? input.homeTimeZone : '',
    currency: typeof input.currency === 'string' && input.currency ? input.currency : 'RUB',
    cities: Array.isArray(input.cities) ? input.cities.filter(x => typeof x === 'string' && x) : [],
    days: Array.isArray(input.days) ? input.days : [],
    members: Array.isArray(input.members) ? input.members : [],
    tags: Array.isArray(input.tags) ? input.tags.filter(x => typeof x === 'string' && x) : [],
    notes: typeof input.notes === 'string' ? input.notes : '',
    origin: input.origin && typeof input.origin === 'object' ? { ...input.origin } : null,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : now,
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : now,
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
  };
}

export function createDay(input = {}, idFn = defaultId) {
  return {
    id: input.id || idFn('d'),
    index: Number.isInteger(input.index) && input.index > 0 ? input.index : 1,
    date: isDateString(input.date) ? input.date : '',
    city: typeof input.city === 'string' ? input.city : '',
    startTime: isTimeString(input.startTime) ? input.startTime : DAY_TIME_DEFAULTS.startTime,
    endTime: isTimeString(input.endTime) ? input.endTime : DAY_TIME_DEFAULTS.endTime,
    transportMode: DAY_TRANSPORT_MODES.includes(input.transportMode) ? input.transportMode : 'transit',
    note: typeof input.note === 'string' ? input.note : '',
    items: Array.isArray(input.items) ? input.items : [],
  };
}

export function createItem(input = {}, idFn = defaultId) {
  const duration = Number.isFinite(input.estimatedDuration) && input.estimatedDuration > 0 && input.estimatedDuration <= 720
    ? Math.round(input.estimatedDuration) : null;
  return {
    id: input.id || idFn('i'),
    dayId: typeof input.dayId === 'string' ? input.dayId : '',
    type: ITEM_TYPES.includes(input.type) ? input.type : 'visit',
    refId: typeof input.refId === 'string' && input.refId ? input.refId : null,
    order: Number.isInteger(input.order) && input.order >= 0 ? input.order : 0,
    startLocal: typeof input.startLocal === 'string' ? input.startLocal : '',
    endLocal: typeof input.endLocal === 'string' ? input.endLocal : '',
    timeZone: typeof input.timeZone === 'string' ? input.timeZone : '',
    flexibility: FLEXIBILITY.includes(input.flexibility) ? input.flexibility : 'flexible',
    mustVisit: input.mustVisit !== false,
    pinnedStart: isTimeString(input.pinnedStart) ? input.pinnedStart : '',
    estimatedDuration: duration,
    plannedStatus: PLANNED_STATUS.includes(input.plannedStatus) ? input.plannedStatus : 'planned',
    actualVisitId: typeof input.actualVisitId === 'string' && input.actualVisitId ? input.actualVisitId : null,
    notes: typeof input.notes === 'string' ? input.notes : '',
    period: ITEM_PERIODS.includes(input.period) ? input.period : '',
    placeNameSnapshot: typeof input.placeNameSnapshot === 'string' ? input.placeNameSnapshot : '',
    confirm: CONFIRM_STATUS.includes(input.confirm) ? input.confirm : 'ok',
  };
}

export function createVisit(input = {}, idFn = defaultId, now = Date.now()) {
  const count = Number.isInteger(input.countIndex) && input.countIndex > 0 ? input.countIndex : 1;
  return {
    id: input.id || idFn('v'),
    placeId: typeof input.placeId === 'string' && input.placeId ? input.placeId : '',
    tripId: typeof input.tripId === 'string' && input.tripId ? input.tripId : null,
    plannedItemId: typeof input.plannedItemId === 'string' && input.plannedItemId ? input.plannedItemId : null,
    date: isDateString(input.date) ? input.date : '',
    dateSource: typeof input.dateSource === 'string' ? input.dateSource : 'unknown',
    note: typeof input.note === 'string' ? input.note.slice(0, 500) : '',
    countIndex: count,
    source: VISIT_SOURCES.includes(input.source) ? input.source : 'manual',
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : now,
  };
}

// 结构校验：只报错不修复。迁移/导入后必须先过这一关再落库。
export function validateTrip(trip) {
  const errors = [];
  const err = (path, code, message) => errors.push({ path, code, message });
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  if (!isObj(trip)) return { ok: false, errors: [{ path: '', code: 'not_object', message: '行程不是对象' }] };
  if (typeof trip.id !== 'string' || !trip.id) err('id', 'required', '缺少稳定 id');
  if (trip.schemaVersion !== TRIP_SCHEMA_VERSION) err('schemaVersion', 'version', `schemaVersion 必须为 ${TRIP_SCHEMA_VERSION}`);
  if (typeof trip.title !== 'string' || !trip.title.trim()) err('title', 'required', '标题不能为空');
  if (!TRIP_STATUS.includes(trip.status)) err('status', 'enum', `status 非法：${trip.status}`);
  if (!DATE_MODES.includes(trip.dateMode)) err('dateMode', 'enum', `dateMode 非法：${trip.dateMode}`);
  if (!Array.isArray(trip.cities)) err('cities', 'type', 'cities 必须是数组');
  if (!Array.isArray(trip.days)) err('days', 'type', 'days 必须是数组');

  if (trip.dateMode === 'fixed') {
    if (!isDateString(trip.startDate)) err('startDate', 'date', '固定日期行程必须有合法 startDate');
    if (trip.endDate && !isDateString(trip.endDate)) err('endDate', 'date', 'endDate 非法');
    if (isDateString(trip.startDate) && isDateString(trip.endDate) && diffDays(trip.startDate, trip.endDate) < 0) {
      err('endDate', 'range', 'endDate 早于 startDate');
    }
    if (isDateString(trip.startDate) && Array.isArray(trip.days)) {
      const expected = diffDays(trip.startDate, trip.endDate) + 1;
      if (Number.isFinite(expected) && expected !== trip.days.length) {
        err('days', 'range', `天数 ${trip.days.length} 与日期跨度 ${expected} 不一致`);
      }
    }
  }

  const dayIds = new Set();
  const itemIds = new Set();
  (Array.isArray(trip.days) ? trip.days : []).forEach((day, di) => {
    const p = `days[${di}]`;
    if (!isObj(day)) return err(p, 'type', 'day 不是对象');
    if (typeof day.id !== 'string' || !day.id) err(`${p}.id`, 'required', 'day 缺少 id');
    else if (dayIds.has(day.id)) err(`${p}.id`, 'duplicate', `day id 重复：${day.id}`);
    else dayIds.add(day.id);
    if (!Number.isInteger(day.index) || day.index !== di + 1) err(`${p}.index`, 'sequence', 'day.index 必须等于序号');
    if (day.date && !isDateString(day.date)) err(`${p}.date`, 'date', 'day.date 非法');
    if (isDateString(trip.startDate) && day.date && day.date !== addDays(trip.startDate, di)) {
      err(`${p}.date`, 'range', 'day.date 与出发日期不连续');
    }
    // 旧数据没有这两个字段：缺失按默认窗口处理；只要写了就必须成对且合法
    if ((day.startTime !== undefined) !== (day.endTime !== undefined)) {
      err(`${p}.startTime`, 'required', 'startTime 与 endTime 必须同时提供');
    }
    if (day.startTime !== undefined && !isTimeString(day.startTime)) err(`${p}.startTime`, 'time', 'startTime 必须是 HH:MM');
    if (day.endTime !== undefined && !isTimeString(day.endTime)) err(`${p}.endTime`, 'time', 'endTime 必须是 HH:MM');
    if (isTimeString(day.startTime) && isTimeString(day.endTime) && day.endTime <= day.startTime) {
      err(`${p}.endTime`, 'range', 'endTime 必须晚于 startTime');
    }
    if (day.transportMode !== undefined && !DAY_TRANSPORT_MODES.includes(day.transportMode)) {
      err(`${p}.transportMode`, 'enum', 'transportMode 必须是 transit 或 taxi');
    }
    if (!Array.isArray(day.items)) return err(`${p}.items`, 'type', 'items 必须是数组');
    day.items.forEach((item, ii) => {
      const ip = `${p}.items[${ii}]`;
      if (!isObj(item)) return err(ip, 'type', 'item 不是对象');
      if (typeof item.id !== 'string' || !item.id) err(`${ip}.id`, 'required', 'item 缺少 id');
      else if (itemIds.has(item.id)) err(`${ip}.id`, 'duplicate', `item id 重复：${item.id}`);
      else itemIds.add(item.id);
      if (item.dayId && item.dayId !== day.id) err(`${ip}.dayId`, 'ref', 'item.dayId 与所属 day 不一致');
      if (!ITEM_TYPES.includes(item.type)) err(`${ip}.type`, 'enum', `item 类型非法：${item.type}`);
      if (!Number.isInteger(item.order) || item.order < 0) err(`${ip}.order`, 'type', 'order 必须是非负整数');
      if (item.refId !== null && item.refId !== undefined && typeof item.refId !== 'string') err(`${ip}.refId`, 'type', 'refId 必须是字符串或 null');
      if (item.type === 'visit' && !item.refId && item.confirm !== 'needs_confirm') {
        err(`${ip}.refId`, 'ref', 'visit 没有 placeId 时必须标记 needs_confirm');
      }
      if (!PLANNED_STATUS.includes(item.plannedStatus)) err(`${ip}.plannedStatus`, 'enum', 'plannedStatus 非法');
      if (!FLEXIBILITY.includes(item.flexibility)) err(`${ip}.flexibility`, 'enum', 'flexibility 非法');
      if (typeof item.mustVisit !== 'boolean') err(`${ip}.mustVisit`, 'type', 'mustVisit 必须是布尔值');
      if (item.estimatedDuration !== null && item.estimatedDuration !== undefined
        && (!Number.isInteger(item.estimatedDuration) || item.estimatedDuration <= 0 || item.estimatedDuration > 720)) {
        err(`${ip}.estimatedDuration`, 'duration', 'estimatedDuration 必须是 1–720 的整数或 null');
      }
      if (item.pinnedStart !== undefined && item.pinnedStart !== '' && !isTimeString(item.pinnedStart)) {
        err(`${ip}.pinnedStart`, 'time', 'pinnedStart 必须是 HH:MM 或空串');
      }
      if (!ITEM_PERIODS.includes(item.period)) err(`${ip}.period`, 'enum', `period 非法：${item.period}`);
      if (!CONFIRM_STATUS.includes(item.confirm)) err(`${ip}.confirm`, 'enum', 'confirm 非法');
    });
  });

  if (!Number.isInteger(trip.revision) || trip.revision < 1) err('revision', 'type', 'revision 必须是正整数');
  return { ok: errors.length === 0, errors };
}

export function validateVisit(visit) {
  const errors = [];
  if (!visit || typeof visit !== 'object') return { ok: false, errors: [{ path: '', code: 'not_object', message: 'Visit 不是对象' }] };
  if (typeof visit.id !== 'string' || !visit.id) errors.push({ path: 'id', code: 'required', message: '缺少 Visit id' });
  if (typeof visit.placeId !== 'string' || !visit.placeId) errors.push({ path: 'placeId', code: 'required', message: '缺少 placeId' });
  if (visit.date && !isDateString(visit.date)) errors.push({ path: 'date', code: 'date', message: 'date 非法' });
  if (visit.tripId !== null && visit.tripId !== undefined && typeof visit.tripId !== 'string') errors.push({ path: 'tripId', code: 'type', message: 'tripId 必须是字符串或 null' });
  return { ok: errors.length === 0, errors };
}

export function tripDayCount(trip) {
  return Array.isArray(trip?.days) ? trip.days.length : 0;
}

export function tripItemCount(trip) {
  return tripDayCount(trip) ? trip.days.reduce((s, d) => s + (Array.isArray(d.items) ? d.items.length : 0), 0) : 0;
}
