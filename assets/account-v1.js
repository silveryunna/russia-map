// 协作管理页（管理员）：账号管理 + 投稿审核
import './base-BJw1lW7I.js';

const $app = document.getElementById('account-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = 'admin-token';
const API = './api/index.php';

let token = localStorage.getItem(LS) || '';
let accounts = [], pending = [], points = [];
let tab = 'pending';
let photoCache = {};
let lastCreated = '';

async function api(action, body, method = 'POST') {
  const r = await fetch(`${API}?a=${action}`, {
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
    [accounts, pending, points] = await Promise.all([
      api('accounts', undefined, 'GET').then(j => j.accounts),
      api('pending', undefined, 'GET').then(j => j.items),
      fetch('./data/points.json').then(r => r.json()),
    ]);
  } catch (e) {
    $app.innerHTML = `<div class="pl-empty">加载失败：${esc(e.message)}<br><button class="pl-btn" onclick="location.reload()">重试</button></div>`;
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
      <button class="fr-tab ${tab === 'pending' ? 'on' : ''}" data-tab="pending">待审核 (${pending.length})</button>
      <button class="fr-tab ${tab === 'accounts' ? 'on' : ''}" data-tab="accounts">账号 (${accounts.length})</button>
    </div>
    <div id="ad-body"></div>`;
  document.getElementById('ad-out').onclick = async () => { try { await api('logout', {}, 'POST'); } catch {} localStorage.removeItem(LS); token = ''; renderLogin(); };
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); });
  tab === 'pending' ? renderPending() : renderAccounts();
}

async function renderPending() {
  const body = document.getElementById('ad-body');
  if (!pending.length) { body.innerHTML = `<div class="pl-empty">🎉 没有待审核的投稿</div>`; return; }
  const byId = new Map(points.map(p => [p.id, p]));
  body.innerHTML = `<div class="ad-list">` + pending.map(it => `
    <div class="ad-item card" data-id="${it.id}">
      <div class="ad-item-top">
        <span class="fr-mine-type">${{ photo: '📷', note: '📝', checkin: '📍' }[it.type]}</span>
        <b>${esc(it.title || { checkin: '打卡' }[it.type] || '')}</b>
        <span class="ad-who">${esc(it.username)}</span>
      </div>
      ${it.type === 'photo' ? `<div class="ad-photo" data-photo="${it.id}">加载照片…</div>` : ''}
      ${it.body ? `<div class="ad-body">${esc(it.body.slice(0, 300))}${it.body.length > 300 ? '…' : ''}</div>` : ''}
      ${it.point_id && byId.get(it.point_id) ? `<div class="ad-point">📍 ${esc(byId.get(it.point_id).name)}（${esc(byId.get(it.point_id).city)}）</div>` : it.point_id ? `<div class="ad-point">📍 ${esc(it.point_id)}</div>` : ''}
      <div class="pl-ops">
        <button class="pl-btn small primary" data-ok="${it.id}">✅ 采纳</button>
        <button class="pl-btn small danger" data-no="${it.id}">❌ 拒绝</button>
      </div>
    </div>`).join('') + `</div>`;
  body.querySelectorAll('[data-photo]').forEach(d => {
    const id = d.dataset.photo;
    if (!photoCache[id]) photoCache[id] = fetch(`${API}?a=photo&id=${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.blob() : null);
    photoCache[id].then(b => {
      if (!b) { d.textContent = '照片加载失败'; return; }
      d.innerHTML = `<img src="${URL.createObjectURL(b)}" alt="">`;
    });
  });
  body.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => review(b.dataset.ok, 'approve'));
  body.querySelectorAll('[data-no]').forEach(b => b.onclick = () => review(b.dataset.no, 'reject'));
}
async function review(id, action) {
  try {
    await api(action, { id: +id });
    toast(action === 'approve' ? '已采纳（数据入库需 Kimi 协助合并）' : '已拒绝');
    pending = pending.filter(x => x.id !== +id);
    renderTabs();
  } catch (e) { toast('失败：' + e.message); }
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
          <span><b>${esc(a.username)}</b>${a.display ? ` <span class="ad-who">${esc(a.display)}</span>` : ''}</span>
          <span class="ad-subcnt">投稿 ${a.submissions}</span>
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

(async () => {
  if (token) { try { await api('me'); renderMain(); return; } catch {} }
  renderLogin();
})();
