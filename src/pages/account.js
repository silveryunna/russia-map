import '../shared/base.css';
import './friend.css';
import './plan.css';
// 协作管理页（管理员）：账号管理 + 投稿审核 + AI 设置

import { AI_MODELS, modelInfo, modelCost, TIER_CLASS } from '../modules/ai-models.js';
import { openReportDialog, REPORT_REASONS } from '../shared/report.js';

const $app = document.getElementById('account-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = 'admin-token';
const API = './api/index.php';
const FACT_LABEL = { hours: '营业时间', ticket: '门票', rating: '评分', other: '其他说明' };
const FACT_PATH = { hours: 'hours', ticket: 'ticket', rating: 'rating', other: 'note' };
const STATUS_LABEL = { pending: '待审核', needs_more: '需补充', approved: '已采纳', rejected: '未采纳', removed: '已移除' };
const ACTION_LABEL = { remove: '移除内容', dismiss: '驳回举报', ban: '封禁投稿者', unban: '解除封禁' };

let token = localStorage.getItem(LS) || '';
let accounts = [], pending = [], points = [], reports = [], reportLogs = [], reportOverdue = 0, reportPending = 0, changesets = [];
let tab = 'pending';
let pendingStatus = 'pending', pendingType = '', reportStatus = 'pending';
let selected = new Set();
let photoCache = {};
let lastCreated = '';

async function api(action, body, method = 'POST', query = '') {
  const r = await fetch(`${API}?a=${action}${query ? '&' + query : ''}`, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ error: '响应解析失败' }));
  if (r.status === 401) { localStorage.removeItem(LS); token = ''; renderLogin(); throw new Error(j.error || '请重新登录'); }
  if (j.error) throw new Error(j.error);
  return j;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'plan-toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}
function genPass() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  arr.forEach(b => s += chars[b % chars.length]);
  return s;
}

