// 朋友投稿页：传照片 / 写笔记 / 打卡（需管理员在 account.html 开的账号）
import './base-BJw1lW7I.js';
import { loadCheckins, hasCheckin } from './checkin-v2.js';

const $app = document.getElementById('friend-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = 'friend-token';
const API = './api/index.php';
// 幂等键：同一次提交动作重试只入库一次（弱网/连点防重复）
const newIdem = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let token = localStorage.getItem(LS) || '';
let me = null;
let points = [];
let tab = 'photo';
let myItems = [];

async function api(action, body, method = 'POST') {
  const r = await fetch(`${API}?a=${action}`, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ error: '响应解析失败' }));
  if (r.status === 401) { logout(); throw new Error(j.error || '登录已过期'); }
  if (j.error) throw new Error(j.error);
  return j;
}
function logout() {
  localStorage.removeItem(LS); token = ''; me = null;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'plan-toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

/* ---------- 登录 ---------- */
function renderLogin() {
  $app.innerHTML = `
    <div class="fr-login card">
      <h2>👋 朋友投稿入口</h2>
      <p class="fr-tip">向站长领取账号后登录，可以传照片、写游记、帮同行打卡</p>
      <label>账号 <input id="fr-user" autocomplete="username"></label>
      <label>密码 <input id="fr-pass" type="password" autocomplete="current-password"></label>
      <button class="pl-btn primary big" id="fr-login">登录</button>
      <div class="fr-err" id="fr-err"></div>
    </div>`;
  document.getElementById('fr-login').onclick = async () => {
    const err = document.getElementById('fr-err');
    err.textContent = '';
    try {
      const j = await (await fetch(`${API}?a=login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ user: document.getElementById('fr-user').value.trim(), pass: document.getElementById('fr-pass').value }),
      })).json();
      if (j.error) throw new Error(j.error);
      token = j.token; localStorage.setItem(LS, token);
      me = j;
      renderMain();
    } catch (e) { err.textContent = e.message; }
  };
}

/* ---------- 主界面 ---------- */
async function renderMain() {
  $app.innerHTML = `<div class="pl-empty">加载中…</div>`;
  try {
    [points, myItems] = await Promise.all([
      fetch('./data/points.json').then(r => r.json()),
      api('my', undefined, 'GET').catch(() => ({ items: [] })),
    ]);
  } catch (e) {
    $app.innerHTML = `<div class="pl-empty">加载失败：${esc(e.message)}<br><button class="pl-btn" onclick="location.reload()">重试</button></div>`;
    return;
  }
  myItems = myItems.items || [];
  renderTabs();
}
function renderTabs() {
  $app.innerHTML = `
    <div class="fr-top">
      <span>你好，<b>${esc(me?.name || '')}</b></span>
      <button class="pl-btn small" id="fr-out">退出</button>
    </div>
    <div class="fr-tabs">
      ${[['photo', '📷 传照片'], ['note', '📝 写笔记'], ['checkin', '📍 打卡'], ['mine', `我的投稿 (${myItems.length})`]].map(([k, n]) =>
        `<button class="fr-tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}
    </div>
    <div id="fr-body"></div>`;
  document.getElementById('fr-out').onclick = async () => { try { await api('logout', {}, 'POST'); } catch {} logout(); renderLogin(); };
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); });
  const body = document.getElementById('fr-body');
  if (tab === 'photo') renderPhoto(body);
  else if (tab === 'note') renderNote(body);
  else if (tab === 'checkin') renderCheckin(body);
  else renderMine(body);
}

/* 照片：本地压缩 → base64 → 投递 */
function renderPhoto(body) {
  body.innerHTML = `
    <div class="card fr-form">
      <label>关联点位（可选）<input id="ph-point" list="pt-list" placeholder="输入点位名筛选…"></label>
      <datalist id="pt-list">${points.filter(p => !p.pending).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <label>一句话说明 <input id="ph-title" placeholder="如：蜈支洲岛的玻璃海" maxlength="100"></label>
      <label>选择照片 <input id="ph-file" type="file" accept="image/*"></label>
      <div id="ph-preview"></div>
      <button class="pl-btn primary big" id="ph-send" disabled>提交审核</button>
      <div class="fr-note">照片会压缩至最长边 1600px 后提交，仅管理员可见，采纳后展示在相册</div>
    </div>`;
  let dataUrl = '';
  document.getElementById('ph-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      dataUrl = cv.toDataURL('image/jpeg', .82);
      document.getElementById('ph-preview').innerHTML = `<img src="${dataUrl}" alt="">`;
      document.getElementById('ph-send').disabled = false;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  document.getElementById('ph-send').onclick = async () => {
    const btn = document.getElementById('ph-send');
    btn.disabled = true; btn.textContent = '提交中…';
    const idem = newIdem();
    try {
      const ptName = document.getElementById('ph-point').value.trim();
      const pt = points.find(p => p.name === ptName);
      await api('submit', { type: 'photo', title: document.getElementById('ph-title').value.trim(), pointId: pt ? pt.id : '', dataUrl, idem });
      toast('已提交，等待站长审核 ✓');
      tab = 'mine'; renderMain();
    } catch (e) { toast('失败：' + e.message); btn.disabled = false; btn.textContent = '提交审核'; }
  };
}

function renderNote(body) {
  body.innerHTML = `
    <div class="card fr-form">
      <label>关联点位（可选）<input id="nt-point" list="pt-list2" placeholder="输入点位名…"></label>
      <datalist id="pt-list2">${points.filter(p => !p.pending).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <label>标题 <input id="nt-title" placeholder="如：三亚潜水一日游" maxlength="100"></label>
      <label>正文（支持 Markdown）<textarea id="nt-body" rows="8" placeholder="# 标题&#10;记录今天的见闻…"></textarea></label>
      <button class="pl-btn primary big" id="nt-send">提交审核</button>
      <div class="fr-note">采纳后会作为旅行笔记展示在网站</div>
    </div>`;
  document.getElementById('nt-send').onclick = async () => {
    const ptName = document.getElementById('nt-point').value.trim();
    const pt = points.find(p => p.name === ptName);
    try {
      await api('submit', { type: 'note', title: document.getElementById('nt-title').value.trim(), body: document.getElementById('nt-body').value, pointId: pt ? pt.id : '', idem: newIdem() });
      toast('已提交，等待站长审核 ✓');
      tab = 'mine'; renderMain();
    } catch (e) { toast('失败：' + e.message); }
  };
}

function renderCheckin(body) {
  const ckMap = loadCheckins();
  body.innerHTML = `
    <div class="card fr-form">
      <label>搜索点位 <input id="ck-q" placeholder="如：中央大街 / 红场"></label>
      <div id="ck-list" class="fr-cklist"></div>
      <div class="fr-note">提交后与站长的打卡清单合并（待审核）</div>
    </div>`;
  const list = document.getElementById('ck-list');
  const draw = q => {
    const hit = points.filter(p => !p.pending && (!q || p.name.toLowerCase().includes(q) || (p.name_en || '').toLowerCase().includes(q))).slice(0, 30);
    list.innerHTML = hit.map(p => {
      const known = hasCheckin(ckMap, p.id);
      return `
      <div class="fr-ckrow">
        <span>${esc(p.name)}</span>
        <button class="pl-btn small" data-ck="${esc(p.id)}" ${known ? 'disabled' : ''}>${known ? '本站已打卡' : '提交打卡'}</button>
      </div>`;
    }).join('') || '<div class="fr-note">无匹配点位</div>';
    list.querySelectorAll('[data-ck]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = '提交中…';
      try {
        await api('submit', { type: 'checkin', pointId: b.dataset.ck, idem: newIdem() });
        toast('打卡已提交 ✓'); b.textContent = '已提交';
      } catch (e) { toast('失败：' + e.message); b.disabled = false; b.textContent = '提交打卡'; }
    });
  };
  draw('');
  document.getElementById('ck-q').oninput = e => draw(e.target.value.trim().toLowerCase());
}

function renderMine(body) {
  const STATUS = { pending: '⏳ 待审核', approved: '✅ 已采纳', rejected: '❌ 未采纳' };
  body.innerHTML = myItems.length ? `<div class="card"><div class="fr-mine">
    ${myItems.map(it => `<div class="fr-mine-row">
      <span class="fr-mine-type">${{ photo: '📷', note: '📝', checkin: '📍' }[it.type] || '•'}</span>
      <span class="fr-mine-title">${esc(it.title || it.point_id || '')}</span>
      <span class="fr-mine-st">${STATUS[it.status] || it.status}</span>
    </div>`).join('')}
  </div></div>` : `<div class="pl-empty">还没有投稿<br><span>上传照片、写笔记或帮打卡</span></div>`;
}

(async () => {
  if (token) {
    try { me = await api('me'); renderMain(); return; } catch {}
  }
  renderLogin();
})();
