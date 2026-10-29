import '../shared/base.css';
import './plan.css';
import { INTERESTS, PLAN_DAYS_MAX, clampDays, ruleEngine } from './plan/engine.js';
import { evaluateDay, formatMinutes } from './plan/feasibility.js';
import { loadPlans } from './plan/store.js';
import { loadCheckins } from '../modules/checkin.js';
import { createIdbDriver, createMemoryDriver, openTripStore } from './trip/store.js';
import { migratePlansV1 } from './trip/migrate.js';
import { tripItemCount } from './trip/schema.js';
import {
  addDay, addPlaceToDay, bindItemPlace, countNeedsConfirm, duplicateTrip,
  itemDateConflicts, moveItemToDay, moveItemWithinDay, removeDay, removeItem,
  setDateMode, setDayNote, setDayWindow, setItemMustVisit, setItemPinnedStart,
  shiftTripStart, splitStartLocal, updateTrip,
} from './trip/edit.js';

// 行程计划（Trip v2）：本次旅行可编辑、可恢复、可导出
// - 存储：IndexedDB（travel-trips），旧 travel-plans-v1 / travel-checkin-v2 首次打开时一次性迁移
// - AI 生成仍走站内通道（api/index.php?a=plan，Key 只在服务器侧）；生成结果统一转成 Trip
// - 每个编辑动作即时落库，保留最近 30 步内存撤销；删除行程不解绑历史打卡（Visit 留档）

const $app = document.getElementById('plan-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS_AI = 'planner-ai-config';
const STATUS_LABEL = { draft: '草稿', planned: '已计划', active: '进行中', completed: '已完成', archived: '已归档' };
const TYPE_LABEL = { visit: '景点', transit: '交通', lodging: '住宿', meal: '餐饮', reservation: '预订', task: '事项', note: '备注' };
const PERIOD_LABEL = { morning: '上午', afternoon: '下午', evening: '晚上', '': '' };

let meta = { cities: [], cityColors: {} };
let cache = { pts: [], rts: [] };
let pointsById = new Map();
let store = null;
let storeWarn = '';
let trips = [];
let current = null;              // 编辑器里的行程
let ambiguities = [];            // 迁移遗留的待确认项（仅用于预置候选）
let undoStack = [];
let view = { mode: 'list', form: null, showAI: false, aiError: '', picker: null, sel: null };

const planLoad = loadPlans(localStorage);

/* ---------- PlannerAI（站内通道 + 会话级自定义覆盖） ---------- */
const siteToken = () => localStorage.getItem('friend-token') || localStorage.getItem('admin-token') || '';
let aiSession = {};  // 高级设置：仅本次会话生效，不落盘（密钥不进 localStorage）
let aiInfo = null;   // ?a=ai_policy：配额 / 可选模型 / 是否有个人接入
let aiModel = localStorage.getItem('planner-ai-model') || '';
let generating = false;
try {
  const old = JSON.parse(localStorage.getItem(LS_AI) || 'null');
  if (old && (old.endpoint || old.key || old.model)) {
    aiSession = old;
    localStorage.removeItem(LS_AI);
    setTimeout(() => toast('旧版 AI 配置已改为本次会话有效；长期接入请在朋友页「我的 AI 接入」保存'), 800);
  }
} catch { /* 忽略损坏的旧配置 */ }

async function loadAiInfo() {
  if (!siteToken()) { aiInfo = null; return; }
  try {
    const r = await fetch('./api/index.php?a=ai_policy', { headers: { Authorization: `Bearer ${siteToken()}` } });
    const j = await r.json().catch(() => ({}));
    aiInfo = r.ok && !j.error ? j : null;
    if (aiInfo && Array.isArray(aiInfo.models) && aiInfo.models.length && !aiInfo.models.includes(aiModel)) aiModel = aiInfo.models[0];
  } catch { aiInfo = null; }
}

const PlannerAI = {
  get ready() { return !!siteToken() || !!aiSession.endpoint; },
  async generate(params, context) {
    const endpoint = aiSession.endpoint || './api/index.php?a=plan';
    const key = aiSession.key || siteToken();
    const body = { params, context };
    const m = aiSession.model || aiModel;
    if (m) body.model = m;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'AI 接口 ' + resp.status);
    const plan = data.plan || data;
    if (!plan || !Array.isArray(plan.days)) throw new Error('AI 返回格式不符');
    if (typeof data.remaining === 'number' && aiInfo) aiInfo.remaining_today = data.remaining;
    return {
      ...plan,
      id: 'p' + Date.now().toString(36),
      name: plan.name || `${params.city}行程`,
      city: params.city,
      date: params.date,
      source: 'ai',
      channel: aiSession.endpoint ? 'custom' : 'site',
      model: data.model || m || '',
      createdAt: Date.now(),
    };
  },
};
function sourceLabel(trip) {
  const o = trip.origin || {};
  if (o.source === 'copy') return '复制自其它行程';
  if (o.source !== 'ai') return '规则引擎（离线）';
  const ch = o.channel === 'custom' ? '自定义接口' : '站内通道';
  return `AI（${ch}${o.model ? ' · ' + o.model : ''}）`;
}
function aiBtnLabel() {
  if (aiSession.endpoint) return '✨ AI 生成（自定义接口）';
  if (!siteToken()) return '✨ AI 生成（需登录）';
  if (aiInfo && !aiInfo.has_custom && !aiInfo.site_enabled) return '✨ AI 生成（站内通道停用）';
  return '✨ AI 生成';
}

