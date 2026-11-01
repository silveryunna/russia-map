#!/usr/bin/env node
// 事实账本门：schema + 来源等级 + 日期规则 + 与 points.json 交叉校验（防漂移）
// 用法: node tools/check-facts.mjs [数据目录，默认 ./data]
//
// 硬规则（与研究管线一致）：
// - verified 只能来自 official 来源，且必须有 https 链接
// - unknown 是合法终态，不需要链接
// - conflict 必须写 note 说明冲突
// - collectedAt/reviewAfter 为 YYYY-MM-DD 且 reviewAfter >= collectedAt
// - 同一 pointId+field 只能有一条
// - 事实的 value 必须与 points.json 同字段完全一致（points.json 是消费口径，facts 是来源账本）
// 过期（reviewAfter < 今天）只报告不判死：数据可以过期，但不能假装没过期。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FACT_FIELDS, FACT_STATUS, SOURCE_TYPES, factKey, indexFacts, factCoverage } from '../src/pages/plan/facts.js';

const dir = resolve(process.argv[2] || './data');
const factsDir = join(dir, 'facts');
const TODAY = new Date().toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\//i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

let bad = 0;
const fail = (m) => { console.error(`❌ ${m}`); bad += 1; };
const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// 稳定序列化：对象键排序，避免键序不同被误判为漂移
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// points.json 的消费口径：缺字段按 unknown / null 处理
function pointValue(point, field) {
  if (!point) return undefined;
  if (field === 'openCalendar') return point.openCalendar === undefined ? 'unknown' : point.openCalendar;
  if (field === 'ticket') return point.ticket === undefined ? 'unknown' : point.ticket;
  if (field === 'duration') return point.estimatedDuration === undefined ? null : point.estimatedDuration;
  if (field === 'name_local') return point.name_local === undefined ? '' : point.name_local;
  return undefined;
}

function checkValue(field, value) {
  if (field === 'openCalendar') {
    if (value === 'unknown') return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'openCalendar 需要对象或 "unknown"';
    for (const k of ['days', 'open', 'close']) if (typeof value[k] !== 'string' || !value[k]) return `openCalendar 缺 ${k}`;
    for (const k of ['open', 'close']) if (!TIME_RE.test(value[k])) return `openCalendar.${k} 需 HH:MM`;
    if (value.lastEntry !== undefined && !TIME_RE.test(value.lastEntry)) return 'openCalendar.lastEntry 需 HH:MM';
    return null;
  }
  if (field === 'ticket') {
    if (typeof value !== 'string' || !value.trim()) return 'ticket 需要非空字符串或 "unknown"';
    return null;
  }
  if (field === 'duration') {
    if (value === null) return null;
    if (!Number.isInteger(value) || value <= 0 || value > 720) return 'duration 需要 1–720 的整数或 null';
    return null;
  }
  if (field === 'name_local') {
    if (typeof value !== 'string' || !value.trim()) return 'name_local 需要非空字符串';
    return null;
  }
  return `未知字段 ${field}`;
}

// ---------- 读取数据 ----------
if (!existsSync(factsDir)) {
  fail(`没有 ${factsDir}（事实账本目录不存在）`);
  process.exit(1);
}
const pointsRaw = readJson(join(dir, 'points.json'));
const points = Array.isArray(pointsRaw) ? pointsRaw : pointsRaw.points || [];
const byId = new Map(points.filter((p) => p && p.id).map((p) => [p.id, p]));
const cityIds = new Set(points.filter((p) => p && p.city).map((p) => p.city));

const files = readdirSync(factsDir).filter((f) => f.endsWith('.json')).sort();
if (!files.length) fail(`${factsDir} 下没有事实文件`);

const allFacts = [];
const seenKeys = new Set();

