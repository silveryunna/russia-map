#!/usr/bin/env node
// 校验候选事实文件（研究管线的第二道门）
// 用法: node tools/research-validate.mjs <candidates.json> [--data ./data]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { summarizeCandidates, validateCandidates } from './research-lib.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dataIdx = args.indexOf('--data');
const dataDir = path.resolve(dataIdx >= 0 && args[dataIdx + 1] ? args[dataIdx + 1] : './data');

if (!file) {
  console.error('用法: node tools/research-validate.mjs <candidates.json> [--data ./data]');
  process.exit(1);
}

let candidates;
try {
  candidates = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
} catch (err) {
  console.error('❌ 候选文件不是合法 JSON：' + err.message);
  process.exit(1);
}

const points = JSON.parse(readFileSync(path.join(dataDir, 'points.json'), 'utf8'));
const ids = new Set((Array.isArray(points) ? points : points.points).map((p) => p.id));
const result = validateCandidates(candidates);
const unknownIds = (Array.isArray(candidates) ? candidates : [])
  .filter((c) => c && c.pointId && !ids.has(c.pointId))
  .map((c) => c.pointId);
for (const id of new Set(unknownIds)) result.errors.push(`点位不存在：${id}`);
result.ok = result.errors.length === 0;

if (!result.ok) {
  console.error(`❌ ${result.errors.length} 处候选不合法`);
  for (const e of result.errors) console.error('  · ' + e);
  process.exit(1);
}
const s = summarizeCandidates(candidates);
console.log(`✅ 候选 ${s.total} 条：verified ${s.byStatus.verified}，estimated ${s.byStatus.estimated}，conflict ${s.byStatus.conflict}，unknown ${s.byStatus.unknown}`);
if (s.expired) console.warn(`⚠️ ${s.expired} 条已过 reviewAfter，需要复核`);
