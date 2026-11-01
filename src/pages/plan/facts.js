// 事实账本（纯函数）：按 pointId+field 索引 data/facts/{city}.json
// 设计要点：
// - points.json 是消费口径，facts 是来源与生命周期；两者同字段必须一致（由 check-facts 交叉校验）
// - 状态词表与研究管线共用：pending | verified | estimated | conflict | unknown
// - 过期不落库：reviewAfter 与「今天」比较在读取时计算，避免数据文件随时间腐烂
// - verified 只能来自 official 来源；unknown 是合法终态

export const FACT_FIELDS = ['openCalendar', 'ticket', 'duration', 'name_local'];
export const FACT_STATUS = ['pending', 'verified', 'estimated', 'conflict', 'unknown'];
export const SOURCE_TYPES = ['official', 'curated', 'social', 'estimate'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function factKey(pointId, field) {
  return `${pointId}|${field}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO, toISO) {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

// 索引：非法条目直接跳过（与 transit-matrix 同策略，校验交给 check-facts）
export function indexFacts(data) {
  const index = new Map();
  const list = Array.isArray(data && data.facts) ? data.facts : [];
  for (const fact of list) {
    if (!fact || typeof fact.pointId !== 'string' || !fact.pointId) continue;
    if (!FACT_FIELDS.includes(fact.field)) continue;
    if (!FACT_STATUS.includes(fact.status)) continue;
    index.set(factKey(fact.pointId, fact.field), { ...fact, city: (data && data.city) || '' });
  }
  return index;
}

// 读取时状态：unknown/pending 不是断言，永远不会 stale
export function factState(fact, { today = todayISO() } = {}) {
  if (!fact || typeof fact !== 'object') {
    return { status: 'missing', effectiveStatus: 'missing', stale: false, known: false, reviewAfter: '', daysUntilReview: null };
  }
  const status = FACT_STATUS.includes(fact.status) ? fact.status : 'unknown';
  const reviewAfter = DATE_RE.test(fact.reviewAfter || '') ? fact.reviewAfter : '';
  const asserts = status === 'verified' || status === 'estimated' || status === 'conflict';
  const stale = Boolean(reviewAfter) && asserts && reviewAfter < today;
  return {
    status,
    effectiveStatus: stale ? 'stale' : status,
    stale,
    known: status !== 'unknown' && fact.value !== 'unknown' && fact.value !== null && fact.value !== undefined,
    reviewAfter,
    daysUntilReview: reviewAfter ? daysBetween(today, reviewAfter) : null,
  };
}

function scoped(index, points) {
  const ids = new Set((Array.isArray(points) ? points : []).filter((p) => p && p.id).map((p) => p.id));
  return [...index.values()].filter((f) => !ids.size || ids.has(f.pointId));
}

// 覆盖率：分母是 points（点位），分子按字段统计；official 只认 verified+official
export function factCoverage(index, { points = [], fields = ['openCalendar', 'ticket'], today } = {}) {
  const list = scoped(index, points);
  const pointCount = (Array.isArray(points) ? points : []).filter((p) => p && p.id).length;
  const byField = {};
  for (const field of fields) {
    byField[field] = {
      field, points: pointCount, known: 0, verified: 0, estimated: 0, conflict: 0, pending: 0, unknown: 0, missing: 0, stale: 0,
    };
  }
  const byStatus = Object.fromEntries(FACT_STATUS.map((s) => [s, 0]));
  const documented = new Set();
  const official = new Set();
  let stale = 0;

  for (const fact of list) {
    const state = factState(fact, { today });
    if (byStatus[fact.status] !== undefined) byStatus[fact.status] += 1;
    if (state.stale) stale += 1;
    documented.add(fact.pointId);
    if (fact.status === 'verified' && fact.sourceType === 'official') official.add(fact.pointId);
    const bucket = byField[fact.field];
    if (!bucket) continue;
    if (state.stale) bucket.stale += 1;
    if (!state.known) { bucket.unknown += 1; continue; }
    bucket.known += 1;
    if (fact.status === 'verified') bucket.verified += 1;
    else if (fact.status === 'estimated') bucket.estimated += 1;
    else if (fact.status === 'conflict') bucket.conflict += 1;
    else bucket.pending += 1;
  }

  // 没有任何事实记录的点位 = missing（区别于显式 unknown）
  for (const field of fields) {
    const bucket = byField[field];
    if (!bucket || !pointCount) continue;
    const recorded = list.filter((f) => f.field === field).length;
    bucket.missing = Math.max(0, pointCount - recorded);
  }

  return {
    points: pointCount,
    facts: list.length,
    documented: documented.size,
    official: official.size,
    stale,
    byStatus,
    byField,
  };
}

// 缺口清单：没有事实、或事实显式为 unknown 的 pointId+field
export function factGaps(index, { points = [], fields = ['openCalendar', 'ticket'], today } = {}) {
  const gaps = [];
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || !point.id) continue;
    for (const field of fields) {
      const fact = index.get(factKey(point.id, field));
      const state = factState(fact, { today });
      if (!fact || !state.known) {
        gaps.push({ pointId: point.id, field, reason: fact ? 'unknown' : 'missing' });
      }
    }
  }
  return gaps;
}
