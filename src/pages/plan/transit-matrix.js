// 城市交通矩阵（纯函数）：只做索引与查询，不 fetch、不碰 DOM
// 数据来源由 data/transit-matrix.json 提供；缺失时调用方回退 coordinate estimate。

const MODES = new Set(['walking', 'car']);

export function indexTransitMatrix(data) {
  const index = new Map();
  const entries = Array.isArray(data && data.entries) ? data.entries : [];
  for (const entry of entries) {
    if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') continue;
    if (!MODES.has(entry.mode)) continue;
    if (!Number.isFinite(entry.minutes) || entry.minutes <= 0) continue;
    if (!Number.isFinite(entry.meters) || entry.meters < 0) continue;
    index.set(`${entry.from}|${entry.to}|${entry.mode}`, {
      ...entry,
      provider: data.provider || '',
      collectedAt: data.collectedAt || '',
    });
  }
  return index;
}

export function lookupTransitLeg(index, fromId, toId, mode) {
  if (!index || !fromId || !toId || !MODES.has(mode)) return null;
  return index.get(`${fromId}|${toId}|${mode}`) || null;
}

export function matrixCoverage(index) {
  if (!index) return { total: 0, walking: 0, car: 0 };
  let walking = 0;
  let car = 0;
  for (const entry of index.values()) {
    if (entry.mode === 'walking') walking += 1;
    else car += 1;
  }
  return { total: index.size, walking, car };
}
