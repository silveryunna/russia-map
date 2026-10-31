// 计划页共用的纯格式化函数：无 DOM、无模块级状态、无存储依赖。
// 拆出来的理由：同一批标签与格式化逻辑被列表、编辑器、Markdown 导出三处共用，
// 留在 plan.js 里既没法单测，也容易出现「导出的日期格式和页面不一致」这类漂移。
// 契约由 tools/test-plan-format.mjs 守护。

export const STATUS_LABEL = { draft: '草稿', planned: '已计划', active: '进行中', completed: '已完成', archived: '已归档' };
export const TYPE_LABEL = {
  visit: '景点', transit: '交通', lodging: '住宿', meal: '餐饮',
  break: '休息', reservation: '预订', task: '事项', note: '备注',
};
export const PERIOD_LABEL = { morning: '上午', afternoon: '下午', evening: '晚上', '': '' };

/** 夹在 [lo, hi] 之间；非数字按 lo 处理，避免 NaN 污染时间轴。 */
export const clampNum = (v, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
};

/** 时间轴吸附到 5 分钟网格（拖动色块时用）。 */
export const snap5 = (v) => Math.round(v / 5) * 5;

/** 分钟数 → 「1h30」/「45m」；跨天值请改用 feasibility 的 formatMinutesCrossDay。 */
export const fmtSpan = (m) => (m >= 60
  ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
  : `${m}m`);

/** ISO 日期 → 「MM/DD」（页面与导出共用的短格式）。 */
export const shortDate = (d) => (d || '').slice(5).replace('-', '/');

/** 行程日期区间；无日期模式固定返回「日期待定」。 */
export function dateRange(trip) {
  if (!trip || trip.dateMode !== 'fixed' || !trip.startDate) return '日期待定';
  return trip.endDate && trip.endDate !== trip.startDate
    ? `${shortDate(trip.startDate)}–${shortDate(trip.endDate)}`
    : shortDate(trip.startDate);
}

/** ISO 日期 → 「周一」；非法日期返回空串（不抛错）。 */
export function weekday(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] || '';
}

/** 条目显示名：点位库最新名称 > 生成时快照 > 类型名 > 兜底。 */
export function itemName(item, pointsById) {
  if (!item) return '未命名';
  const pt = item.refId && pointsById ? pointsById.get(item.refId) : null;
  return (pt && pt.name) || item.placeNameSnapshot || TYPE_LABEL[item.type] || '未命名';
}

/** 条目类型名（用于图标/分色），口径同 itemName。 */
export function itemType(item, pointsById) {
  if (!item) return '';
  const pt = item.refId && pointsById ? pointsById.get(item.refId) : null;
  return (pt && pt.type) || TYPE_LABEL[item.type] || '';
}

/** 行程来源标签：规则引擎 / AI（站内通道·自定义接口）/ 复制。 */
export function sourceLabel(trip) {
  const o = (trip && trip.origin) || {};
  if (o.source === 'copy') return '复制自其它行程';
  if (o.source !== 'ai') return '规则引擎（离线）';
  const ch = o.channel === 'custom' ? '自定义接口' : '站内通道';
  return `AI（${ch}${o.model ? ' · ' + o.model : ''}）`;
}
