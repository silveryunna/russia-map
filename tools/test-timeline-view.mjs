#!/usr/bin/env node
// 时间轴视图几何模型质量门：范围/刻度/块位置/交通与等待/重叠/跨午夜/空白天
// 用法: node tools/test-timeline-view.mjs
import { buildDayRail, TL_TYPE_COLORS } from '../src/pages/plan/timeline.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const day = { startTime: '09:00', endTime: '21:00' };
const row = (itemId, start, duration, extra = {}) => ({
  itemId, name: itemId, start, end: start + duration, duration,
  transitMinutes: 0, mode: 'none', calendar: 'unknown', pinned: false, ...extra,
});

// 1) 基础几何：范围、高度、刻度、块位置、锁定与必去
{
  const items = [
    { id: 'a', type: 'visit', placeType: '博物馆', mustVisit: true },
    { id: 'b', type: 'visit', placeType: '餐饮', mustVisit: false, pinnedStart: '10:30' },
  ];
  const rail = buildDayRail({
    day, items,
    result: { timeline: [row('a', 540, 60), row('b', 630, 60, { transitMinutes: 15, mode: 'metro' })] },
  });
  assert(rail.rangeStart === 510 && rail.rangeEnd === 1280 && rail.height === 962.5, '范围与高度按窗口+余量计算');
  assert(!rail.hours.some((h) => h.min === 540 || h.min === 1260), '出发/收工刻度线不与边界重复');
  assert(rail.hours.length === 11 && rail.hours[0].label === '10:00', '小时刻度完整');
  const b = rail.blocks[1];
  assert(b.top === 150 && b.height === 75 && /10:30–11:30 · 60m/.test(b.timeLabel), '块位置/高度/时间标签');
  assert(b.pinned === true && b.must === false && b.booked === false, '锁定与必去/可删标记');
  assert(b.unknown === true && /^#/.test(b.color) && TL_TYPE_COLORS['餐饮'] === b.color, '未知日历与类型颜色');
  const leg = rail.legs[0];
  assert(leg && leg.minutes === 15 && leg.showLabel === true && leg.label === '地铁 15m', '交通段按模式显示');
  const wait = rail.waits[0];
  assert(wait && wait.height === 18.75, '锁定前的空档被量化');
}

// 2) 重叠：块开始早于前一块结束
{
  const rail = buildDayRail({
    day, items: [{ id: 'a' }, { id: 'b' }],
    result: { timeline: [row('a', 540, 60), row('b', 570, 60)] },
  });
  assert(rail.blocks[1].overlapPrev === true && rail.blocks[0].overlapPrev === false, '重叠块被标记（供双列并排）');
}

// 3) 跨午夜：超时区高度与「次日」结束标签
{
  const rail = buildDayRail({
    day, items: [{ id: 'a' }],
    result: { timeline: [row('a', 540, 960)] },
  });
  assert(rail.overrun && rail.overrun.height === 300 && rail.overrun.endLabel === '01:00（次日）',
    '跨午夜超时区与次日标签');
  assert(rail.hours.some((h) => h.min === 1440 && h.label === '24:00'), '跨日刻度用连续时间 24:00');
  assert(rail.blocks[0].timeLabel.includes('（次日）'), '块时间标签同样标注次日');
}

// 4) 空白天与无坐标边界
{
  const rail = buildDayRail({ day, items: [], result: { timeline: [] } });
  assert(rail.blocks.length === 0 && rail.legs.length === 0 && rail.waits.length === 0, '空白天无块/交通/等待');
  assert(rail.overrun === null && rail.lastEnd === 540 && rail.height === 962.5, '空白天仍渲染窗口');
}

if (bad) { console.error(`\n${bad} 项时间轴几何测试失败`); process.exit(1); }
console.log('\n时间轴视图质量门通过');
