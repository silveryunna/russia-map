import '../shared/base.css';
import './plan.css';
import './friend.css';
// 朋友投稿页：传照片 / 写笔记 / 打卡（需管理员在 account.html 开的账号）

import { loadCheckins, hasCheckin } from '../modules/checkin.js';
import { openVisitRepository } from './visits/repository.js';
import { AI_MODELS, modelInfo } from '../modules/ai-models.js';
import { loadRegions, visiblePoints } from '../shared/regions.js';
import { openReportDialog } from '../shared/report.js';

const $app = document.getElementById('friend-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = 'friend-token';
const API = './api/index.php';
// 幂等键：同一次提交动作重试只入库一次（弱网/连点防重复）
const newIdem = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let token = localStorage.getItem(LS) || '';
let me = null;
let points = [];
let regionIndex = null;  // 板块开关：投稿/打卡的点位候选只取可见板块
let checkins = {};
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

/* ---------- 我的 AI 接入（自定义 endpoint，随账号存服务器，key 不回显） ---------- */
async function renderAISettings(body) {
  body.innerHTML = `<div class="pl-empty">加载中…</div>`;
  let cfg = { endpoint: '', model: '', has_key: false };
  try { cfg = await api('ai_settings', undefined, 'GET'); } catch (e) { body.innerHTML = `<div class="pl-empty">加载失败：${esc(e.message)}</div>`; return; }
  const custom = cfg.model && !modelInfo(cfg.model);
  body.innerHTML = `
    <div class="card fr-form">
      <h3 style="margin:0">🤖 我的 AI 接入</h3>
      <label>Endpoint（https）<input id="fa-endpoint" name="ai-cfg-ep" autocomplete="off" value="${esc(cfg.endpoint || '')}" placeholder="留空 = 使用站内通道"></label>
      <label>模型
        <select id="fa-model-sel">
          <option value="">默认（站内配置）</option>
          ${AI_MODELS.map(m => `<option value="${m.id}" ${m.id === cfg.model ? 'selected' : ''}>${esc(m.name)}（${m.tier} · ¥${m.pin}/¥${m.pout}）</option>`).join('')}
          <option value="__custom" ${custom ? 'selected' : ''}>自定义…</option>
        </select>
      </label>
      <input id="fa-model-custom" autocomplete="off" name="ai-cfg-model" style="display:${custom ? '' : 'none'}" value="${custom ? esc(cfg.model) : ''}" placeholder="自定义模型 ID">
      <label>API Key <input id="fa-key" name="ai-cfg-key" type="password" autocomplete="new-password" placeholder="${cfg.has_key ? '已保存（留空保持不变）' : 'sk-...'}"></label>
      <button class="pl-btn primary big" id="fa-save">保存</button>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="pl-btn small" id="fa-test">⚡ 测试连接</button>
        <button class="pl-btn small danger" id="fa-clear">清除（回到站内通道）</button>
      </div>
      <div class="fr-note" id="fa-result"></div>
      <div class="fr-note">配置后，行程计划页的 AI 生成将走你自己的接口（OpenAI 兼容格式），不占用本站次数；密钥随账号保存在服务器，任何接口都不会回显明文。模型名旁的价格为 TokenHub 刊例快照（2026-10-27）。</div>
    </div>`;
  const selVal = () => {
    const s = document.getElementById('fa-model-sel');
    return s.value === '__custom' ? document.getElementById('fa-model-custom').value.trim() : s.value;
  };
  document.getElementById('fa-model-sel').onchange = e => {
    document.getElementById('fa-model-custom').style.display = e.target.value === '__custom' ? '' : 'none';
  };
  document.getElementById('fa-save').onclick = async () => {
    try {
      await api('ai_settings', {
        endpoint: document.getElementById('fa-endpoint').value.trim(),
        model: selVal(),
        key: document.getElementById('fa-key').value,
      });
      toast('已保存 ✓'); renderAISettings(body);
    } catch (e) { toast('失败：' + e.message); }
  };
  document.getElementById('fa-test').onclick = async () => {
    const res = document.getElementById('fa-result');
    const btn = document.getElementById('fa-test');
    btn.disabled = true; res.textContent = '测试中（真实调一次模型，约几秒）…';
    try {
      const j = await api('ai_test', {
        endpoint: document.getElementById('fa-endpoint').value.trim(),
        model: selVal(),
        key: document.getElementById('fa-key').value,
      });
      res.textContent = j.ok
        ? `✓ 连通正常 · 延迟 ${(j.latency_ms / 1000).toFixed(1)}s · 模型 ${j.model} 回复：${j.preview || '（空）'}`
        : `✗ ${j.error || '测试失败'}`;
    } catch (e) { res.textContent = '✗ ' + e.message; }
    btn.disabled = false;
  };
  document.getElementById('fa-clear').onclick = async () => {
    try { await api('ai_settings', { endpoint: '' }); toast('已清除'); renderAISettings(body); }
    catch (e) { toast('失败：' + e.message); }
  };
}

/* ---------- 主界面 ---------- */
async function renderMain() {
  $app.innerHTML = `<div class="pl-empty">加载中…</div>`;
  try {
    [points, myItems, checkins] = await Promise.all([
      fetch('./data/points.json').then(r => r.json()),
      api('my', undefined, 'GET').catch(() => ({ items: [] })),
      openVisitRepository().then(repo => repo.getCheckins()).catch(() => loadCheckins()),
    ]);
  } catch (e) {
    $app.innerHTML = `<div class="pl-empty">加载失败：${esc(e.message)}<br><button class="pl-btn" id="fr-retry">重试</button></div>`;
    document.getElementById('fr-retry').onclick = () => location.reload();
    return;
  }
  regionIndex = await loadRegions();
  points = visiblePoints(points, regionIndex);
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
      ${[['photo', '📷 传照片'], ['note', '📝 写笔记'], ['checkin', '📍 打卡'], ['fact', '🛠 纠错'], ['mine', `我的投稿 (${myItems.length})`], ['ai', '🤖 AI 接入']].map(([k, n]) =>
        `<button class="fr-tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}
    </div>
    <div id="fr-body"></div>`;
  document.getElementById('fr-out').onclick = async () => { try { await api('logout', {}, 'POST'); } catch {} logout(); renderLogin(); };
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); });
  const body = document.getElementById('fr-body');
  if (tab === 'photo') renderPhoto(body);
  else if (tab === 'note') renderNote(body);
  else if (tab === 'checkin') renderCheckin(body);
  else if (tab === 'fact') renderFact(body);
  else if (tab === 'ai') renderAISettings(body);
  else renderMine(body);
}

