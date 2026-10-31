// 确定性可行性引擎（纯函数，无 DOM / storage / fetch）
// 只回答"这一天这样走是否走得完、卡在哪"，不替用户美化结论：
//   • 开放日历 unknown 时按宽边界（不限制）处理，但每处都标记 unknown，绝不当作"全天开放"
//   • 交通段默认标 source:'estimate'（直线距离 + 速度假设）；命中 data/transit-matrix.json 时用真实 walking/car 时长并标 source:'matrix'
//   • 冲突分 error / warn：error 才判不可行；每条不可行结论都必须能给出至少一个可执行修复

// 打车费用估算来自城市费率表；工具/无城市上下文时默认莫斯科口径
import { TAXI_FARES } from './fare-table.js';
import { lookupTransitLeg } from './transit-matrix.js';

export const TRANSIT = {
  walkSpeedMPerMin: 80,      // 4.8 km/h，城市步行含找路
  walkRadiusMeters: 1200,    // 1.2km 内默认步行
  metroOverheadMinutes: 10,  // 进站/候车/换乘/出站
  metroMPerMin: 500,         // 30 km/h 门到门均速
  taxiOverheadMinutes: 5,    // 打车：叫车/上下车
};

export const DEFAULT_DAY = { start: '09:00', end: '21:00' };

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(TIME_RE);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatMinutes(min) {
  if (!Number.isFinite(min)) return '';
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

// 展示用：>= 24:00 的分钟数写成「01:28（次日）」，避免看起来早于 23:30
export function formatMinutesCrossDay(min) {
  if (!Number.isFinite(min)) return '';
  return Math.round(min) >= 1440 ? `${formatMinutes(min)}（次日）` : formatMinutes(min);
}

export function distanceMeters(a, b) {
  if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

// 两站之间的通行估算；options.mode='taxi' 时用打车口径（省进出站时间，费用未知）
export function estimateLeg(from, to, options = {}) {
  if (!from || !to) return null;
  if (from.id && to.id && from.id === to.id) return { meters: 0, minutes: 0, mode: 'walk', source: 'estimate' };
  const matrixMode = options.mode === 'taxi' ? 'car' : 'walking';
  const real = options.matrix ? lookupTransitLeg(options.matrix, from.id, to.id, matrixMode) : null;
  if (real) {
    const base = {
      meters: real.meters,
      minutes: real.minutes,
      mode: matrixMode === 'car' ? 'taxi' : 'walk',
      source: 'matrix',
      provider: real.provider,
      collectedAt: real.collectedAt,
    };
    if (matrixMode !== 'car') return base;
    const fare = Object.prototype.hasOwnProperty.call(options, 'fare') ? options.fare : TAXI_FARES['莫斯科'];
    if (!fare) return base;
    const step = fare.roundTo || 1;
    const cost = Math.max(fare.minimum, Math.round((fare.base + fare.perKm * (real.meters / 1000)) / step) * step);
    return { ...base, cost, currency: fare.currency };
  }
  const meters = distanceMeters(from, to);
  if (meters === null) return null;
  if (meters <= TRANSIT.walkRadiusMeters) {
    return { meters, minutes: Math.ceil(meters / TRANSIT.walkSpeedMPerMin), mode: 'walk', source: 'estimate' };
  }
  if (options.mode === 'taxi') {
    const base = {
      meters,
      minutes: TRANSIT.taxiOverheadMinutes + Math.ceil(meters / TRANSIT.metroMPerMin),
      mode: 'taxi',
      source: 'estimate',
    };
    const fare = Object.prototype.hasOwnProperty.call(options, 'fare') ? options.fare : TAXI_FARES['莫斯科'];
    if (!fare) return base;
    const step = fare.roundTo || 1;
    const cost = Math.max(fare.minimum, Math.round((fare.base + fare.perKm * (meters / 1000)) / step) * step);
    return { ...base, cost, currency: fare.currency };
  }
  return {
    meters,
    minutes: TRANSIT.metroOverheadMinutes + Math.ceil(meters / TRANSIT.metroMPerMin),
    mode: 'metro',
    source: 'estimate',
  };
}

// 'Mo-Su' / 'Mo,Tu,Fr' / ['Mo','Tu'] 三种写法都接受
export function parseDays(days) {
  if (Array.isArray(days)) return days.filter((d) => WEEKDAYS.includes(d));
  if (typeof days !== 'string' || !days.trim()) return [];
  const out = [];
  for (const part of days.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = part.split('-').map((s) => s.trim());
    if (!WEEKDAYS.includes(a)) continue;
    if (!b) { out.push(a); continue; }
    if (!WEEKDAYS.includes(b)) continue;
    for (let i = WEEKDAYS.indexOf(a); ; i = (i + 1) % 7) {
      out.push(WEEKDAYS[i]);
      if (WEEKDAYS[i] === b) break;
    }
  }
  return [...new Set(out)];
}

export function weekdayKey(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const t = Date.parse(dateStr + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  return WEEKDAYS[new Date(t).getUTCDay()];
}

function nthWeekdayMatch(dateStr, weekday, nth) {
  if (weekdayKey(dateStr) !== weekday) return false;
  const [year, month] = dateStr.split('-').map(Number);
  const day = Number(dateStr.slice(8, 10));
  if (nth === 'last') {
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day + 7 > dim;
  }
  return Math.ceil(day / 7) === Number(nth);
}

function exceptionMatches(ex, dateStr) {
  if (!ex || typeof ex !== 'object') return false;
  if (ex.type === 'date') return ex.date === dateStr;
  if (ex.type === 'date-range') return ex.from <= dateStr && dateStr <= ex.to;
  if (ex.type === 'nth-weekday') return nthWeekdayMatch(dateStr, ex.weekday, ex.nth);
  return false;
}

function hoursFrom(primary, fallback) {
  const open = parseMinutes(primary && primary.open);
  const close = parseMinutes(primary && primary.close);
  const lastEntry = parseMinutes(primary && primary.lastEntry);
  return {
    open: open === null ? fallback.open : open,
    close: close === null ? fallback.close : close,
    lastEntry: lastEntry === null ? fallback.lastEntry : lastEntry,
  };
}

// 返回 { state:'open'|'closed'|'unknown', open, close, lastEntry, reason, exceptionsUnresolved? }
// weekly 按星期覆盖默认时段；exceptions 支持 date / date-range / nth-weekday（1–5 或 last）
export function calendarState(calendar, dateStr) {
  if (!calendar || calendar === 'unknown' || typeof calendar !== 'object') {
    return { state: 'unknown', open: null, close: null, lastEntry: null, reason: '开放日历未知' };
  }
  const wd = weekdayKey(dateStr);
  const exceptions = Array.isArray(calendar.exceptions) ? calendar.exceptions : [];
  const weeklyUnresolved = !wd && calendar.weekly && typeof calendar.weekly === 'object'
    && Object.keys(calendar.weekly).length > 0;
  const exceptionsUnresolved = !wd && (exceptions.length > 0 || weeklyUnresolved);
  const closedDays = parseDays(calendar.closed);
  const openDays = parseDays(calendar.days || 'Mo-Su');
  const baseOpen = parseMinutes(calendar.open);
  const baseClose = parseMinutes(calendar.close);
  const baseLast = parseMinutes(calendar.lastEntry);

  let state = 'open';
  let reason = '';
  if (wd) {
    if (closedDays.includes(wd)) { state = 'closed'; reason = `${wd} 闭馆`; }
    else if (!openDays.includes(wd)) { state = 'closed'; reason = `${wd} 不开放`; }
  }

  const weekly = wd && calendar.weekly && typeof calendar.weekly[wd] === 'object' ? calendar.weekly[wd] : null;
  let hours = hoursFrom(weekly, { open: baseOpen, close: baseClose, lastEntry: baseLast });

  if (wd) {
    const ex = exceptions.find((e) => exceptionMatches(e, dateStr));
    if (ex) {
      if (ex.action === 'closed') {
        state = 'closed';
        reason = ex.note || '特殊闭馆';
      } else if (ex.action === 'open') {
        state = 'open';
        hours = hoursFrom(ex, hours);
        reason = ex.note || '特殊开放';
      }
    }
  }

  if (state === 'closed') {
    return { state: 'closed', open: null, close: null, lastEntry: null, reason, exceptionsUnresolved: false };
  }
  if (hours.open === null || hours.close === null) {
    return { state: 'unknown', open: null, close: null, lastEntry: null, reason: '开放时间格式不可用' };
  }
  return {
    state: 'open',
    open: hours.open,
    close: hours.close,
    lastEntry: hours.lastEntry,
    reason: reason || `${formatMinutes(hours.open)}–${formatMinutes(hours.close)}`,
    exceptionsUnresolved,
  };
}

const ABS_RE = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})$/;

function resolveStart(item) {
  const s = typeof item.startLocal === 'string' ? item.startLocal : '';
  const abs = s.match(ABS_RE);
  if (abs) return { kind: 'absolute', date: s.slice(0, 10), minutes: parseMinutes(abs[1]) };
  // 编辑器里的锁定时刻是软锚点；带日期的预订（absolute）优先
  const pinned = parseMinutes(typeof item.pinnedStart === 'string' ? item.pinnedStart : '');
  if (pinned !== null) return { kind: 'pinned', date: '', minutes: pinned };
  const t = parseMinutes(s);
  if (t !== null) return { kind: 'time', date: '', minutes: t };
  return { kind: 'none', date: '', minutes: null };
}

const SKIP_TYPES = new Set(['note', 'task']);
// 无点位也可排程的"就地时间块"：就餐与休息预留
const BLOCK_ONLY_TYPES = new Set(['meal', 'break']);

function placeOf(places, id) {
  if (!places) return null;
  return places instanceof Map ? places.get(id) || null : places[id] || null;
}

/**
 * 评估一天的行程。
 * @param {object} input
 * @param {{id?:string,date?:string,index?:number}} input.day
 * @param {Array} input.items  按 order 升序的 ItineraryItem
 * @param {Map|object} input.places  placeId → point（需要 lat/lon/estimatedDuration/openCalendar）
 * @param {{start?:string,end?:string}} [input.options]
 */
export function evaluateDay({ day = {}, items = [], places = null, options = {} } = {}) {
  const dayStart = parseMinutes(options.start || DEFAULT_DAY.start) ?? 540;
  const dayEnd = parseMinutes(options.end || DEFAULT_DAY.end) ?? 1260;
  const transportMode = options.transportMode === 'taxi' ? 'taxi' : 'transit';
  const taxiFareOption = Object.prototype.hasOwnProperty.call(options, 'taxiFare') ? options.taxiFare : TAXI_FARES['莫斯科'];
  const date = typeof day.date === 'string' ? day.date : '';

  const conflicts = [];
  const timeline = [];
  const push = (kind, severity, itemId, message, extra = {}) =>
    conflicts.push({ kind, severity, itemId, message, ...extra });

  const seen = new Map();
  let cursor = dayStart;
  let prevPlace = null;
  let dwell = 0;
  let transit = 0;
  let wait = 0;
  let taxiCost = 0;
  let taxiCurrency = '';

  const list = (Array.isArray(items) ? items : []).filter(
    (i) => i && typeof i === 'object' && !SKIP_TYPES.has(i.type) && i.plannedStatus !== 'skipped',
  );
  // 最后一步若回到起点（环线闭合），按"路过"处理而不是重复点位
  const lastResolvable = [...list].reverse().find((i) => i.refId && placeOf(places, i.refId)) || null;
  const firstResolvable = list.find((i) => i.refId && placeOf(places, i.refId)) || null;

  for (const item of list) {
    const place = item.refId ? placeOf(places, item.refId) : null;
    const name = item.placeNameSnapshot || (place && place.name) || item.id || '未命名条目';
    // 无点位的就餐/休息预留是可排程的"就地时间块"，不是缺数据的错误
    const blockOnly = !place && BLOCK_ONLY_TYPES.has(item.type);

    if (!place && !blockOnly) {
      push('unresolved-place', 'error', item.id, `「${name}」没有绑定点位，无法排程`);
      continue;
    }
    if (place && seen.has(place.id)) {
      const closesLoop = item === lastResolvable && firstResolvable && seen.size >= 2
        && placeOf(places, firstResolvable.refId)?.id === place.id;
      if (closesLoop) {
        const leg = prevPlace ? estimateLeg(prevPlace, place, { mode: transportMode, fare: taxiFareOption, matrix: options.matrix }) : null;
        if (leg) {
          transit += leg.minutes;
          if (leg.mode === 'taxi') {
            taxiCost += leg.cost || 0;
            taxiCurrency = leg.currency || taxiCurrency;
          }
        }
        push('loop-closure', 'warn', item.id, `「${name}」是回到起点的闭合回路，只计通行不计停留`, {
          backMinutes: leg ? leg.minutes : 0,
        });
      } else {
        push('duplicate-place', 'error', item.id, `「${name}」在这天出现了不止一次`, { duplicateOf: seen.get(place.id) });
      }
      continue;
    }
    if (place) seen.set(place.id, item.id);

    const duration = Number.isFinite(item.estimatedDuration) ? item.estimatedDuration
      : place && Number.isFinite(place.estimatedDuration) ? place.estimatedDuration : null;
    if (!duration || duration <= 0) {
      push('missing-duration', 'error', item.id, `「${name}」没有停留时长，排程无法进行`);
      continue;
    }

    const start = resolveStart(item);
    if (start.kind === 'absolute' && start.date && date && start.date !== date) {
      push('cross-day', 'error', item.id, `「${name}」的预订在 ${start.date}，不属于这一天（${date}）`, { itemDate: start.date, dayDate: date });
      continue;
    }

    const leg = place && prevPlace ? estimateLeg(prevPlace, place, { mode: transportMode, fare: taxiFareOption, matrix: options.matrix }) : null;
    if (place && prevPlace && !leg) {
      push('missing-coords', 'error', item.id, `「${name}」或上一站没有坐标，无法估算通行时间`);
      continue;
    }
    const legMinutes = leg ? leg.minutes : 0;
    if (leg) {
      transit += legMinutes;
      if (leg.mode === 'taxi') {
        taxiCost += leg.cost || 0;
        taxiCurrency = leg.currency || taxiCurrency;
      }
    }

    let arrive = cursor + legMinutes;
    if (start.kind === 'absolute' || start.kind === 'pinned' || start.kind === 'time') {
      const pin = start.minutes;
      const hard = start.kind === 'absolute' || item.flexibility === 'fixed';
      if (pin < arrive) {
        if (hard) {
          push('overlap', 'error', item.id, `「${name}」固定 ${formatMinutes(pin)} 开始，但按前面的行程 ${formatMinutesCrossDay(arrive)} 才能到`, {
            fixedAt: formatMinutes(pin),
            earliestArrival: formatMinutesCrossDay(arrive),
          });
        } else {
          // 软时点被晚到覆盖：按实际到达继续，但必须告诉用户晚了多少
          push('late-start', 'warn', item.id, `「${name}」计划 ${formatMinutes(pin)} 开始，实际 ${formatMinutesCrossDay(arrive)} 才到`, {
            planned: formatMinutes(pin),
            actual: formatMinutesCrossDay(arrive),
          });
        }
      } else {
        wait += pin - arrive;
        arrive = pin;
      }
    }

    let cal = { state: 'none' };
    if (place) {
      cal = calendarState(place.openCalendar, date);
      if (cal.state === 'unknown') {
        push('hours-unknown', 'warn', item.id, `「${name}」开放时间未知，按宽边界排程（不等于全天开放）`);
      } else if (cal.state === 'closed') {
        push('closed', 'error', item.id, `「${name}」${cal.reason}，${date || '当天'}去不了`, { reason: cal.reason });
      } else {
        if (cal.exceptionsUnresolved) {
          push('calendar-exceptions', 'warn', item.id, `「${name}」缺少日期，周内/特殊闭馆例外未校验（按默认时段排程）`);
        }
        if (arrive < cal.open) {
          wait += cal.open - arrive;
          push('before-open', 'warn', item.id, `「${name}」${formatMinutes(cal.open)} 才开门，需等待 ${cal.open - arrive} 分钟`, { opens: formatMinutes(cal.open) });
          arrive = cal.open;
        }
        const lastEntry = cal.lastEntry ?? cal.close;
        if (arrive > lastEntry) {
          push('after-last-entry', 'error', item.id, `「${name}」最晚入场 ${formatMinutes(lastEntry)}，实际 ${formatMinutesCrossDay(arrive)} 才到`, {
            lastEntry: formatMinutes(lastEntry),
          });
        } else if (arrive + duration > cal.close) {
          push('after-close', 'error', item.id, `「${name}」${formatMinutes(cal.close)} 关门，${formatMinutesCrossDay(arrive)} 开始停留 ${duration} 分钟会超时`, {
            closes: formatMinutes(cal.close),
          });
        }
      }
    }

    const end = arrive + duration;
    dwell += duration;
    timeline.push({
      itemId: item.id,
      placeId: place ? place.id : null,
      name,
      arrive,
      start: arrive,
      end,
      duration,
      transitMinutes: legMinutes,
      mode: leg ? leg.mode : 'none',
      transitSource: leg ? leg.source : 'none',
      cost: leg && leg.mode === 'taxi' ? leg.cost || 0 : 0,
      currency: leg && leg.mode === 'taxi' ? leg.currency || '' : '',
      calendar: cal.state,
      pinned: start.kind === 'absolute' || item.flexibility === 'fixed',
    });
    cursor = end;
    if (place) prevPlace = place;
  }

  if (timeline.length && cursor > dayEnd) {
    push('day-overrun', 'error', 'day', `这天要到 ${formatMinutesCrossDay(cursor)} 才结束，超出 ${formatMinutes(dayEnd)} 的收工线 ${cursor - dayEnd} 分钟`);
  }

  const errors = conflicts.filter((c) => c.severity === 'error');
  const totalMinutes = timeline.length ? timeline[timeline.length - 1].end - timeline[0].arrive + (timeline[0].arrive - dayStart) : 0;

  return {
    feasible: errors.length === 0 && timeline.length > 0,
    empty: timeline.length === 0,
    conflicts,
    errors,
    timeline,
    stats: {
      dwellMinutes: dwell,
      transitMinutes: transit,
      waitMinutes: wait,
      taxiCost,
      taxiCurrency,
      totalMinutes,
      places: timeline.filter((t) => t.placeId).length,
      unknownHours: timeline.filter((t) => t.calendar === 'unknown').length,
    },
  };
}

// 针对每条 error 给出至少一个可执行修复；返回去重后的建议列表
export function suggestFixes(result, { items = [], dayEnd = DEFAULT_DAY.end } = {}) {
  const byId = new Map((items || []).map((i) => [i.id, i]));
  const out = [];
  const add = (kind, label, detail = '') => {
    const key = kind + '|' + label;
    if (!out.some((x) => x.key === key)) out.push({ key, kind, label, detail });
  };

  for (const c of result.errors || []) {
    if (c.kind === 'day-overrun') {
      const longest = [...(result.timeline || [])]
        .filter((t) => {
          const it = byId.get(t.itemId);
          return it && it.mustVisit !== true && it.flexibility !== 'fixed' && !it.pinnedStart;
        })
        .sort((a, b) => b.duration - a.duration)[0];
      if (longest) add('drop', `删掉「${longest.name}」可省 ${longest.duration} 分钟`, '优先删非必去、非预订的点位');
      add('extend', `把收工线从 ${dayEnd} 后移，或把这一天拆成两天`, '仅在没有固定预订时可行');
    } else if (c.kind === 'closed') {
      add('reschedule', `把「${c.message.match(/「(.+?)」/)?.[1] || '该点位'}」换到开放日`, c.reason || '');
    } else if (c.kind === 'after-last-entry' || c.kind === 'after-close') {
      add('move-earlier', `把「${c.message.match(/「(.+?)」/)?.[1] || '该点位'}」提前，或改成第二天上午`, '');
    } else if (c.kind === 'overlap') {
      add('move-item', `把冲突的柔性点位挪到预订之后`, c.message);
    } else if (c.kind === 'late-start') {
      add('move-earlier', `「${c.message.match(/「(.+?)」/)?.[1] || '该点位'}」比计划晚到，可提前出发或删掉前面一个点位`, c.message);
    } else if (c.kind === 'duplicate-place') {
      add('drop-duplicate', `删掉重复的「${c.message.match(/「(.+?)」/)?.[1] || '点位'}」`, '');
    } else if (c.kind === 'missing-duration') {
      add('add-duration', `为「${c.message.match(/「(.+?)」/)?.[1] || '该点位'}」补停留时长`, 'data/points.json 的 estimatedDuration');
    } else if (c.kind === 'unresolved-place') {
      add('bind-place', `先给「${c.message.match(/「(.+?)」/)?.[1] || '该条目'}」绑定点位`, '行程页的「绑定」');
    } else if (c.kind === 'cross-day') {
      add('fix-date', `把「${c.message.match(/「(.+?)」/)?.[1] || '该预订'}」移到对应日期`, c.itemDate ? `${c.itemDate} → ${c.dayDate}` : '');
    } else if (c.kind === 'missing-coords') {
      add('add-coords', '补点位坐标', 'data/points.json 的 lat/lon');
    }
  }
  return out.map(({ key, ...rest }) => rest);
}
