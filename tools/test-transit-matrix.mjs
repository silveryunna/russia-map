#!/usr/bin/env node
// 交通矩阵质量门：数据契约 + 查询 + 可行性引擎接线（缺失时回退估算）
// 用法: node tools/test-transit-matrix.mjs [数据目录，默认 ./data]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { indexTransitMatrix, lookupTransitLeg, matrixCoverage } from '../src/pages/plan/transit-matrix.js';
import { estimateLeg, evaluateDay } from '../src/pages/plan/feasibility.js';

const dir = resolve(process.argv[2] || './data');
const points = JSON.parse(readFileSync(resolve(dir, 'points.json'), 'utf8'));
const matrix = JSON.parse(readFileSync(resolve(dir, 'transit-matrix.json'), 'utf8'));
const byId = new Map(points.map((p) => [p.id, p]));

let bad = 0;
const fail = (m) => { console.error(`❌ ${m}`); bad += 1; };
const ok = (m) => console.log(`✅ ${m}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// 1) 数据契约
{
  if (matrix.city === '莫斯科' && matrix.provider === '2gis' && DATE.test(matrix.collectedAt || '') && DATE.test(matrix.reviewAfter || '')) {
    ok('矩阵元数据完整（城市/来源/采集与复核日期）');
  } else fail(`矩阵元数据异常：${JSON.stringify({ city: matrix.city, provider: matrix.provider, collectedAt: matrix.collectedAt, reviewAfter: matrix.reviewAfter })}`);

  const entries = Array.isArray(matrix.entries) ? matrix.entries : [];
  const keys = new Set();
  let invalid = 0;
  for (const e of entries) {
    if (!e || !byId.has(e.from) || !byId.has(e.to) || !['walking', 'car'].includes(e.mode)
      || !Number.isInteger(e.minutes) || e.minutes <= 0 || e.minutes > 720
      || !Number.isInteger(e.meters) || e.meters <= 0) { invalid += 1; continue; }
    const key = `${e.from}|${e.to}|${e.mode}`;
    if (keys.has(key)) invalid += 1;
    keys.add(key);
  }
  if (entries.length && !invalid) ok(`矩阵条目 ${entries.length} 条，起终点/模式/时长/距离均有效`);
  else fail(`矩阵有 ${invalid} 条非法或重复条目`);

  const coverage = matrixCoverage(indexTransitMatrix(matrix));
  if (coverage.total >= 15 && coverage.walking >= 8 && coverage.car >= 5) ok(`矩阵覆盖 ${coverage.total} 条（步行 ${coverage.walking} / 驾车 ${coverage.car}）`);
  else fail(`矩阵覆盖不足：${JSON.stringify(coverage)}`);
}

// 2) 索引与直接查询
{
  const index = indexTransitMatrix(matrix);
  const first = matrix.entries[0];
  const hit = lookupTransitLeg(index, first.from, first.to, first.mode);
  if (hit && hit.minutes === first.minutes && hit.provider === '2gis') ok('矩阵查询命中并带来源');
  else fail('矩阵查询未命中');
  if (!lookupTransitLeg(index, first.from, first.to, first.mode === 'walking' ? 'car' : 'walking')) ok('模式不匹配时不串用');
  else fail('模式不匹配仍命中');
  const fake = indexTransitMatrix({ provider: 'x', entries: [{ from: 'a', to: 'b', mode: 'walking', minutes: 0, meters: 1 }, { from: 'a', to: 'b', mode: 'flying', minutes: 5, meters: 1 }, { from: 'a', to: 'b', mode: 'car', minutes: 5, meters: 100 }] });
  if (fake.size === 1) ok('非法矩阵条目被忽略');
  else fail(`非法矩阵条目未被忽略：${fake.size}`);
}

// 3) estimateLeg 接线
{
  const a = { id: 'pa', lat: 55.7, lon: 37.6 };
  const b = { id: 'pb', lat: 55.701, lon: 37.601 };
  const index = indexTransitMatrix({ provider: '2gis', collectedAt: '2026-10-31', entries: [
    { from: 'pa', to: 'pb', mode: 'walking', minutes: 7, meters: 300 },
    { from: 'pa', to: 'pb', mode: 'car', minutes: 9, meters: 1200 },
  ] });
  const walk = estimateLeg(a, b, { matrix: index });
  if (walk && walk.source === 'matrix' && walk.minutes === 7 && walk.meters === 300 && walk.mode === 'walk') ok('estimateLeg 使用真实步行矩阵');
  else fail(`步行矩阵未生效：${JSON.stringify(walk)}`);
  const taxi = estimateLeg(a, b, { matrix: index, mode: 'taxi' });
  if (taxi && taxi.source === 'matrix' && taxi.sourceKind === 'third-party-route' && taxi.minutes === 14 && taxi.mode === 'taxi' && taxi.cost > 0 && taxi.currency === 'RUB') ok('estimateLeg 使用真实驾车矩阵并补统一门到门开销');
  else fail(`驾车矩阵未生效：${JSON.stringify(taxi)}`);
  const fallback = estimateLeg(a, b, {});
  if (fallback && fallback.source === 'estimate' && fallback.sourceKind === 'model-estimate') ok('矩阵缺失时回退估算');
  else fail('矩阵缺失未回退估算');
}

// 4) evaluateDay 使用矩阵
{
  const places = new Map([
    ['pa', { id: 'pa', name: 'A', lat: 55.7, lon: 37.6, estimatedDuration: 30 }],
    ['pb', { id: 'pb', name: 'B', lat: 55.701, lon: 37.601, estimatedDuration: 30 }],
  ]);
  const index = indexTransitMatrix({ provider: '2gis', collectedAt: '2026-10-31', entries: [
    { from: 'pa', to: 'pb', mode: 'walking', minutes: 7, meters: 300 },
  ] });
  const items = [
    { id: 'i1', refId: 'pa', type: 'visit', order: 0, startLocal: '', flexibility: 'flexible', mustVisit: true, estimatedDuration: null, placeNameSnapshot: 'A', plannedStatus: 'planned', confirm: 'ok' },
    { id: 'i2', refId: 'pb', type: 'visit', order: 1, startLocal: '', flexibility: 'flexible', mustVisit: true, estimatedDuration: null, placeNameSnapshot: 'B', plannedStatus: 'planned', confirm: 'ok' },
  ];
  const res = evaluateDay({ day: { id: 'd', date: '2026-11-11' }, items, places, options: { matrix: index } });
  if (res.stats.transitMinutes === 7 && !res.errors.length) ok('evaluateDay 按矩阵累计通行 7 分钟');
  else fail(`evaluateDay 矩阵通行异常：${res.stats.transitMinutes}m / ${JSON.stringify(res.errors)}`);
}

if (bad) { console.error(`\n${bad} 项交通矩阵测试失败`); process.exit(1); }
console.log('\n交通矩阵质量门通过');