// 本地压缩上传图（最长边 1600，JPEG .82）；照片与纠错证据共用
function compressImage(file, done) {
  const img = new Image();
  img.onload = () => {
    const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    done(cv.toDataURL('image/jpeg', .82));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
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
    compressImage(f, data => {
      dataUrl = data;
      document.getElementById('ph-preview').innerHTML = `<img src="${dataUrl}" alt="">`;
      document.getElementById('ph-send').disabled = false;
    });
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
  const ckMap = checkins || {};
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

/* 事实纠错：字段白名单 + 值格式 + 来源/证据至少一项（服务端二次校验） */
const FACT_FIELDS = [['hours', '营业时间'], ['ticket', '门票'], ['rating', '评分'], ['other', '其他说明']];
const FACT_PATH = { hours: 'hours', ticket: 'ticket', rating: 'rating', other: 'note' };

function renderFact(body) {
  body.innerHTML = `
    <div class="card fr-form">
      <label>要纠错的点位 <input id="fc-point" list="pt-list3" placeholder="输入点位名筛选…" autocomplete="off"></label>
      <datalist id="pt-list3">${points.filter(p => !p.pending).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <div class="fr-note" id="fc-current">选择点位后显示当前值</div>
      <label>要修改的字段
        <select id="fc-field">${FACT_FIELDS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      </label>
      <label>更正后的值 <input id="fc-value" maxlength="200" placeholder="营业时间 09:00-18:00 / 门票 100元 / 评分 4.5"></label>
      <label>来源链接（与证据截图至少填一项）<input id="fc-src" type="url" maxlength="300" placeholder="https://…"></label>
      <label>证据截图（可选）<input id="fc-file" type="file" accept="image/*"></label>
      <div id="fc-preview"></div>
      <label>补充说明（可选）<textarea id="fc-body" rows="2" maxlength="500" placeholder="为什么需要修改…"></textarea></label>
      <button class="pl-btn primary big" id="fc-send">提交纠错</button>
      <div class="fr-note">审核通过后生成一条可应用变更（changeset），由工具合并进数据并保留前后值，可整批回滚。</div>
    </div>`;
  let evidence = '';
  const cur = () => {
    const p = points.find(x => x.name === document.getElementById('fc-point').value.trim());
    const f = document.getElementById('fc-field').value;
    const el = document.getElementById('fc-current');
    if (!p) { el.textContent = '选择点位后显示当前值'; return; }
    const v = p[FACT_PATH[f]];
    el.textContent = `当前值：${v === undefined || v === null ? '（数据里没有这个字段）' : String(v)}`;
  };
  document.getElementById('fc-point').oninput = cur;
  document.getElementById('fc-field').onchange = cur;
  document.getElementById('fc-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    compressImage(f, data => {
      evidence = data;
      document.getElementById('fc-preview').innerHTML = `<img src="${evidence}" alt="">`;
    });
  };
  document.getElementById('fc-send').onclick = async () => {
    const p = points.find(x => x.name === document.getElementById('fc-point').value.trim());
    if (!p) return toast('请从列表中选择点位');
    const btn = document.getElementById('fc-send');
    btn.disabled = true; btn.textContent = '提交中…';
    try {
      await api('submit', {
        type: 'fact', pointId: p.id,
        targetField: document.getElementById('fc-field').value,
        value: document.getElementById('fc-value').value.trim(),
        sourceUrl: document.getElementById('fc-src').value.trim(),
        evidence,
        body: document.getElementById('fc-body').value.trim(),
        idem: newIdem(),
      });
      toast('纠错已提交，等待站长审核 ✓');
      tab = 'mine'; renderMain();
    } catch (e) { toast('失败：' + e.message); btn.disabled = false; btn.textContent = '提交纠错'; }
  };
}

