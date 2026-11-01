#!/usr/bin/env node
// 事实账本质量门：索引 / 读取时过期判定 / 覆盖率 / 缺口清单
// 用法: node tools/test-facts.mjs [数据目录，默认 ./data]
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FACT_FIELDS, FACT_STATUS, SOURCE_TYPES, factKey, indexFacts, factState, factCoverage, factGaps,
} from '../src/pages/plan/facts.js';

let bad = 0;
const fail = (m) => { console.error(`❌ ${m}`); bad += 1; };
const ok = (m) => console.log(`✅ ${m}`);

const eq = (actual, expected, label) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(label);
  else fail(`${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
};

// 1) 词表与研究管线一致
eq(FACT_FIELDS, ['openCalendar', 'ticket', 'duration', 'name_local'], '字段词表与研究管线一致');
eq(FACT_STATUS, ['pending', 'verified', 'estimated', 'conflict', 'unknown'], '状态词表与研究管线一致');
eq(SOURCE_TYPES, ['official', 'curated', 'social', 'estimate'], '来源类型与研究管线一致');

// 2) 索引：非法条目跳过，合法条目按 pointId+field 合并城市
{
  const index = indexFacts({
    city: '莫斯科',
    facts: [
      { pointId: 'p001', field: 'openCalendar', status: 'verified', value: { days: 'Mo-Su', open: '00:00', close: '23:59' } },
      { pointId: 'p001', field: 'ticket', status: 'unknown', value: 'unknown' },
      { pointId: '', field: 'ticket', status: 'unknown', value: 'unknown' },
      { pointId: 'p002', field: 'notAField', status: 'verified', value: 'x' },
      { pointId: 'p002', field: 'ticket', status: 'notAStatus', value: 'x' },
      null,
    ],
  });
  eq(index.size, 2, '索引只收合法条目');
  eq(index.get('p001|openCalendar').city, '莫斯科', '索引补上城市');
  const multi = indexFacts({ facts: [{ pointId: 'p009', field: 'ticket', status: 'unknown', value: 'unknown', city: '圣彼得堡' }] });
  eq(multi.get('p009|ticket').city, '圣彼得堡', '顶层没有 city 时保留条目自带的 city');  eq(factKey('p003', 'ticket'), 'p003|ticket', 'factKey 口径稳定');
}

// 3) 读取时过期：不落库、按今天计算
{
  const today = '2026-11-01';
  const fresh = factState({ status: 'verified', reviewAfter: '2027-01-29', value: { days: 'Mo-Su' } }, { today });
  eq([fresh.stale, fresh.effectiveStatus, fresh.known], [false, 'verified', true], '未到期事实保持 verified');

  const stale = factState({ status: 'verified', reviewAfter: '2026-10-31', value: { days: 'Mo-Su' } }, { today });
  eq([stale.stale, stale.effectiveStatus], [true, 'stale'], '过了复核日降级为 stale');

  const boundary = factState({ status: 'estimated', reviewAfter: '2026-11-01', value: '免费' }, { today });
  eq(boundary.stale, false, '复核日当天仍有效');

  const unknown = factState({ status: 'unknown', reviewAfter: '2020-01-01', value: 'unknown' }, { today });
  eq([unknown.stale, unknown.known], [false, false], 'unknown 不是断言，永不过期');

  const pending = factState({ status: 'pending', reviewAfter: '2020-01-01', value: 'unknown' }, { today });
  eq(pending.stale, false, 'pending 永不过期');

  const missing = factState(null, { today });
  eq([missing.status, missing.known], ['missing', false], '没有事实时返回 missing');

  eq(factState({ status: 'verified', reviewAfter: '2026-11-11' }, { today }).daysUntilReview, 10, '剩余复核天数按 UTC 计算');
}

// 4) 覆盖率：分母是点位，official 只认 verified+official
{
  const points = [{ id: 'p001' }, { id: 'p002' }, { id: 'p003' }, { id: 'p004' }];
  const facts = [
    { pointId: 'p001', field: 'openCalendar', status: 'verified', sourceType: 'official', reviewAfter: '2027-01-01', value: { days: 'Mo-Su' } },
    { pointId: 'p001', field: 'ticket', status: 'verified', sourceType: 'official', reviewAfter: '2027-01-01', value: '免费' },
    { pointId: 'p002', field: 'openCalendar', status: 'estimated', sourceType: 'curated', reviewAfter: '2027-01-01', value: { days: 'Mo-Su' } },
    { pointId: 'p002', field: 'ticket', status: 'unknown', sourceType: 'curated', reviewAfter: '2027-01-01', value: 'unknown' },
    { pointId: 'p003', field: 'openCalendar', status: 'verified', sourceType: 'official', reviewAfter: '2020-01-01', value: { days: 'Mo-Su' } },
  ];
  const coverage = factCoverage(indexFacts({ facts }), { points, fields: ['openCalendar', 'ticket'], today: '2026-11-01' });
  eq(coverage.official, 2, 'official 只统计 verified+official 的点位（过期仍计入来源数）');
  eq(coverage.documented, 3, '有记录点位数正确');
  eq(coverage.stale, 1, '过期事实计数正确');
  eq(coverage.byField.openCalendar.known, 3, 'openCalendar 已知数正确（含过期）');
  eq(coverage.byField.openCalendar.verified, 2, 'openCalendar 已验证数正确');
  eq(coverage.byField.openCalendar.estimated, 1, 'openCalendar 估算数正确');
  eq(coverage.byField.openCalendar.stale, 1, '过期计入对应字段');
  eq(coverage.byField.ticket.known, 1, 'ticket 已知数正确');
  eq(coverage.byField.ticket.unknown, 1, 'ticket 显式 unknown 计数正确');
  eq(coverage.byField.ticket.missing, 2, '没记录的点位算 missing（p003/p004）');
}

// 5) 缺口清单：missing 与 unknown 都算缺口，已知事实不算
{
  const points = [{ id: 'p001' }, { id: 'p002' }];
  const facts = [
    { pointId: 'p001', field: 'openCalendar', status: 'verified', sourceType: 'official', reviewAfter: '2027-01-01', value: { days: 'Mo-Su' } },
    { pointId: 'p002', field: 'openCalendar', status: 'unknown', sourceType: 'curated', reviewAfter: '2027-01-01', value: 'unknown' },
  ];
  const gaps = factGaps(indexFacts({ facts }), { points, fields: ['openCalendar', 'ticket'], today: '2026-11-01' });
  eq(gaps.length, 3, '缺口数为 3');
  eq(gaps.filter((g) => g.reason === 'unknown').length, 1, '显式 unknown 标为 unknown');
  eq(gaps.filter((g) => g.reason === 'missing').length, 2, '没有记录标为 missing');
}

// 6) 真实数据集成：莫斯科事实文件可被索引（没有文件时跳过，不阻断）
{
  const dir = resolve(process.argv[2] || './data');
  const file = resolve(dir, 'facts/moscow.json');
  if (!existsSync(file)) {
    console.log('⚠️  没有 data/facts/moscow.json，跳过真实数据集成检查');
  } else {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const index = indexFacts(doc);
    if (index.size > 0 && index.size === doc.facts.length) ok(`莫斯科事实文件可索引（${index.size} 条）`);
    else fail(`莫斯科事实文件索引异常：索引 ${index.size} / 原始 ${doc.facts.length}`);
    const pointsFile = resolve(dir, 'points.json');
    if (existsSync(pointsFile)) {
      const raw = JSON.parse(readFileSync(pointsFile, 'utf8'));
      const points = (Array.isArray(raw) ? raw : raw.points || []).filter((p) => p.city === doc.city);
      const coverage = factCoverage(index, { points, fields: ['openCalendar', 'ticket'], today: '2026-11-01' });
      if (coverage.official > 0) ok(`莫斯科官方来源点位 ${coverage.official}/${coverage.points}`);
      else fail('莫斯科官方来源点位为 0（事实账本没有生效）');
    }
  }
}

if (bad) {
  console.error(`\n${bad} 处事实账本质量问题`);
  process.exit(1);
}
console.log('\n事实账本质量门通过');
