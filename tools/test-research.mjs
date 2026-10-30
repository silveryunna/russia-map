#!/usr/bin/env node
// 资料补全流水线质量门：缺口队列、候选事实校验、状态汇总
import {
  buildGapQueue, missingFields, summarizeCandidates, validateCandidates,
} from './research-lib.mjs';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const points = [
  { id: 'p1', name: 'A', city: '莫斯科', openCalendar: 'unknown', ticket: 'unknown' },
  { id: 'p2', name: 'B', city: '莫斯科', openCalendar: 'unknown', ticket: '免费' },
  { id: 'p3', name: 'C', city: '莫斯科', openCalendar: 'unknown', ticket: 'unknown' },
  { id: 'p4', name: 'D', city: '莫斯科', pending: true, openCalendar: 'unknown', ticket: 'unknown' },
  { id: 'p5', name: 'E', city: '莫斯科', openCalendar: { days: 'Mo-Su', open: '10:00', close: '18:00' }, ticket: '免费' },
  { id: 'q1', name: 'Q1', city: '无路线城', openCalendar: 'unknown', ticket: 'unknown' },
];
const routes = [
  { city: '莫斯科', steps: [{ pointId: 'p1' }, { pointId: 'p2' }, { pointId: 'p5' }] },
  { city: '莫斯科', steps: [{ pointId: 'p1' }, { pointId: 'p5' }] },
];

// 1) 队列：动线覆盖优先、使用次数降序、pending/已齐项排除
{
  const q = buildGapQueue({ points, routes, city: '莫斯科', fields: ['openCalendar', 'ticket'], limit: 10, now: 0 });
  assert(q.map((x) => x.pointId).join(',') === 'p1,p2', '只收动线内未齐项，且按使用次数排序');
  assert(q[0].fields.join(',') === 'openCalendar,ticket' && q[1].fields.join(',') === 'openCalendar', '逐项列出缺口字段');
  assert(missingFields(points[4], ['openCalendar', 'ticket']).length === 0, '字段齐全的点位无缺口');
  const limited = buildGapQueue({ points, routes, city: '莫斯科', fields: ['openCalendar'], limit: 1 });
  assert(limited.length === 1 && limited[0].pointId === 'p1', 'limit 生效');
}

// 2) 城市没有动线时回退到全城点位
{
  const q = buildGapQueue({ points, routes, city: '无路线城', fields: ['openCalendar', 'ticket'] });
  assert(q.length === 1 && q[0].pointId === 'q1' && q[0].routeUsage === 0, '无动线城市按全城点位生成队列');
}

// 3) 候选校验：官方/线索边界与格式
{
  const good = {
    pointId: 'p1', field: 'openCalendar', value: { days: 'Mo-Su', open: '10:00', close: '18:00' },
    status: 'verified', sourceType: 'official', sourceUrl: 'https://example.com/hours',
    collectedAt: '2026-10-01', reviewAfter: '2027-04-01',
  };
  assert(validateCandidates([good]).ok, '官方来源的 verified 候选通过');
  assert(!validateCandidates([{ ...good, sourceType: 'social' }]).ok, 'UGC 不能标记 verified');
  const unknown = {
    pointId: 'p1', field: 'ticket', value: 'unknown', status: 'unknown', sourceType: 'estimate',
    collectedAt: '2026-10-01', reviewAfter: '2027-04-01',
  };
  assert(validateCandidates([unknown]).ok, '显式 unknown 无需来源链接');
  assert(!validateCandidates([{ ...good, value: 'unknown' }]).ok, 'verified 不能是 unknown');
  assert(!validateCandidates([{ ...good, sourceUrl: 'http://example.com' }]).ok, '非 https 来源被拒绝');
  assert(!validateCandidates([{ ...good, reviewAfter: '2026-09-01' }]).ok, 'reviewAfter 早于 collectedAt 被拒绝');
  const conflict = {
    pointId: 'p2', field: 'ticket', value: 'unknown', status: 'conflict', sourceType: 'curated',
    sourceUrl: 'https://example.com/conflict', collectedAt: '2026-10-01', reviewAfter: '2027-04-01',
  };
  assert(!validateCandidates([conflict]).ok && validateCandidates([{ ...conflict, note: '两个来源冲突' }]).ok,
    'conflict 必须带 note');
  assert(!validateCandidates([good, { ...good }]).ok, '同一 pointId+field 重复被拒绝');
  assert(!validateCandidates([{ ...good, field: 'duration', value: 0 }]).ok, '时长越界被拒绝');
}

// 4) 汇总：状态/来源/过期
{
  const list = [
    { pointId: 'p1', field: 'openCalendar', status: 'verified', sourceType: 'official', reviewAfter: '2027-01-01' },
    { pointId: 'p2', field: 'ticket', status: 'estimated', sourceType: 'social', reviewAfter: '2026-01-01' },
    { pointId: 'p3', field: 'ticket', status: 'conflict', sourceType: 'curated', reviewAfter: '2027-01-01' },
    { pointId: 'p4', field: 'ticket', status: 'unknown', sourceType: 'estimate', reviewAfter: '2020-01-01' },
  ];
  const s = summarizeCandidates(list, { today: '2026-10-31' });
  assert(s.total === 4 && s.byStatus.verified === 1 && s.bySource.social === 1, '状态与来源计数正确');
  assert(s.expired === 1, '只有非 unknown 且过期的候选计入复核');
}

if (bad) { console.error(`\n${bad} 项资料管线测试失败`); process.exit(1); }
console.log('\n资料补全流水线质量门通过');