/* ---------- 通用 ---------- */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'plan-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}
const md = d => (d || '').slice(5).replace('-', '/');
function dateRange(trip) {
  if (trip.dateMode !== 'fixed' || !trip.startDate) return '日期待定';
  return trip.endDate && trip.endDate !== trip.startDate ? `${md(trip.startDate)}–${md(trip.endDate)}` : md(trip.startDate);
}
function weekday(date) {
  if (!date) return '';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date + 'T00:00:00').getDay()] || '';
}
function itemName(item) {
  const pt = item.refId ? pointsById.get(item.refId) : null;
  return (pt && pt.name) || item.placeNameSnapshot || TYPE_LABEL[item.type] || '未命名';
}
function itemType(item) {
  const pt = item.refId ? pointsById.get(item.refId) : null;
  return (pt && pt.type) || TYPE_LABEL[item.type] || '';
}
function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 渲染 ---------- */
function render() {
  if (view.mode === 'create') return renderCreate();
  if (view.mode === 'editor' && current) return renderEditor();
  return renderList();
}

function banners() {
  const out = [];
  if (storeWarn) out.push(`<div class="pl-tip warn">⚠️ ${esc(storeWarn)}</div>`);
  if (planLoad.recovered) out.push(`<div class="pl-tip warn">⚠️ 检测到损坏的旧本地计划，已备份为 ${esc(planLoad.backupKey || '备份键')}</div>`);
  const live = current
    ? ambiguities.filter(a => current.days.some(d => d.items.some(it => it.id === a.itemId && it.confirm !== 'ok')))
    : [];
  if (live.length) out.push(`<div class="pl-tip">🔎 旧计划迁移有 ${live.length} 个点位待确认，点名字即可绑定</div>`);
  return out.join('');
}

