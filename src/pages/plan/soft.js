// 软目标度量（纯函数）：折返、换乘、兴趣命中、正午摄影、连续活动、收工留白
// 只给事实与轻提示，不参与硬约束，也不合成"精确评分"
import { interestHits } from './engine.js';

function placeOf(places, id) {
  if (!places || !id) return null;
  return places instanceof Map ? places.get(id) || null : places[id] || null;
}

function bearing(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function turnDegrees(a, b, c) {
  let d = bearing(a, b) - bearing(b, c);
  d = ((d + 540) % 360) - 180;
  return Math.abs(d);
}

export function evaluateSoft({ day, result, items = [], places = null, interests = [] } = {}) {
  const rows = Array.isArray(result && result.timeline) ? result.timeline : [];
  const byId = new Map((Array.isArray(items) ? items : []).map((it) => [it.id, it]));
  const want = Array.isArray(interests) ? interests.filter((x) => typeof x === 'string' && x) : [];

  let reversals = 0;
  for (let i = 2; i < rows.length; i += 1) {
    const a = placeOf(places, rows[i - 2].placeId);
    const b = placeOf(places, rows[i - 1].placeId);
    const c = placeOf(places, rows[i].placeId);
    if (a && b && c && turnDegrees(a, b, c) > 150) reversals += 1;
  }

  let metroLegs = 0;
  let walkMinutes = 0;
  for (const r of rows) {
    if (r.mode === 'metro') metroLegs += 1;
    if (r.mode === 'walk') walkMinutes += r.transitMinutes || 0;
  }

  // 两次用餐/休息之间最长的连续活动（停留+通行），休息块本身不计入
  let longestStretch = 0;
  let stretch = 0;
  for (const r of rows) {
    const it = byId.get(r.itemId);
    if (it && (it.type === 'meal' || it.type === 'break')) {
      longestStretch = Math.max(longestStretch, stretch);
      stretch = 0;
      continue;
    }
    stretch += (r.duration || 0) + (r.transitMinutes || 0);
  }
  longestStretch = Math.max(longestStretch, stretch);

  const endMin = /^\d{2}:\d{2}$/.test(day && day.endTime ? day.endTime : '')
    ? Number(day.endTime.slice(0, 2)) * 60 + Number(day.endTime.slice(3, 5))
    : 21 * 60;
  const lastEnd = rows.length ? rows[rows.length - 1].end : endMin;
  const endSlackMinutes = Math.max(0, endMin - lastEnd);

  let middayPhoto = 0;
  let placesTotal = 0;
  let interestMatched = 0;
  for (const r of rows) {
    const p = placeOf(places, r.placeId);
    if (!p) continue;
    placesTotal += 1;
    const hits = interestHits(p);
    if (hits.includes('摄影') && r.start < 15 * 60 && r.end > 12 * 60) middayPhoto += 1;
    if (want.length && hits.some((k) => want.includes(k))) interestMatched += 1;
  }

  return {
    reversals,
    metroLegs,
    walkMinutes,
    longestStretchMinutes: longestStretch,
    endSlackMinutes,
    middayPhoto,
    interest: { configured: want, matched: interestMatched, total: placesTotal },
  };
}
