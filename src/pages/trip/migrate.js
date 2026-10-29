// 旧数据 → Trip v2 / Visit 迁移（纯函数）
// 原则（ROADMAP §3.4）：名称→placeId；歧义进人工确认队列；绝不静默丢数据。
// 解析不出的点位保留为 needs_confirm 的 visit item + 名字快照，等 UI 里人工确认。

import {
  addDays, createDay, createItem, createTrip, createVisit, isDateString,
  TRIP_SCHEMA_VERSION,
} from './schema.js';

const SLOT_ORDER = ['morning', 'afternoon', 'evening'];

// 已知城市的 IANA 时区；未知城市留空，不猜（界面显示"时区未设置"）
export const CITY_TIME_ZONES = {
  '莫斯科': 'Europe/Moscow',
  '莫斯科州/近郊': 'Europe/Moscow',
  '圣彼得堡': 'Europe/Moscow',
  '叶卡捷琳堡': 'Asia/Yekaterinburg',
  '阿拉木图': 'Asia/Almaty',
  '哈尔滨': 'Asia/Shanghai',
  '伊宁': 'Asia/Shanghai',
  '三亚': 'Asia/Shanghai',
};

export function indexPlaces(points) {
  const byId = new Map();
  const byName = new Map();
  for (const p of Array.isArray(points) ? points : []) {
    if (!p || typeof p.id !== 'string' || !p.id) continue;
    byId.set(p.id, p);
    if (typeof p.name !== 'string' || !p.name) continue;
    const list = byName.get(p.name) || [];
    list.push(p.id);
    byName.set(p.name, list);
  }
  return { byId, byName };
}

export function resolvePlaceName(index, name) {
  const ids = index.byName.get(name) || [];
  if (ids.length === 1) return { placeId: ids[0], candidates: [] };
  return { placeId: null, candidates: ids };
}

function validPlan(p) {
  return !!p && typeof p === 'object' && typeof p.id === 'string' && !!p.id
    && Array.isArray(p.days) && p.days.length > 0;
}

export function migratePlansV1({ plans, points, idFn, now = Date.now() } = {}) {
  const index = indexPlaces(points);
  const trips = [];
  const ambiguities = [];
  const issues = [];
  const stats = { plans: 0, trips: 0, days: 0, items: 0, resolved: 0, ambiguous: 0, unresolved: 0, skipped: 0 };

  for (const plan of Array.isArray(plans) ? plans : []) {
    stats.plans += 1;
    if (!validPlan(plan)) {
      stats.skipped += 1;
      issues.push({
        kind: 'invalid-plan',
        planId: plan && plan.id ? String(plan.id) : '',
        reason: '结构不完整（缺 id 或 days）',
      });
      continue;
    }

    const city = typeof plan.city === 'string' ? plan.city : '';
    const fixed = isDateString(plan.date);
    const trip = createTrip({
      id: `t_${plan.id}`,
      title: typeof plan.name === 'string' && plan.name.trim() ? plan.name : `${city || '未命名'}行程`,
      status: 'draft',
      dateMode: fixed ? 'fixed' : 'relative',
      startDate: fixed ? plan.date : '',
      homeTimeZone: CITY_TIME_ZONES[city] || '',
      currency: 'RUB',
      cities: city ? [city] : [],
      notes: typeof plan.note === 'string' ? plan.note : '',
      origin: {
        source: plan.source === 'ai' ? 'ai' : 'rule',
        channel: typeof plan.channel === 'string' ? plan.channel : '',
        model: typeof plan.model === 'string' ? plan.model : '',
        legacyPlanId: plan.id,
        migratedAt: now,
      },
      createdAt: Number.isFinite(plan.createdAt) ? plan.createdAt : now,
      updatedAt: now,
    }, idFn, now);

    trip.days = plan.days.map((rawDay, di) => {
      const day = createDay({
        index: di + 1,
        date: fixed ? addDays(plan.date, di) : '',
        city,
        note: rawDay && typeof rawDay.tip === 'string' ? rawDay.tip : '',
      }, idFn);
      const slots = rawDay && rawDay.slots && typeof rawDay.slots === 'object' ? rawDay.slots : {};
      for (const slot of SLOT_ORDER) {
        const names = Array.isArray(slots[slot]) ? slots[slot] : [];
        for (const rawName of names) {
          if (typeof rawName !== 'string' || !rawName) continue;
          const { placeId, candidates } = resolvePlaceName(index, rawName);
          const item = createItem({
            dayId: day.id,
            type: 'visit',
            refId: placeId,
            order: day.items.length,
            period: slot,
            placeNameSnapshot: rawName,
            confirm: placeId ? 'ok' : 'needs_confirm',
          }, idFn);
          day.items.push(item);
          if (placeId) {
            stats.resolved += 1;
          } else {
            ambiguities.push({
              kind: candidates.length ? 'ambiguous' : 'unresolved',
              tripId: trip.id,
              dayId: day.id,
              dayIndex: day.index,
              itemId: item.id,
              name: rawName,
              candidates,
            });
            if (candidates.length) stats.ambiguous += 1;
            else stats.unresolved += 1;
          }
        }
      }
      stats.days += 1;
      stats.items += day.items.length;
      return day;
    });

    if (fixed) trip.endDate = addDays(plan.date, trip.days.length - 1);
    trip.tags = city ? [city] : [];
    trips.push(trip);
    stats.trips += 1;
  }

  return { schemaVersion: TRIP_SCHEMA_VERSION, trips, ambiguities, issues, stats };
}

export function migrateCheckinsToVisits({ checkins, now = Date.now(), idFn } = {}) {
  const visits = [];
  const stats = { places: 0, visits: 0, withDate: 0, withNote: 0 };
  const src = checkins && typeof checkins === 'object' && !Array.isArray(checkins) ? checkins : {};
  for (const [placeId, info] of Object.entries(src)) {
    if (!placeId) continue;
    const n = Math.max(1, Math.min(99, Number(info && info.n) || 1));
    const last = info && isDateString(info.last) ? info.last : '';
    const note = info && typeof info.note === 'string' ? info.note : '';
    stats.places += 1;
    for (let i = 0; i < n; i += 1) {
      const isLast = i === n - 1;
      visits.push(createVisit({
        id: `v_${placeId}_${i + 1}`,
        placeId,
        tripId: null,
        date: isLast ? last : '',
        dateSource: last ? 'legacy-checkin' : 'unknown',
        note: isLast ? note : '',
        countIndex: i + 1,
        source: 'legacy-checkin',
        createdAt: now,
      }, idFn, now));
    }
    stats.visits += n;
    if (last) stats.withDate += 1;
    if (note) stats.withNote += 1;
  }
  return { schemaVersion: TRIP_SCHEMA_VERSION, visits, stats };
}
