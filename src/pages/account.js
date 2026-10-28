import '../shared/base.css';
import './friend.css';
import './plan.css';
// 协作管理页（管理员）：账号管理 + 投稿审核 + AI 设置

import { AI_MODELS, modelInfo, modelCost, TIER_CLASS } from '../modules/ai-models.js';

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
      <button class="fr-tab ${tab === 'pending' ? 'on' : ''}" data-tab="pending">待审核 (${pending.length})</button>
      <button class="fr-tab ${tab === 'accounts' ? 'on' : ''}" data-tab="accounts">账号 (${accounts.length})</button>
      <button class="fr-tab ${tab === 'ai' ? 'on' : ''}" data-tab="ai">AI 设置</button>
    </div>
    <div id="ad-body"></div>`;
  document.getElementById('ad-out').onclick = async () => { try { await api('logout', {}, 'POST'); } catch {} localStorage.removeItem(LS); token = ''; renderLogin(); };
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); });
  tab === 'pending' ? renderPending() : tab === 'accounts' ? renderAccounts() : renderAI();
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

  body.innerHTML = `
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