function renderList() {
  const needConfirm = trips.reduce((s, t) => s + countNeedsConfirm(t), 0);
  $app.innerHTML = `
    <div class="pl-head">
      <h2>🧭 我的行程</h2>
      <div class="tr-head-ops">
        <button class="pl-btn primary" id="pl-new">＋ 新建</button>
        <button class="pl-btn small" id="tr-import">导入备份</button>
        <button class="pl-btn small" id="tr-export">备份全部</button>
      </div>
    </div>
    ${banners()}
    ${needConfirm ? `<div class="pl-tip">🔎 ${needConfirm} 个点位待确认（旧计划迁移的歧义名称），打开行程点名字即可绑定</div>` : ''}
    ${trips.length ? trips.map(t => `
      <div class="pl-card" data-open="${esc(t.id)}">
        <div class="pl-card-top">
          <span class="pl-name">${esc(t.title)}</span>
          <span class="pl-src ${t.status === 'completed' ? 'ai' : ''}">${esc(STATUS_LABEL[t.status] || t.status)}</span>
        </div>
        <div class="pl-meta">${esc((t.cities || []).join(' / ') || '未设城市')} · ${dateRange(t)} · ${t.days.length} 天 · ${tripItemCount(t)} 项${countNeedsConfirm(t) ? ` · <b class="tr-warn">${countNeedsConfirm(t)} 待确认</b>` : ''}</div>
        <div class="pl-ops">
          <button class="pl-btn small" data-open="${esc(t.id)}">编辑</button>
          <button class="pl-btn small" data-copy="${esc(t.id)}">复制</button>
          <button class="pl-btn small" data-md="${esc(t.id)}">导出 Markdown</button>
          <button class="pl-btn small danger" data-del="${esc(t.id)}">删除</button>
        </div>
      </div>`).join('')
      : `<div class="pl-empty">还没有行程<br><span>点"新建"生成一份草案，之后可以逐日调整、增删点位</span></div>`}
    <div class="pl-foot">数据只存在这台设备的浏览器里（IndexedDB）· 离线可编辑 · 共 ${trips.length} 份行程${needConfirm ? ` · ${needConfirm} 项待确认` : ''}</div>
    <input type="file" id="tr-import-file" accept="application/json,.json" hidden>`;

  document.getElementById('pl-new').onclick = () => {
    view.mode = 'create'; view.aiError = ''; view.showAI = false;
    view.form = { city: meta.cities[0] || '', date: '', days: 3, interests: [] };
    render();
  };
  document.getElementById('tr-export').onclick = exportBackup;
  const file = document.getElementById('tr-import-file');
  document.getElementById('tr-import').onclick = () => file.click();
  file.onchange = () => { if (file.files && file.files[0]) importBackup(file.files[0]); file.value = ''; };

  $app.onchange = null;
  $app.onclick = e => {
    // 卡片内的按钮必须先于卡片的 data-open 匹配，否则点"复制"会变成"打开"
    const copy = e.target.closest('[data-copy]');
    if (copy) { copyTrip(copy.dataset.copy); return; }
    const mdBtn = e.target.closest('[data-md]');
    if (mdBtn) { const t = trips.find(x => x.id === mdBtn.dataset.md); if (t) exportMd(t); return; }
    const del = e.target.closest('[data-del]');
    if (del) { deleteTrip(del.dataset.del); return; }
    const open = e.target.closest('[data-open]');
    if (open) openTrip(open.dataset.open);
  };
}

async function openTrip(id) {
  const t = await store.getTrip(id);
  if (!t) { toast('行程不存在'); await refreshTrips(); render(); return; }
  current = t;
  undoStack = [];
  view.mode = 'editor';
  view.picker = null;
  render();
}

async function copyTrip(id) {
  const src = await store.getTrip(id);
  if (!src) return;
  const copy = duplicateTrip(src);
  const r = await store.saveTrip(copy);
  if (!r.ok) { toast('复制失败：' + ((r.errors[0] || {}).message || '')); return; }
  await refreshTrips();
  render();
  toast('已复制为新行程');
}

async function deleteTrip(id) {
  const t = trips.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`删除「${t.title}」？打卡记录会保留（解除关联），不会丢失`)) return;
  const r = await store.deleteTrip(id);
  await refreshTrips();
  render();
  toast(r.detachedVisits ? `已删除，${r.detachedVisits} 条打卡记录已解除关联` : '已删除');
}

