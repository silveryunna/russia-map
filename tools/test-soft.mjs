#!/usr/bin/env node
// 软目标度量质量门：折返/换乘/兴趣/正午摄影/连续活动/留白
// 用法: node tools/test-soft.mjs
import { evaluateSoft } from '../src/pages/plan/soft.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const places = new Map([
  ['p1', { id: 'p1', name: '博物馆', type: '博物馆', lat: 55.75, lon: 37.61 }],
  ['p2', { id: 'p2', name: '观景台', type: '观景', lat: 55.76, lon: 37.61 }],
  ['p3', { id: 'p3', name: '博物馆 2', type: '博物馆', lat: 55.75, lon: 37.61 }],
  ['p4', { id: 'p4', name: '餐厅', type: '餐厅', lat: 55.77, lon: 37.61 }],
]);
const items = [
  { id: 'i1', type: 'visit' }, { id: 'i2', type: 'visit' }, { id: 'i3', type: 'visit' },
  { id: 'm1', type: 'meal' }, { id: 'i4', type: 'visit' }, { id: 'b1', type: 'break' },
];
const timeline = [
  { itemId: 'i1', placeId: 'p1', start: 540, end: 600, duration: 60, transitMinutes: 0, mode: 'none' },
  { itemId: 'i2', placeId: 'p2', start: 720, end: 810, duration: 90, transitMinutes: 10, mode: 'metro' },
  { itemId: 'i3', placeId: 'p3', start: 820, end: 880, duration: 60, transitMinutes: 10, mode: 'walk' },
  { itemId: 'm1', placeId: null, start: 880, end: 940, duration: 60, transitMinutes: 0, mode: 'none' },
  { itemId: 'i4', placeId: 'p4', start: 950, end: 1010, duration: 60, transitMinutes: 10, mode: 'taxi' },
  { itemId: 'b1', placeId: null, start: 1010, end: 1030, duration: 20, transitMinutes: 0, mode: 'none' },
];
const day = { startTime: '09:00', endTime: '21:00' };

// 1) 基本度量
{
  const s = evaluateSoft({ day, result: { timeline }, items, places, interests: ['摄影', '美食'] });
  assert(s.reversals === 1, '先北后南的一次掉头被识别为折返');
  assert(s.metroLegs === 1 && s.walkMinutes === 10 && s.taxiLegs === 1, '地铁/步行/打车段分别统计');
  assert(s.longestStretchMinutes === 230, '用餐/休息会打断连续活动');
  assert(s.endSlackMinutes === 230, '收工留白按窗口结束减最后收工');
  assert(s.middayPhoto === 1, '12:00–15:00 的观景/摄影点被标出');
  assert(s.interest.matched === 2 && s.interest.total === 4, '兴趣命中按点位类型匹配');
}

// 2) 未设兴趣：不产生命中数
{
  const s = evaluateSoft({ day, result: { timeline }, items, places, interests: [] });
  assert(s.interest.matched === 0 && s.interest.configured.length === 0, '未设兴趣时不做匹配');
}

// 3) 空白天：留白等于整个窗口
{
  const s = evaluateSoft({ day, result: { timeline: [] }, items: [], places, interests: [] });
  assert(s.longestStretchMinutes === 0 && s.endSlackMinutes === 0 && s.middayPhoto === 0, '空白天全部归零');
}

if (bad) { console.error(`\n${bad} 项软目标测试失败`); process.exit(1); }
console.log('\n软目标质量门通过');
