#!/usr/bin/env node
// Plan B 候选质量门：同类型/同簇/兴趣优先，排除 pending/已用/异地，按距离兜底
// 用法: node tools/test-alternatives.mjs
import { suggestAlternatives } from '../src/pages/plan/alternatives.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const target = { id: 't', city: '莫斯科', type: '博物馆', cluster: '中心', lat: 55.75, lon: 37.61, tags: ['建筑'] };
const pts = [
  { id: 'a', city: '莫斯科', type: '博物馆', cluster: '中心', lat: 55.751, lon: 37.611, tags: ['建筑'] },
  { id: 'b', city: '莫斯科', type: '博物馆', cluster: '北', lat: 55.9, lon: 37.6, tags: ['建筑'] },
  { id: 'c', city: '莫斯科', type: '公园自然', cluster: '中心', lat: 55.752, lon: 37.612 },
  { id: 'd', city: '莫斯科', type: '餐饮', cluster: '南', lat: 55.7, lon: 37.5 },
  { id: 'e', city: '莫斯科', type: '博物馆', cluster: '中心', pending: true, lat: 55.753, lon: 37.613 },
  { id: 'z', city: '圣彼得堡', type: '博物馆', cluster: '中心', lat: 59.9, lon: 30.3 },
];

// 1) 排序与过滤
{
  const r = suggestAlternatives({ target, points: pts, usedIds: ['b'], limit: 3 });
  assert(r[0].point.id === 'a', '同类型+同簇+同兴趣排第一');
  assert(r.map(x => x.point.id).join(',') === 'a,c,d', '同簇优先于无关类型；已用项被排除');
  assert(!r.some(x => x.point.id === 'e' || x.point.id === 'z'), 'pending 与异地候选被排除');
  assert(r[0].distance >= 0 && r[0].score > r[1].score, '带距离与优先级分数');
}

// 2) limit 与空输入
{
  const r = suggestAlternatives({ target, points: pts, usedIds: [], limit: 2 });
  assert(r.length === 2 && r[0].point.id === 'a' && r[1].point.id === 'b', 'limit 生效且同类型优先');
  assert(suggestAlternatives({ target: null, points: pts }).length === 0, '无目标返回空');
  assert(suggestAlternatives({ target, points: [] }).length === 0, '无候选返回空');
}

if (bad) { console.error(`\n${bad} 项 Plan B 测试失败`); process.exit(1); }
console.log('\nPlan B 质量门通过');
