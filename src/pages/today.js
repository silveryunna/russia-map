// 今日执行（M1）：行中看今天——当前/下一项、缓冲、到达/完成/跳过、核验任务、变更日志、离线包。
// 全部读写走 Trip store（IndexedDB），天然离线可用；跨标签页变更经 BroadcastChannel 自动刷新。
import '../shared/base.css';
import './today.css';
import { renderIcpFooter } from '../shared/icp-footer.js';
import { createIdbDriver, createMemoryDriver, openTripStore } from './trip/store.js';
import {
  completeItem, dayExecution, nearestDay, recordArrival, skipItem, verificationTasks,
} from './trip/execution.js';
import { pointDigest, tripChecklistMarkdown, tripToGeoJSON, tripToGPX, tripToKML } from './trip/offline.js';
import { indexTransitMatrix } from './plan/transit-matrix.js';
import { formatMinutes } from './plan/feasibility.js';

const $app = document.getElementById('today-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = n => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localNowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const localNowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtClock = ts => { const d = new Date(ts); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtBuffer = m => {
  const sign = m < 0 ? '−' : '';
  const abs = Math.abs(m);
  return abs >= 60 ? `${sign}${Math.floor(abs / 60)}h${abs % 60 ? pad(abs % 60) : ''}` : `${sign}${abs}m`;
};

const STRUCT_LABEL = {
  empty: '今天没有排程条目',
  feasible: '✅ 结构可行，证据充分',
  conditional: '⚠️ 条件式可排（仍有待核事实或估算段）',
  infeasible: '⛔ 存在硬冲突，建议回编辑器调整',
};
const KIND_ICON = {
  generate: '🛠', edit: '✏️', reorder: '🔀', move: '📦', resize: '⏱', trim: '✂️', repair: '🧰',
  replace: '🔁', complete: '✅', skip: '⏭', arrive: '📍', undo: '↶', import: '📥', note: '📝',
};

let store = null;
let storeWarn = '';
let pointsById = new Map();
let matrix = null;
let trips = [];
let current = null;
let dayIndex = 0;
let visits = [];
let events = [];
let clockTimer = null;

