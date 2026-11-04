#!/usr/bin/env node
// 动线契约棘轮（审计 P1-6）：`check-sample-data.mjs` 只守莫斯科样板，
// 其余 7 个城市的动线点位可以静默缺 name_local / 时长 / 开放日历 / 票价 / 来源，
// 于是「能生成行程」和「生成得出可执行行程」之间没有门。
// 这里把 data/routes.json 实际覆盖的**全部**点位纳入同一份契约，按 pointId|field 记账：
//   · 新出现的缺口 = 立即失败（加点位/加动线必须同时补字段）
//   · 已补上的缺口 = 提示跑 --tighten 收紧基线（只准降不准升）
// 用法: node tools/check-route-contract.mjs [数据目录，默认 ./data]
//       node tools/check-route-contract.mjs --tighten        # 把当前缺口写回基线（只能变少）
//       node tools/check-route-contract.mjs --tighten --force # 明知有新增缺口也覆盖（需在提交说明里写理由）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPE_VOCAB } from './type-vocab.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tighten = args.includes('--tighten');
const force = args.includes('--force');
const dirArg = args.find((a) => !a.startsWith('--'));
const dir = resolve(dirArg || resolve(ROOT, 'data'));
const BASELINE = resolve(ROOT, 'tools/fixtures/route-contract-baseline.json');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = new Set(['official', 'curated', 'estimate', 'measured', 'user']);

function readJson(file) {
  return JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
}

const rawPoints = readJson('points.json');
const points = Array.isArray(rawPoints) ? rawPoints : rawPoints.points || [];
const routes = readJson('routes.json');
const byId = new Map(points.map((p) => [p.id, p]));

const scope = [...new Set(routes.flatMap((r) => (r.steps || []).map((s) => s.pointId)).filter(Boolean))].sort();

// 契约与 check-sample-data 同一口径：缺字段记一条，字段值非法也记一条。
// 只记「哪个点位缺哪个字段」，不记具体值——值会随研究更新，棘轮只关心缺口数量不反弹。
const checks = {
  name: (p) => typeof p.name === 'string' && p.name.trim(),
  name_en: (p) => typeof p.name_en === 'string' && p.name_en.trim(),
  name_local: (p) => typeof p.name_local === 'string' && p.name_local.trim(),
  type: (p) => TYPE_VOCAB.includes(p.type),
  coords: (p) => typeof p.lat === 'number' && typeof p.lon === 'number',
  confidence: (p) => [75, 100].includes(p.confidence),
  duration: (p) => Number.isInteger(p.estimatedDuration) && p.estimatedDuration > 0 && p.estimatedDuration <= 720,
  durationBasis: (p) => ['estimate', 'measured'].includes(p.durationBasis),
  openCalendar: (p) => p.openCalendar === 'unknown'
    || !!(p.openCalendar && typeof p.openCalendar === 'object'
      && (p.openCalendar.alwaysOpen === true || (p.openCalendar.days && p.openCalendar.open && p.openCalendar.close))),
  ticket: (p) => typeof p.ticket === 'string' && !!p.ticket.trim(),
  sources: (p) => Array.isArray(p.sources) && p.sources.length > 0
    && p.sources.every((s) => s && SOURCE_TYPES.has(s.type) && DATE.test(s.collectedAt || '')
      && (s.url || s.note) && (!s.url || /^https?:\/\//i.test(s.url))),
};

const entries = [];
const unknownPoints = [];
for (const id of scope) {
  const p = byId.get(id);
  if (!p) { unknownPoints.push(id); continue; }
  for (const [field, pass] of Object.entries(checks)) {
    if (!pass(p)) entries.push(`${id}|${field}`);
  }
}
entries.sort();

const fieldOf = (e) => e.split('|')[1];
const summarize = (list) => {
  const byField = {};
  const byCity = {};
  for (const e of list) {
    const id = e.split('|')[0];
    byField[fieldOf(e)] = (byField[fieldOf(e)] || 0) + 1;
    const city = byId.get(id)?.city || '?';
    byCity[city] = (byCity[city] || 0) + 1;
  }
  return { byField, byCity };
};

// 动线里引用了不存在的点位：这是数据完整性错误，不归棘轮（check-data 也会拦），单独硬失败
if (unknownPoints.length) {
  console.error(`❌ routes.json 引用了不存在的点位：${unknownPoints.join(', ')}`);
  process.exit(1);
}

const hasBaseline = existsSync(BASELINE);
let baseline = { entries: [] };
if (hasBaseline) baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const known = new Set(baseline.entries || []);
const current = new Set(entries);
const added = entries.filter((e) => !known.has(e));
const fixed = [...known].filter((e) => !current.has(e)).sort();

if (tighten) {
  if (added.length && !force && hasBaseline) {
    const { byField } = summarize(added);
    console.error('❌ 基线只能收紧，不能放宽：当前有新增缺口，先补数据（或确认后加 --force）');
    for (const e of added) console.error(`   · ${describe(e)}`);
    console.error(`   新增合计 ${added.length} 条：${Object.entries(byField).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
    process.exit(1);
  }
  mkdirSync(dirname(BASELINE), { recursive: true });
  const next = {
    note: '动线契约棘轮基线（tools/check-route-contract.mjs --tighten 重新生成）；entries 是 pointId|field，只准减少',
    updatedAt: new Date().toISOString().slice(0, 10),
    scope: scope.length,
    entries,
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n', 'utf8');
  console.log(`✅ 基线已收紧：${baseline.entries?.length ?? 0} → ${entries.length} 条缺口（动线覆盖 ${scope.length} 个点位）`);
  process.exit(0);
}

function describe(e) {
  const [id, field] = e.split('|');
  const p = byId.get(id);
  return `${id}（${p?.city || '?'} · ${p?.name || '?'}）缺 ${field}`;
}

let bad = 0;
console.log(`动线契约：${routes.length} 条动线 / ${scope.length} 个点位 / 基线缺口 ${known.size} 条`);

if (!hasBaseline) {
  console.error(`❌ 缺少基线 ${BASELINE}`);
  console.error('   先跑 `node tools/check-route-contract.mjs --tighten` 登记现状，此后只准降不准升');
  process.exit(1);
}

if (added.length) {
  bad += added.length;
  const { byField, byCity } = summarize(added);
  console.error(`\n❌ 新增 ${added.length} 处动线契约缺口（不允许悄悄加进来）：`);
  for (const e of added) console.error(`   · ${describe(e)}`);
  console.error(`   按字段：${Object.entries(byField).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
  console.error(`   按城市：${Object.entries(byCity).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
  console.error('   补字段请同时写 data/points.json 与 data/facts/{city}.json（来源账本），或把点位移出动线');
} else {
  console.log(`✅ 没有新增契约缺口（${entries.length} 条存量，全部已登记在基线）`);
}

if (fixed.length) {
  console.log(`\n💡 有 ${fixed.length} 条基线缺口已补上：跑 \`node tools/check-route-contract.mjs --tighten\` 收紧基线`);
  for (const e of fixed.slice(0, 8)) console.log(`   · ${e}`);
  if (fixed.length > 8) console.log(`   · …其余 ${fixed.length - 8} 条`);
}

const { byCity } = summarize(entries);
console.log('\n存量缺口分布（按城市）：');
for (const [city, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1])) {
  const pts = scope.filter((id) => (byId.get(id)?.city || '?') === city).length;
  console.log(`   · ${city}：${n} 条 / ${pts} 个动线点位`);
}

if (bad) {
  console.error(`\n动线契约为 ${bad} 处新增缺口`);
  process.exit(1);
}
console.log('\n动线契约门通过');
