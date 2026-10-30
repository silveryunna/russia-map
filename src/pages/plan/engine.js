// 规则引擎纯函数：不碰 DOM / localStorage，便于 Node 单测。
// 输出格式仍是 slots:[name]，P1 迁移到 placeId 时只改这一层与渲染层。

import { addDays, isDateString } from '../trip/schema.js';
import { calendarState, evaluateDay } from './feasibility.js';

export const PLAN_DAYS_MIN = 1;
export const PLAN_DAYS_MAX = 7; // 与 api/index.php 的 1–7 保持一致
export const MAX_PER_DAY = 8;
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
 * @param {{pts:Array,rts:Array}} data
 */
export function ruleEngine(params, data) {
  const targetDays = clampDays(params.days);
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
  const isClosedOn = (place, date) => {
    if (!date || !place || !place.openCalendar || place.openCalendar === 'unknown') return false;
    const state = calendarState(place.openCalendar, date);
    if (state.state !== 'closed') return false;
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
    const res = evaluateDay({ day: { id: 'generated', date }, items, places: byId });
    return { ok: res.errors.length === 0, day };
  };

  // 动线映射为日：先剔除已用点位和当天闭馆点位，再按单日上限截断，溢出点位回到候选池。
  for (const r of cityRoutes) {
    if (days.length >= targetDays) break;
    const date = dateFor(days.length);
    const routePts = (r.steps || [])
      .map(stepPoint)
      .filter(p => p && !used.has(p.id)
        && Number.isFinite(p.estimatedDuration) && p.estimatedDuration > 0
        && Number.isFinite(p.lat) && Number.isFinite(p.lon)
        && !isClosedOn(p, date));
    const day = buildDay(routePts);
    if (!day.usedIds.length) continue;
    day.usedIds.forEach(id => used.add(id));
    days.push(mkDay(days.length + 1, day.slots, `参考动线：${r.name} · ${r.tip || r.summary || ''}`));
  }

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
