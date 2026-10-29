// 时间轴视图几何模型（纯函数，无 DOM）：把 evaluateDay 的结果排成可绘制的轨道
// 只为界面定位服务，不改变排程结论；跨午夜一律交给 formatMinutesCrossDay 显示
import { DEFAULT_DAY, formatMinutes, formatMinutesCrossDay, parseMinutes } from './feasibility.js';

export const TL_PX_PER_MIN = 1.25;
export const TL_TYPE_COLORS = {
  '博物馆': '#B08A4A', '宫殿庄园': '#A5574E', '宗教场所': '#7E6BA8', '餐饮': '#5E8C4A',
  '演出': '#A8577E', '水上巴士': '#4A7E96', '纪念地': '#8A8272', '公园': '#6C8C4A',
  '地铁站': '#6B7B8C', '观景台': '#B08A4A', '文学地标': '#8A6A4A', '交通': '#9A9A9A', '休息': '#7A9AA8',
};
const MODE_LABEL = { walk: '步行', metro: '地铁' };

// 轨道上的小时刻度用连续时间（24:00、25:00），避免跨日刻度与 00:00 混淆
function railHourLabel(minutes) {
  const h = Math.floor(minutes / 60);
  return String(h).padStart(2, '0') + ':00';
}

export function buildDayRail({ result, day, items = [], pxPerMin = TL_PX_PER_MIN } = {}) {
  const rows = Array.isArray(result && result.timeline) ? result.timeline : [];
  const byId = new Map((Array.isArray(items) ? items : []).map((it) => [it.id, it]));
  const startMin = parseMinutes(day && day.startTime) ?? parseMinutes(DEFAULT_DAY.start) ?? 540;
  const endMin = parseMinutes(day && day.endTime) ?? parseMinutes(DEFAULT_DAY.end) ?? 1260;
  const starts = rows.map((r) => r.start);
  const ends = rows.map((r) => r.end);
  const rangeStart = Math.max(0, Math.min(startMin, ...starts) - 30);
  const rangeEnd = Math.max(endMin, ...ends, startMin + 60) + 20;
  const px = Math.max(0.5, Number(pxPerMin) || TL_PX_PER_MIN);
  const top = (m) => (m - rangeStart) * px;

  const hours = [];
  for (let t = Math.ceil(rangeStart / 60) * 60; t <= rangeEnd; t += 60) {
    if (Math.abs(t - startMin) < 1 || Math.abs(t - endMin) < 1) continue;
    hours.push({ min: t, top: top(t), label: railHourLabel(t) });
  }

  const lastEnd = ends.length ? ends[ends.length - 1] : startMin;
  const overrun = lastEnd > endMin
    ? { top: top(endMin), height: (lastEnd - endMin) * px, endLabel: formatMinutesCrossDay(lastEnd) }
    : null;

  const blocks = rows.map((r, i) => {
    const it = byId.get(r.itemId) || {};
    const type = it.placeType || it.type || 'visit';
    return {
      itemId: r.itemId,
      name: r.name || it.placeNameSnapshot || r.itemId,
      type,
      color: TL_TYPE_COLORS[type] || '#8A8272',
      start: r.start,
      end: r.end,
      duration: r.duration,
      top: top(r.start),
      height: Math.max(r.duration * px, 26),
      timeLabel: `${formatMinutesCrossDay(r.start)}–${formatMinutesCrossDay(r.end)} · ${r.duration}m`,
      must: it.mustVisit !== false,
      pinned: !!it.pinnedStart,
      booked: r.pinned === true,
      unknown: r.calendar === 'unknown',
      overlapPrev: i > 0 && r.start < rows[i - 1].end,
    };
  });

  const legs = [];
  const waits = [];
  rows.forEach((r, i) => {
    if (i === 0) return;
    const prev = rows[i - 1];
    const transit = r.transitMinutes || 0;
    const arriveRaw = prev.end + transit;
    if (transit > 0) {
      const mid = (prev.end + arriveRaw) / 2;
      legs.push({
        top: top(mid) - 8,
        minutes: transit,
        mode: r.mode || 'none',
        label: `${MODE_LABEL[r.mode] || '通行'} ${transit}m`,
        showLabel: transit >= 12,
      });
    }
    const wait = r.start - arriveRaw;
    if (wait > 0) waits.push({ top: top(arriveRaw), height: wait * px, label: `空档 ${wait}m` });
  });

  return {
    pxPerMin: px,
    rangeStart,
    rangeEnd,
    startMin,
    endMin,
    height: Math.max(320, (rangeEnd - rangeStart) * px),
    hours,
    overrun,
    blocks,
    legs,
    waits,
    lastEnd,
  };
}