function renderCreate() {
  const f = view.form;
  $app.innerHTML = `
    <div class="pl-head"><h2>新建行程</h2><button class="pl-btn" id="pl-back">← 返回</button></div>
    <div class="pl-form card">
      <label>目的地
        <select id="pl-city">${[...meta.cities].sort().map(c => `<option ${c === f.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <label>出发日期（可留空＝无日期行程）<input id="pl-date" type="date" value="${esc(f.date)}"></label>
      <label>天数 <input id="pl-days" type="number" min="1" max="${PLAN_DAYS_MAX}" value="${f.days}"></label>
      <div class="pl-label">兴趣标签（可多选，不选=全城点位）</div>
      <div class="pl-chips">${Object.keys(INTERESTS).map(k => `<button class="chip ${f.interests.includes(k) ? 'on' : ''}" data-int="${k}">${k}</button>`).join('')}</div>
      <div class="pl-gen">
        <button class="pl-btn primary big" id="pl-gen-rule">⚙️ 规则引擎生成（离线）</button>
        <button class="pl-btn big" id="pl-gen-ai">${aiBtnLabel()}</button>
      </div>
      ${view.aiError ? `
      <div class="pl-ai-error">
        <div>AI 生成失败：${esc(view.aiError)}</div>
        <div class="pl-ai-error-ops">
          <button class="pl-btn small primary" id="ai-retry">重试 AI</button>
          <button class="pl-btn small" id="ai-fallback">使用离线规则</button>
          <button class="pl-btn small" id="ai-cancel">取消</button>
        </div>
      </div>` : ''}
      ${aiInfo ? `<div class="pl-label">${aiInfo.has_custom ? '已接入你自己的 AI（不占用本站次数）' : `今日剩余 ${aiInfo.remaining_today}/${aiInfo.quota} 次`}</div>` : ''}
      ${aiInfo && !aiInfo.has_custom && aiInfo.models && aiInfo.models.length ? `
      <label>AI 模型
        <select id="pl-model">${aiInfo.models.map(m => `<option ${m === aiModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      </label>` : ''}
      <button class="pl-ai-toggle" id="pl-ai-cfg">高级：自定义接口${aiSession.endpoint ? '（本次会话已启用 ✓）' : ''}</button>
      ${view.showAI ? `
      <div class="pl-ai-box">
        <label>Endpoint（https）<input id="ai-endpoint" placeholder="https://api.example.com/v1/chat/completions" value="${esc(aiSession.endpoint || '')}"></label>
        <label>API Key（可选）<input id="ai-key" type="password" placeholder="sk-..." value="${esc(aiSession.key || '')}"></label>
        <label>模型名（可选）<input id="ai-model" placeholder="deepseek-v4-pro ..." value="${esc(aiSession.model || '')}"></label>
        <div class="pl-ai-note">仅本次会话有效，密钥不再存入浏览器。长期接入请到 <a href="./friend.html">朋友页</a> 登录后在「我的 AI 接入」保存（随账号存放于服务器）。</div>
        <button class="pl-btn small" id="ai-save">本次会话生效</button>
        <button class="pl-btn small" id="ai-clear">清除覆盖</button>
      </div>` : ''}
    </div>`;
  document.getElementById('pl-back').onclick = () => { view.mode = 'list'; render(); };
  $app.onclick = null;
  $app.onchange = null;
  document.getElementById('pl-city').onchange = e => { f.city = e.target.value; };
  document.getElementById('pl-date').onchange = e => { f.date = e.target.value; };
  document.getElementById('pl-days').onchange = e => { f.days = clampDays(e.target.value); e.target.value = f.days; };
  const modelSel = document.getElementById('pl-model');
  if (modelSel) modelSel.onchange = e => { aiModel = e.target.value; localStorage.setItem('planner-ai-model', aiModel); };
  $app.querySelectorAll('[data-int]').forEach(b => b.onclick = () => {
    const k = b.dataset.int;
    f.interests = f.interests.includes(k) ? f.interests.filter(x => x !== k) : [...f.interests, k];
    render();
  });
  document.getElementById('pl-ai-cfg').onclick = () => { view.showAI = !view.showAI; render(); };
  const saveAI = document.getElementById('ai-save');
  if (saveAI) saveAI.onclick = () => {
    aiSession = { endpoint: document.getElementById('ai-endpoint').value.trim(), key: document.getElementById('ai-key').value.trim(), model: document.getElementById('ai-model').value.trim() };
    toast(aiSession.endpoint ? '自定义接口已启用（本次会话）' : '已保存'); render();
  };
  const clearAI = document.getElementById('ai-clear');
  if (clearAI) clearAI.onclick = () => { aiSession = {}; toast('已清除自定义覆盖'); render(); };
  document.getElementById('pl-gen-rule').onclick = () => doGenerate('rule');
  document.getElementById('pl-gen-ai').onclick = () => doGenerate('ai');
  const retry = document.getElementById('ai-retry');
  if (retry) retry.onclick = () => { view.aiError = ''; render(); doGenerate('ai'); };
  const fallback = document.getElementById('ai-fallback');
  if (fallback) fallback.onclick = () => { view.aiError = ''; render(); doGenerate('rule'); };
  const cancel = document.getElementById('ai-cancel');
  if (cancel) cancel.onclick = () => { view.aiError = ''; render(); };
}

async function doGenerate(src) {
  const f = view.form;
  if (!f.city) return toast('请选择目的地');
  if (generating) return;
  if (src === 'ai' && !f.date) return toast('AI 生成需要出发日期，请先选择日期（也可以留空用离线规则生成无日期行程）');
  // AI 不可用时不再静默降级：交给用户决定重试 / 用规则 / 取消，生成结果永远标注来源
  if (src === 'ai' && !PlannerAI.ready) {
    view.aiError = '未登录或未配置 AI 接口';
    render();
    return;
  }
  generating = true;
  const btn = document.getElementById('pl-gen-ai');
  if (btn && src === 'ai') { btn.disabled = true; btn.textContent = '✨ 生成中（约 30-60 秒）…'; }
  toast('生成中…');
  try {
    const plan = src === 'ai'
      ? await PlannerAI.generate(f, {
          points: cache.pts.filter(p => p.city === f.city),
          routes: cache.rts.filter(r => r.city === f.city),
        })
      : ruleEngine(f, { pts: cache.pts, rts: cache.rts });
    const mig = migratePlansV1({ plans: [plan], points: cache.pts });
    const trip = mig.trips[0];
    if (!trip || !trip.days.length) {
      generating = false;
      toast('没有可用点位，试试减少天数或换城市');
      render();
      return;
    }
    const saved = await store.saveTrip(trip);
    generating = false;
    if (!saved.ok) { toast('保存失败：' + (saved.errors[0] || {}).message); render(); return; }
    await refreshTrips();
    current = saved.trip;
    undoStack = [];
    view.mode = 'editor';
    view.sel = null;
    render();
    const pending = countNeedsConfirm(current);
    toast(`行程已生成（${sourceLabel(current)}）${pending ? ` · ${pending} 个点位待确认` : ''}`);
    if (plan.note) setTimeout(() => toast(plan.note), 600);
  } catch (err) {
    generating = false;
    view.aiError = err.message;
    render();
  }
}

/* ---------- 编辑器 ---------- */
const FEAS_LABEL = {
  'day-overrun': '超出收工线', closed: '闭馆', 'after-last-entry': '过最后入场', 'after-close': '会跨闭馆',
  overlap: '与预订重叠', 'cross-day': '跨日预订', 'duplicate-place': '重复点位', 'missing-duration': '缺时长',
  'unresolved-place': '未绑定', 'missing-coords': '缺坐标',
};

// 每天一条可行性结论：硬冲突才标红，unknown 只作为提示（绝不假装"全天开放"）
function feasibilityLine(d) {
  const res = evaluateDay({
    day: { id: d.id, date: d.date }, items: d.items, places: pointsById,
    options: { start: d.startTime, end: d.endTime },
  });
  if (res.empty) return '';
  const errs = res.errors;
  const unknown = res.stats.unknownHours;
  const start = formatMinutes(res.timeline[0].arrive);
  const end = formatMinutes(res.timeline[res.timeline.length - 1].end);
  const dwell = (res.stats.dwellMinutes / 60).toFixed(1);
  const chips = errs.slice(0, 3).map(c => `<span class="tr-chip danger">${FEAS_LABEL[c.kind] || c.kind}</span>`).join('')
    + (errs.length > 3 ? `<span class="tr-chip danger">+${errs.length - 3}</span>` : '')
    + (unknown ? `<span class="tr-chip">${unknown} 处开放时间未知</span>` : '');
  return `<div class="tr-feas ${errs.length ? 'is-bad' : ''}">
      <span>⏱ 预计 ${start}–${end} · 停留 ${dwell}h · 通行 ${res.stats.transitMinutes}m</span>
      <span>${errs.length ? `⚠️ ${errs[0].message}` : '✅ 硬约束通过'}</span>
      ${chips ? `<div class="tr-feas-chips">${chips}</div>` : ''}
    </div>`;
}

function itemPanelHtml(it) {
  const booking = splitStartLocal(it.startLocal);
  const hasBooking = !!booking.date;
  const pinned = it.pinnedStart || '';
  return `
    <div class="tr-item-panel">
      <label class="tr-panel-field">锁定时点
        <input type="time" data-pin-time="${esc(it.id)}" value="${esc(pinned)}" ${hasBooking ? 'disabled' : ''} aria-label="锁定时点">
      </label>
      <button class="pl-btn small" data-pin-clear="${esc(it.id)}" ${pinned && !hasBooking ? '' : 'disabled'}>清除</button>
      <span class="tr-seg" role="group" aria-label="必去或可删">
        <button class="${it.mustVisit !== false ? 'on' : ''}" data-must="${esc(it.id)}" data-must-value="1">必去</button>
        <button class="${it.mustVisit === false ? 'on' : ''}" data-must="${esc(it.id)}" data-must-value="0">可删</button>
      </span>
      <span class="tr-panel-hint">${hasBooking ? `已按预订 ${esc(booking.time)} 锁定，锁时字段不生效` : (pinned ? '按锁定时刻排程' : '留空＝跟随前一站顺排')}</span>
    </div>`;
}

function renderEditor() {
  const t = current;
  const col = meta.cityColors[(t.cities || [])[0]] || '#B71C1C';
  const conflicts = itemDateConflicts(t);
  const conflictByItem = new Map(conflicts.map(c => [c.itemId, c]));
  const pending = countNeedsConfirm(t);
  $app.innerHTML = `
    <div class="pl-head">
      <button class="pl-btn small" id="tr-back">← 全部行程</button>
      <div class="tr-head-ops">
        <button class="pl-btn small" id="tr-undo" ${undoStack.length ? '' : 'disabled'}>↶ 撤销</button>
        <button class="pl-btn small" id="tr-md">导出 MD</button>
      </div>
    </div>
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
        ${t.dateMode === 'fixed' ? `<label>改期方式
          <select id="tr-policy">
            <option value="shift_all">整体平移</option>
            <option value="keep_bookings">保留已订时刻</option>
          </select>
        </label>` : ''}
      </div>
      <div class="pl-meta">${esc(sourceLabel(t))} · ${t.days.length} 天 · ${tripItemCount(t)} 项${pending ? ` · <b class="tr-warn">${pending} 待确认</b>` : ''}${conflicts.length ? ` · <b class="tr-warn">${conflicts.length} 处预订日冲突</b>` : ''} · 修订 ${t.revision}</div>
    </div>
    ${t.notes ? `<div class="pl-tip">📌 ${esc(t.notes)}</div>` : ''}
    ${t.days.map((d, di) => `
      <div class="pl-day card" style="border-left:4px solid ${col}">
        <div class="pl-day-head">
          <span>Day ${d.index}${d.date ? ` <em>${md(d.date)} ${weekday(d.date)}</em>` : ''}</span>
          <span>${d.items.length} 项</span>
        </div>
        <div class="tr-window">
          <span class="tr-window-label">⏱ 当天窗口</span>
          <input type="time" data-window-start="${di}" value="${esc(d.startTime || '09:00')}" aria-label="Day ${d.index} 出发时间">
          <span class="tr-window-sep">–</span>
          <input type="time" data-window-end="${di}" value="${esc(d.endTime || '21:00')}" aria-label="Day ${d.index} 收工时间">
        </div>
        ${feasibilityLine(d)}
        ${d.items.length ? d.items.map((it, ii) => {
          const cf = conflictByItem.get(it.id);
          return `
          <div class="pl-point tr-item ${view.sel === it.id ? 'is-sel' : ''}" data-item="${esc(it.id)}">
            <span class="pl-dot" style="background:${it.confirm === 'ok' && it.refId ? (meta.cityColors[(pointsById.get(it.refId) || {}).city] || '#546E7A') : '#C9A227'}"></span>
            <button class="tr-name" data-bind="${esc(it.id)}">${esc(itemName(it))}</button>
            ${it.period ? `<span class="tr-chip">${PERIOD_LABEL[it.period]}</span>` : ''}
            ${it.pinnedStart ? `<span class="tr-chip pin">🔒 ${esc(it.pinnedStart)}</span>` : ''}
            ${it.mustVisit === false ? '<span class="tr-chip opt">可删</span>' : ''}
            ${it.confirm !== 'ok' ? '<span class="tr-chip warn">待确认</span>' : ''}
            ${cf ? `<span class="tr-chip danger">预订 ${md(cf.itemDate)}</span>` : ''}
            <span class="pl-ptype">${esc(itemType(it))}</span>
            <span class="tr-ops">
              <button class="tr-icon" data-up="${esc(it.id)}" ${ii === 0 ? 'disabled' : ''} aria-label="上移">↑</button>
              <button class="tr-icon" data-dn="${esc(it.id)}" ${ii === d.items.length - 1 ? 'disabled' : ''} aria-label="下移">↓</button>
              ${t.days.length > 1 ? `<select class="tr-day-move" name="move-day" data-moveday="${esc(it.id)}" aria-label="移动到某天">${t.days.map((x, xi) => `<option value="${xi}" ${xi === di ? 'selected' : ''}>D${xi + 1}</option>`).join('')}</select>` : ''}
              <button class="tr-icon danger" data-rm="${esc(it.id)}" aria-label="删除">✕</button>
            </span>
          </div>
          ${view.sel === it.id ? itemPanelHtml(it) : ''}`;
        }).join('') : '<div class="tr-day-empty">这一天还没有安排</div>'}
        <div class="tr-day-ops">
          <button class="pl-btn small" data-add="${di}">＋ 加点位</button>
          <button class="pl-btn small" data-note="${di}">📝 ${d.note ? '改备注' : '加备注'}</button>
          ${t.days.length > 1 ? `<button class="pl-btn small danger" data-delday="${di}">删除这天</button>` : ''}
        </div>
        ${d.note ? `<div class="pl-tip">💡 ${esc(d.note)}</div>` : ''}
      </div>`).join('')}
    <div class="tr-foot-ops">
      <button class="pl-btn" id="tr-add-day">＋ 增加一天</button>
      <button class="pl-btn" id="tr-json">导出本行程 JSON</button>
    </div>
    ${view.picker ? pickerHtml() : ''}`;

  document.getElementById('tr-back').onclick = () => { view.mode = 'list'; view.picker = null; view.sel = null; current = null; render(); };
  const undoBtn = document.getElementById('tr-undo');
  if (undoBtn) undoBtn.onclick = doUndo;
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
  if (view.picker) wirePicker();

  // 委托：items 与 day 操作
  $app.onclick = e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) { pickPlace(pick.dataset.pick); return; }
    const add = e.target.closest('[data-add]');
    if (add) { view.picker = { mode: 'add', dayIndex: +add.dataset.add, q: '', city: (current.cities || [])[0] || '' }; render(); const q = document.getElementById('tr-q'); if (q) q.focus(); return; }
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
    }
  };
}

