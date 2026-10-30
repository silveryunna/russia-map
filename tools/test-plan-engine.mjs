#!/usr/bin/env node
// 规则引擎质量门（CI 强制）：把 plan 生成的三个历史 bug 钉成断言
//   A) 跨动线重复点位——同一点位在多条动线里出现时不得在一份计划里重复
//   B) 下午无限追加——单日点位上限 / 各时段上限必须硬性生效
//   C) 前后端天数不一致——请求 N 天但点位不足时，返回真实天数 + note，而不是假装 N 天
// 用法: node tools/test-plan-engine.mjs
import {
  PLAN_DAYS_MAX, MAX_PER_DAY, SLOT_CAPS, clampDays, ruleEngine, buildDay, selectDayPoints,
} from '../src/pages/plan/engine.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

const P = (id, name, cluster, type = '景点', extra = {}) => ({
  id, name, city: '莫斯科', cluster, type, highlight: '', tags: [],
  lat: 55.75, lon: 37.61, estimatedDuration: 60, ...extra,
});

function allNames(plan) {
  return plan.days.flatMap(d => [...d.slots.morning, ...d.slots.afternoon, ...d.slots.evening]);
}

function checkCaps(plan, label) {
  for (const d of plan.days) {
    const n = d.slots.morning.length + d.slots.afternoon.length + d.slots.evening.length;
    if (n > MAX_PER_DAY) return fail(`${label}：Day ${d.day} 有 ${n} 个点位，超过单日上限 ${MAX_PER_DAY}`);
    for (const [sk, cap] of Object.entries(SLOT_CAPS)) {
      if (d.slots[sk].length > cap) return fail(`${label}：Day ${d.day} ${sk} 有 ${d.slots[sk].length} 个，超过上限 ${cap}`);
    }
  }
  return true;
}

// 0) clampDays 与后端 1–7 对齐
{
  const cases = [[0, 1], [1, 1], [7, 7], [99, 7], [-3, 1], ['4', 4], ['abc', 3], [undefined, 3]];
  const off = cases.filter(([input, want]) => clampDays(input) !== want);
  if (!off.length) ok(`clampDays 与 1–${PLAN_DAYS_MAX} 一致（${cases.length} 组）`);
  else fail(`clampDays 不符：${off.map(([i, w]) => `${i}→${clampDays(i)}(期望${w})`).join(', ')}`);
}

// A) 跨动线重复点位只出现一次
{
  const pts = [
    P('a1', '红场', '市中心'), P('a2', '圣瓦西里', '市中心'), P('a3', '古姆', '市中心'),
    P('b2', '列宁墓', '市中心'), P('b3', '亚历山大花园', '市中心'),
  ];
  // 动线按 name 索引：红场同时出现在两条动线里，只能安排一次
  const rts = [
    { name: '动线一', city: '莫斯科', steps: [{ point: '红场' }, { point: '圣瓦西里' }, { point: '古姆' }] },
    { name: '动线二', city: '莫斯科', steps: [{ point: '红场' }, { point: '列宁墓' }, { point: '亚历山大花园' }] },
  ];
  const plan = ruleEngine({ city: '莫斯科', days: 3, interests: [] }, { pts, rts });
  const names = allNames(plan);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (!dup.length) ok(`跨动线去重：${names.length} 个点位无重复（红场出现 1 次）`);
  else fail(`跨动线重复点位：${dup.join('、')}`);
  checkCaps(plan, '跨动线去重');
}

// B) 单日上限硬性生效（动线含 12 个点位 → 不得全塞进一天）
{
  const pts = Array.from({ length: 12 }, (_, i) => P(`p${i}`, `点位${i + 1}`, '同类'));
  const rts = [{ name: '长动线', city: '莫斯科', steps: pts.map(p => ({ point: p.name })) }];
  const plan = ruleEngine({ city: '莫斯科', days: 3, interests: [] }, { pts, rts });
  const day1 = plan.days[0];
  const n1 = day1.slots.morning.length + day1.slots.afternoon.length + day1.slots.evening.length;
  if (n1 <= MAX_PER_DAY && checkCaps(plan, '单日上限')) ok(`长动线首日 ${n1} 个点位，未超过 ${MAX_PER_DAY}`);
  else fail(`长动线首日放了 ${n1} 个点位，超过上限 ${MAX_PER_DAY}（历史 bug：下午无限追加）`);
  // 溢出点位不能丢：3 天 × 上限足够装下 12 个
  const names = allNames(plan);
  const missing = pts.map(p => p.name).filter(n => !names.includes(n));
  if (!missing.length) ok(`溢出点位转入后续天数：12/12 全部安排`);
  else fail(`溢出点位丢失：${missing.join('、')}`);
}