function renderMine(body) {
  const STATUS = {
    pending: '⏳ 待审核', approved: '✅ 已采纳', rejected: '❌ 未采纳',
    needs_more: '💬 需补充', removed: '🚫 已移除',
  };
  const ICON = { photo: '📷', note: '📝', checkin: '📍', fact: '🛠' };
  body.innerHTML = myItems.length ? `<div class="card"><div class="fr-mine">
    ${myItems.map(it => `<div class="fr-mine-row">
      <span class="fr-mine-type">${ICON[it.type] || '•'}</span>
      <span class="fr-mine-title">${esc(it.title || it.point_id || '')}</span>
      ${it.target_field ? `<span class="ad-who">${esc(it.target_field)} → ${esc(it.new_value || '')}</span>` : ''}
      <span class="fr-mine-st">${STATUS[it.status] || it.status}</span>
      ${it.reason && (it.status === 'needs_more' || it.status === 'rejected') ? `<span class="fr-note" style="margin-top:0">理由：${esc(it.reason)}</span>` : ''}
      ${it.status !== 'removed' ? `<button class="pl-btn small" data-report="${it.id}">🚩 举报</button>` : ''}
    </div>`).join('')}
  </div></div>` : `<div class="pl-empty">还没有投稿<br><span>上传照片、写笔记、帮打卡或纠错</span></div>`;
  body.querySelectorAll('[data-report]').forEach(b => b.onclick = () => {
    const it = myItems.find(x => x.id === +b.dataset.report);
    openReportDialog({
      targetType: 'submission', targetId: b.dataset.report,
      label: it?.title || `投稿 #${b.dataset.report}`,
      submit: payload => api('report', payload),
    });
  });
}

(async () => {
  if (token) {
    try { me = await api('me'); renderMain(); return; } catch {}
  }
  renderLogin();
})();