function renderLogin() {
  $app.innerHTML = `
    <div class="fr-login card">
      <h2>🔐 协作管理</h2>
      <p class="fr-tip">管理员登录后可开通朋友账号、审核投稿</p>
      <label>账号 <input id="ad-user" value="admin"></label>
      <label>密码 <input id="ad-pass" type="password"></label>
      <button class="pl-btn primary big" id="ad-login">登录</button>
      <div class="fr-err" id="ad-err"></div>
    </div>`;
  document.getElementById('ad-login').onclick = async () => {
    const err = document.getElementById('ad-err');
    err.textContent = '';
    try {
      const j = await (await fetch(`${API}?a=login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ user: document.getElementById('ad-user').value.trim(), pass: document.getElementById('ad-pass').value }),
      })).json();
      if (j.error || !j.admin) throw new Error(j.error || '非管理员账号');
      token = j.token; localStorage.setItem(LS, token);
      renderMain();
    } catch (e) { err.textContent = e.message; }
  };
}

async function renderMain() {
  $app.innerHTML = `<div class="pl-empty">加载中…</div>`;
  try {
    [accounts, pending, points, changesets] = await Promise.all([
      api('accounts', undefined, 'GET').then(j => j.accounts),
      api('pending', undefined, 'GET', `status=${pendingStatus}${pendingType ? '&type=' + pendingType : ''}`).then(j => j.items),
      fetch('./data/points.json').then(r => r.json()),
      api('changesets', undefined, 'GET').then(j => j.items),
    ]);
    const rep = await api('reports', undefined, 'GET', `status=${reportStatus}`);
    reports = rep.items;
    reportLogs = rep.logs || [];
    reportOverdue = rep.overdue || 0;
    reportPending = rep.pending || 0;
  } catch (e) {
    $app.innerHTML = `<div class="pl-empty">加载失败：${esc(e.message)}<br><button class="pl-btn" id="ad-retry">重试</button></div>`;
    document.getElementById('ad-retry').onclick = () => location.reload();
    return;
  }
  renderTabs();
}
function renderTabs() {
  $app.innerHTML = `
    <div class="fr-top">
      <span><b>🔐 协作管理</b></span>
      <button class="pl-btn small" id="ad-out">退出</button>
    </div>
    <div class="fr-tabs">
      <button class="fr-tab ${tab === 'pending' ? 'on' : ''}" data-tab="pending">内容审核 (${pending.length})</button>
      <button class="fr-tab ${tab === 'reports' ? 'on' : ''}" data-tab="reports">举报 (${reportPending}${reportOverdue ? ` · 超时 ${reportOverdue}` : ''})</button>
      <button class="fr-tab ${tab === 'changesets' ? 'on' : ''}" data-tab="changesets">变更入库 (${changesets.length})</button>
      <button class="fr-tab ${tab === 'accounts' ? 'on' : ''}" data-tab="accounts">账号 (${accounts.length})</button>
      <button class="fr-tab ${tab === 'ai' ? 'on' : ''}" data-tab="ai">AI 设置</button>
    </div>
    <div id="ad-body"></div>`;
  document.getElementById('ad-out').onclick = async () => { try { await api('logout', {}, 'POST'); } catch {} localStorage.removeItem(LS); token = ''; renderLogin(); };
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; selected.clear(); renderTabs(); });
  tab === 'pending' ? renderPending()
    : tab === 'reports' ? renderReports()
    : tab === 'changesets' ? renderChangesets()
    : tab === 'accounts' ? renderAccounts() : renderAI();
}

async function renderPending() {
  const body = document.getElementById('ad-body');
  const byId = new Map(points.map(p => [p.id, p]));
  const ICON = { photo: '📷', note: '📝', checkin: '📍', fact: '🛠' };
  const filters = `
    <div class="card ad-new">
      <div class="ad-new-row">
        <label style="flex:1">状态 <select id="ad-st">${['pending', 'needs_more', 'approved', 'rejected', 'removed'].map(k => `<option value="${k}" ${pendingStatus === k ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}</select></label>
        <label style="flex:1">类型 <select id="ad-type">
          <option value="">全部</option>
          ${[['photo', '照片'], ['note', '笔记'], ['checkin', '打卡'], ['fact', '纠错']].map(([k, n]) => `<option value="${k}" ${pendingType === k ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>
        <button class="pl-btn small primary" id="ad-bulk">批量采纳</button>
      </div>
      <div class="fr-note">驳回与「需补充」必须填写理由；每次状态变更都记录操作人、时间与理由。纠错通过后只生成 changeset，不直接改线上数据。</div>
    </div>`;
  if (!pending.length) { body.innerHTML = filters + `<div class="pl-empty">🎉 当前筛选下没有内容</div>`; bindPendingFilters(body); return; }
  body.innerHTML = filters + `<div class="ad-list">` + pending.map(it => {
    const p = it.point_id ? byId.get(it.point_id) : null;
    const curVal = it.type === 'fact' && p ? p[FACT_PATH[it.target_field]] : undefined;
    return `
    <div class="ad-item card" data-id="${it.id}">
      <div class="ad-item-top">
        <input type="checkbox" data-sel="${it.id}" ${selected.has(it.id) ? 'checked' : ''}>
        <span class="fr-mine-type">${ICON[it.type] || '•'}</span>
        <b>${esc(it.title || { checkin: '打卡' }[it.type] || '')}</b>
        <span class="ad-who">${esc(it.username)}</span>
        <span class="ad-subcnt">${STATUS_LABEL[it.status] || it.status}</span>
      </div>
      ${it.type === 'fact' ? `<div class="ad-point">🛠 ${FACT_LABEL[it.target_field] || it.target_field}：现值 ${curVal === undefined ? '（无）' : esc(String(curVal))} → <b>${esc(it.new_value)}</b></div>` : ''}
      ${it.source_url ? `<div class="ad-point">🔗 <a href="${esc(it.source_url)}" target="_blank" rel="noopener noreferrer">${esc(it.source_url)}</a></div>` : ''}
      ${it.has_evidence ? `<div class="ad-photo" data-photo="${it.id}">加载证据…</div>` : ''}
      ${it.body ? `<div class="ad-body">${esc(it.body.slice(0, 300))}${it.body.length > 300 ? '…' : ''}</div>` : ''}
      ${p ? `<div class="ad-point">📍 ${esc(p.name)}（${esc(p.city)}）</div>` : it.point_id ? `<div class="ad-point">📍 ${esc(it.point_id)}</div>` : ''}
      <div class="pl-ops">
        <button class="pl-btn small primary" data-ok="${it.id}">✅ 采纳</button>
        <button class="pl-btn small" data-more="${it.id}">💬 需补充</button>
        <button class="pl-btn small danger" data-no="${it.id}">❌ 拒绝</button>
        <button class="pl-btn small" data-report="${it.id}">🚩 举报</button>
      </div>
    </div>`;
  }).join('') + `</div>`;
  body.querySelectorAll('[data-photo]').forEach(d => {
    const id = d.dataset.photo;
    if (!photoCache[id]) photoCache[id] = fetch(`${API}?a=photo&id=${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.blob() : null);
    photoCache[id].then(b => {
      if (!b) { d.textContent = '证据加载失败'; return; }
      d.innerHTML = `<img src="${URL.createObjectURL(b)}" alt="">`;
    });
  });
  body.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => {
    const id = +c.dataset.sel;
    c.checked ? selected.add(id) : selected.delete(id);
  });
  body.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => {
    const r = prompt('采纳理由（会记入审核日志）', '内容真实且符合收录标准');
    if (r && r.trim().length >= 2) doReview([+b.dataset.ok], 'approve', r.trim());
  });
  body.querySelectorAll('[data-more]').forEach(b => b.onclick = () => {
    const r = prompt('需要补充什么？（会发给投稿人）');
    if (r && r.trim().length >= 2) doReview([+b.dataset.more], 'needs_more', r.trim());
  });
  body.querySelectorAll('[data-no]').forEach(b => b.onclick = () => {
    const r = prompt('驳回理由（必填，至少 2 字）');
    if (r && r.trim().length >= 2) doReview([+b.dataset.no], 'reject', r.trim());
  });
  body.querySelectorAll('[data-report]').forEach(b => b.onclick = () => {
    const it = pending.find(x => x.id === +b.dataset.report);
    openReportDialog({
      targetType: 'submission', targetId: b.dataset.report,
      label: it?.title || `投稿 #${b.dataset.report}`,
      submit: payload => api('report', payload),
    });
  });
  bindPendingFilters(body);
}

function bindPendingFilters(body) {
  const st = body.querySelector('#ad-st');
  const ty = body.querySelector('#ad-type');
  if (st) st.onchange = () => { pendingStatus = st.value; selected.clear(); loadPending().then(renderTabs).catch(e => toast(e.message)); };
  if (ty) ty.onchange = () => { pendingType = ty.value; selected.clear(); loadPending().then(renderTabs).catch(e => toast(e.message)); };
  const bulk = body.querySelector('#ad-bulk');
  if (bulk) bulk.onclick = () => {
    if (!selected.size) return toast('先勾选要采纳的投稿');
    const r = prompt(`批量采纳 ${selected.size} 条的共用理由`, '内容真实且符合收录标准');
    if (r && r.trim().length >= 2) doReview([...selected], 'approve', r.trim());
  };
}

async function loadPending() {
  pending = (await api('pending', undefined, 'GET', `status=${pendingStatus}${pendingType ? '&type=' + pendingType : ''}`)).items;
}
async function refreshAfterReview() {
  await loadPending();
  changesets = (await api('changesets', undefined, 'GET')).items;
  const rep = await api('reports', undefined, 'GET', `status=${reportStatus}`);
  reports = rep.items; reportLogs = rep.logs || [];
  reportOverdue = rep.overdue || 0; reportPending = rep.pending || 0;
  renderTabs();
}
async function doReview(ids, action, reason = '') {
  try {
    const j = await api('review', { ids, action, reason });
    const label = { approve: '已采纳', needs_more: '已标记需补充', reject: '已拒绝' }[action];
    toast(label + (j.skipped?.length ? `（${j.skipped.length} 条跳过）` : ''));
    selected.clear();
    await refreshAfterReview();
  } catch (e) { toast('失败：' + e.message); }
}

/* A-16 举报处理：待处理列表 + 24h 超时提示 + 移除/驳回/封禁 + 日志 */
async function loadReports() {
  const rep = await api('reports', undefined, 'GET', `status=${reportStatus}`);
  reports = rep.items; reportLogs = rep.logs || [];
  reportOverdue = rep.overdue || 0; reportPending = rep.pending || 0;
}
function renderReports() {
  const body = document.getElementById('ad-body');
  const reasonLabel = k => (REPORT_REASONS.find(([x]) => x === k) || [k, k])[1];
  const filters = `
    <div class="card ad-new">
      <div class="ad-new-row">
        <label style="flex:1">状态 <select id="ad-rst">
          ${[['pending', '待处理'], ['handled', '已处理'], ['all', '全部']].map(([k, n]) => `<option value="${k}" ${reportStatus === k ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>
        <span class="ad-who">处理时限目标 24h${reportOverdue ? ` · ⚠ 已超时 ${reportOverdue} 条` : ''}</span>
      </div>
      <div class="fr-note">处理动作写入举报日志；封禁投稿者会同时清掉该账号全部会话。</div>
    </div>`;
  const rows = reports.length ? reports.map(r => `
    <div class="ad-item card">
      <div class="ad-item-top">
        <b>#${r.id} ${reasonLabel(r.reason)}</b>
        <span class="ad-who">${esc(r.reporter)}</span>
        <span class="ad-subcnt">${r.status === 'pending' ? '待处理' : '已处理'}${r.overdue ? ' · ⚠ 超时' : ''}</span>
      </div>
      <div class="ad-point">${r.target_type === 'submission' ? `投稿 #${r.target_id}${r.s_title ? ' · ' + esc(r.s_title) : ''}` : `点位 ${esc(r.target_id)}`}</div>
      ${r.note ? `<div class="ad-body">${esc(r.note)}</div>` : ''}
      <div class="fr-note">举报于 ${new Date(+r.created * 1000).toLocaleString('zh-CN')}${r.handled_by ? ` · 由 ${esc(r.handled_by)} ${ACTION_LABEL[r.action] || r.action}` : ''}</div>
      ${r.status === 'pending' ? `<div class="pl-ops">
        ${r.target_type === 'submission' ? `<button class="pl-btn small danger" data-h="${r.id}" data-act="remove">移除内容</button>` : ''}
        <button class="pl-btn small" data-h="${r.id}" data-act="dismiss">驳回举报</button>
        ${r.s_username ? `<button class="pl-btn small danger" data-h="${r.id}" data-act="ban">封禁投稿者</button>` : ''}
      </div>` : ''}
    </div>`).join('') : `<div class="pl-empty">当前筛选下没有举报</div>`;
  const logs = reportLogs.length ? `<div class="card"><div class="ad-sec-title">处理与封禁日志</div>
    ${reportLogs.map(l => `<div class="fr-note" style="margin-top:var(--sp-1,4px)">#${l.id} · ${new Date(+l.created * 1000).toLocaleString('zh-CN')} · ${esc(l.actor)} ${ACTION_LABEL[l.action] || l.action}${l.note ? ' · ' + esc(l.note) : ''}</div>`).join('')}
  </div>` : '';
  body.innerHTML = filters + `<div class="ad-list">${rows}</div>` + logs;
  const rst = body.querySelector('#ad-rst');
  if (rst) rst.onchange = async () => { reportStatus = rst.value; try { await loadReports(); renderReports(); } catch (e) { toast(e.message); } };
  body.querySelectorAll('[data-h]').forEach(b => b.onclick = async () => {
    const action = b.dataset.act;
    const note = action === 'dismiss' ? (prompt('驳回理由（可选）') || '') : (prompt('处理备注（可选）') || '');
    try {
      await api('report_handle', { id: +b.dataset.h, action, note });
      toast('已处理：' + (ACTION_LABEL[action] || action));
      await loadReports(); renderReports();
    } catch (e) { toast('失败：' + e.message); }
  });
}

/* P1-6 changeset：导出待应用变更，交给 tools/apply-changesets.mjs 落盘 */
function renderChangesets() {
  const body = document.getElementById('ad-body');
  const rows = changesets.length ? changesets.map(c => `
    <div class="ad-item card">
      <div class="ad-item-top"><b>#${c.id} · 投稿 #${c.submission_id}</b>
        <span class="ad-subcnt">${c.status}${c.run_id ? ' · ' + esc(c.run_id) : ''}</span>
      </div>
      <div class="ad-point">📍 ${esc(c.city || '')} ${esc(c.point_id)} · ${esc(c.json_path)}：${c.before_value === null ? '（原无）' : esc(c.before_value)} → <b>${esc(c.new_value)}</b></div>
      ${c.applied_by ? `<div class="fr-note">由 ${esc(c.applied_by)} 于 ${new Date(+c.applied_at * 1000).toLocaleString('zh-CN')} 应用</div>` : ''}
    </div>`).join('') : `<div class="pl-empty">没有待应用变更</div>`;
  body.innerHTML = `
    <div class="card ad-new">
      <div class="ad-new-row"><button class="pl-btn small primary" id="ad-export">⬇ 导出待应用 JSON</button></div>
      <div class="fr-note">导出后在服务器执行：<code>node tools/apply-changesets.mjs --input ready.json --by "操作人"</code>；重复执行幂等，回滚用 <code>--rollback &lt;run_id&gt;</code>。被后续变更覆盖时会提示冲突并跳过。</div>
    </div>
    <div class="ad-list">${rows}</div>`;
  const btn = body.querySelector('#ad-export');
  if (btn) btn.onclick = () => {
    const ready = changesets.filter(c => c.status === 'ready');
    if (!ready.length) return toast('没有待应用变更');
    const blob = new Blob([JSON.stringify({ version: 1, items: ready }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `changesets-ready-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`已导出 ${ready.length} 条变更`);
  };
}


function renderAccounts() {
  const body = document.getElementById('ad-body');
  body.innerHTML = `
    ${lastCreated ? `<div class="card" style="border-color:#B71C1C"><div class="fr-note" style="color:#3A3226;font-size:14px;margin-top:0">${lastCreated}</div></div>` : ''}
    <div class="card ad-new">
      <div class="ad-sec-title">开通新账号</div>
      <div class="ad-new-row">
        <input id="nw-user" placeholder="账号名（2-20字）">
        <input id="nw-pass" placeholder="密码（至少6位）">
        <button class="pl-btn small" id="nw-gen">🎲 生成</button>
      </div>
      <input id="nw-display" placeholder="备注名（如：小李）" style="margin-top:8px">
      <button class="pl-btn primary" id="nw-create" style="margin-top:10px">创建账号</button>
      <div class="fr-note" id="nw-result"></div>
    </div>
    <div class="card"><div class="ad-sec-title">已有账号</div>
      ${accounts.length ? accounts.map(a => `
        <div class="fr-ckrow">
          <span><b>${esc(a.username)}</b>${a.display ? ` <span class="ad-who">${esc(a.display)}</span>` : ''}${a.banned ? ' <span class="ad-subcnt">🚫 已封禁</span>' : ''}</span>
          <span class="ad-subcnt">投稿 ${a.submissions}</span>
          <button class="pl-btn small" data-ban="${esc(a.username)}" data-on="${a.banned ? 0 : 1}">${a.banned ? '解除封禁' : '封禁'}</button>
          <button class="pl-btn small danger" data-rm="${esc(a.username)}">删除</button>
        </div>`).join('') : '<div class="fr-note">还没有账号</div>'}
    </div>`;
  document.getElementById('nw-gen').onclick = () => { document.getElementById('nw-pass').value = genPass(); };
  document.getElementById('nw-create').onclick = async () => {
    const u = document.getElementById('nw-user').value.trim();
    const p = document.getElementById('nw-pass').value;
    const d = document.getElementById('nw-display').value.trim();
    const res = document.getElementById('nw-result');
    try {
      await api('accounts', { user: u, pass: p, display: d });
      lastCreated = `✅ 已创建，把账号密码发给朋友：<br>账号 <b>${esc(u)}</b> · 密码 <b>${esc(p)}</b>`;
      accounts = (await api('accounts', undefined, 'GET')).accounts;
      renderTabs();
      toast('账号已创建 ✓');
    } catch (e) { res.textContent = '失败：' + e.message; }
  };
  body.querySelectorAll('[data-ban]').forEach(b => b.onclick = async () => {
    const on = b.dataset.on === '1';
    if (on && !confirm(`封禁账号 ${b.dataset.ban}？将同时清掉其全部会话。`)) return;
    try {
      await api('ban', { user: b.dataset.ban, banned: on });
      accounts = (await api('accounts', undefined, 'GET')).accounts;
      renderTabs();
      toast(on ? '已封禁' : '已解除封禁');
    } catch (e) { toast('失败：' + e.message); }
  });
  body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    if (!confirm(`删除账号 ${b.dataset.rm}？其投稿保留。`)) return;
    try {
      const r = await fetch(`${API}?a=accounts&user=${encodeURIComponent(b.dataset.rm)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || '删除失败');
      accounts = accounts.filter(a => a.username !== b.dataset.rm);
      renderTabs();
      toast('已删除');
    } catch (e) { toast('失败：' + e.message); }
  });
}

/* ---------- AI 设置（概览 + 可视化台账 + 配额/模型范围 + 我的自定义接入） ---------- */
const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let aiSel = { friend: [], admin: [] };

function modelChipsHtml(field) {
  const sel = aiSel[field];
  const customs = sel.filter(id => !modelInfo(id));
  return `
    <div class="ai-chips">
      ${AI_MODELS.map(m => `<button type="button" class="chip ${sel.includes(m.id) ? 'on' : ''}" data-field="${field}" data-mid="${m.id}" title="${m.id} · 输入 ¥${m.pin} / 输出 ¥${m.pout} 每百万 token（刊例快照价）">${esc(m.name)}<span class="ai-tier ${TIER_CLASS[m.tier] || ''}">${m.tier}</span></button>`).join('')}
      ${customs.map(id => `<button type="button" class="chip on" data-field="${field}" data-mid="${esc(id)}">${esc(id)}<span class="ai-tier">自定义</span></button>`).join('')}
    </div>
    <div class="ad-new-row" style="margin-top:8px">
      <input placeholder="自定义模型 ID，回车添加" data-custom="${field}" autocomplete="off" name="ai-custom-${field}">
    </div>`;
}
function bindModelChips(field) {
  const body = document.getElementById('ad-body');
  body.querySelectorAll(`[data-field="${field}"][data-mid]`).forEach(b => b.onclick = () => {
    const id = b.dataset.mid;
    aiSel[field] = aiSel[field].includes(id) ? aiSel[field].filter(x => x !== id) : [...aiSel[field], id];
    refreshChips(field);
  });
  const inp = body.querySelector(`[data-custom="${field}"]`);
  if (inp) inp.onkeydown = e => {
    if (e.key !== 'Enter') return;
    const v = inp.value.trim().replace(/[^\w./-]/g, '');
    if (v && !aiSel[field].includes(v)) { aiSel[field] = [...aiSel[field], v]; refreshChips(field); }
  };
}
function refreshChips(field) {
  const box = document.getElementById(`chips-${field}`);
  if (box) { box.innerHTML = modelChipsHtml(field); bindModelChips(field); }
}
// 模型下拉（预设 + 自定义项），返回当前应保存的模型 ID
function aiModelSelHtml(selId, inpId, current) {
  const custom = current && !modelInfo(current);
  return `
    <select id="${selId}">
      <option value="">默认（站内配置）</option>
      ${AI_MODELS.map(m => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${esc(m.name)}（${m.tier} · ¥${m.pin}/¥${m.pout}）</option>`).join('')}
      <option value="__custom" ${custom ? 'selected' : ''}>自定义…</option>
    </select>
    <input id="${inpId}" autocomplete="off" name="${inpId}" style="display:${custom ? '' : 'none'};margin-top:6px" value="${custom ? esc(current) : ''}" placeholder="自定义模型 ID">`;
}
function aiModelSelBind(selId, inpId) {
  document.getElementById(selId).onchange = e => {
    document.getElementById(inpId).style.display = e.target.value === '__custom' ? '' : 'none';
  };
}
function aiModelSelVal(selId, inpId) {
  const s = document.getElementById(selId);
  return s.value === '__custom' ? document.getElementById(inpId).value.trim() : s.value;
}

async function renderAI() {
  const body = document.getElementById('ad-body');
  body.innerHTML = `<div class="pl-empty">加载中…</div>`;
  let pol, usage, mine;
  try {
    [pol, usage, mine] = await Promise.all([
      api('ai_policy', undefined, 'GET'),
      api('ai_usage', undefined, 'GET'),
      api('ai_settings', undefined, 'GET'),
    ]);
  } catch (e) { body.innerHTML = `<div class="pl-empty">加载失败：${esc(e.message)}</div>`; return; }
  const P = pol.policy || {};
  aiSel = { friend: [...(P.models_friend || [])], admin: [...(P.models_admin || [])] };

  // 概览数据
  const monthCost = (usage.month_by_model || []).reduce((s, r) => s + (modelCost(r.model, +r.pt || 0, +r.ct || 0) ?? 0), 0);
  const cap = P.month_token_cap ?? 2000000;
  const pct = cap > 0 ? Math.min(100, Math.round((usage.month_site_tokens || 0) / cap * 100)) : 0;
  const today = fmtDate(new Date());
  const todayRow = (usage.daily || []).find(d => d.d === today);
  // 近 14 天柱状图数据
  const dayMap = Object.fromEntries((usage.daily || []).map(d => [d.d, d]));
  const days = [];
  for (let i = 13; i >= 0; i--) { const k = fmtDate(new Date(Date.now() - i * 864e5)); days.push({ k, ...(dayMap[k] || { calls: 0, fails: 0, tok: 0 }) }); }
  const maxTok = Math.max(1, ...days.map(d => +d.tok || 0));
  const maxModelTok = Math.max(1, ...(usage.by_model || []).map(r => (+r.pt || 0) + (+r.ct || 0)));
  const maxUserTok = Math.max(1, ...(usage.by_user || []).map(r => +r.tok || 0));
  const alerts = usage.alerts || [];
  const alertBar = alerts.length ? `
    <div class="card ai-alertbar${pct >= 80 ? ' warn' : ''}" role="status">
      <div class="ad-sec-title">用量告警（阈值 60% / 80%，同周期同阈值只告一次）</div>
      ${alerts.slice(0, 8).map(a => `
        <div class="fr-ckrow">
          <span>${esc(a.period)} · 达 <b>${+a.threshold}%</b></span>
          <span class="ad-subcnt">${(+a.tokens || 0).toLocaleString()} / ${(+a.cap || 0).toLocaleString()} tok · ${new Date(+a.created * 1000).toLocaleString('zh-CN')}</span>
        </div>`).join('')}
      ${alerts.length > 8 ? `<div class="fr-note">另有 ${alerts.length - 8} 条历史，按时间倒序只展示最近 8 条</div>` : ''}
      <div class="fr-note">同时写入服务端结构化日志（标签 [ai_alert]），无需配置外部 webhook</div>
    </div>` : '';

  body.innerHTML = `
    ${alertBar}
    <div class="card ad-new">
      <div class="ad-sec-title">本月概览（站内通道）</div>
      <div class="ai-stats">
        <div><div class="ai-big">${(usage.month_site_tokens || 0).toLocaleString()}</div><div class="fr-note">tokens</div></div>
        <div><div class="ai-big">≈¥${monthCost.toFixed(2)}</div><div class="fr-note">刊例价估算，未计免费额度</div></div>
        <div><div class="ai-big">${todayRow ? +todayRow.calls : 0}</div><div class="fr-note">今日生成${todayRow && +todayRow.fails ? `（失败 ${todayRow.fails}）` : ''}</div></div>
      </div>
      <div class="ai-progress ${pct >= 80 ? 'warn' : ''}"><i style="width:${pct}%"></i></div>
      <div class="fr-note" style="margin-top:4px">熔断进度 ${pct}%（阈值 ${(cap / 10000).toLocaleString()} 万 token / 月）</div>
    </div>
    <div class="card">
      <div class="ad-sec-title">近 14 天调用</div>
      <div class="ai-bars">${days.map(d => {
        const h = Math.max(2, Math.round((+d.tok || 0) / maxTok * 110));
        const total = (+d.calls || 0) + (+d.fails || 0);
        const fh = total ? Math.round(h * (+d.fails || 0) / total) : 0;
        return `<div class="ai-bar" title="${d.k}：${+d.calls || 0} 次成功 / ${+d.fails || 0} 失败 · ${(+d.tok || 0).toLocaleString()} tok"><i style="height:${h - fh}px"></i>${fh ? `<i class="fail" style="height:${fh}px"></i>` : ''}</div>`;
      }).join('')}</div>
      <div class="ai-bar-x">${days.map((d, i) => `<span>${i % 2 ? '' : d.k.slice(5)}</span>`).join('')}</div>
      <div class="ai-2col">
        <div>
          <div class="ad-sec-title" style="margin-top:12px">按模型（近 30 天）</div>
          ${(usage.by_model || []).length ? usage.by_model.map(r => {
            const c = modelCost(r.model, +r.pt || 0, +r.ct || 0);
            const w = Math.max(4, Math.round(((+r.pt || 0) + (+r.ct || 0)) / maxModelTok * 100));
            const mi = modelInfo(r.model);
            return `<div class="ai-hbar"><div class="row"><span class="lbl" title="${esc(r.model)}">${esc(mi ? mi.name : r.model)}</span><span class="track"><i style="width:${w}%"></i></span><span class="val">${c === null ? '' : '≈¥' + c.toFixed(2)}</span></div></div>`;
          }).join('') : '<div class="fr-note">暂无记录</div>'}
        </div>
        <div>
          <div class="ad-sec-title" style="margin-top:12px">按用户（近 30 天）</div>
          ${(usage.by_user || []).length ? usage.by_user.map(r => {
            const w = Math.max(4, Math.round((+r.tok || 0) / maxUserTok * 100));
            return `<div class="ai-hbar"><div class="row"><span class="lbl">${esc(r.username)}${r.channel === 'custom' ? ' <span class="ad-who">自定义</span>' : ''}</span><span class="track"><i style="width:${w}%"></i></span><span class="val">${(+r.tok || 0).toLocaleString()}</span></div></div>`;
          }).join('') : '<div class="fr-note">暂无记录</div>'}
        </div>
      </div>
      <div class="ad-sec-title" style="margin-top:14px">最近明细</div>
      ${usage.items && usage.items.length ? usage.items.map(it => `
        <div class="fr-ckrow">
          <span>${esc(it.model || '')} · <b>${esc(it.username)}</b> <span class="ad-who">${it.channel === 'custom' ? '自定义' : '站内'}${+it.ok ? '' : ' · 失败'}</span></span>
          <span class="ad-subcnt">${((+it.pt || 0) + (+it.ct || 0)).toLocaleString()} tok</span>
        </div>`).join('') : '<div class="fr-note">还没有 AI 调用记录</div>'}
    </div>
    <div class="card ad-new">
      <div class="ad-sec-title">每日生成次数上限</div>
      <div class="ad-new-row">
        <label style="flex:1">朋友 <input id="aiq-friend" type="number" min="0" max="100" value="${P.friend_quota ?? 3}"></label>
        <label style="flex:1">管理员 <input id="aiq-admin" type="number" min="0" max="100" value="${P.admin_quota ?? 30}"></label>
        <label style="flex:1">自定义接入 <input id="aiq-custom" type="number" min="0" max="100" value="${P.custom_quota ?? 20}"></label>
      </div>
      <div class="ad-sec-title" style="margin-top:14px">朋友可用模型（点击切换，悬浮看单价）</div>
      <div id="chips-friend">${modelChipsHtml('friend')}</div>
      <div class="ad-sec-title" style="margin-top:14px">管理员可用模型</div>
      <div id="chips-admin">${modelChipsHtml('admin')}</div>
      <div class="fr-note">价格为 2026-10-27 刊例快照、未计免费额度；旗舰档与省钱档价差可达 40 倍，开放给朋友前留意</div>
      <div class="ad-new-row" style="margin-top:12px">
        <label style="flex:1">月 token 熔断 <input id="aiq-cap" type="number" min="0" max="50000000" value="${cap}"></label>
        <label style="flex:1">站内通道 <select id="aiq-enabled"><option value="1" ${P.site_enabled ? 'selected' : ''}>开启</option><option value="0" ${!P.site_enabled ? 'selected' : ''}>停用</option></select></label>
      </div>
      <div class="ad-new-row" style="margin-top:12px">
        <label style="flex:1">IP 限流次数 <input id="aiq-ipmax" type="number" min="1" max="1000" value="${P.ip_rate_max ?? 10}"></label>
        <label style="flex:1">窗口秒数 <input id="aiq-ipwin" type="number" min="60" max="86400" value="${P.ip_rate_window ?? 600}"></label>
      </div>
      <div class="fr-note">IP 维度按滑动窗口计数，与账号日额度并存、取更严者；只在实际发起生成时计一次（重放/被拒不占额度）</div>
      <button class="pl-btn primary" id="aiq-save" style="margin-top:10px">保存 AI 设置</button>
    </div>
    <div class="card ad-new">
      <div class="ad-sec-title">我的 AI 接入（配置后我生成计划走自己的接口，不占站内次数）</div>
      <label>Endpoint（https）<input id="aie-endpoint" name="ai-cfg-ep" autocomplete="off" value="${esc(mine.endpoint || '')}" placeholder="留空 = 使用站内通道"></label>
      <label style="margin-top:8px">模型 ${aiModelSelHtml('aie-model-sel', 'aie-model-custom', mine.model || '')}</label>
      <label style="margin-top:8px">API Key <input id="aie-key" name="ai-cfg-key" type="password" autocomplete="new-password" placeholder="${mine.has_key ? '已保存（留空保持不变）' : 'sk-...'}"></label>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="pl-btn primary" id="aie-save">保存我的接入</button>
        <button class="pl-btn small" id="aie-test">⚡ 测试连接</button>
        <button class="pl-btn small danger" id="aie-clear">清除（回到站内通道）</button>
      </div>
      <div class="fr-note" id="aie-result" style="margin-top:8px"></div>
    </div>`;
  bindModelChips('friend'); bindModelChips('admin');
  aiModelSelBind('aie-model-sel', 'aie-model-custom');
  document.getElementById('aiq-save').onclick = async () => {
    if (!aiSel.friend.length || !aiSel.admin.length) return toast('两组的模型范围都不能为空');
    try {
      await api('ai_policy', {
        friend_quota: +document.getElementById('aiq-friend').value,
        admin_quota: +document.getElementById('aiq-admin').value,
        custom_quota: +document.getElementById('aiq-custom').value,
        month_token_cap: +document.getElementById('aiq-cap').value,
        ip_rate_max: +document.getElementById('aiq-ipmax').value,
        ip_rate_window: +document.getElementById('aiq-ipwin').value,
        site_enabled: document.getElementById('aiq-enabled').value === '1',
        models_friend: aiSel.friend,
        models_admin: aiSel.admin,
      });
      toast('AI 设置已保存 ✓');
      renderAI();
    } catch (e) { toast('失败：' + e.message); }
  };
  document.getElementById('aie-save').onclick = async () => {
    try {
      await api('ai_settings', {
        endpoint: document.getElementById('aie-endpoint').value.trim(),
        model: aiModelSelVal('aie-model-sel', 'aie-model-custom'),
        key: document.getElementById('aie-key').value,
      });
      toast('我的 AI 接入已保存 ✓');
      renderAI();
    } catch (e) { toast('失败：' + e.message); }
  };
  document.getElementById('aie-test').onclick = async () => {
    const res = document.getElementById('aie-result');
    const btn = document.getElementById('aie-test');
    btn.disabled = true; res.textContent = '测试中（真实调一次模型，约几秒）…';
    try {
      const j = await api('ai_test', {
        endpoint: document.getElementById('aie-endpoint').value.trim(),
        model: aiModelSelVal('aie-model-sel', 'aie-model-custom'),
        key: document.getElementById('aie-key').value,
      });
      res.textContent = j.ok
        ? `✓ 连通正常 · 延迟 ${(j.latency_ms / 1000).toFixed(1)}s · 模型 ${j.model} 回复：${j.preview || '（空）'}`
        : `✗ ${j.error || '测试失败'}`;
    } catch (e) { res.textContent = '✗ ' + e.message; }
    btn.disabled = false;
  };
  document.getElementById('aie-clear').onclick = async () => {
    if (!confirm('清除自定义接入，回到站内通道？')) return;
    try { await api('ai_settings', { endpoint: '' }); toast('已清除'); renderAI(); }
    catch (e) { toast('失败：' + e.message); }
  };
}

(async () => {
  if (token) { try { await api('me'); renderMain(); return; } catch {} }
  renderLogin();
})();
