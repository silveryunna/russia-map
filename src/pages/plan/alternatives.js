// Plan B 候选：同城、未去过、非 pending；优先同类型/同簇/同兴趣，再按距离
import { distanceMeters } from './feasibility.js';
import { interestHits } from './engine.js';

export function suggestAlternatives({ target, points = [], usedIds = [], limit = 3 } = {}) {
  if (!target || typeof target !== 'object' || !target.id) return [];
  const used = new Set(Array.isArray(usedIds) ? usedIds : []);
  const targetHits = new Set(interestHits(target));
  const scored = [];

  for (const p of Array.isArray(points) ? points : []) {
    if (!p || typeof p !== 'object' || !p.id || p.id === target.id) continue;
    if (p.pending || used.has(p.id)) continue;
    if (target.city && p.city !== target.city) continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    let score = 0;
    if (p.type && p.type === target.type) score += 3;
    if (p.cluster && p.cluster === target.cluster) score += 2;
    score += interestHits(p).filter((k) => targetHits.has(k)).length;
    scored.push({ point: p, distance: distanceMeters(target, p) || 0, score });
  }

  scored.sort((a, b) => b.score - a.score || a.distance - b.distance);
  return scored.slice(0, Math.max(0, limit));
}
