#!/usr/bin/env node
// 计划页纯格式化质量门（W2 拆分后新增）
// 这些函数同时被列表、编辑器、Markdown 导出使用，口径必须只有一份。
// 用法: node tools/test-plan-format.mjs
import {
  STATUS_LABEL, TYPE_LABEL, PERIOD_LABEL,
  clampNum, snap5, fmtSpan, shortDate, dateRange, weekday, itemName, itemType, sourceLabel,
} from '../src/pages/plan/format.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// 1) 数值夹取与吸附
{
  assert(clampNum(5, 0, 10) === 5, '区间内原样返回');
  assert(clampNum(-3, 0, 10) === 0 && clampNum(99, 0, 10) === 10, '越界夹到边界');
  assert(clampNum(NaN, 15, 720) === 15, 'NaN 回落到下限（不让 NaN 进时间轴）');
  assert(clampNum('30', 15, 720) === 30, '数字字符串可参与计算');
  assert(clampNum(Infinity, 0, 100) === 0, 'Infinity 回落到下限');
  assert(snap5(12) === 10 && snap5(13) === 15 && snap5(10) === 10, '吸附到 5 分钟网格');
}

// 2) 时长格式化
{
  assert(fmtSpan(45) === '45m', '不足 1 小时用分钟');
  assert(fmtSpan(60) === '1h', '整点不带 00 分');
  assert(fmtSpan(90) === '1h30', '1 小时 30 分');
  assert(fmtSpan(125) === '2h05', '分钟补零');
}

// 3) 日期
{
  assert(shortDate('2026-11-01') === '11/01', '短日期为 MM/DD');
  assert(shortDate('') === '' && shortDate(undefined) === '', '空日期返回空串');
  assert(dateRange({ dateMode: 'fixed', startDate: '2026-11-01', endDate: '2026-11-03' }) === '11/01–11/03', '固定日期区间');
  assert(dateRange({ dateMode: 'fixed', startDate: '2026-11-01', endDate: '2026-11-01' }) === '11/01', '单日不显示重复区间');
  assert(dateRange({ dateMode: 'flexible', startDate: '2026-11-01' }) === '日期待定', '非固定日期显示待定');
  assert(dateRange({}) === '日期待定' && dateRange(null) === '日期待定', '缺字段/空行程不抛错');
  assert(weekday('2026-11-01') === '周日', '2026-11-01 是周日');
  assert(weekday('2026-11-02') === '周一', '2026-11-02 是周一');
  assert(weekday('') === '' && weekday('not-a-date') === '', '空/非法日期返回空串');
}

// 4) 条目名与类型
{
  const points = new Map([['p1', { id: 'p1', name: '红场', type: '景点' }]]);
  assert(itemName({ refId: 'p1', placeNameSnapshot: '旧名' }, points) === '红场', '点位库最新名称优先于快照');
  assert(itemName({ refId: 'p404', placeNameSnapshot: '旧名' }, points) === '旧名', '点位不存在时回落到快照');
  assert(itemName({ type: 'meal' }, points) === '餐饮', '无快照时回落到类型标签');
  assert(itemName({}, points) === '未命名', '什么都没有时用兜底名');
  assert(itemName(null, points) === '未命名', 'null 条目不抛错');
  assert(itemName({ refId: 'p1' }) === '未命名', '未注入点位库时不崩（退化为兜底）');
  assert(itemType({ refId: 'p1' }, points) === '景点', '类型优先取点位库');
  assert(itemType({ type: 'break' }, points) === '休息', '类型回落到标签');
  assert(itemType({}, points) === '', '无类型返回空串');
}

// 5) 来源标签（生成结果永远标注来源）
{
  assert(sourceLabel({ origin: { source: 'rule' } }) === '规则引擎（离线）', '规则引擎来源');
  assert(sourceLabel({ origin: { source: 'ai', channel: 'site' } }) === 'AI（站内通道）', 'AI 站内通道');
  assert(sourceLabel({ origin: { source: 'ai', channel: 'custom', model: 'deepseek' } }) === 'AI（自定义接口 · deepseek）', 'AI 自定义接口带模型名');
  assert(sourceLabel({ origin: { source: 'copy' } }) === '复制自其它行程', '复制来源');
  assert(sourceLabel({}) === '规则引擎（离线）', '缺 origin 按规则引擎处理');
}

// 6) 标签表完整性（新增类型时必须显式处理，避免页面显示成 undefined）
{
  const typeKeys = ['visit', 'transit', 'lodging', 'meal', 'break', 'reservation', 'task', 'note'];
  assert(typeKeys.every(k => TYPE_LABEL[k]), '类型标签覆盖全部条目类型');
  assert(Object.keys(PERIOD_LABEL).length === 4 && PERIOD_LABEL[''] === '', '时段标签含空串占位');
  assert(Object.keys(STATUS_LABEL).length === 5, '状态标签 5 种');
}

if (bad) { console.error(`\n${bad} 处格式化口径不一致`); process.exit(1); }
console.log('\n计划格式化质量门通过');
