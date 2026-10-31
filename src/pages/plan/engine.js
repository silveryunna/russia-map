// 规则引擎纯函数：不碰 DOM / localStorage，便于 Node 单测。
// 输出格式仍是 slots:[name]，P1 迁移到 placeId 时只改这一层与渲染层。

import { addDays, isDateString } from '../trip/schema.js';
import { calendarState, evaluateDay } from './feasibility.js';

export const PLAN_DAYS_MIN = 1;
export const PLAN_DAYS_MAX = 7; // 与 api/index.php 的 1–7 保持一致
export const MAX_PER_DAY = 8;
export const MIN_FILLED_DAY = 5;
export const SLOT_CAPS = { morning: 3, afternoon: 3, evening: 2 };

export const INTERESTS = {
  '建筑': /建筑|构成主义|斯大林|现代主义|粗野|先锋派|新艺术|折衷|古典主义|摩天|工业遗产/,
  '美食': /餐厅|咖啡|食堂|小吃|甜品|酒吧|美食|饮品|冰淇淋|下午茶|大排档|自助|火锅/,
  '博物馆': /博物馆|美术馆|展览|画廊/,
  '自然': /海湾|公园|湖泊|雨林|峡谷|海岛|沙滩|森林|冰川|温泉|湿地|草原/,
  '摄影': /拍照|摄影|观景|登顶|全景|机位|出片|扫街/,
  '地铁': /地铁站|火车站|交通|口岸|机场/,
  '文学': /文学|故居|书店|诗人|作家|纪念雕像/,
  '购物': /商场|市场|免税|巴扎|市集|步行街/,
};

const FOOD_RE = /餐厅|咖啡|甜品|酒吧|下午茶|大排档|自助|火锅|食堂|小吃|粥铺/;

export function clampDays(n) {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) return 3;
  return Math.max(PLAN_DAYS_MIN, Math.min(PLAN_DAYS_MAX, v));
}

export function interestHits(p) {
  const t = `${p.type} ${p.cluster} ${p.highlight || ''} ${(p.tags || []).join(' ')}`;
  return Object.keys(INTERESTS).filter(k => INTERESTS[k].test(t));
}

// 按顺序去重并截断到单日上限；超出的点位留作后续天数的候选，而不是硬塞进下午。
export function selectDayPoints(list, cap = MAX_PER_DAY) {
  const seen = new Set();
  const picked = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    picked.push(p);
    if (picked.length >= cap) break;
  }
  return picked;
}

export function buildDay(list) {
  const picked = selectDayPoints(list);
  const food = picked.filter(p => FOOD_RE.test(p.type || ''));
  const rest = picked.filter(p => !FOOD_RE.test(p.type || ''));
  const slots = { morning: [], afternoon: [], evening: [] };

  const push = (slot, p) => {
    if (slots[slot].length < SLOT_CAPS[slot]) { slots[slot].push(p); return true; }
    return false;
  };

  // 非餐饮按原顺序铺进上午/下午，超出上限才进入晚上；
  // 餐饮优先晚上，晚上满了再回填下午/上午，保证不丢点也不超上限。
  for (const p of rest) {
    if (!push('morning', p) && !push('afternoon', p)) push('evening', p);
  }
  for (const p of food) {
    if (!push('evening', p) && !push('afternoon', p)) push('morning', p);
  }

  return {
    slots: {
      morning: slots.morning.map(p => p.name),
      afternoon: slots.afternoon.map(p => p.name),
      evening: slots.evening.map(p => p.name),
    },
    usedIds: [...slots.morning, ...slots.afternoon, ...slots.evening].map(p => p.id),
  };
}

function mkDay(n, slots, tip) {
  return { day: n, slots, tip };
}

/**
 * @param {{city:string,date?:string,days:number,interests?:string[]}} params
 * @param {{pts:Array,rts:Array,matrix?:object}} data
 */
