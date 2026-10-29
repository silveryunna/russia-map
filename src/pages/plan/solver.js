// 基于软目标的日内顺序求解：确定性插入式局部搜索
// 只重排"可动的 visit"（非固定、无绝对预订、无锁定），餐食/休息与固定项保持位置
import { evaluateDay } from './feasibility.js';
import { evaluateSoft } from './soft.js';

const PERIOD_RANK = { morning: 0, afternoon: 1, evening: 2 };

function periodViolations(list) {
  let violations = 0;
  let last = -1;
  for (const it of list) {
    const rank = PERIOD_RANK[it && it.period];
    if (rank === undefined) continue;
    if (rank < last) violations += 1;
    last = rank;
  }
  return violations;
}

function endOfDay(day) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(day && day.endTime ? day.endTime : '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 21 * 60;
}

// 10 卢布 ≈ 1 个软目标分值（≈1 分钟通行），仅在 RUB 口径下启用
export const TAXI_COST_PER_SCORE_RUB = 10;

export function softScore({ day, result, soft, taxiCostWeight = 1 }) {
  const rows = result && Array.isArray(result.timeline) ? result.timeline : [];
  const lastEnd = rows.length ? rows[rows.length - 1].end : 0;
  const overrun = Math.max(0, lastEnd - endOfDay(day));
  const errors = result && Array.isArray(result.errors) ? result.errors.length : 0;
  return (errors * 1e6)
    + (overrun * 100)
    + (soft.reversals * 60)
    + ((soft.middayPhoto || 0) * 30)
    + (result && result.stats ? result.stats.transitMinutes : 0)
    + (((result && result.stats ? result.stats.taxiCostRub || 0 : 0) / TAXI_COST_PER_SCORE_RUB) * taxiCostWeight)
    + (Math.max(0, (soft.longestStretchMinutes || 0) - 240) * 0.5);
}

export function optimizeDayOrder({ day, items, places, interests = [], maxPasses = 2, taxiCostWeight = 1 } = {}) {
  const base = Array.isArray(items) ? items : [];
  const evaluate = (list) => {
    const result = evaluateDay({
      day: { id: day && day.id, date: day && day.date },
      items: list,
      places,
      options: {
        start: day && day.startTime,
        end: day && day.endTime,
        transportMode: day && day.transportMode === 'taxi' ? 'taxi' : 'transit',
      },
    });
    const soft = evaluateSoft({ day, result, items: list, places, interests });
    // 时段倒置权重高于折返/通行（1 次≈10 分钟超时），避免把晚间演出排到上午
    const periodPenalty = periodViolations(list) * 1000;
    return { result, soft, score: softScore({ day, result, soft, taxiCostWeight }) + periodPenalty };
  };

  // 小时段组内稳定排序的候选：一次修正跨时段倒置，避免局部搜索被中间状态卡住
  const periodSortedCandidate = (list) => {
    const movableList = list.filter((it) => movable.has(it.id));
    const sorted = [...movableList].sort((a, b) => {
      const ra = PERIOD_RANK[a.period] ?? 1.5;
      const rb = PERIOD_RANK[b.period] ?? 1.5;
      return ra - rb;
    });
    let k = 0;
    return list.map((it) => (movable.has(it.id) ? sorted[k++] : it));
  };

  const before = evaluate(base);
  const baseIds = base.map((it) => it.id);
  const movable = new Set(base
    .filter((it) => it && it.type === 'visit' && it.flexibility !== 'fixed' && !it.pinnedStart
      && !(typeof it.startLocal === 'string' && it.startLocal))
    .map((it) => it.id));

  if (movable.size < 2) {
    return { improved: false, order: baseIds, before, after: before, beforePeriods: periodViolations(base), afterPeriods: periodViolations(base) };
  }

  let current = base;
  let currentEval = before;
  let best = { items: base, eval: before };

  const sortedBase = periodSortedCandidate(base);
  const sortedEval = evaluate(sortedBase);
  if (sortedEval.score < best.eval.score - 1e-9) {
    current = sortedBase;
    currentEval = sortedEval;
    best = { items: sortedBase, eval: sortedEval };
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let localBest = { items: current, eval: currentEval };
    const ids = current.map((it) => it.id);
    for (const id of movable) {
      const rest = ids.filter((x) => x !== id);
      for (let at = 0; at <= rest.length; at += 1) {
        const candidateIds = [...rest.slice(0, at), id, ...rest.slice(at)];
        if (candidateIds.join('|') === ids.join('|')) continue;
        const candidate = candidateIds.map((cid) => current.find((it) => it.id === cid));
        const ev = evaluate(candidate);
        if (ev.score < localBest.eval.score - 1e-9) localBest = { items: candidate, eval: ev };
      }
    }
    if (localBest.eval.score >= currentEval.score - 1e-9) break;
    best = localBest;
    current = localBest.items;
    currentEval = localBest.eval;
  }

  const order = best.items.map((it) => it.id);
  const changed = order.join('|') !== baseIds.join('|');
  const safe = best.eval.result.errors.length <= before.result.errors.length;
  const improved = safe && changed && best.eval.score < before.score - 1e-9;
  return {
    improved,
    order: safe ? order : baseIds,
    before,
    after: safe ? best.eval : before,
    beforePeriods: periodViolations(base),
    afterPeriods: periodViolations(safe ? best.items : base),
  };
}