for (const file of files) {
  const path = join(factsDir, file);
  const where = `data/facts/${file}`;
  let doc;
  try {
    doc = readJson(path);
  } catch (err) {
    fail(`${where} 不是合法 JSON：${err.message}`);
    continue;
  }

  if (!doc || typeof doc !== 'object') { fail(`${where} 顶层必须是对象`); continue; }
  if (typeof doc.city !== 'string' || !doc.city) fail(`${where} 缺 city`);
  else if (!cityIds.has(doc.city)) fail(`${where} city「${doc.city}」在 points.json 里没有任何点位`);
  if (doc.schemaVersion !== 1) fail(`${where} schemaVersion 必须是 1`);
  if (!DATE_RE.test(doc.updatedAt || '')) fail(`${where} updatedAt 需 YYYY-MM-DD`);
  if (!Array.isArray(doc.facts)) { fail(`${where} facts 必须是数组`); continue; }

  let verified = 0;
  let estimated = 0;
  let unknown = 0;
  let conflict = 0;
  let pending = 0;

  doc.facts.forEach((fact, i) => {
    const at = `${where} facts[${i}]`;
    if (!fact || typeof fact !== 'object') return fail(`${at} 不是对象`);
    if (typeof fact.pointId !== 'string' || !fact.pointId) return fail(`${at} 缺 pointId`);

    const point = byId.get(fact.pointId);
    if (!point) return fail(`${at} pointId「${fact.pointId}」不在 points.json`);
    if (doc.city && point.city !== doc.city) fail(`${at} 点位城市「${point.city}」与文件 city「${doc.city}」不一致`);

    if (!FACT_FIELDS.includes(fact.field)) fail(`${at} field 非法：${fact.field}`);
    if (!FACT_STATUS.includes(fact.status)) fail(`${at} status 非法：${fact.status}`);
    if (!SOURCE_TYPES.includes(fact.sourceType)) fail(`${at} sourceType 非法：${fact.sourceType}`);

    const key = factKey(fact.pointId, fact.field);
    if (seenKeys.has(key)) fail(`${at} 重复的 pointId+field（${key}）`);
    seenKeys.add(key);

    if (!DATE_RE.test(fact.collectedAt || '')) fail(`${at} collectedAt 需 YYYY-MM-DD`);
    if (!DATE_RE.test(fact.reviewAfter || '')) fail(`${at} reviewAfter 需 YYYY-MM-DD`);
    if (DATE_RE.test(fact.collectedAt || '') && DATE_RE.test(fact.reviewAfter || '') && fact.reviewAfter < fact.collectedAt) {
      fail(`${at} reviewAfter 早于 collectedAt`);
    }

    // 来源等级
    const needsUrl = fact.status !== 'unknown';
    if (needsUrl && !fact.sourceUrl && fact.sourceType !== 'estimate' && fact.sourceType !== 'curated') {
      fail(`${at} ${fact.status} 事实缺少 sourceUrl`);
    }
    if (fact.sourceUrl && !HTTPS_RE.test(fact.sourceUrl)) fail(`${at} sourceUrl 必须是 https`);
    if (fact.status === 'verified' && fact.sourceType !== 'official') {
      fail(`${at} verified 必须来自 official 来源（UGC/估算只能做线索）`);
    }
    if (fact.status === 'conflict' && (typeof fact.note !== 'string' || !fact.note.trim())) {
      fail(`${at} conflict 需要 note 说明冲突`);
    }
    if (fact.status === 'verified' && fact.value === 'unknown') fail(`${at} verified 不能是 unknown`);

    const valueError = checkValue(fact.field, fact.value);
    if (valueError) fail(`${at} ${valueError}`);

    // 交叉校验：事实值必须与 points.json 一致
    const expected = pointValue(point, fact.field);
    if (canonical(fact.value) !== canonical(expected)) {
      fail(`${at} ${fact.pointId}.${fact.field} 与 points.json 漂移：facts=${canonical(fact.value)} points=${canonical(expected)}`);
    }

    if (fact.status === 'verified') verified += 1;
    else if (fact.status === 'estimated') estimated += 1;
    else if (fact.status === 'unknown') unknown += 1;
    else if (fact.status === 'conflict') conflict += 1;
    else pending += 1;
  });

  const stale = doc.facts.filter((f) => f && DATE_RE.test(f.reviewAfter || '') && f.status !== 'unknown' && f.status !== 'pending' && f.reviewAfter < TODAY);
  ok(`${where}：${doc.facts.length} 条（verified ${verified} / estimated ${estimated} / unknown ${unknown} / conflict ${conflict} / pending ${pending}），过期 ${stale.length}`);
  if (stale.length) {
    warn(`${where} 有 ${stale.length} 条已过复核日，不能继续当已验证事实：${stale.slice(0, 6).map((f) => `${f.pointId}.${f.field}@${f.reviewAfter}`).join('、')}${stale.length > 6 ? ' …' : ''}`);
  }
  for (const fact of doc.facts) allFacts.push({ ...fact, city: doc.city });
}

// 汇总：官方来源点位（verified + official）
if (allFacts.length) {
  const index = indexFacts({ facts: allFacts });
  for (const city of [...new Set(allFacts.map((f) => f.city).filter(Boolean))]) {
    const cityPoints = points.filter((p) => p && p.city === city);
    const coverage = factCoverage(index, { points: cityPoints, fields: ['openCalendar', 'ticket'], today: TODAY });
    ok(`${city}：官方来源点位 ${coverage.official}/${coverage.points}；开放时间 已知 ${coverage.byField.openCalendar.known}、票价 已知 ${coverage.byField.ticket.known}；过期 ${coverage.stale}`);
  }
}

if (bad) {
  console.error(`\n${bad} 处事实账本问题`);
  process.exit(1);
}
console.log('\n事实账本门通过');