// B2) buildDay / selectDayPoints 单元行为
{
  const many = Array.from({ length: 10 }, (_, i) => P(`q${i}`, `Q${i}`, 'c'));
  const picked = selectDayPoints([...many, ...many]);
  if (picked.length === MAX_PER_DAY) ok(`selectDayPoints 去重后按上限截断到 ${MAX_PER_DAY}`);
  else fail(`selectDayPoints 返回 ${picked.length} 个，期望 ${MAX_PER_DAY}`);
  const day = buildDay(many);
  const total = day.slots.morning.length + day.slots.afternoon.length + day.slots.evening.length;
  const uniq = new Set(day.usedIds).size;
  if (total <= MAX_PER_DAY && uniq === total) ok(`buildDay 产出 ${total} 个点位，槽位总和与 usedIds 一致`);
  else fail(`buildDay 槽位 ${total} / usedIds ${uniq} 不一致或超限`);
}

// C) 请求天数 > 可用天数：返回真实天数 + note（前端据此提示，不再前后端不一致）
{
  const pts = [P('x1', '甲', 'A'), P('x2', '乙', 'A'), P('x3', '丙', 'B')];
  const plan = ruleEngine({ city: '莫斯科', days: 5, interests: [] }, { pts, rts: [] });
  if (plan.days.length < 5 && plan.days.length > 0 && plan.note) {
    ok(`点位不足时返回真实天数 ${plan.days.length}/5 并带 note`);
  } else {
    fail(`点位不足时返回 ${plan.days.length} 天、note=${JSON.stringify(plan.note)}，期望 <5 天且有 note`);
  }
  if (plan.days.every((d, i) => d.day === i + 1)) ok('Day 序号连续，与 days 数组下标一致');
  else fail(`Day 序号不连续：${plan.days.map(d => d.day).join(',')}`);
}

// C2) 点位充足时足额生成请求天数
{
  const pts = Array.from({ length: 40 }, (_, i) => P(`r${i}`, `点${i}`, `群${i % 4}`));
  const plan = ruleEngine({ city: '莫斯科', days: 4, interests: [] }, { pts, rts: [] });
  if (plan.days.length === 4 && !plan.note) ok('点位充足时足额生成 4 天且无 note');
  else fail(`点位充足时生成 ${plan.days.length} 天、note=${JSON.stringify(plan.note)}`);
  checkCaps(plan, '足额生成');
}

// D) 兴趣过滤 / 空数据 / 过滤后点位太少时的回退
{
  const pts = [
    ...Array.from({ length: 6 }, (_, i) => P(`m${i}`, `博物馆${i}`, 'A', '博物馆')),
    ...Array.from({ length: 6 }, (_, i) => P(`n${i}`, `公园${i}`, 'B', '公园')),
  ];
  const mus = ruleEngine({ city: '莫斯科', days: 1, interests: ['博物馆'] }, { pts, rts: [] });
  const names = allNames(mus);
  if (names.length && names.every(n => n.startsWith('博物馆'))) ok('兴趣过滤生效：只出博物馆类点位');
  else fail(`兴趣过滤失效：${names.join('、')}`);

  const rare = ruleEngine({ city: '莫斯科', days: 1, interests: ['地铁'] }, { pts, rts: [] });
  if (allNames(rare).length) ok('兴趣命中不足 4 个时回退全城点位，不返回空计划');
  else fail('兴趣命中不足时返回空计划');

  const empty = ruleEngine({ city: '莫斯科', days: 3, interests: [] }, { pts: [], rts: [] });
  if (empty.days.length === 0 && empty.note) ok('无点位时返回 0 天 + note，不死循环');
  else fail(`无点位时返回 ${empty.days.length} 天、note=${JSON.stringify(empty.note)}`);

  const other = ruleEngine({ city: '圣彼得堡', days: 2, interests: [] }, { pts, rts: [] });
  if (other.days.length === 0) ok('城市无点位时不串城');
  else fail(`城市无点位却生成了 ${other.days.length} 天`);
}

// E) pending 点位（无坐标）不进入计划
{
  const pts = [P('u1', '待核点位', 'A', '景点', { pending: true }), P('u2', '正常点位', 'A')];
  const plan = ruleEngine({ city: '莫斯科', days: 1, interests: [] }, { pts, rts: [] });
  const names = allNames(plan);
  if (!names.includes('待核点位') && names.includes('正常点位')) ok('pending 点位被排除');
  else fail(`pending 点位混入：${names.join('、')}`);
}

