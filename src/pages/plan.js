import '../shared/base.css';
import './plan.css';
import '../shared/layout-wide.css';
import '../shared/print.css';
import { installShortcuts, openHelp } from '../shared/shortcuts.js';
import { evaluateDay, formatMinutes, formatMinutesCrossDay } from './plan/feasibility.js';
import { indexTransitMatrix, matrixCoverage } from './plan/transit-matrix.js';
import { indexFacts, loadFactLedger, factCoverage } from './plan/facts.js';
import { buildDayRail } from './plan/timeline.js';
import { planAutoTrim } from './plan/repair.js';
import { evaluateSoft } from './plan/soft.js';
import { suggestAlternatives } from './plan/alternatives.js';
import { optimizeDayOrder } from './plan/solver.js';
import { currencySymbol, taxiFareFor } from './plan/fare-table.js';
import { loadPlans } from './plan/store.js';
import { loadCheckins } from '../modules/checkin.js';
import { createIdbDriver, createMemoryDriver, openTripStore } from './trip/store.js';
import { createChangeEvent, tripItemCount } from './trip/schema.js';
import { diffTrips, summarizeDiff } from './trip/execution.js';
import { isValidTimeZone, todayInZone } from '../shared/local-date.js';
import { checkStorageHealth, deviceNotice } from '../shared/storage-persist.js';
import { loadRegions, visiblePoints as filterVisiblePoints, isPointVisible } from '../shared/regions.js';
import {
  PERIOD_LABEL, STATUS_LABEL, clampNum, fmtSpan, itemName, itemType,
  shortDate, snap5, sourceLabel, weekday,
} from './plan/format.js';
import { createAIClient } from './plan/ai.js';
import { download, exportBackup as writeBackup, exportMarkdown, importBackup as readBackup, backupReminder } from './plan/io.js';
import { renderTripList } from './plan/list.js';
import { renderCreateForm, runGenerate } from './plan/generate.js';
import {
  addDay, addPlaceToDay, bindItemPlace, countNeedsConfirm, insertItemAt,
  itemDateConflicts, moveItemAfter, moveItemToDay, moveItemWithinDay, removeDay, removeItem,
  reorderDay, replaceItemPlace, setDateMode, setDayNote, setDayTransportMode, setDayWindow, setItemDuration, setItemMustVisit, setItemPinnedStart,
  shiftTripStart, splitStartLocal, updateTrip,
} from './trip/edit.js';

// 行程计划（Trip v2）：本次旅行可编辑、可恢复、可导出
// - 存储：IndexedDB（travel-trips），旧 travel-plans-v1 / travel-checkin-v2 首次打开时一次性迁移
// - AI 生成仍走站内通道（api/index.php?a=plan，Key 只在服务器侧）；生成结果统一转成 Trip
// - 每个编辑动作即时落库，保留最近 30 步内存撤销；删除行程不解绑历史打卡（Visit 留档）

