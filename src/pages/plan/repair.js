// 可执行修复的纯逻辑：只计算"删哪些条目能消除超时"，不直接改 Trip
import { evaluateDay } from './feasibility.js';

function isTrimmable(item) {
  return !!item && item.mustVisit !== true && item.flexibility !== 'fixed' && !item.pinnedStart;
}

export function planAutoTrim({ day, items, places, maxDrops = 12 } = {}) {
  const options = { start: day && day.startTime, end: day && day.endTime };
  const evaluate = (list) => evaluateDay({
    day: { id: day && day.id, date: day && day.date }, items: list, places, options,
  });
  let list = Array.isArray(items) ? items : [];
  const before = evaluate(list);
  const dropIds = [];
  let after = before;

  while (after.errors.some((c) => c.kind === 'day-overrun') && dropIds.length < maxDrops) {
    const candidates = after.timeline
      .map((t) => ({ t, item: list.find((i) => i.id === t.itemId) }))
      .filter(({ item }) => isTrimmable(item))
      .sort((a, b) => b.t.duration - a.t.duration);
    if (!candidates.length) break;
    const victim = candidates[0].item;
    dropIds.push(victim.id);
    list = list.filter((i) => i.id !== victim.id);
    after = evaluate(list);
  }

  return {
    dropIds,
    before,
    after,
    resolved: !after.errors.some((c) => c.kind === 'day-overrun'),
  };
}
