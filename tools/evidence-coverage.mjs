#!/usr/bin/env node
// 证据覆盖率报告（只读，不判死）：按城市/字段/动线报告事实覆盖与过期情况
// 用法:
//   node tools/evidence-coverage.mjs [数据目录，默认 ./data]
//   node tools/evidence-coverage.mjs ./data --city 莫斯科
//   node tools/evidence-coverage.mjs ./data --json
//
// 退出码：数据缺失/格式错误才为 1；覆盖率低、有过期项只报告，不阻断发布。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { factKey, indexFacts, factState, factCoverage, FACT_FIELDS } from '../src/pages/plan/facts.js';

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--'));
const dir = resolve(dirArg || './data');
const cityIdx = args.indexOf('--city');
const cityFilter = cityIdx >= 0 ? args[cityIdx + 1] : '';
const asJson = args.includes('--json');
const TODAY = new Date().toISOString().slice(0, 10);
const FIELDS = ['openCalendar', 'ticket'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const pointsPath = join(dir, 'points.json');
const factsDir = join(dir, 'facts');
if (!existsSync(pointsPath)) {
  console.error(`❌ 找不到 ${pointsPath}`);
  process.exit(1);
}
if (!existsSync(factsDir)) {
  console.error(`❌ 找不到 ${factsDir}（先建 data/facts/{city}.json）`);
  process.exit(1);
}

const pointsRaw = readJson(pointsPath);
const points = (Array.isArray(pointsRaw) ? pointsRaw : pointsRaw.points || []).filter((p) => p && p.id);
const byId = new Map(points.map((p) => [p.id, p]));

let routes = [];
const routesPath = join(dir, 'routes.json');
if (existsSync(routesPath)) {
  const raw = readJson(routesPath);
  routes = (Array.isArray(raw) ? raw : raw.routes || []).filter((r) => r && Array.isArray(r.steps));
}

const docs = readdirSync(factsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: `data/facts/${f}`, ...readJson(join(factsDir, f)) }));

const allFacts = docs.flatMap((doc) => (Array.isArray(doc.facts) ? doc.facts.map((f) => ({ ...f, city: doc.city })) : []));
const index = indexFacts({ facts: allFacts });

const cities = [...new Set(docs.map((d) => d.city).filter(Boolean))];
const report = {
  generatedAt: TODAY,
  dataDir: dir,
  cities: [],
};