function findItem(id) {
  for (const d of current.days) {
    const it = d.items.find(x => x.id === id);
    if (it) return it;
  }
  return null;
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
          ${[...new Set(cache.pts.map(x => x.city))].sort().map(c => `<option ${c === p.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <div class="tr-results" id="tr-results">${pickerResultsHtml()}</div>
      </div>
    </div>`;
}

function pickerResultsHtml() {
  const p = view.picker;
  const q = (p.q || '').trim().toLowerCase();
  let list = cache.pts.filter(x => !x.pending && (!p.city || x.city === p.city));
  if (q) list = list.filter(x => `${x.name || ''} ${x.name_en || ''} ${x.type || ''} ${x.cluster || ''}`.toLowerCase().includes(q));
  if (p.mode === 'add') {
    const day = current.days[p.dayIndex];
    const added = new Set((day ? day.items : []).map(i => i.refId));
    list = list.filter(x => !added.has(x.id));
  }
  const candIds = p.mode === 'bind'
    ? ((ambiguities.find(a => a.itemId === p.itemId) || {}).candidates || [])
    : [];
  const cands = candIds.map(id => pointsById.get(id)).filter(Boolean);
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

/* ---------- 落库 / 撤销 ---------- */
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
    await refreshTrips();
    render();
  }
}

async function applyTrip(next) {
  const before = JSON.stringify(current);
  if (await persistTrip(next)) {
    undoStack.push(before);
    if (undoStack.length > 30) undoStack.shift();
    await refreshTrips();
    render();
  }
}

async function doUndo() {
  const snap = undoStack.pop();
  if (!snap) return;
  if (await persistTrip(JSON.parse(snap))) {
    await refreshTrips();
    render();
    toast('已撤销上一步');
  }
}

/* ---------- 导入导出 ---------- */
async function exportBackup() {
  const payload = await store.exportAll();
  download(`trips-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
  toast(`已导出 ${payload.trips.length} 份行程、${payload.visits.length} 条打卡记录`);
}

async function importBackup(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
    if (Array.isArray(payload)) payload = { trips: payload, visits: [] };
  } catch {
    toast('备份文件不是合法 JSON');
    return;
  }
  const replace = confirm('用备份覆盖本机全部行程吗？\n确定＝覆盖；取消＝合并（同一行程保留修订号更高的版本）');
  const r = await store.importAll(payload, { mode: replace ? 'replace' : 'merge' });
  if (!r.ok) { toast(r.error || '导入失败'); return; }
  await refreshTrips();
  render();
  toast(replace ? `已覆盖：${r.added} 份行程` : `合并完成：新增 ${r.added}、更新 ${r.updated}、跳过 ${r.skipped}`);
}

function exportMd(trip) {
  const lines = [`# ${trip.title}`, ``, `> ${(trip.cities || []).join(' / ')} · ${dateRange(trip)} · 来源：${sourceLabel(trip)}`, ``];
  if (trip.notes) lines.push(`> 📌 ${trip.notes}`, ``);
  for (const d of trip.days) {
    lines.push(`## Day ${d.index}${d.date ? ` · ${d.date}` : ''}`, ``);
    for (const it of d.items) {
      const parts = [`- **${itemName(it)}**`];
      if (it.period) parts.push(`（${PERIOD_LABEL[it.period]}）`);
      if (it.confirm !== 'ok') parts.push(' 〔待确认〕');
      if (it.startLocal) parts.push(` ${it.startLocal.replace('T', ' ')}`);
      lines.push(parts.join(''));
    }
    if (d.items.length) lines.push('');
    if (d.note) lines.push(`> 💡 ${d.note}`, '');
  }
  download(`${trip.title || '行程'}.md`, lines.join('\n'), 'text/markdown');
  toast('已导出 Markdown');
}

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
  const [pts, rts, mt] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/routes.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
    loadAiInfo(),
  ]);
  cache.pts = Array.isArray(pts) ? pts : (pts.points || []);
  cache.rts = Array.isArray(rts) ? rts : (rts.routes || []);
  meta = mt;
  pointsById = new Map(cache.pts.map(p => [p.id, p]));
  await bootStore();
  await runMigration();
  await refreshTrips();
  render();
})().catch(err => {
  $app.innerHTML = `<div class="pl-empty">⚠️ 加载失败：${esc(err.message)}</div>`;
});