const $app = document.getElementById('plan-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 「今天」按行程时区取日历日；未设置时区时回退设备本地（不能用 UTC，见 shared/local-date.js）
const localToday = () => todayInZone((current && current.homeTimeZone) || '');

// 常用时区（只是输入建议，仍接受任意合法 IANA 时区）
const TIME_ZONE_OPTIONS = [
  'Asia/Shanghai', 'Asia/Almaty', 'Asia/Yekaterinburg', 'Asia/Novosibirsk',
  'Asia/Irkutsk', 'Asia/Vladivostok', 'Europe/Moscow', 'Europe/Kaliningrad', 'UTC',
];

let meta = { cities: [], cityColors: {} };
let cache = { pts: [], visiblePts: [], rts: [], visibleRts: [], matrix: null, facts: null };
let pointsById = new Map();
let regionIndex = null;  // 板块开关：候选点位只能用可见板块，已有行程条目一律保留
let store = null;
let storeWarn = '';
let dataWarn = [];       // 交通矩阵/事实账本加载失败（离线兜底时为空数组）
let backupLast = '';     // 上次全量备份日期（meta backup:lastExportAt）
let storageWarn = '';    // 持久化/配额风险提示（只提示，不阻塞）
let trips = [];
let current = null;              // 编辑器里的行程
let ambiguities = [];            // 迁移遗留的待确认项（仅用于预置候选）
let undoStack = [];
let view = { mode: 'list', form: null, showAI: false, aiError: '', picker: null, sel: null, layout: 'list' };
let railDrag = null;
let tlDragged = false;
let lastBlockTap = { id: '', at: 0 };

const planLoad = loadPlans(localStorage);

/* ---------- PlannerAI（站内通道 + 会话级自定义覆盖，实现见 plan/ai.js） ---------- */
let generating = false;
const ai = createAIClient({ toast });

/* ---------- 通用 ---------- */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'plan-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

/* ---------- 渲染 ---------- */
function render() {
  if (view.mode === 'create') { removePrintSheet(); return renderCreate(); }
  if (view.mode === 'editor' && current) return renderEditor();
  removePrintSheet();
  return renderList();
}

/* ---------- 打印稿（body 级，@media print 时其他节点全隐藏） ---------- */
function removePrintSheet() {
  const el = document.getElementById('print-sheet');
  if (el) el.remove();
}

function printItemHtml(it, row) {
  const time = row ? `${formatMinutesCrossDay(row.start)}–${formatMinutesCrossDay(row.end)}` : '未排程';
  const flags = [
    row && row.unmodeled ? '✈ 长途未建模' : '',
    it.confirm !== 'ok' ? '待确认' : '',
    it.mustVisit === false ? '可删' : '',
    it.plannedStatus === 'skipped' ? '已跳过' : '',
  ].filter(Boolean);
  return `<div class="ps-item">
      <span class="ps-time">${esc(time)}</span>
      <div>
        <span class="ps-name">${esc(itemName(it, pointsById))}${flags.map(f => `<span class="ps-flag">${esc(f)}</span>`).join('')}</span>
        ${it.notes ? `<span class="ps-note">${esc(it.notes)}</span>` : ''}
        ${it.placeNameSnapshot !== itemName(it, pointsById) ? `<span class="ps-note">${esc(it.placeNameSnapshot)}</span>` : ''}
      </div>
    </div>`;
}

function renderPrintSheet(t, dayRes) {
  removePrintSheet();
  const range = t.startDate ? (t.days.length > 1 ? `${shortDate(t.startDate)} 起 · ${t.days.length} 天` : shortDate(t.startDate)) : `${t.days.length} 天`;
  const days = t.days.map((d, di) => {
    const res = dayRes.get(d.id);
    const rows = res ? res.timeline : [];
    const rowOf = (id) => rows.find(x => x.itemId === id) || null;
    const items = d.items.length
      ? d.items.map(it => printItemHtml(it, rowOf(it.id))).join('')
      : '<div class="ps-note">这一天还没有安排</div>';
    const transfer = transferNote(t, di);
    return `<section class="ps-day">
        <div class="ps-day-head">
          <span>Day ${d.index}${d.date ? ` · ${shortDate(d.date)} ${weekday(d.date)}` : ''}</span>
          <span class="ps-date">${d.items.length} 项</span>
        </div>
        ${items}
        ${d.note ? `<div class="ps-day-note">备注：${esc(d.note)}</div>` : ''}
        ${transfer ? `<div class="ps-day-note">${transfer.replace(/<[^>]+>/g, '').replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '')}</div>` : ''}
      </section>`;
  }).join('');
  const el = document.createElement('article');
  el.id = 'print-sheet';
  el.className = 'print-sheet';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <h1 class="ps-title">${esc(t.title || '行程单')}</h1>
    <div class="ps-sub">${esc(range)} · ${tripItemCount(t)} 项 · ${esc(STATUS_LABEL[t.status] || '')}${t.notes ? ` · ${esc(t.notes)}` : ''}</div>
    ${days}
    <div class="ps-foot">牛马打工人的旅行笔记 · 行程单 · 打印时间 ${esc(new Date().toLocaleString('zh-CN'))} · 页码见页脚</div>`;
  document.body.append(el);
}

function banners() {
  const out = [];
  if (storeWarn) out.push(`<div class="pl-tip warn">⚠️ ${esc(storeWarn)}</div>`);
  for (const w of dataWarn) out.push(`<div class="pl-tip warn">⚠️ ${esc(w)}</div>`);
  if (!storeWarn && trips.length) {
    const b = backupReminder(backupLast, localToday());
    if (b) out.push(`<div class="pl-tip warn">💾 ${b.level === 'never' ? '这份行程数据还没有导出过备份' : `上次备份已是 ${b.days} 天前`}——数据只存在这台设备的浏览器里<button class="pl-btn small" data-backup-now>立即备份</button></div>`);
  }
  if (planLoad.recovered) out.push(`<div class="pl-tip warn">⚠️ 检测到损坏的旧本地计划，已备份为 ${esc(planLoad.backupKey || '备份键')}</div>`);
  if (storageWarn) out.push(`<div class="pl-tip warn">🧷 ${esc(storageWarn)}<button class="pl-btn small" data-backup-now>立即备份</button></div>`);
  const live = current
    ? ambiguities.filter(a => current.days.some(d => d.items.some(it => it.id === a.itemId && it.confirm !== 'ok')))
    : [];
  if (live.length) out.push(`<div class="pl-tip">🔎 旧计划迁移有 ${live.length} 个点位待确认，点名字即可绑定</div>`);
  const cov = matrixCoverage(cache.matrix);
  const fc = factCoverage(cache.facts, { points: cache.pts, today: localToday() });
  out.push(`<div class="pl-tip">🧭 数据快照：交通矩阵 ${cov.total} 段（步行 ${cov.walking} · 车行 ${cov.car}）· 事实账本 ${fc.facts} 条 / 覆盖 ${fc.documented} 点位（official ${fc.official}）${fc.stale ? ` · 已过期 ${fc.stale} 条` : ''}</div>`);
  return out.join('');
}

// 列表 / 创建 / 生成的实现已拆到 plan/list.js 与 plan/generate.js；这里只做依赖绑定。
// 用函数而不是常量持有 ctx：trips / store / current 都会被重新赋值，每次取最新值。
function pageCtx() {
  return {
    app: $app, view, meta, cache, trips, store, ai, toast, render, refreshTrips,
    esc, banners, exportMd, exportBackup, importBackup,
    get current() { return current; },
    set current(v) { current = v; },
    isGenerating: () => generating,
    setGenerating(v) { generating = v; },
    resetUndo() { undoStack = []; },
  };
}

function renderList() { return renderTripList(pageCtx()); }
function renderCreate() { return renderCreateForm(pageCtx()); }
const doGenerate = src => runGenerate(pageCtx(), src);

/* ---------- 编辑器 ---------- */
const FEAS_LABEL = {
  'day-overrun': '超出收工线', closed: '闭馆', 'after-last-entry': '过最后入场', 'after-close': '会跨闭馆',
  overlap: '与预订重叠', 'cross-day': '跨日预订', 'duplicate-place': '重复点位', 'missing-duration': '缺时长',
  'unresolved-place': '未绑定', 'missing-coords': '缺坐标', 'calendar-exceptions': '特殊闭馆未校验',
  'hours-stale': '开放时间待复核', 'cross-region-unmodeled': '长途未建模',
};

const UNMODELED_NOTE = '长途未建模（需自行安排航班/长距离交通）';

// 板块串联：一天里首个/末个可见点位的 region 用来判断跨板块长途段（不新增行程字段，旧数据按 region 缺失跳过）
function dayRegion(d) {
  for (const it of d.items) {
    if (it.type === 'note' || it.type === 'task' || it.plannedStatus === 'skipped') continue;
    const p = it.refId ? pointsById.get(it.refId) : null;
    if (p && typeof p.region === 'string' && p.region) return p.region;
  }
  return '';
}
function prevDayRegion(t, di) {
  for (let i = di - 1; i >= 0; i -= 1) {
    const r = dayRegion(t.days[i]);
    if (r) return r;
  }
  return '';
}
// 进入第 di 天前所在板块；与当天板块不同 → 该天按"长途未建模"降权
function transferFromRegion(t, di) {
  const cur = dayRegion(t.days[di]);
  const prev = prevDayRegion(t, di);
  return cur && prev && prev !== cur ? prev : '';
}
function regionName(id) {
  const r = regionIndex && regionIndex.byId ? regionIndex.byId.get(id) : null;
  return r && r.name ? r.name : id;
}
function regionNamesMap() {
  const out = {};
  if (regionIndex && regionIndex.byId) for (const [id, r] of regionIndex.byId) out[id] = r.name || id;
  return out;
}
function transferNote(t, di) {
  const from = transferFromRegion(t, di);
  const cur = dayRegion(t.days[di]);
  if (!from || !cur) return '';
  let prevIdx = -1;
  for (let i = di - 1; i >= 0; i -= 1) if (dayRegion(t.days[i])) { prevIdx = i; break; }
  if (prevIdx < 0) return '';
  return `<div class="tr-feas is-warn"><span>✈️ D${prevIdx + 1}（${esc(regionName(from))}）→ D${di + 1}（${esc(regionName(cur))}）：${UNMODELED_NOTE}，不计入当天排程</span></div>`;
}

// 每天一条双轴结论：结构是否可排 + 证据有多少仍待核/估算
function feasibilityLine(d, res) {
  if (!res || res.empty) return '';
  const errs = res.errors;
  const warns = res.conflicts.filter(c => c.severity === 'warn' && c.kind !== 'hours-unknown');
  const lead = errs[0] || warns[0];
  const unknown = res.evidence ? res.evidence.unknownFacts : res.stats.unknownHours;
  const stale = res.evidence ? res.evidence.staleFacts : 0;
  const legs = res.timeline.filter(t => t.transitSource === 'matrix' || t.transitSource === 'estimate');
  const thirdParty = legs.filter(t => t.transitSourceKind === 'third-party-route' || t.transitSource === 'matrix').length;
  const estimated = legs.length - thirdParty;
  const start = formatMinutesCrossDay(res.timeline[0].arrive);
  const end = formatMinutesCrossDay(res.timeline[res.timeline.length - 1].end);
  const dwell = (res.stats.dwellMinutes / 60).toFixed(1);
  const conditional = res.structural === 'conditional' || res.structural === 'unmodeled';
  const unmodeled = (res.stats && res.stats.unmodeledLegs) || 0;
  const chips = errs.slice(0, 3).map(c => `<span class="tr-chip danger">${FEAS_LABEL[c.kind] || c.kind}</span>`).join('')
    + (errs.length > 3 ? `<span class="tr-chip danger">+${errs.length - 3}</span>` : '')
    + (unmodeled ? `<span class="tr-chip warn" title="${UNMODELED_NOTE}">✈️ ${unmodeled} 段长途未建模（需自行安排航班/长距离交通）</span>` : '')
    + (warns.length ? `<span class="tr-chip warn">${warns.length} 条提示</span>` : '')
    + (unknown ? `<span class="tr-chip warn">${unknown} 处开放时间待核</span>` : '')
    + (stale ? `<span class="tr-chip warn">${stale} 处资料待复核</span>` : '')
    + (legs.length
      ? `<span class="tr-chip" title="第三方路线=命中 2GIS 路线；模型估算=直线距离 + 速度假设">🧭 ${thirdParty}/${legs.length} 段第三方路线${estimated ? ` · ${estimated} 段估算` : ''}</span>`
      : '');
  const verdict = lead
    ? `${errs.length ? '⚠️' : '🔔'} ${lead.message}`
    : unmodeled ? `⚠️ 含 ${unmodeled} 段${UNMODELED_NOTE}，无法自动判定`
    : conditional ? '⚠️ 条件式可排（仍有待核事实或估算段）' : '✅ 结构可行，证据充分';
  return `<div class="tr-feas ${errs.length ? 'is-bad' : warns.length || conditional ? 'is-warn' : ''}">
      <span>⏱ 预计 ${start}–${end} · 停留 ${dwell}h · 通行 ${res.stats.transitMinutes}m</span>
      <span>${verdict}</span>
      ${chips ? `<div class="tr-feas-chips">${chips}</div>` : ''}
    </div>`;
}

function planBAlternatives(it, limit = 2) {
  const place = it.refId ? pointsById.get(it.refId) : null;
  if (!place) return [];
  const used = new Set();
  for (const d of current.days) for (const x of d.items) if (x.refId) used.add(x.refId);
  return suggestAlternatives({ target: place, points: cache.visiblePts, usedIds: used, limit });
}

function alternativesHtml(it) {
  const alts = planBAlternatives(it);
  if (!alts.length) return '';
  return `<div class="tr-planb"><span>Plan B</span>${alts.map(a =>
    `<button class="tr-fix" data-alt-item="${esc(it.id)}" data-alt-place="${esc(a.point.id)}">换「${esc(a.point.name)}」${a.distance ? ` · ${(a.distance / 1000).toFixed(1)}km` : ''}</button>`
  ).join('')}</div>`;
}

function dayFare(d) {
  const firstPlace = d.items.map(it => (it.refId ? pointsById.get(it.refId) : null)).find(p => p && p.city);
  const city = d.city || (firstPlace && firstPlace.city) || (current.cities || [])[0] || '';
  return taxiFareFor(city);
}

function effectiveDuration(it) {  if (Number.isFinite(it.estimatedDuration)) return it.estimatedDuration;
  const place = it.refId ? pointsById.get(it.refId) : null;
  return place && Number.isFinite(place.estimatedDuration) ? place.estimatedDuration : null;
}

function itemPanelHtml(it, di, withOps = false) {
  const booking = splitStartLocal(it.startLocal);
  const hasBooking = !!booking.date;
  const pinned = it.pinnedStart || '';
  const duration = effectiveDuration(it);
  const day = current.days[di];
  const idx = day ? day.items.findIndex(x => x.id === it.id) : -1;
  const last = day ? day.items.length - 1 : 0;
  const ops = withOps ? `
      <button class="tr-icon" data-up="${esc(it.id)}" ${idx <= 0 ? 'disabled' : ''} aria-label="上移">↑</button>
      <button class="tr-icon" data-dn="${esc(it.id)}" ${idx === last ? 'disabled' : ''} aria-label="下移">↓</button>
      ${current.days.length > 1 ? `<select class="tr-day-move" name="move-day" data-moveday="${esc(it.id)}" aria-label="移动到某天">${current.days.map((x, xi) => `<option value="${xi}" ${xi === di ? 'selected' : ''}>D${xi + 1}</option>`).join('')}</select>` : ''}
      <button class="tr-icon danger" data-rm="${esc(it.id)}" aria-label="删除">✕</button>` : '';
  return `
    <div class="tr-item-panel">
      <label class="tr-panel-field">锁定时点
        <input type="time" data-pin-time="${esc(it.id)}" value="${esc(pinned)}" ${hasBooking ? 'disabled' : ''} name="pin-time" aria-label="锁定时点">
      </label>
      <button class="pl-btn small" data-pin-clear="${esc(it.id)}" ${pinned && !hasBooking ? '' : 'disabled'}>清除</button>
      <span class="tr-seg" role="group" aria-label="必去或可删">
        <button class="${it.mustVisit !== false ? 'on' : ''}" data-must="${esc(it.id)}" data-must-value="1">必去</button>
        <button class="${it.mustVisit === false ? 'on' : ''}" data-must="${esc(it.id)}" data-must-value="0">可删</button>
      </span>
      <span class="tr-dwell-edit" role="group" aria-label="停留时长">
        <span>停留</span>
        <button class="tr-step" data-dwell="${esc(it.id)}" data-step="-15" ${!duration || duration <= 15 ? 'disabled' : ''}>−15</button>
        <b>${duration ? duration + 'm' : '未设'}</b>
        <button class="tr-step" data-dwell="${esc(it.id)}" data-step="15" ${duration && duration >= 720 ? 'disabled' : ''}>+15</button>
        ${it.estimatedDuration != null ? `<button class="tr-step reset" data-dwell="${esc(it.id)}" data-step="reset">恢复默认</button>` : ''}
      </span>
      <span class="tr-panel-hint">${hasBooking ? `已按预订 ${esc(booking.time)} 锁定，锁时字段不生效` : (pinned ? '按锁定时刻排程' : '留空＝跟随前一站顺排')}</span>
      ${ops}
      ${alternativesHtml(it)}
    </div>`;
}

function softLine(d, di, res, interests) {
  if (!res || res.empty) return '';
  const s = evaluateSoft({ day: d, result: res, items: d.items, places: pointsById, interests });
  const chips = [];
  if (s.reversals) chips.push(`<span class="tr-soft-chip ${s.reversals > 1 ? 'warn' : ''}" title="相邻两段方向接近掉头的次数">↩ 折返 ${s.reversals}</span>`);
  if (s.metroLegs) chips.push(`<span class="tr-soft-chip" title="地铁段数（含进出站时间）">🚇 换乘 ${s.metroLegs} 段</span>`);
  if (s.taxiLegs) {
    const cost = res.stats.taxiCost || 0;
    const cur = res.stats.taxiCurrency || '';
    const fare = cost && cur ? ` · 约 ${cost}${currencySymbol(cur)}` : ' · 费用未配置';
    chips.push(`<span class="tr-soft-chip" title="打车段数与城市费率估算（不是报价）">🚕 打车 ${s.taxiLegs} 段${fare}</span>`);
  }
  if (interests.length) {
    chips.push(`<span class="tr-soft-chip ${s.interest.matched === 0 ? 'warn' : ''}" title="所选兴趣命中的点位">🎯 兴趣 ${s.interest.matched}/${s.interest.total}</span>`);
  }
  if (s.middayPhoto) chips.push(`<span class="tr-soft-chip warn" title="12:00–15:00 的摄影/观景点，光线通常最硬">📷 正午摄影 ${s.middayPhoto}</span>`);
  if (s.longestStretchMinutes) chips.push(`<span class="tr-soft-chip ${s.longestStretchMinutes > 240 ? 'warn' : ''}" title="两次用餐/休息之间最长的连续活动时间">🧗 连续 ${fmtSpan(s.longestStretchMinutes)}</span>`);
  if (s.endSlackMinutes > 0) chips.push(`<span class="tr-soft-chip" title="收工线前的剩余时间">🛋 留白 ${fmtSpan(s.endSlackMinutes)}</span>`);
  const movable = d.items.filter(it => it.type === 'visit' && it.flexibility !== 'fixed'
    && !it.pinnedStart && !it.startLocal);
  if (res.timeline.length >= 2 && movable.length >= 2) {
    chips.push(`<button class="tr-soft-action" data-optimize="${di}" title="按折返/通行/摄影/连续活动做确定性顺序搜索">✨ 优化顺序</button>`);
  }
  return chips.length ? `<div class="tr-soft">${chips.join('')}</div>` : '';
}

function unplacedReason(it) {
  if (!it.refId) return '未绑定点位';
  if (it.type === 'note' || it.type === 'task') return '不参与排程';
  if (it.plannedStatus === 'skipped') return '已跳过';
  return '缺时长或坐标';
}

// 午餐预留：在 0…n 个插入位里试排，选开始时间最接近 12:30 的位置
function addLunch(di) {
  const day = current.days[di];
  if (!day) return;
  const id = `meal_${Date.now().toString(36)}`;
  const patch = {
    id, type: 'meal', refId: null, placeNameSnapshot: '午餐（预留）',
    mustVisit: false, estimatedDuration: 60, confirm: 'ok',
  };
  let bestIdx = day.items.length;
  let bestDiff = Infinity;
  for (let idx = 0; idx <= day.items.length; idx += 1) {
    const trial = [...day.items.slice(0, idx), { ...patch }, ...day.items.slice(idx)];
    const res = evaluateDay({
      day: { id: day.id, date: day.date }, items: trial, places: pointsById,
      options: { start: day.startTime, end: day.endTime, matrix: cache.matrix, facts: cache.facts },
    });
    const row = res.timeline.find(t => t.itemId === id);
    if (!row) continue;
    const diff = Math.abs(row.start - (12 * 60 + 30));
    if (diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
  }
  view.sel = id;
  mutate(trip => insertItemAt(trip, di, bestIdx, patch));
  toast('已插入 60 分钟午餐预留（可删，可改停留）');
}

function addRest(di) {
  const day = current.days[di];
  if (!day) return;
  const id = `break_${Date.now().toString(36)}`;
  const patch = {
    id, type: 'break', refId: null, placeNameSnapshot: '休息（预留）',
    mustVisit: false, estimatedDuration: 20, confirm: 'ok',
  };
  view.sel = id;
  mutate(trip => insertItemAt(trip, di, day.items.length, patch));
  toast('已追加 20 分钟休息预留（可删，可改停留）');
}

function timelineDayHtml(d, di, res) {
  const railItems = d.items.map(it => ({ ...it, placeType: itemType(it, pointsById) }));
  const rail = buildDayRail({ result: res, day: d, items: railItems });
  const placed = new Set(res.timeline.map(x => x.itemId));
  const unplaced = d.items.filter(it => !placed.has(it.id));
  const selected = view.sel && d.items.some(it => it.id === view.sel) ? d.items.find(it => it.id === view.sel) : null;

  const blocks = rail.blocks.map(b => {
    const compact = b.height < 54;
    const tiny = b.height < 34;
    const cls = [
      b.must ? '' : 'optional', b.pinned ? 'pinned' : '', b.booked ? 'booked' : '',
      b.overlapPrev ? 'overlap' : '', view.sel === b.itemId ? 'selected' : '',
      compact ? 'compact' : '', tiny ? 'tiny' : '',
    ].filter(Boolean).join(' ');
    return `<div class="tl-block ${cls}" data-tl-block="${esc(b.itemId)}" data-start="${b.start}" data-duration="${b.duration}"
      style="top:${b.top}px;height:${b.height}px;background:${b.color}14;border-left-color:${b.color}">
      ${b.pinned ? '<span class="tl-pin">🔒</span>' : (b.booked ? '<span class="tl-pin">预订</span>' : '')}
      <div class="tl-time">${esc(b.timeLabel)}</div>
      <div class="tl-name">${esc(b.name)}</div>
      ${compact ? '' : `<div class="tl-meta">${esc(b.type)}${b.unknown ? ' · 开放时间未知' : ''}</div>`}
    </div>`;
  }).join('');

  const hours = rail.hours.map(h => `<div class="tl-hour" style="top:${h.top}px"><b>${h.label}</b></div>`).join('');
  const legs = rail.legs.filter(l => l.showLabel).map(l => `<div class="tl-leg" style="top:${l.top}px" title="${esc(l.detail || '')}"><span>${esc(l.label)}</span></div>`).join('');
  const waits = rail.waits.map(w => `<div class="tl-wait" style="top:${w.top}px;height:${w.height}px"><span>${esc(w.label)}</span></div>`).join('');
  const overrun = rail.overrun ? `<div class="tl-overrun" style="top:${rail.overrun.top}px;height:${rail.overrun.height}px"></div>` : '';
  const unplacedHtml = unplaced.length ? `<div class="tl-unplaced">
      <span class="tl-unplaced-label">未排程 ${unplaced.length} 项</span>
      ${unplaced.map(it => `<button class="tl-unplaced-item ${view.sel === it.id ? 'sel' : ''}" data-item="${esc(it.id)}">${esc(itemName(it, pointsById))}<small>${esc(unplacedReason(it))}</small></button>`).join('')}
    </div>` : '';

  return `<div class="tl-wrap">
      <div class="tl-hint">拖动色块锁定时刻 · 双击解锁 · 点色块改必去/可删或删除</div>
      <div class="tl-rail" data-rail="${di}" data-range-start="${rail.rangeStart}" data-px="${rail.pxPerMin}" data-day-start="${rail.startMin}">
        <div class="tl-inner" style="height:${rail.height}px">
          ${hours}
          <div class="tl-bound start" style="top:${(rail.startMin - rail.rangeStart) * rail.pxPerMin}px"><b>出发 ${formatMinutesCrossDay(rail.startMin)}</b></div>
          <div class="tl-bound end" style="top:${(rail.endMin - rail.rangeStart) * rail.pxPerMin}px"><b>收工 ${formatMinutesCrossDay(rail.endMin)}</b></div>
          ${overrun}${legs}${waits}${blocks}
        </div>
      </div>
      ${unplacedHtml}
      ${selected ? itemPanelHtml(selected, di, true) : ''}
    </div>`;
}

function fixBar(d, di, res) {
  const acts = [];
  if (res.errors.some(c => c.kind === 'day-overrun')) {
    acts.push(`<button class="tr-fix" data-trim="${di}">⚡ 自动减负</button>`);
    const lastEnd = res.timeline.length ? res.timeline[res.timeline.length - 1].end : 0;
    if (lastEnd > 0 && lastEnd < 1440) {
      acts.push(`<button class="tr-fix" data-extend="${di}" data-end="${lastEnd}">收工延到 ${formatMinutesCrossDay(lastEnd)}</button>`);
    }
    if ((d.transportMode || 'transit') !== 'taxi') {
      const taxi = evaluateDay({
        day: { id: d.id, date: d.date }, items: d.items, places: pointsById,
        options: { start: d.startTime, end: d.endTime, transportMode: 'taxi', taxiFare: dayFare(d), matrix: cache.matrix, facts: cache.facts },
      });
      const saved = res.stats.transitMinutes - taxi.stats.transitMinutes;
      if (saved > 0) {
        const cost = taxi.stats.taxiCost || 0;
        const cur = taxi.stats.taxiCurrency || '';
        const fare = cost && cur ? `，约 ${cost}${currencySymbol(cur)}` : '，费用未配置';
        acts.push(`<button class="tr-fix" data-day-taxi="${di}">打车优先（通行省 ${saved}m${fare}）</button>`);
      }
    }
  }
  const unpinned = new Set();
  const movedNext = new Set();
  const planBShown = new Set();
  for (const c of res.conflicts) {
    if (c.kind === 'duplicate-place' && c.itemId) {
      const it = d.items.find(i => i.id === c.itemId);
      if (it) acts.push(`<button class="tr-fix danger" data-remove-item="${esc(it.id)}">删掉重复「${esc(itemName(it, pointsById))}」</button>`);
    }
    if (c.kind === 'closed' && c.itemId && !planBShown.has(c.itemId)) {
      const it = d.items.find(i => i.id === c.itemId);
      if (it) {
        planBShown.add(it.id);
        for (const a of planBAlternatives(it, 2)) {
          acts.push(`<button class="tr-fix" data-alt-item="${esc(it.id)}" data-alt-place="${esc(a.point.id)}">Plan B「${esc(a.point.name)}」</button>`);
        }
      }
    }
    if (c.kind === 'overlap' && c.itemId) {
      const idx = res.timeline.findIndex(t => t.itemId === c.itemId);
      const prevRow = idx > 0 ? res.timeline[idx - 1] : null;
      const prevItem = prevRow ? d.items.find(i => i.id === prevRow.itemId) : null;
      const booked = d.items.find(i => i.id === c.itemId);
      if (prevItem && booked && prevItem.flexibility !== 'fixed' && !splitStartLocal(prevItem.startLocal).date) {
        acts.push(`<button class="tr-fix" data-move-after="${esc(prevItem.id)}" data-anchor="${esc(booked.id)}">把「${esc(itemName(prevItem, pointsById))}」移到预订后</button>`);
      }
    }
    if ((c.kind === 'after-last-entry' || c.kind === 'after-close') && c.itemId
      && di + 1 < current.days.length && !movedNext.has(c.itemId)) {
      const it = d.items.find(i => i.id === c.itemId);
      if (it && !splitStartLocal(it.startLocal).date) {
        movedNext.add(it.id);
        acts.push(`<button class="tr-fix" data-move-next="${esc(it.id)}" data-to="${di + 1}">把「${esc(itemName(it, pointsById))}」移到 Day ${di + 2}</button>`);
      }
    }
    if ((c.kind === 'late-start' || c.kind === 'overlap') && c.itemId) {
      const it = d.items.find(i => i.id === c.itemId);
      if (it && it.pinnedStart && !unpinned.has(it.id)) {
        unpinned.add(it.id);
        acts.push(`<button class="tr-fix" data-unpin-item="${esc(it.id)}">解锁「${esc(itemName(it, pointsById))}」</button>`);
      }
    }
  }
  if (!acts.length) return '';
  return `<div class="tr-fixbar"><span>可执行修复</span>${acts.join('')}</div>`;
}

function renderEditor() {
  const t = current;
  const col = meta.cityColors[(t.cities || [])[0]] || '#B71C1C';
  const conflicts = itemDateConflicts(t);
  const conflictByItem = new Map(conflicts.map(c => [c.itemId, c]));
  const pending = countNeedsConfirm(t);
  const dayRes = new Map(t.days.map((d, di) => [d.id, evaluateDay({
    day: { id: d.id, date: d.date }, items: d.items, places: pointsById,
    options: {
      start: d.startTime, end: d.endTime, transportMode: d.transportMode || 'transit',
      taxiFare: dayFare(d), matrix: cache.matrix, facts: cache.facts,
      entryRegion: transferFromRegion(t, di), regionNames: regionNamesMap(),
    },
  })]));
  const crossRegionTransfers = t.days.reduce((n, d, di) => n + (transferFromRegion(t, di) ? 1 : 0), 0);
  const tripInterests = Array.isArray(t.origin && t.origin.interests) ? t.origin.interests : [];
  // 大屏右栏：概览 + 打印/快捷键入口（窄屏由 CSS 隐藏，版面与改动前一致）
  const range = t.startDate
    ? (t.days.length > 1 ? `${shortDate(t.startDate)} 起 · ${t.days.length} 天` : shortDate(t.startDate))
    : `${t.days.length} 天`;
  const asideHtml = `
    <aside class="plan-aside" aria-label="行程概览">
      <div class="aside-card">
        <h3>行程概览</h3>
        <div class="aside-stack">
          <div class="aside-row"><span>日期</span><b>${esc(range)}</b></div>
          <div class="aside-row"><span>条目</span><b>${tripItemCount(t)} 项</b></div>
          <div class="aside-row"><span>待确认</span><b>${pending} 项</b></div>
          ${crossRegionTransfers ? `<div class="aside-row"><span>跨板块</span><b>${crossRegionTransfers} 段长途未建模</b></div>` : ''}
        </div>
      </div>
      <div class="aside-card">
        <h3>打印与快捷键</h3>
        <div class="aside-stack">
          <button type="button" class="pl-btn" data-print>🖨 打印行程单</button>
          <button type="button" class="pl-btn" data-kbd-open>? 查看全部快捷键</button>
          <p class="aside-note">打印只输出干净行程单（标题 / 日期 / 每日条目 / 点位与备注 / 长途未建模标记），导航、侧栏、地图控件和彩色背景都不会带进纸面。</p>
        </div>
      </div>
    </aside>`;
  $app.innerHTML = `
    <div class="pl-head">
      <button class="pl-btn small" id="tr-back">← 全部行程</button>
      <div class="tr-head-ops">
        <a class="pl-btn small" href="./today.html">📍 今日执行</a>
        <button class="pl-btn small pl-print-head" data-print>🖨 打印行程单</button>
        <button class="pl-btn small" id="tr-layout">${view.layout === 'timeline' ? '☰ 列表' : '🗓 时间轴'}</button>
        <button class="pl-btn small" id="tr-undo" ${undoStack.length ? '' : 'disabled'}>↶ 撤销</button>
        <button class="pl-btn small" id="tr-md">导出 MD</button>
      </div>
    </div>
    <div class="plan-shell">
      <main class="plan-main">
    ${banners()}
    <div class="card tr-meta">
      <input id="tr-title" class="tr-title-input" value="${esc(t.title)}" aria-label="行程标题">
      <div class="tr-meta-row">
        <label>状态
          <select id="tr-status">${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <label>出发日期
          <input id="tr-date" type="date" value="${esc(t.startDate || '')}">
        </label>
        <label>时区
          <input id="tr-tz" list="tr-tz-options" value="${esc(t.homeTimeZone || '')}" placeholder="设备本地" aria-label="行程时区（IANA）">
        </label>
        <datalist id="tr-tz-options">${TIME_ZONE_OPTIONS.map(z => `<option value="${esc(z)}"></option>`).join('')}</datalist>
        ${t.dateMode === 'fixed' ? `<label>改期方式
          <select id="tr-policy">
            <option value="shift_all">整体平移</option>
            <option value="keep_bookings">保留已订时刻</option>
          </select>
        </label>` : ''}
      </div>
      <div class="pl-meta">${esc(sourceLabel(t))} · ${t.days.length} 天 · ${tripItemCount(t)} 项${pending ? ` · <b class="tr-warn">${pending} 待确认</b>` : ''}${conflicts.length ? ` · <b class="tr-warn">${conflicts.length} 处预订日冲突</b>` : ''}${crossRegionTransfers ? ` · <b class="tr-warn">${crossRegionTransfers} 段跨板块长途未建模</b>` : ''} · 修订 ${t.revision}</div>
    </div>
    ${t.notes ? `<div class="pl-tip">📌 ${esc(t.notes)}</div>` : ''}
    ${t.days.map((d, di) => `
      <div class="pl-day card" style="border-left:4px solid ${col}">
        <div class="pl-day-head">
          <span>Day ${d.index}${d.date ? ` <em>${shortDate(d.date)} ${weekday(d.date)}</em>` : ''}</span>
          <span>${d.items.length} 项</span>
        </div>
        <div class="tr-window">
          <span class="tr-window-label">⏱ 当天窗口</span>
          <input type="time" data-window-start="${di}" value="${esc(d.startTime || '09:00')}" name="day-start" aria-label="Day ${d.index} 出发时间">
          <span class="tr-window-sep">–</span>
          <input type="time" data-window-end="${di}" value="${esc(d.endTime || '21:00')}" name="day-end" aria-label="Day ${d.index} 收工时间">
          <select class="tr-mode-select" data-day-mode="${di}" name="day-mode" aria-label="Day ${d.index} 交通方式" title="打车优先：用更高费用换时间（费用未建模）">
            <option value="transit" ${(d.transportMode || 'transit') !== 'taxi' ? 'selected' : ''}>公交优先</option>
            <option value="taxi" ${d.transportMode === 'taxi' ? 'selected' : ''}>打车优先</option>
          </select>
        </div>
        ${feasibilityLine(d, dayRes.get(d.id))}
        ${transferNote(t, di)}
        ${softLine(d, di, dayRes.get(d.id), tripInterests)}
        ${fixBar(d, di, dayRes.get(d.id))}
        ${view.layout === 'timeline' ? timelineDayHtml(d, di, dayRes.get(d.id)) : (d.items.length ? d.items.map((it, ii) => {
          const cf = conflictByItem.get(it.id);
          return `
          <div class="pl-point tr-item ${view.sel === it.id ? 'is-sel' : ''}" data-item="${esc(it.id)}">
            <span class="pl-dot" style="background:${it.confirm === 'ok' && it.refId ? (meta.cityColors[(pointsById.get(it.refId) || {}).city] || '#546E7A') : '#C9A227'}"></span>
            <button class="tr-name" data-bind="${esc(it.id)}">${esc(itemName(it, pointsById))}</button>
            ${it.period ? `<span class="tr-chip">${PERIOD_LABEL[it.period]}</span>` : ''}
            ${it.pinnedStart ? `<span class="tr-chip pin">🔒 ${esc(it.pinnedStart)}</span>` : ''}
            ${it.mustVisit === false ? '<span class="tr-chip opt">可删</span>' : ''}
            ${it.confirm !== 'ok' ? '<span class="tr-chip warn">待确认</span>' : ''}
            ${it.refId && !isPointVisible(pointsById.get(it.refId), regionIndex) ? '<span class="tr-chip">⛔ 所在板块已隐藏</span>' : ''}
            ${cf ? `<span class="tr-chip danger">预订 ${shortDate(cf.itemDate)}</span>` : ''}
            <span class="pl-ptype">${esc(itemType(it, pointsById))}</span>
            <span class="tr-ops">
              <button class="tr-icon" data-up="${esc(it.id)}" ${ii === 0 ? 'disabled' : ''} aria-label="上移">↑</button>
              <button class="tr-icon" data-dn="${esc(it.id)}" ${ii === d.items.length - 1 ? 'disabled' : ''} aria-label="下移">↓</button>
              ${t.days.length > 1 ? `<select class="tr-day-move" name="move-day" data-moveday="${esc(it.id)}" aria-label="移动到某天">${t.days.map((x, xi) => `<option value="${xi}" ${xi === di ? 'selected' : ''}>D${xi + 1}</option>`).join('')}</select>` : ''}
              <button class="tr-icon danger" data-rm="${esc(it.id)}" aria-label="删除">✕</button>
            </span>
          </div>
          ${view.sel === it.id ? itemPanelHtml(it) : ''}`;
        }).join('') : '<div class="tr-day-empty">这一天还没有安排</div>')}
        <div class="tr-day-ops">
          <button class="pl-btn small" data-add="${di}">＋ 加点位</button>
          <button class="pl-btn small" data-lunch="${di}">🍽 午餐 60m</button>
          <button class="pl-btn small" data-rest="${di}">☕ 休息 20m</button>
          <button class="pl-btn small" data-note="${di}">📝 ${d.note ? '改备注' : '加备注'}</button>
          ${t.days.length > 1 ? `<button class="pl-btn small danger" data-delday="${di}">删除这天</button>` : ''}
        </div>
        ${d.note ? `<div class="pl-tip">💡 ${esc(d.note)}</div>` : ''}
      </div>`).join('')}
    <div class="tr-foot-ops">
      <button class="pl-btn" id="tr-add-day">＋ 增加一天</button>
      <button class="pl-btn" id="tr-json">导出本行程 JSON</button>
    </div>
      </main>
      ${asideHtml}
    </div>
    ${view.picker ? pickerHtml() : ''}`;
  renderPrintSheet(t, dayRes);

  document.getElementById('tr-back').onclick = () => { view.mode = 'list'; view.picker = null; view.sel = null; current = null; render(); };
  const undoBtn = document.getElementById('tr-undo');
  if (undoBtn) undoBtn.onclick = doUndo;
  document.getElementById('tr-layout').onclick = () => {
    view.layout = view.layout === 'timeline' ? 'list' : 'timeline';
    view.sel = null;
    render();
  };
  document.getElementById('tr-md').onclick = () => exportMd(current);
  document.getElementById('tr-json').onclick = () => download(`${current.title || '行程'}.json`, JSON.stringify({ schemaVersion: current.schemaVersion, trips: [current], visits: [] }, null, 2));
  document.getElementById('tr-add-day').onclick = () => mutate(trip => addDay(trip));
  const titleInput = document.getElementById('tr-title');
  titleInput.onchange = () => {
    const v = titleInput.value.trim();
    if (v && v !== current.title) mutate(trip => updateTrip(trip, { title: v }));
    else titleInput.value = current.title;
  };
  document.getElementById('tr-status').onchange = e => mutate(trip => updateTrip(trip, { status: e.target.value }));
  const dateInput = document.getElementById('tr-date');
  dateInput.onchange = () => {
    const v = dateInput.value;
    if (!v) { mutate(trip => setDateMode(trip, 'relative')); return; }
    if (t.dateMode !== 'fixed') { mutate(trip => setDateMode(trip, 'fixed', v)); return; }
    const policy = document.getElementById('tr-policy').value;
    const res = shiftTripStart(current, v, { policy });
    if (!res.ok) { toast(res.error); dateInput.value = current.startDate; return; }
    applyTrip(res.trip);
    if (res.conflicts.length) toast(`已改期，${res.conflicts.length} 处预订仍保留原日期，请逐条核对`);
  };
  // 时区：留空＝跟随设备本地；填了就必须是合法 IANA 时区，否则回退（避免落库时被结构校验拒绝）
  const tzInput = document.getElementById('tr-tz');
  tzInput.onchange = () => {
    const raw = tzInput.value.trim();
    if (raw && !isValidTimeZone(raw)) {
      toast('时区格式不对：请填 IANA 名称，如 Asia/Shanghai；留空跟随设备');
      tzInput.value = current.homeTimeZone || '';
      return;
    }
    if (raw !== (current.homeTimeZone || '')) mutate(trip => updateTrip(trip, { homeTimeZone: raw }));
  };
  if (view.picker) wirePicker();

  // 委托：items 与 day 操作
  $app.onclick = e => {
    // 打印与快捷键入口（head 与右栏两个按钮共用 data-print / data-kbd-open）
    if (e.target.closest('[data-print]')) { window.print(); return; }
    if (e.target.closest('[data-kbd-open]')) { openHelp(); return; }
    const tlBlock = e.target.closest('[data-tl-block]');
    if (tlBlock) {
      if (tlDragged) { tlDragged = false; return; }
      const id = tlBlock.dataset.tlBlock;
      const now = Date.now();
      if (lastBlockTap.id === id && now - lastBlockTap.at < 300) {
        lastBlockTap = { id: '', at: 0 };
        const it = findItem(id);
        if (it && it.pinnedStart) mutate(trip => setItemPinnedStart(trip, it.id, ''));
        return;
      }
      lastBlockTap = { id, at: now };
      view.sel = view.sel === id ? null : id;
      render();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) { pickPlace(pick.dataset.pick); return; }
    const add = e.target.closest('[data-add]');
    if (add) { view.picker = { mode: 'add', dayIndex: +add.dataset.add, q: '', city: (current.cities || [])[0] || '' }; render(); const q = document.getElementById('tr-q'); if (q) q.focus(); return; }
    const lunch = e.target.closest('[data-lunch]');
    if (lunch) { addLunch(+lunch.dataset.lunch); return; }
    const rest = e.target.closest('[data-rest]');
    if (rest) { addRest(+rest.dataset.rest); return; }
    const note = e.target.closest('[data-note]');
    if (note) {
      const di = +note.dataset.note;
      const v = prompt('这一天的备注（留空清除）', current.days[di].note || '');
      if (v !== null) mutate(trip => setDayNote(trip, di, v.trim()));
      return;
    }
    const delDay = e.target.closest('[data-delday]');
    if (delDay) {
      const di = +delDay.dataset.delday;
      const n = current.days[di].items.length;
      if (confirm(`删除 Day ${di + 1}？${n ? `其中 ${n} 个点位会并入相邻的一天，不会丢失` : ''}`)) mutate(trip => removeDay(trip, di));
      return;
    }
    const up = e.target.closest('[data-up]');
    if (up) { mutate(trip => moveItemWithinDay(trip, up.dataset.up, -1)); return; }
    const dn = e.target.closest('[data-dn]');
    if (dn) { mutate(trip => moveItemWithinDay(trip, dn.dataset.dn, 1)); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { if (view.sel === rm.dataset.rm) view.sel = null; mutate(trip => removeItem(trip, rm.dataset.rm)); return; }
    const pinClear = e.target.closest('[data-pin-clear]');
    if (pinClear) { mutate(trip => setItemPinnedStart(trip, pinClear.dataset.pinClear, '')); return; }
    const must = e.target.closest('[data-must]');
    if (must) { mutate(trip => setItemMustVisit(trip, must.dataset.must, must.dataset.mustValue === '1')); return; }
    const dwellBtn = e.target.closest('[data-dwell]');
    if (dwellBtn) {
      const it = findItem(dwellBtn.dataset.dwell);
      if (!it) return;
      const cur = effectiveDuration(it);
      const step = dwellBtn.dataset.step;
      const next = step === 'reset' ? null : cur ? clampNum(cur + Number(step), 15, 720) : 30;
      mutate(trip => setItemDuration(trip, it.id, next));
      return;
    }
    const trim = e.target.closest('[data-trim]');
    if (trim) {
      const di = +trim.dataset.trim;
      const d = current.days[di];
      if (!d) return;
      const plan = planAutoTrim({ day: d, items: d.items, places: pointsById, matrix: cache.matrix });
      if (!plan.dropIds.length) { toast('没有可删条目：把某条设为「可删」，或延长收工'); return; }
      mutate(trip => plan.dropIds.reduce((t, id) => removeItem(t, id), trip));
      toast(`已移除 ${plan.dropIds.length} 项${plan.resolved ? '，硬约束通过' : '，仍超时'}`);
      return;
    }
    const extend = e.target.closest('[data-extend]');
    if (extend) {
      const di = +extend.dataset.extend;
      const d = current.days[di];
      const end = Number(extend.dataset.end);
      if (!d || !Number.isFinite(end) || end >= 1440) return;
      mutate(trip => setDayWindow(trip, di, { startTime: d.startTime || '09:00', endTime: formatMinutes(end) }));
      toast(`收工线已延到 ${formatMinutes(end)}`);
      return;
    }
    const removeFix = e.target.closest('[data-remove-item]');
    if (removeFix) { mutate(trip => removeItem(trip, removeFix.dataset.removeItem)); return; }
    const unpinFix = e.target.closest('[data-unpin-item]');
    if (unpinFix) { mutate(trip => setItemPinnedStart(trip, unpinFix.dataset.unpinItem, '')); return; }
    const moveAfterBtn = e.target.closest('[data-move-after]');
    if (moveAfterBtn) { mutate(trip => moveItemAfter(trip, moveAfterBtn.dataset.moveAfter, moveAfterBtn.dataset.anchor)); return; }
    const moveNextBtn = e.target.closest('[data-move-next]');
    if (moveNextBtn) { mutate(trip => moveItemToDay(trip, moveNextBtn.dataset.moveNext, +moveNextBtn.dataset.to)); return; }
    const taxiBtn = e.target.closest('[data-day-taxi]');
    if (taxiBtn) { mutate(trip => setDayTransportMode(trip, +taxiBtn.dataset.dayTaxi, 'taxi')); toast('已切换为打车优先（费用未建模）'); return; }
    const altBtn = e.target.closest('[data-alt-place]');
    if (altBtn) {
      const place = pointsById.get(altBtn.dataset.altPlace);
      if (place) mutate(trip => replaceItemPlace(trip, altBtn.dataset.altItem, place));
      return;
    }
    const optimizeBtn = e.target.closest('[data-optimize]');
    if (optimizeBtn) {
      const di = +optimizeBtn.dataset.optimize;
      const d = current.days[di];
      if (!d) return;
      const r = optimizeDayOrder({
        day: d, items: d.items, places: pointsById, interests: tripInterests, taxiFare: dayFare(d), matrix: cache.matrix,
      });
      if (!r.improved) { toast('当前顺序在折返/通行/摄影/时段上已是最优'); return; }
      mutate(trip => reorderDay(trip, di, r.order));
      const periodPart = r.beforePeriods !== r.afterPeriods ? `时段 ${r.beforePeriods}→${r.afterPeriods}，` : '';
      toast(`顺序已优化：${periodPart}折返 ${r.before.soft.reversals}→${r.after.soft.reversals}，通行 ${r.before.result.stats.transitMinutes}→${r.after.result.stats.transitMinutes}m`);
      return;
    }
    const bind = e.target.closest('[data-bind]');
    if (bind) {
      const it = findItem(bind.dataset.bind);
      if (it && it.confirm !== 'ok') { view.picker = { mode: 'bind', itemId: it.id, q: '', city: (current.cities || [])[0] || '' }; render(); const q = document.getElementById('tr-q'); if (q) q.focus(); return; }
    }
    const back = e.target.closest('[data-pick-close]');
    if (back) { view.picker = null; render(); return; }
    const row = e.target.closest('[data-item]');
    if (row) { view.sel = view.sel === row.dataset.item ? null : row.dataset.item; render(); }
  };
  $app.onchange = e => {
    const sel = e.target.closest('[data-moveday]');
    if (sel) { const to = +sel.value; mutate(trip => moveItemToDay(trip, sel.dataset.moveday, to)); return; }
    const ws = e.target.closest('[data-window-start]');
    const we = e.target.closest('[data-window-end]');
    if (ws || we) {
      const di = Number(ws ? ws.dataset.windowStart : we.dataset.windowEnd);
      const day = current.days[di];
      if (!day) return;
      const start = ws ? ws.value : (day.startTime || '09:00');
      const end = we ? we.value : (day.endTime || '21:00');
      if (!start || !end || end <= start) { toast('收工时间必须晚于出发时间'); render(); return; }
      mutate(trip => setDayWindow(trip, di, { startTime: start, endTime: end }));
      return;
    }
    const pin = e.target.closest('[data-pin-time]');
    if (pin) {
      const v = pin.value;
      if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { render(); return; }
      mutate(trip => setItemPinnedStart(trip, pin.dataset.pinTime, v));
      return;
    }
    const modeSel = e.target.closest('[data-day-mode]');
    if (modeSel) {
      mutate(trip => setDayTransportMode(trip, +modeSel.dataset.dayMode, modeSel.value));
      if (modeSel.value === 'taxi') toast('打车优先：用更高费用换时间（费用未建模）');
    }
  };
  $app.onpointerdown = e => {
    const block = e.target.closest('[data-tl-block]');
    const rail = block && block.closest('.tl-rail');
    if (!block || !rail) return;
    const item = findItem(block.dataset.tlBlock);
    if (item && splitStartLocal(item.startLocal).date) return; // 预订时刻不可拖动
    railDrag = {
      block, rail, itemId: block.dataset.tlBlock, startY: e.clientY,
      baseStart: Number(block.dataset.start), duration: Number(block.dataset.duration) || 30,
      moved: false, pending: null,
    };
    try { block.setPointerCapture(e.pointerId); } catch { /* 合成事件无真实指针 */ }
  };
  $app.onpointermove = e => {
    const g = railDrag;
    if (!g) return;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.abs(dy) < 4) return;
    g.moved = true;
    tlDragged = true;
    const px = Number(g.rail.dataset.px) || 1.25;
    const rangeStart = Number(g.rail.dataset.rangeStart) || 0;
    const dayStart = Number(g.rail.dataset.dayStart) || 0;
    const newStart = clampNum(snap5(g.baseStart + dy / px), dayStart, 1439);
    g.pending = newStart;
    g.block.classList.add('dragging', 'pinned');
    g.block.style.top = ((newStart - rangeStart) * px) + 'px';
    const timeEl = g.block.querySelector('.tl-time');
    if (timeEl) timeEl.textContent = `${formatMinutesCrossDay(newStart)}–${formatMinutesCrossDay(newStart + g.duration)} · ${g.duration}m`;
  };
  $app.onpointerup = () => {
    const g = railDrag;
    railDrag = null;
    if (!g || !g.moved) return;
    const value = formatMinutes(clampNum(g.pending ?? g.baseStart, 0, 1439));
    mutate(trip => setItemPinnedStart(trip, g.itemId, value)).then(() => { if (current) render(); });
    setTimeout(() => { tlDragged = false; }, 350);
  };
  $app.onpointercancel = () => {
    if (!railDrag) return;
    railDrag = null;
    render();
  };
}

function findItem(id) {
  for (const d of current.days) {
    const it = d.items.find(x => x.id === id);
    if (it) return it;
  }
  return null;
}

/* ---------- 键盘：j/k 在当前行程的条目间移动（列表/时间轴都用同一份条目顺序） ---------- */
let planKbdIdx = -1;

function stepPlanItem(step) {
  if (!current) return;
  const ids = current.days.flatMap(d => d.items.map(it => it.id));
  if (!ids.length) return;
  planKbdIdx = (planKbdIdx + step + ids.length) % ids.length;
  view.sel = ids[planKbdIdx];
  render();
  const el = $app.querySelector(`.tr-item[data-item="${CSS.escape(view.sel)}"], .tl-block[data-tl-block="${CSS.escape(view.sel)}"]`);
  if (el) el.scrollIntoView({ block: 'center' });
}

function pickerHtml() {
  const p = view.picker;
  const title = p.mode === 'bind'
    ? `为「${esc((findItem(p.itemId) || {}).placeNameSnapshot || '待确认点位')}」指定点位`
    : `添加点位到 Day ${(p.dayIndex || 0) + 1}`;
  return `
    <div class="tr-overlay">
      <div class="tr-sheet">
        <div class="tr-sheet-head">
          <strong>${title}</strong>
          <button class="pl-btn small" data-pick-close>完成</button>
        </div>
        <input id="tr-q" placeholder="搜索点位名 / 英文名 / 类型" value="${esc(p.q)}">
        <select id="tr-city-sel">
          <option value="">全部城市</option>
          ${[...new Set(cache.visiblePts.map(x => x.city))].sort().map(c => `<option ${c === p.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <div class="tr-results" id="tr-results">${pickerResultsHtml()}</div>
      </div>
    </div>`;
}

function pickerResultsHtml() {
  const p = view.picker;
  const q = (p.q || '').trim().toLowerCase();
  let list = cache.visiblePts.filter(x => !x.pending && (!p.city || x.city === p.city));
  if (q) list = list.filter(x => `${x.name || ''} ${x.name_en || ''} ${x.type || ''} ${x.cluster || ''}`.toLowerCase().includes(q));
  if (p.mode === 'add') {
    const day = current.days[p.dayIndex];
    const added = new Set((day ? day.items : []).map(i => i.refId));
    list = list.filter(x => !added.has(x.id));
  }
  const candIds = p.mode === 'bind'
    ? ((ambiguities.find(a => a.itemId === p.itemId) || {}).candidates || [])
    : [];
  const cands = candIds.map(id => pointsById.get(id)).filter(Boolean).filter(x => isPointVisible(x, regionIndex));
  const rest = list.filter(x => !candIds.includes(x.id)).slice(0, 60);
  const row = (x, tag) => `
    <button class="tr-result" data-pick="${esc(x.id)}">
      <span>${esc(x.name)}${x.name_en ? `<em>${esc(x.name_en)}</em>` : ''}</span>
      <span class="pl-ptype">${tag || esc(x.type || '')}</span>
    </button>`;
  return `
    ${cands.length ? `<div class="tr-res-label">同名候选</div>${cands.map(x => row(x, '候选')).join('')}` : ''}
    ${rest.length ? `${cands.length ? '<div class="tr-res-label">其它点位</div>' : ''}${rest.map(x => row(x)).join('')}` : (cands.length ? '' : '<div class="tr-day-empty">没有匹配的点位</div>')}`;
}

function wirePicker() {
  const q = document.getElementById('tr-q');
  if (q) q.oninput = () => { view.picker.q = q.value; const box = document.getElementById('tr-results'); if (box) box.innerHTML = pickerResultsHtml(); };
  const city = document.getElementById('tr-city-sel');
  if (city) city.onchange = () => { view.picker.city = city.value; const box = document.getElementById('tr-results'); if (box) box.innerHTML = pickerResultsHtml(); };
}

async function pickPlace(placeId) {
  const pt = pointsById.get(placeId);
  if (!pt || !view.picker) return;
  const p = view.picker;
  if (p.mode === 'bind') {
    const day = current.days.find(d => d.items.some(i => i.id === p.itemId));
    if (day && day.items.some(i => i.id !== p.itemId && i.refId === pt.id)) {
      toast('这一天已经有这个点位了；如需替换请先删掉重复的一条');
      return;
    }
    view.picker = null;
    await mutate(trip => bindItemPlace(trip, p.itemId, pt));
    toast(`已绑定：${pt.name}`);
    return;
  }
  const keepQ = p.q;
  await mutate(trip => addPlaceToDay(trip, pt, { dayIndex: p.dayIndex }));
  view.picker = { mode: 'add', dayIndex: p.dayIndex, q: keepQ, city: p.city };
  render();
  const q = document.getElementById('tr-q');
  if (q) q.focus();
}

/* ---------- 落库 / 撤销 / 变更日志 ---------- */
// M1：每次编辑留 ChangeEvent（Diff 摘要 + 受影响条目），日志失败不影响编辑本身
async function logChange(kind, before, after) {
  try {
    if (!before || !after || !store) return;
    const diff = diffTrips(before, after);
    const summary = summarizeDiff(diff);
    if (summary === '无可见变更') return;
    let k = kind;
    if (!k) {
      if (diff.changed.some(c => c.moved)) k = 'move';
      else if (diff.reordered) k = 'reorder';
      else k = 'edit';
    }
    const affected = [...diff.added, ...diff.removed, ...diff.changed].map(x => x.id).slice(0, 50);
    await store.saveEvent(createChangeEvent({ tripId: after.id, at: Date.now(), kind: k, summary, affected }));
  } catch { /* 变更日志失败不阻断编辑 */ }
}

async function persistTrip(next) {
  const r = await store.saveTrip(next);
  if (!r.ok) {
    toast('保存失败：' + ((r.errors && r.errors[0] && r.errors[0].message) || '数据未通过校验'));
    return false;
  }
  current = r.trip;
  return true;
}

async function mutate(fn) {
  if (!current) return;
  const before = JSON.stringify(current);
  const next = fn(current);
  if (JSON.stringify(next) === before) return;
  if (await persistTrip(next)) {
    undoStack.push(before);
    if (undoStack.length > 30) undoStack.shift();
    logChange(null, JSON.parse(before), current);
    await refreshTrips();
    render();
  }
}

async function applyTrip(next) {
  const before = JSON.stringify(current);
  if (await persistTrip(next)) {
    undoStack.push(before);
    if (undoStack.length > 30) undoStack.shift();
    logChange(null, JSON.parse(before), current);
    await refreshTrips();
    render();
  }
}

async function doUndo() {
  const snap = undoStack.pop();
  if (!snap) return;
  const before = JSON.stringify(current);
  const restored = JSON.parse(snap);
  // 撤销写回的是「旧内容 + 新 revision」：必须沿用当前 revision，
  // 否则 M0 的乐观锁会把撤销当成过期写入直接拒绝（revision-conflict），
  // 表现为点了撤销毫无反应、按钮一直可点。
  if (Number.isInteger(current.revision)) restored.revision = current.revision;
  if (await persistTrip(restored)) {
    logChange('undo', JSON.parse(before), current);
    await refreshTrips();
    render();
    toast('已撤销上一步');
  } else {
    // 保存失败（例如另一个标签页已经改过）时把快照放回，避免一次失败吞掉一步历史
    undoStack.push(snap);
    if (undoStack.length > 30) undoStack.shift();
  }
}

/* ---------- 导入导出（实现见 plan/io.js，这里只做依赖绑定） ---------- */
const exportBackup = () => writeBackup({
  store, save: download, toast,
  afterExport: async () => {
    backupLast = localToday();
    await store.setMeta('backup:lastExportAt', backupLast).catch(() => {});
  },
});

// 「立即备份」按钮渲染在 banners() 里（列表/编辑器视图都有），用委托绑一次
$app.addEventListener('click', e => {
  if (e.target && e.target.closest('[data-backup-now]')) { e.preventDefault(); void exportBackup(); }
});

const importBackup = file => readBackup(file, {
  store,
  toast,
  onImported: async () => { await refreshTrips(); render(); },
});

const exportMd = trip => exportMarkdown(trip, {
  nameOf: it => itemName(it, pointsById),
  save: download,
  toast,
});

/* ---------- 启动 ---------- */
async function refreshTrips() {
  trips = await store.listTrips();
}

async function bootStore() {
  try {
    const idb = await openTripStore({ driver: createIdbDriver() });
    await idb.getMeta('__probe'); // 真正打开一次数据库，隐私模式下会在这里失败
    store = idb;
  } catch {
    store = await openTripStore({ driver: createMemoryDriver() });
    storeWarn = '当前浏览器无法使用本地数据库（可能处于隐私模式），本次修改不会保存';
  }
}

async function runMigration() {
  try {
    let checkins = {};
    try { checkins = loadCheckins() || {}; } catch { checkins = {}; }
    const rep = await store.migrateLegacy({ plans: planLoad.plans || [], checkins, points: cache.pts });
    if (rep.ran) {
      const p = rep.plans ? `旧计划 ${rep.plans.plans} 份→${rep.plans.trips} 份行程` : '';
      const c = rep.checkins ? `打卡 ${rep.checkins.visits} 条→历史记录` : '';
      toast(`已迁移：${[p, c].filter(Boolean).join('，')}`);
    } else if (rep.reasons && rep.reasons.length) {
      toast('旧数据迁移未完成：' + rep.reasons[0]);
    }
  } catch (err) {
    toast('旧数据迁移失败：' + err.message);
  }
  const saved = await store.getMeta('migration:report').catch(() => null);
  ambiguities = (saved && Array.isArray(saved.ambiguities) ? saved.ambiguities : []).filter(a => a && a.itemId);
}

(async () => {
  const [pts, rts, mt, trs, fts, regions] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/routes.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
    fetch('./data/transit-matrix.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
    loadFactLedger(),
    loadRegions(),
    ai.loadInfo(),
  ]);
  cache.pts = Array.isArray(pts) ? pts : (pts.points || []);
  cache.rts = Array.isArray(rts) ? rts : (rts.routes || []);
  // 板块开关：候选点位/动线只取可见板块；pointsById 仍保留全量，避免既有行程条目被静默删除
  regionIndex = regions;
  cache.visiblePts = filterVisiblePoints(cache.pts, regionIndex);
  const visibleCities = new Set(cache.visiblePts.map(p => p.city));
  cache.visibleRts = cache.rts.filter(r => visibleCities.has(r.city));
  cache.matrix = indexTransitMatrix(trs);
  cache.facts = indexFacts(fts);
  // 静默降级不可接受（审计 B2-2）：矩阵/账本没加载成功必须让用户知道结论降级了
  if (!trs) dataWarn.push('交通矩阵未加载（离线或网络故障），通行时间全部按模型估算');
  if (!fts) dataWarn.push('事实账本未加载（离线或网络故障），开放时间一律按未知处理');
  meta = mt;
  pointsById = new Map(cache.pts.map(p => [p.id, p]));
  await bootStore();
  backupLast = String(await store.getMeta('backup:lastExportAt').catch(() => '')) || '';
  // 申请持久化存储 + 看配额水位：失败只提示，不影响使用；iOS/安卓再补一条设备专属的清理风险说明
  const health = await checkStorageHealth();
  storageWarn = health.warning || deviceNotice(typeof navigator === 'undefined' ? '' : navigator.userAgent) || '';
  await runMigration();
  await refreshTrips();
  render();
  installShortcuts({
    // 有候选面板时优先聚焦面板搜索，否则聚焦标题（计划页唯一的可编辑文本框）
    search: () => (view.picker && document.getElementById('tr-q') ? document.getElementById('tr-q') : document.getElementById('tr-title'))?.focus(),
    nextPoint: () => stepPlanItem(1),
    prevPoint: () => stepPlanItem(-1),
    today: () => { location.href = './today.html'; },
    plan: () => {},   // 已经在本页：不刷新，避免丢掉未保存的编辑状态
  });
})().catch(err => {
  $app.innerHTML = `<div class="pl-empty">⚠️ 加载失败：${esc(err.message)}</div>`;
});