function toast(msg) {
  let el = document.querySelector('.td-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'td-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function evalOptions(day) {
  return { start: day.startTime, end: day.endTime, transportMode: day.transportMode || 'transit', matrix };
}

function executionState() {
  const day = current.days[dayIndex];
  return {
    day,
    state: dayExecution({
      trip: current, day, visits, places: pointsById,
      options: evalOptions(day), nowMinutes: localNowMinutes(),
    }),
  };
}

function pointOf(row) {
  return row.item && row.item.refId ? pointsById.get(row.item.refId) : null;
}

function navUrl(point) {
  if (!point || !Number.isFinite(point.lat)) return '';
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=18/${point.lat}/${point.lon}`;
}

const rowName = row => (pointOf(row)?.name) || row.item?.placeNameSnapshot || row.name || '未命名';

function rowFlags(row) {
  const flags = [];
  if (row.calendar === 'unknown' && row.placeId) flags.push('<span class="td-flag unknown">开放时间待核</span>');
  if (row.transitSourceKind === 'model-estimate' && row.transitMinutes > 0) flags.push('<span class="td-flag estimate">交通为估算</span>');
  if (row.transitSourceKind === 'third-party-route') flags.push('<span class="td-flag">第三方路线</span>');
  return flags.join('');
}

/* ---------- 渲染 ---------- */
function render() {
  if (!current) { renderPicker(); return; }
  const { day, state } = executionState();
  const { rows, current: cur, next, bufferMinutes, progress, result } = state;
  const structural = result.structural;
  const verdictCls = structural === 'infeasible' ? 'is-bad' : structural === 'conditional' ? 'is-warn' : '';

  const nowRow = cur || next;
  const bufferHtml = Number.isFinite(bufferMinutes)
    ? `<span class="td-buffer ${bufferMinutes < 10 ? 'tight' : 'ok'}">${bufferMinutes < 0 ? `已吃紧 ${fmtBuffer(bufferMinutes)}` : `还可缓冲 ${fmtBuffer(bufferMinutes)}`}</span>`
    : '';

  $app.innerHTML = `
    ${storeWarn ? `<div class="td-card td-emergency">⚠️ ${esc(storeWarn)}</div>` : ''}
    <div class="td-toolbar">
      <select id="td-trip">${trips.map(t => `<option value="${esc(t.id)}" ${t.id === current.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select>
      <select id="td-day">${current.days.map((d, i) => `<option value="${i}" ${i === dayIndex ? 'selected' : ''}>第 ${i + 1} 天${d.date ? ` ${d.date}` : ''}</option>`).join('')}</select>
      <a class="td-btn" href="./plan.html">🧭 编辑器</a>
    </div>

    <div class="td-card">
      <div class="td-progress">
        <span>✅ 完成 ${progress.done}</span>
        <span>⏭ 跳过 ${progress.skipped}</span>
        <span>⏳ 待办 ${progress.pending}</span>
        ${bufferHtml}
      </div>
      <div class="td-verdict ${verdictCls}">${esc(STRUCT_LABEL[structural] || structural)}</div>
      ${result.stats && result.stats.unknownHours ? `<div class="td-muted">${result.stats.unknownHours} 处开放时间待核</div>` : ''}
    </div>

    ${nowRow ? `
    <div class="td-card td-now">
      <div class="td-label">${cur ? '正在进行' : '下一项'}</div>
      <div class="td-name">${esc(rowName(nowRow))}</div>
      <div class="td-time">${Number.isFinite(nowRow.arrive) ? `${formatMinutes(nowRow.arrive)}–${formatMinutes(nowRow.end)}` : '时间待定'} · 停留 ${nowRow.duration ?? '—'} 分钟${nowRow.transitMinutes ? ` · 路上约 ${nowRow.transitMinutes} 分钟` : ''}</div>
      <div>${rowFlags(nowRow)}</div>
      <div class="td-actions">
        <button class="td-btn primary" data-act="done" data-id="${esc(nowRow.itemId)}">✅ 完成</button>
        ${!cur ? `<button class="td-btn" data-act="arrive" data-id="${esc(nowRow.itemId)}">📍 到达打卡</button>` : ''}
        <button class="td-btn warn" data-act="skip" data-id="${esc(nowRow.itemId)}">⏭ 跳过</button>
        ${navUrl(pointOf(nowRow)) ? `<a class="td-btn" href="${navUrl(pointOf(nowRow))}" target="_blank" rel="noopener">🧭 导航</a>` : ''}
      </div>
    </div>` : `
    <div class="td-card"><h2>🎉 今天全部完成</h2><div class="td-muted">没有待办项了，好好休息。</div></div>`}

    <div class="td-card">
      <h2>📋 今天的时间表</h2>
      ${rows.length ? rows.map(row => renderRow(row, cur)).join('') : '<div class="td-muted">（空）</div>'}
    </div>

    ${day.note ? `<div class="td-card td-emergency">💡 ${esc(day.note)}</div>` : ''}
    ${current.notes ? `<div class="td-card td-emergency">🚨 ${esc(current.notes)}</div>` : ''}

    ${renderTasks()}
    ${renderEvents()}
    ${renderOffline()}
  `;
  bind();
}

function renderRow(row, cur) {
  const statusCls = row.status === 'done' ? 'is-done' : row.status === 'skipped' ? 'is-skipped' : '';
  const currentCls = cur && cur.itemId === row.itemId ? 'is-current' : '';
  const unscheduled = row.unscheduled ? 'is-unscheduled' : '';
  const time = Number.isFinite(row.arrive) ? `${formatMinutes(row.arrive)}<br>${formatMinutes(row.end)}` : '待定';
  const icon = row.status === 'done' ? '✅' : row.status === 'skipped' ? '⏭' : row.item?.type === 'meal' ? '🍽' : row.item?.type === 'break' ? '☕' : '📍';
  const p = pointOf(row);
  const canAct = row.status === 'pending' && row.item && (row.item.type === 'visit' || row.item.type === 'reservation' || row.item.type === 'meal' || row.item.type === 'break');
  return `
    <div class="td-row ${statusCls} ${currentCls} ${unscheduled}">
      <div class="td-time">${time}</div>
      <div class="td-body">
        <div class="td-name">${icon} ${esc(rowName(row))}</div>
        <div class="td-sub">${row.transitMinutes ? `路上约 ${row.transitMinutes} 分钟 · ` : ''}停留 ${row.duration ?? '—'} 分钟 ${rowFlags(row)}</div>
      </div>
      <div class="td-row-actions">
        ${canAct ? `<button class="td-btn" data-act="done" data-id="${esc(row.itemId)}">✅</button>
        <button class="td-btn" data-act="skip" data-id="${esc(row.itemId)}">⏭</button>` : ''}
        ${navUrl(p) ? `<a class="td-btn" href="${navUrl(p)}" target="_blank" rel="noopener">🧭</a>` : ''}
      </div>
    </div>`;
}

function renderTasks() {
  const tasks = verificationTasks(current, pointsById, { today: localToday() });
  if (!tasks.length) return '';
  const label = { high: '🔴', medium: '🟡', low: '⚪' };
  return `
    <div class="td-card">
      <h2>🧾 出发前核验（${tasks.length}）</h2>
      ${tasks.slice(0, 12).map(t => `<div class="td-task"><span class="td-impact">${label[t.impact] || ''}</span>${esc(t.question)}</div>`).join('')}
      ${tasks.length > 12 ? `<div class="td-muted">…共 ${tasks.length} 条，完整清单见离线包</div>` : ''}
    </div>`;
}

function renderEvents() {
  if (!events.length) return '';
  return `
    <div class="td-card">
      <h2>🕘 变更日志（最近 ${Math.min(events.length, 20)} 条）</h2>
      ${events.slice(0, 20).map(ev => `
        <div class="td-event"><span class="td-event-time">${fmtClock(ev.at)}</span>${KIND_ICON[ev.kind] || '•'} ${esc(ev.summary || ev.kind)}</div>`).join('')}
    </div>`;
}

function renderOffline() {
  return `
    <div class="td-card">
      <h2>📦 离线包</h2>
      <div class="td-muted" style="margin-bottom:8px">全部在本机生成，飞行模式可用；数据不出这台设备。</div>
      <div class="td-actions">
        <button class="td-btn" data-dl="json">行程 JSON</button>
        <button class="td-btn" data-dl="gpx">GPX 轨迹</button>
        <button class="td-btn" data-dl="kml">KML</button>
        <button class="td-btn" data-dl="geojson">GeoJSON</button>
        <button class="td-btn" data-dl="checklist">核验清单 MD</button>
        <button class="td-btn" data-dl="digest">点位摘要 MD</button>
      </div>
    </div>`;
}

function renderPicker() {
  $app.innerHTML = `
    ${storeWarn ? `<div class="td-card td-emergency">⚠️ ${esc(storeWarn)}</div>` : ''}
    <div class="td-card">
      <h2>选择要执行的行程</h2>
      ${trips.length ? `
        <div class="td-toolbar"><select id="td-trip">${trips.map(t => `<option value="${esc(t.id)}">${esc(t.title)}（${t.days.length} 天）</option>`).join('')}</select>
        <button class="td-btn primary" id="td-open">打开</button></div>
        <div class="td-muted">也可以先去 <a href="./plan.html">🧭 行程计划</a> 新建或调整。</div>`
      : '<div class="td-muted">还没有行程。先去 <a href="./plan.html">🧭 行程计划</a> 生成一份草案。</div>'}
    </div>`;
  const openBtn = document.getElementById('td-open');
  if (openBtn) {
    openBtn.onclick = () => {
      const sel = document.getElementById('td-trip');
      const t = trips.find(x => x.id === sel.value);
      if (t) openTrip(t.id);
    };
  }
}

/* ---------- 数据与动作 ---------- */
async function refreshTrips() {
  trips = await store.listTrips();
}

async function openTrip(id) {
  const t = await store.getTrip(id);
  if (!t) { toast('行程不存在'); await refreshTrips(); current = null; render(); return; }
  current = t;
  const near = nearestDay(t, localToday());
  dayIndex = near ? near.dayIndex : 0;
  await reloadFacts();
  render();
}

async function reloadFacts() {
  if (!current) { visits = []; events = []; return; }
  [visits, events] = await Promise.all([
    store.listVisits({ tripId: current.id }),
    store.listEvents({ tripId: current.id }),
  ]);
}

async function reloadTrip() {
  if (!current) return;
  const fresh = await store.getTrip(current.id);
  if (fresh) current = fresh;
  await reloadFacts();
  render();
}

async function applyExecution(result, okMessage) {
  if (!result.ok) { toast(result.error || '操作失败'); return false; }
  const r = await store.applyExecution({ trip: result.trip, visit: result.visit || null, event: result.event || null, leg: result.leg || null });
  if (!r.ok) {
    if (r.code === 'revision-conflict') { toast('行程已在别处更新，已刷新'); await reloadTrip(); }
    else toast('保存失败：' + ((r.errors && r.errors[0] && r.errors[0].message) || '未知错误'));
    return false;
  }
  if (r.trip) current = r.trip;
  await reloadFacts();
  render();
  if (okMessage) toast(okMessage);
  return true;
}

async function doComplete(itemId) {
  const row = executionState().state.rows.find(r => r.itemId === itemId);
  const result = completeItem(current, itemId, {
    at: Date.now(), actualEnd: localNowHHMM(), existingVisits: visits,
  });
  await applyExecution(result, `已完成「${row ? rowName(row) : ''}」`);
}

async function doSkip(itemId) {
  const reason = prompt('跳过原因（可留空）：', '');
  if (reason === null) return;
  const row = executionState().state.rows.find(r => r.itemId === itemId);
  const result = skipItem(current, itemId, { reason, at: Date.now(), existingVisits: visits });
  await applyExecution(result, `已跳过「${row ? rowName(row) : ''}」`);
}

async function doArrive(itemId) {
  const { day, state } = executionState();
  const row = state.rows.find(r => r.itemId === itemId);
  if (!row) return;
  const planned = Number.isFinite(row.transitMinutes) ? row.transitMinutes : null;
  const input = prompt(`到达「${rowName(row)}」。这段路实际走了几分钟？`, planned !== null ? String(planned) : '15');
  if (input === null) return;
  const actual = Number(input);
  if (!Number.isFinite(actual) || actual < 0) { toast('分钟数无效'); return; }
  const result = recordArrival(current, day, row.item, {
    plannedMinutes: planned, mode: row.mode, actualMinutes: actual, at: Date.now(),
  });
  await applyExecution({ ok: true, trip: null, leg: result.leg, event: result.event }, `已记录：路上 ${Math.round(actual)} 分钟`);
}

function download(name, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function doDownload(kind) {
  if (!current) return;
  const stamp = localToday();
  const opts = { options: evalOptions(current.days[dayIndex] || {}) };
  const tasks = verificationTasks(current, pointsById, { today: stamp });
  if (kind === 'json') {
    const payload = await store.exportAll();
    download(`trip-backup-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } else if (kind === 'gpx') {
    download(`trip-${stamp}.gpx`, tripToGPX(current, pointsById, opts), 'application/gpx+xml');
  } else if (kind === 'kml') {
    download(`trip-${stamp}.kml`, tripToKML(current, pointsById, opts), 'application/vnd.google-earth.kml+xml');
  } else if (kind === 'geojson') {
    download(`trip-${stamp}.geojson`, JSON.stringify(tripToGeoJSON(current, pointsById, opts), null, 2), 'application/geo+json');
  } else if (kind === 'checklist') {
    download(`checklist-${stamp}.md`, tripChecklistMarkdown(current, pointsById, { ...opts, tasks }), 'text/markdown;charset=utf-8');
  } else if (kind === 'digest') {
    download(`digest-${stamp}.md`, pointDigest(current, pointsById, opts), 'text/markdown;charset=utf-8');
  }
  toast('已导出');
}

function bind() {
  const tripSel = document.getElementById('td-trip');
  if (tripSel) tripSel.onchange = () => openTrip(tripSel.value);
  const daySel = document.getElementById('td-day');
  if (daySel) daySel.onchange = () => { dayIndex = Number(daySel.value) || 0; render(); };
  $app.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (act === 'done') doComplete(id);
      else if (act === 'skip') doSkip(id);
      else if (act === 'arrive') doArrive(id);
    };
  });
  $app.querySelectorAll('[data-dl]').forEach(btn => {
    btn.onclick = () => doDownload(btn.getAttribute('data-dl'));
  });
}

/* ---------- 启动 ---------- */
async function openDefault() {
  await refreshTrips();
  if (!trips.length) { current = null; render(); return; }
  const today = localToday();
  const pick = trips.find(t => t.status === 'active')
    || trips.find(t => t.startDate && t.endDate && t.startDate <= today && today <= t.endDate)
    || trips[0];
  await openTrip(pick.id);
}

(async () => {
  const [pts, trs] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/transit-matrix.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const list = Array.isArray(pts) ? pts : (pts.points || []);
  pointsById = new Map(list.map(p => [p.id, p]));
  matrix = indexTransitMatrix(trs);
  try {
    store = await openTripStore({ driver: createIdbDriver() });
    await store.getMeta('__probe');
  } catch {
    store = await openTripStore({ driver: createMemoryDriver() });
    storeWarn = 'IndexedDB 不可用，本次会话的改动不会被保存';
  }
  store.subscribe(change => {
    if (change.origin === store.clientId) return;
    if (change.area === 'trips' || change.area === 'visits' || change.area === 'events' || change.area === 'legs' || change.area === 'execution' || change.area === 'import') {
      reloadTrip();
    }
  });
  renderIcpFooter();
  await openDefault();
  clockTimer = setInterval(() => { if (current) render(); }, 30000);
})().catch(err => {
  $app.innerHTML = `<div class="td-card">⚠️ 加载失败：${esc(err.message)}</div>`;
});

window.addEventListener('beforeunload', () => { if (clockTimer) clearInterval(clockTimer); });
