#!/usr/bin/env node
// 顺序求解质量门：确定性、减少折返/通行、不移动固定/锁定项、错误不增加
// 用法: node tools/test-solver.mjs
import { optimizeDayOrder, softScore } from '../src/pages/plan/solver.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const places = new Map([
  ['p1', { id: 'p1', name: 'P1', type: '博物馆', lat: 55.750, lon: 37.61 }],
  ['p2', { id: 'p2', name: 'P2', type: '博物馆', lat: 55.755, lon: 37.61 }],
  ['p3', { id: 'p3', name: 'P3', type: '博物馆', lat: 55.760, lon: 37.61 }],
  ['p4', { id: 'p4', name: 'P4', type: '博物馆', lat: 55.765, lon: 37.61 }],
]);
const day = { id: 'd1', date: '2026-11-10', startTime: '09:00', endTime: '21:00', transportMode: 'transit' };
const item = (id, extra = {}) => ({ id, refId: id, type: 'visit', flexibility: 'flexible', mustVisit: true, estimatedDuration: 30, plannedStatus: 'planned', ...extra });

// 1) 反向顺序 → 消除折返且缩短通行
{
  const items = [item('p4'), item('p2'), item('p3'), item('p1')];
  const r = optimizeDayOrder({ day, items, places });
  assert(r.improved === true, '明显绕路的顺序会被改进');
  assert(r.after.soft.reversals < r.before.soft.reversals, '折返次数下降');
  assert(r.after.result.stats.transitMinutes < r.before.result.stats.transitMinutes, '通行分钟下降');
  assert(r.after.result.errors.length <= r.before.result.errors.length, '硬错误不增加');
  const again = optimizeDayOrder({ day, items, places });
  assert(again.order.join(',') === r.order.join(','), '同输入结果确定');
}

// 2) 固定/锁定项不参与移动
{
  const items = [item('p4'), item('p2', { pinnedStart: '12:00' }), item('p3', { flexibility: 'fixed' }), item('p1')];
  const r = optimizeDayOrder({ day, items, places });
  const anchors = r.order.filter(id => id === 'p2' || id === 'p3');
  assert(anchors.join(',') === 'p2,p3', '锁定/固定项相对顺序保持');
}

// 3) 可动项不足两个 → 空操作
{
  const items = [item('p1', { flexibility: 'fixed' }), item('p2')];
  const r = optimizeDayOrder({ day, items, places });
  assert(!r.improved && r.order.join(',') === 'p1,p2', '可动项不足时不做重排');
}

// 4) 时段序：晚间项目不能排到上午
{
  const items = [item('p1', { period: 'evening' }), item('p2', { period: 'morning' }), item('p3', { period: 'afternoon' })];
  const r = optimizeDayOrder({ day, items, places });
  const rank = { p2: 0, p3: 1, p1: 2 };
  const ranks = r.order.map(id => rank[id]);
  assert(r.improved && ranks.every((x, i) => i === 0 || x >= ranks[i - 1]),
    '求解遵循上午→下午→晚上，不把晚间演出排到上午');
}

// 5) 打车费用按城市费率的 scoreUnit 折算；未配置费率不计
{
  const base = {
    day,
    result: { timeline: [], errors: [], stats: { transitMinutes: 40, taxiCost: 0, taxiCurrency: '' } },
    soft: { reversals: 0, middayPhoto: 0, longestStretchMinutes: 0 },
  };
  const costly = {
    ...base,
    result: { ...base.result, stats: { transitMinutes: 40, taxiCost: 1000, taxiCurrency: 'RUB' } },
  };
  assert(softScore({ ...costly, taxiFare: { scoreUnit: 10 } }) - softScore(base) === 100,
    '打车费用按城市 scoreUnit 折算成分值');
  assert(softScore(costly) === softScore(base), '未配置城市费率时不把费用计入分值');
}

if (bad) { console.error(`\n${bad} 项顺序求解测试失败`); process.exit(1); }
console.log('\n顺序求解质量门通过');