// F) 动线步骤以 pointId 为准：改名后名称快照过期也能命中；只有 pointId 也可解析
{
  const pts = [P('f1', '红场（新名）', '市中心'), P('f2', '圣瓦西里', '市中心'), P('f3', '古姆', '市中心')];
  const rts = [{
    name: '改名线',
    city: '莫斯科',
    steps: [
      { point: '红场', pointId: 'f1' },   // 名称快照是旧名，pointId 指向新名点位
      { pointId: 'f2' },                  // 只有 pointId
      { point: '古姆' },                  // 只有名称（旧数据兼容）
    ],
  }];
  const plan = ruleEngine({ city: '莫斯科', days: 1, interests: [] }, { pts, rts });
  const names = allNames(plan);
  const want = ['红场（新名）', '圣瓦西里', '古姆'];
  if (want.every(n => names.includes(n))) ok('动线解析：pointId 优先、名称兜底，3 个点位全部命中');
  else fail(`动线解析失败：得到 ${names.join('、')}，期望 ${want.join('、')}`);

  const stale = ruleEngine({ city: '莫斯科', days: 1, interests: [] }, {
    pts, rts: [{ name: '失联线', city: '莫斯科', steps: [{ point: '圣瓦西里', pointId: 'p999' }] }],
  });
  const staleDay = stale.days.find(d => /参考动线：失联线/.test(d.tip || ''));
  const staleNames = staleDay ? [...staleDay.slots.morning, ...staleDay.slots.afternoon, ...staleDay.slots.evening] : [];
  if (staleNames.includes('圣瓦西里')) ok('pointId 失效时回退名称解析，步骤不丢');
  else fail(`pointId 失效后步骤丢失：动线日 ${JSON.stringify(staleNames)}`);
}

// G) 固定日期生成尊重开放日历：闭馆点不硬排，次日再排
{
  const closedMonday = P('g1', '周一闭馆馆', '文学', '博物馆', { openCalendar: { days: 'Tu-Su', open: '10:00', close: '18:00' } });
  const openPoint = P('g2', '周一开放点', '文学');
  const mondayPlan = ruleEngine({ city: '莫斯科', date: '2026-11-16', days: 1 }, { pts: [closedMonday, openPoint], rts: [] });
  const mondayNames = allNames(mondayPlan);
  if (!mondayNames.includes('周一闭馆馆') && mondayNames.includes('周一开放点')) ok('固定日期：周一闭馆点不进入周一');
  else fail(`周一闭馆点被排入：${mondayNames.join('、')}`);
  if (mondayPlan.note && /已跳过当天闭馆点位/.test(mondayPlan.note) && /周一闭馆馆/.test(mondayPlan.note)) ok('固定日期：被跳过的闭馆点写入 note');
  else fail(`闭馆点 note 缺失：${JSON.stringify(mondayPlan.note)}`);

  const tuesdayPlan = ruleEngine({ city: '莫斯科', date: '2026-11-17', days: 1 }, { pts: [closedMonday, openPoint], rts: [] });
  if (allNames(tuesdayPlan).includes('周一闭馆馆')) ok('固定日期：开放日正常排入');
  else fail('开放日反而被过滤');

  const relative = ruleEngine({ city: '莫斯科', days: 1 }, { pts: [closedMonday], rts: [] });
  if (allNames(relative).includes('周一闭馆馆')) ok('无日期行程不按星期过滤（保留旧行为）');
  else fail('无日期行程被错误过滤');
}

// G2) 当天闭馆点延后到次日，而不是直接丢弃
{
  const p1 = P('h1', '周一闭馆馆', 'A', '博物馆', { openCalendar: { days: 'Tu', open: '10:00', close: '18:00' } });
  const p2 = P('h2', '周一开放点', 'A');
  const plan = ruleEngine({ city: '莫斯科', date: '2026-11-16', days: 2 }, { pts: [p1, p2], rts: [] });
  const namesByDay = plan.days.map(d => [...d.slots.morning, ...d.slots.afternoon, ...d.slots.evening]);
  if (namesByDay.length === 2 && namesByDay[0].includes('周一开放点') && namesByDay[1].includes('周一闭馆馆')) ok('闭馆点顺延到下一个开放日');
  else fail(`顺延失败：${JSON.stringify(namesByDay)}`);
}

// G3) 缺少停留时长的点位不进入生成计划（排程无法评估）
{
  const pts = [P('i1', '有时长', 'A'), { ...P('i2', '缺时长', 'A'), estimatedDuration: undefined }];
  const plan = ruleEngine({ city: '莫斯科', days: 1 }, { pts, rts: [] });
  const names = allNames(plan);
  if (names.includes('有时长') && !names.includes('缺时长')) ok('缺停留时长点位被排除');
  else fail(`缺时长点位混入：${names.join('、')}`);
}

// G4) 补充日按可行性预演：放不下的点位不硬塞，写入 note
{
  const pts = [
    P('j1', '长馆一', 'A', '博物馆', { estimatedDuration: 600 }),
    P('j2', '长馆二', 'A', '博物馆', { estimatedDuration: 600 }),
  ];
  const plan = ruleEngine({ city: '莫斯科', date: '2026-11-17', days: 1 }, { pts, rts: [] });
  const names = allNames(plan);
  if (names.includes('长馆一') && !names.includes('长馆二')) ok('补充日超收工线的点位被跳过');
  else fail(`超时点位混入：${names.join('、')}`);
  if (plan.note && /当天排不下已跳过/.test(plan.note) && /长馆二/.test(plan.note)) ok('超时点位写入 note');
  else fail(`超时 note 缺失：${JSON.stringify(plan.note)}`);
}

if (bad) { console.error(`\n${bad} 项规则引擎测试失败`); process.exit(1); }
console.log('\n规则引擎质量门通过');