for (const city of cities) {
  if (cityFilter && city !== cityFilter) continue;
  const cityPoints = points.filter((p) => p.city === city);
  const coverage = factCoverage(index, { points: cityPoints, fields: FIELDS, today: TODAY });

  // 动线覆盖：只用真实动线里的点位，按使用次数排序
  const cityRoutes = routes.filter((r) => r.city === city);
  const usage = new Map();
  for (const route of cityRoutes) {
    for (const step of route.steps) if (step && step.pointId) usage.set(step.pointId, (usage.get(step.pointId) || 0) + 1);
  }
  const routePoints = [...usage.keys()].map((id) => byId.get(id)).filter(Boolean);
  const routeOfficial = new Set();
  const routeKnown = { openCalendar: 0, ticket: 0 };
  for (const point of routePoints) {
    for (const field of FIELDS) {
      const fact = index.get(factKey(point.id, field));
      if (!fact) continue;
      if (factState(fact, { today: TODAY }).known) routeKnown[field] += 1;
      if (fact.status === 'verified' && fact.sourceType === 'official') routeOfficial.add(point.id);
    }
  }
  const routeCoverage = {
    points: routePoints.length,
    routes: cityRoutes.length,
    official: routeOfficial.size,
    openCalendar: routeKnown.openCalendar,
    ticket: routeKnown.ticket,
  };

  // 缺口清单：动线点位优先
  const gaps = [];
  for (const point of routePoints) {
    const missing = FIELDS.filter((field) => {
      const fact = index.get(factKey(point.id, field));
      return !fact || !factState(fact, { today: TODAY }).known;
    });
    if (missing.length) gaps.push({ pointId: point.id, name: point.name || '', usage: usage.get(point.id) || 0, missing });
  }
  gaps.sort((a, b) => b.usage - a.usage || a.pointId.localeCompare(b.pointId));

  const stale = cityPoints.flatMap((point) => FIELDS
    .map((field) => index.get(factKey(point.id, field)))
    .filter(Boolean)
    .map((fact) => ({ fact, state: factState(fact, { today: TODAY }) }))
    .filter(({ state }) => state.stale));

  const dueSoon = cityPoints.flatMap((point) => FIELDS
    .map((field) => index.get(factKey(point.id, field)))
    .filter(Boolean)
    .map((fact) => ({ fact, state: factState(fact, { today: TODAY }) }))
    .filter(({ state }) => !state.stale && state.daysUntilReview !== null && state.daysUntilReview <= 30));

  report.cities.push({
    city,
    files: docs.filter((d) => d.city === city).map((d) => d.file),
    points: cityPoints.length,
    facts: allFacts.filter((f) => f.city === city).length,
    coverage,
    routeCoverage,
    gaps: gaps.slice(0, 25),
    gapTotal: gaps.length,
    stale: stale.map(({ fact, state }) => ({ pointId: fact.pointId, field: fact.field, reviewAfter: state.reviewAfter, daysUntilReview: state.daysUntilReview })),
    dueSoon: dueSoon.map(({ fact, state }) => ({ pointId: fact.pointId, field: fact.field, reviewAfter: state.reviewAfter, daysUntilReview: state.daysUntilReview })),
  });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (!report.cities.length) {
  console.error(`❌ 没有匹配的事实文件（--city ${cityFilter || '（未指定）'}）`);
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`\n证据覆盖率报告（${TODAY}）`);
for (const city of report.cities) {
  const c = city.coverage;
  console.log(`\n【${city.city}】${city.files.join('、')}`);
  console.log(`点位 ${city.points} 个 · 事实 ${city.facts} 条 · 有记录点位 ${c.documented} · 官方来源点位 ${c.official} · 过期 ${c.stale}`);
  console.log(`\n字段        ${pad('已知', 6)}${pad('已验证', 8)}${pad('估算', 6)}${pad('未知', 6)}${pad('缺失', 6)}${pad('过期', 6)}覆盖`);
  for (const field of FIELDS) {
    const b = c.byField[field];
    const rate = city.points ? Math.round((b.known / city.points) * 100) : 0;
    console.log(`${pad(field, 12)}${num(b.known, 6)}${num(b.verified, 8)}${num(b.estimated, 6)}${num(b.unknown, 6)}${num(b.missing, 6)}${num(b.stale, 6)}  ${rate}%`);
  }
  console.log(`\n动线：${city.routeCoverage.routes} 条 / 覆盖点位 ${city.routeCoverage.points} 个`
    + ` · 官方来源 ${city.routeCoverage.official}`
    + ` · 开放时间已知 ${city.routeCoverage.openCalendar}`
    + ` · 票价已知 ${city.routeCoverage.ticket}`);

  if (city.gaps.length) {
    console.log(`\n动线缺口（按使用次数降序，共 ${city.gapTotal} 个点位）：`);
    for (const gap of city.gaps.slice(0, 10)) {
      console.log(`  ${pad(gap.pointId, 6)}${pad(gap.name, 28)}×${num(gap.usage, 2)}  缺 ${gap.missing.join(' / ')}`);
    }
  }
  if (city.stale.length) {
    console.log(`\n已过复核日（${city.stale.length} 条，不能继续当已验证事实）：`);
    for (const item of city.stale.slice(0, 10)) {
      console.log(`  ${pad(item.pointId, 6)}${pad(item.field, 14)}复核日 ${item.reviewAfter}（已过 ${-item.daysUntilReview} 天）`);
    }
  }
  if (city.dueSoon.length) {
    console.log(`\n30 天内到期（${city.dueSoon.length} 条）：`);
    for (const item of city.dueSoon.slice(0, 10)) {
      console.log(`  ${pad(item.pointId, 6)}${pad(item.field, 14)}复核日 ${item.reviewAfter}（剩 ${item.daysUntilReview} 天）`);
    }
  }
}

console.log('\n报告完成（只读，不影响退出码）');