export function ruleEngine(params, data) {
  const targetDays = clampDays(params.days);
  const matrix = data.matrix || null;
  const interests = Array.isArray(params.interests) ? params.interests : [];
  const cityPts = (data.pts || []).filter(p => !p.pending && p.city === params.city
    && Number.isFinite(p.estimatedDuration) && p.estimatedDuration > 0
    && Number.isFinite(p.lat) && Number.isFinite(p.lon));

  let pool = cityPts;
  if (interests.length) {
    const hit = cityPts.filter(p => interestHits(p).some(i => interests.includes(i)));
    if (hit.length >= 4) pool = hit; // 兴趣过滤后点位太少则回退全城
  }

  const byName = new Map((data.pts || []).map(p => [p.name, p]));
  const byId = new Map((data.pts || []).map(p => [p.id, p]));
  // 动线步骤以 pointId 为准，point 名称兜底（旧数据/改名未同步时的退路）
  const stepPoint = s => (s && ((s.pointId && byId.get(s.pointId)) || byName.get(s.point))) || null;
  const cityRoutes = (data.rts || []).filter(r => r.city === params.city);
  const used = new Set();
  const days = [];
  const tripStart = isDateString(params.date) ? params.date : '';
  const dateFor = (index) => (tripStart ? addDays(tripStart, index) : '');
  const skipped = new Map();
  const trimmed = new Map();
  const closedOn = (place, date) => {
    if (!date || !place || !place.openCalendar || place.openCalendar === 'unknown') return false;
    return calendarState(place.openCalendar, date).state === 'closed';
  };
  const isClosedOn = (place, date) => {
    if (!closedOn(place, date)) return false;
    const state = calendarState(place.openCalendar, date);
    skipped.set(`${place.id}|${date}`, { id: place.id, name: place.name, date, reason: state.reason || '闭馆' });
    return true;
  };
  // 用可行性引擎预演一天：开馆等待、通行、收工线都算进去，排不下就留到次日
  const fitsDay = (points, date) => {
    const day = buildDay(points);
    const ordered = day.usedIds.map(id => byId.get(id)).filter(Boolean);
    if (!ordered.length) return { ok: false, day };
    const items = ordered.map((p, index) => ({
      id: `g${index}`, refId: p.id, type: 'visit', order: index, startLocal: '',
      flexibility: 'flexible', mustVisit: false, estimatedDuration: null,
      placeNameSnapshot: p.name, plannedStatus: 'planned', confirm: 'ok',
    }));
    const res = evaluateDay({ day: { id: 'generated', date }, items, places: byId, options: { matrix } });
    return {
      ok: res.errors.length === 0,
      day,
      end: res.timeline.length ? res.timeline.at(-1).end : null,
      wait: res.stats?.waitMinutes || 0,
    };
  };
  // 同一天里“先到却等 3 小时开门”不是可行就等于好；等待更短、收工更早的顺序优先。
  const betterFit = (a, b) => {
    if (!b) return true;
    const aw = a.wait ?? 0, bw = b.wait ?? 0;
    if (aw !== bw) return aw < bw;
    return (a.end ?? 0) < (b.end ?? 0);
  };
  const orderKey = (points) => points.map(p => p.id).join(',');
  // 动线顺序只是参考：第三方路线可能让后面的点迟到，先用单点移动找等待最短且不丢点的顺序，
  // 全都不行才退化为尾部裁剪。
  const fitRouteDay = (points, date) => {
    const direct = fitsDay(points, date);
    let best = direct.ok ? { ...direct, points } : null;
    if (points.length >= 2) {
      for (let from = 0; from < points.length; from += 1) {
        for (let to = 0; to < points.length; to += 1) {
          if (from === to) continue;
          const trial = [...points];
          const [moved] = trial.splice(from, 1);
          trial.splice(to, 0, moved);
          const fit = fitsDay(trial, date);
          if (fit.ok && betterFit(fit, best)) best = { ...fit, points: trial };
        }
      }
    }
    if (best) return { ...best, reordered: orderKey(best.points) !== orderKey(points) };
    for (let n = points.length - 1; n >= 1; n -= 1) {
      const fit = fitsDay(points.slice(0, n), date);
      if (fit.ok) return { ...fit, points: points.slice(0, n), dropped: points.slice(n) };
    }
    return { ...direct, points };
  };
  const routePtsFor = (route, date, usedSet, record = false) => (route.steps || [])
    .map(stepPoint)
    .filter(p => p && !usedSet.has(p.id)
      && Number.isFinite(p.estimatedDuration) && p.estimatedDuration > 0
      && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      && !(record ? isClosedOn(p, date) : closedOn(p, date)));

  const hasDayLabels = cityRoutes.some(r => /^D\d+$/i.test(String(r.day || '')));
  const isCoreRoute = r => /^D\d+$/i.test(String(r.day || ''));
  const coreRoutes = hasDayLabels ? cityRoutes.filter(isCoreRoute) : cityRoutes;
  let supplementary = hasDayLabels ? cityRoutes.filter(r => !isCoreRoute(r)) : [];

  // 核心日线保持原顺序；专题/延伸线在后面的日期里做前看一步的平衡选择：
  // 今天多排一条，不能把明天排成空天；最后一天仍按原顺序优先。
  for (const r of coreRoutes) {
    if (days.length >= targetDays) break;
    const date = dateFor(days.length);
    const routePts = routePtsFor(r, date, used, true);
    const day = buildDay(routePts);
    if (!day.usedIds.length) continue;
    day.usedIds.forEach(id => used.add(id));
    days.push(mkDay(days.length + 1, day.slots, `参考动线：${r.name} · ${r.tip || r.summary || ''}`));
  }

  while (days.length < targetDays && supplementary.length) {
    const date = dateFor(days.length);
    const lastDay = days.length + 1 >= targetDays;
    const usable = (route, day) => {
      const count = day.usedIds.length;
      return count > 0 && !(count < 2 && (route.steps || []).length >= 2);
    };
    let chosen = null;
    if (lastDay) {
      const options = [];
      for (const r of supplementary) {
        const points = routePtsFor(r, date, used);
        const day = buildDay(points);
        if (!usable(r, day)) continue;
        const fit = fitRouteDay(points, date);
        if (!fit.ok) continue;
        options.push({ r, points: fit.points, day: fit.day, end: fit.end ?? 0 });
      }
      const short = options.filter(o => o.end < 14 * 60).sort((a, b) => a.end - b.end)[0];
      let approved = short || null;
      if (short) {
        for (const other of options) {
          if (other.r === short.r) continue;
          const room = MAX_PER_DAY - other.points.length;
          if (room < 1) continue;
          const combined = [...short.points.slice(0, room), ...other.points];
          const fit = fitsDay(combined, date);
          if (fit.ok && (fit.end ?? 0) > short.end) {
            approved = { r: short.r, day: fit.day, paired: other.r };
            break;
          }
        }
      }
      if (!approved) {
        approved = options.sort((a, b) => b.end - a.end || b.day.usedIds.length - a.day.usedIds.length)[0] || null;
      }
      if (approved) chosen = approved;
    } else {
      const nextDate = dateFor(days.length + 1);
      let best = null;
      supplementary.forEach((r, index) => {
        const day = buildDay(routePtsFor(r, date, used));
        const count = day.usedIds.length;
        if (!usable(r, day)) return;
        const usedAfter = new Set([...used, ...day.usedIds]);
        let nextBest = 0;
        for (const r2 of supplementary) {
          if (r2 === r) continue;
          const nextDay = buildDay(routePtsFor(r2, nextDate, usedAfter));
          if (usable(r2, nextDay)) nextBest = Math.max(nextBest, nextDay.usedIds.length);
        }
        const score = [Math.min(count, nextBest), count + nextBest, count, -index];
        const better = !best
          || score[0] > best.score[0]
          || (score[0] === best.score[0] && score[1] > best.score[1])
          || (score[0] === best.score[0] && score[1] === best.score[1] && score[2] > best.score[2]);
        if (better) best = { r, day, score };
      });
      chosen = best;
    }
    if (!chosen) break;
    if (chosen.paired) {
      const primary = routePtsFor(chosen.r, date, used, true);
      const secondary = routePtsFor(chosen.paired, date, used, true);
      const room = MAX_PER_DAY - secondary.length;
      const placed = fitRouteDay([...primary.slice(0, room), ...secondary], date);
      const day = placed.day;
      if (placed.dropped) placed.dropped.forEach(p => trimmed.set(p.id, p.name));
      if (placed.ok && day.usedIds.length) {
        day.usedIds.forEach(id => used.add(id));
        const orderNote = placed.reordered ? '（按第三方路线调整顺序）' : '';
        days.push(mkDay(days.length + 1, day.slots, `参考动线：${chosen.r.name} + ${chosen.paired.name}（半日线配对）${orderNote}`));
        supplementary = supplementary.filter(r => r !== chosen.r && r !== chosen.paired);
        continue;
      }
      chosen = { r: chosen.r };
    }
    const placed = fitRouteDay(routePtsFor(chosen.r, date, used, true), date);
    const day = placed.day;
    if (placed.dropped) placed.dropped.forEach(p => trimmed.set(p.id, p.name));
    if (!placed.ok || !day.usedIds.length) {
      supplementary = supplementary.filter(r => r !== chosen.r);
      continue;
    }
    day.usedIds.forEach(id => used.add(id));
    const orderNote = placed.reordered ? '（按第三方路线调整顺序）' : '';
    days.push(mkDay(days.length + 1, day.slots, `参考动线：${chosen.r.name} · ${chosen.r.tip || chosen.r.summary || ''}${orderNote}`));
    supplementary = supplementary.filter(r => r !== chosen.r);
  }

  // 稀疏日补点：动线日优先补同群点位，聚类补齐后再补一次；不跨点位群硬凑。
  const dayPoints = (day) => ['morning', 'afternoon', 'evening']
    .flatMap(slot => day.slots[slot])
    .map(name => byName.get(name))
    .filter(Boolean);
  const toppedUp = new Map();
  const topUp = () => {
    let changed = true;
    while (changed) {
      changed = false;
      const sparse = days.filter(day => dayPoints(day).length < MIN_FILLED_DAY);
      for (const day of sparse) {
        const date = dateFor(day.day - 1);
        const current = dayPoints(day);
        const clusters = new Set(current.map(p => p.cluster));
        const candidates = pool.filter(p => p && !used.has(p.id)
          && clusters.has(p.cluster)
          && Number.isFinite(p.estimatedDuration) && p.estimatedDuration > 0
          && Number.isFinite(p.lat) && Number.isFinite(p.lon)
          && !closedOn(p, date));
        let picked = null;
        for (const p of candidates) {
          for (let index = 0; index <= current.length; index += 1) {
            const trial = [...current.slice(0, index), p, ...current.slice(index)];
            const fit = fitsDay(trial, date);
            if (!fit.ok) continue;
            if (betterFit(fit, picked)) picked = { p, day: fit.day, wait: fit.wait, end: fit.end };
          }
        }
        if (!picked) continue;
        day.slots = picked.day.slots;
        used.add(picked.p.id);
        const list = toppedUp.get(day.day) || [];
        list.push(picked.p.name);
        toppedUp.set(day.day, list);
        changed = true;
      }
    }
  };
  topUp();

  // 剩余点位按点位群聚类补齐；当天闭馆的点位留到次日，不硬排。
  const byCluster = new Map();
  for (const p of pool) {
    if (used.has(p.id)) continue;
    if (!byCluster.has(p.cluster)) byCluster.set(p.cluster, []);
    byCluster.get(p.cluster).push(p);
  }
  let remaining = [...byCluster.values()].sort((a, b) => b.length - a.length).flat();
  while (days.length < targetDays && remaining.length) {
    const date = dateFor(days.length);
    const accepted = [];
    const next = [];
    const seen = new Set();
    let built = null;
    for (const p of remaining) {
      if (!p || used.has(p.id) || seen.has(p.id)) continue;
      if (isClosedOn(p, date)) { next.push(p); continue; }
      if (!Number.isFinite(p.estimatedDuration) || p.estimatedDuration <= 0
        || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      if (accepted.length >= MAX_PER_DAY) { next.push(p); continue; }
      seen.add(p.id);
      const fit = fitsDay([...accepted, p], date);
      if (!fit.ok) { trimmed.set(p.id, p.name); next.push(p); continue; }
      accepted.push(p);
      built = fit.day;
    }
    if (!accepted.length || !built) break;
    built.usedIds.forEach(id => used.add(id));
    days.push(mkDay(days.length + 1, built.slots, ''));
    remaining = next;
  }
  topUp();
  for (const day of days) {
    const names = toppedUp.get(day.day);
    if (names && names.length) day.tip = `${day.tip || ''} · 补充：${names.join('、')}`;
  }

  const omitted = new Map();
  for (const item of skipped.values()) {
    if (used.has(item.id) || omitted.has(item.id)) continue;
    omitted.set(item.id, item);
  }
  const closedNote = [...omitted.values()]
    .slice(0, 3)
    .map(item => `${item.name}（${item.date} ${item.reason}）`)
    .join('、');
  const trimNote = [...trimmed.entries()]
    .filter(([id]) => !used.has(id))
    .slice(0, 3)
    .map(([, name]) => name)
    .join('、');
  const note = [
    days.length < targetDays
      ? `可用点位不足，已生成 ${days.length} 天；建议减少天数、补充点位或搭配周边城市`
      : '',
    closedNote ? `已跳过当天闭馆点位：${closedNote}` : '',
    trimNote ? `部分点位当天排不下已跳过：${trimNote}` : '',
  ].filter(Boolean).join('；');

  return {
    id: 'p' + Date.now().toString(36),
    name: `${params.city}${days.length}日游草案`,
    city: params.city,
    date: params.date || '',
    daysN: days.length,
    source: 'rule',
    createdAt: Date.now(),
    interests,
    days,
    ...(note ? { note } : {}),
  };
}
