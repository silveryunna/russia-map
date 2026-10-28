import '../shared/base.css';
import './plan.css';
import { INTERESTS, PLAN_DAYS_MAX, clampDays, ruleEngine } from './plan/engine.js';
import { loadPlans, savePlans } from './plan/store.js';
// 日程计划 v2：规则引擎离线生成 + TokenHub AI（站内通道，api/index.php?a=plan 代理）
// 默认走站内接口，Bearer 用本站登录 token（friend-token / admin-token）；Key 只在服务器侧
// 高级设置可会话级覆盖 endpoint/key（不落盘）；长期自定义接入在 friend.html「我的 AI 接入」保存
// 协议：POST {endpoint, headers:{Authorization:Bearer key}, body:{model?, params:{city,date,days,interests}, context:{points,routes}}}
// 期望返回：{plan:{name,days:[{day,slots:{morning:[],afternoon:[],evening:[]},tip}]}, remaining?, model?}


const $app = document.getElementById('plan-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS_AI = 'planner-ai-config';

let meta = { cities: [], cityColors: {} };
const planLoad = loadPlans(localStorage);
let plans = planLoad.plans;
let view = { mode: 'list', planId: null, form: null, showAI: false, aiError: '' };
let cache = { pts: null, rts: null };

function persistPlans() {
  try {
    savePlans(localStorage, plans);
    planLoad.recovered = false;
    return true;
  } catch (err) {
    toast('本地存储写入失败：' + err.message + '（可先导出 Markdown）');
    return false;
  }
}

/* ---------- PlannerAI（站内通道 + 会话级自定义覆盖） ---------- */
const siteToken = () => localStorage.getItem('friend-token') || localStorage.getItem('admin-token') || '';
let aiSession = {};  // 高级设置：仅本次会话生效，不落盘（密钥不进 localStorage）
let aiInfo = null;   // ?a=ai_policy：配额 / 可选模型 / 是否有个人接入
let aiModel = localStorage.getItem('planner-ai-model') || '';  // 记住上次选择的模型
let generating = false;
// 旧版 localStorage AI 配置迁移为会话级（密钥不再落盘）
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
      city: params.city,
      date: params.date,
      source: 'ai',
      channel: aiSession.endpoint ? 'custom' : 'site',
      model: data.model || m || '',
      createdAt: Date.now(),
    };
  },
};
function sourceLabel(p) {
  if (p.source !== 'ai') return '规则引擎（离线）';
  const ch = p.channel === 'custom' ? '自定义接口' : '站内通道';
  return `AI（${ch}${p.model ? ' · ' + p.model : ''}）`;
}
function aiBtnLabel() {
  if (aiSession.endpoint) return '✨ AI 生成（自定义接口）';
  if (!siteToken()) return '✨ AI 生成（需登录）';
  if (aiInfo && !aiInfo.has_custom && !aiInfo.site_enabled) return '✨ AI 生成（站内通道停用）';
  return '✨ AI 生成';
}

/* ---------- 视图 ---------- */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'plan-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

function render() {
  if (view.mode === 'list') return renderList();
  if (view.mode === 'create') return renderCreate();
  return renderDetail();
}

function renderList() {
  $app.innerHTML = `
    <div class="pl-head">
      <h2>🧭 我的计划</h2>
      <button class="pl-btn primary" id="pl-new">＋ 新建计划</button>
    </div>
    ${planLoad.recovered ? `<div class="pl-tip">⚠️ 检测到损坏的本地计划，已备份为 ${esc(planLoad.backupKey)} 并重建空列表</div>` : ''}
    ${plans.length ? plans.map(p => `
      <div class="pl-card" data-open="${p.id}">
        <div class="pl-card-top">
          <span class="pl-name">${esc(p.name)}</span>
          <span class="pl-src ${p.source}">${p.source === 'ai' ? 'AI' : '规则'}</span>
        </div>
        <div class="pl-meta">${esc(p.city)} · ${esc(p.date || '日期待定')} · ${p.days.length} 天 · ${p.days.reduce((s, d) => s + d.slots.morning.length + d.slots.afternoon.length + d.slots.evening.length, 0)} 个点位</div>
        <div class="pl-ops">
          <button class="pl-btn small" data-export="${p.id}">导出 Markdown</button>
          <button class="pl-btn small danger" data-del="${p.id}">删除</button>
        </div>
      </div>`).join('')
      : `<div class="pl-empty">还没有计划<br><span>点右上角"新建计划"生成第一份行程草案</span></div>`}
    <div class="pl-foot">规则引擎离线可用 · AI 生成需登录账号（朋友页 / 管理页）</div>`;
  document.getElementById('pl-new').onclick = () => {
    view.mode = 'create'; view.aiError = ''; view.showAI = false;
    view.form = { city: meta.cities[0] || '', date: '', days: 3, interests: [] };
    render();
  };
}

function renderCreate() {
  const f = view.form;
  $app.innerHTML = `
    <div class="pl-head"><h2>新建计划</h2><button class="pl-btn" id="pl-back">← 返回</button></div>
    <div class="pl-form card">
      <label>目的地
        <select id="pl-city">${[...meta.cities].sort().map(c => `<option ${c === f.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <label>出发日期 <input id="pl-date" type="date" value="${esc(f.date)}"></label>
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
  document.getElementById('pl-city').onchange = e => f.city = e.target.value;
  document.getElementById('pl-date').onchange = e => f.date = e.target.value;
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
    plans.unshift(plan);
    if (!persistPlans()) {
      plans = plans.filter(x => x.id !== plan.id);
      generating = false;
      render();
      return;
    }
    view.mode = 'detail'; view.planId = plan.id; view.aiError = '';
    generating = false;
    render();
    toast(`计划已生成（${sourceLabel(plan)}）`);
    if (plan.note) setTimeout(() => toast(plan.note), 600);
  } catch (err) {
    generating = false;
    view.aiError = err.message;
    render();
  }
}

function renderDetail() {
  const p = plans.find(x => x.id === view.planId);
  if (!p) { view.mode = 'list'; return render(); }
  const byName = new Map(cache.pts.map(x => [x.name, x]));
  const col = meta.cityColors[p.city] || '#B71C1C';
  const slotName = { morning: '🌅 上午', afternoon: '☀️ 下午', evening: '🌙 晚上' };
  $app.innerHTML = `
    <div class="pl-head">
      <h2>${esc(p.name)}</h2>
      <button class="pl-btn" id="pl-back">← 返回</button>
    </div>
    <div class="pl-meta" style="margin:0 0 12px">${esc(p.city)} · ${esc(p.date || '日期待定')} · ${p.days.length} 天 · 来源：${esc(sourceLabel(p))}</div>
    ${p.note ? `<div class="pl-tip" style="margin-bottom:12px">⚠️ ${esc(p.note)}</div>` : ''}
    ${p.days.map(d => `
      <div class="pl-day card" style="border-left:4px solid ${col}">
        <div class="pl-day-head">Day ${d.day} <span>${d.slots.morning.length + d.slots.afternoon.length + d.slots.evening.length} 个点位</span></div>
        ${Object.keys(slotName).map(sk => d.slots[sk].length ? `
          <div class="pl-slot">
            <div class="pl-slot-name">${slotName[sk]}</div>
            ${d.slots[sk].map(n => {
              const pt = byName.get(n);
              return `<div class="pl-point"><span class="pl-dot" style="background:${pt ? (meta.cityColors[pt.city] || '#546E7A') : '#999'}"></span>${esc(n)}<span class="pl-ptype">${pt ? esc(pt.type) : ''}</span></div>`;
            }).join('')}
          </div>` : '').join('')}
        ${d.tip ? `<div class="pl-tip">💡 ${esc(d.tip)}` : ''}
      </div>`).join('')}
    <div class="pl-ops" style="margin-top:14px">
      <button class="pl-btn primary" id="pl-exp">导出 Markdown</button>
      <button class="pl-btn danger" id="pl-del">删除计划</button>
    </div>`;
  document.getElementById('pl-back').onclick = () => { view.mode = 'list'; render(); };
  document.getElementById('pl-exp').onclick = () => exportMd(p);
  document.getElementById('pl-del').onclick = () => {
    plans = plans.filter(x => x.id !== p.id);
    persistPlans();
    view.mode = 'list'; render(); toast('已删除');
  };
}

function exportMd(p) {
  const byName = new Map(cache.pts.map(x => [x.name, x]));
  const md = [`# ${p.name}`, ``, `> ${p.city} · ${p.date || '日期待定'} · 来源：${sourceLabel(p)}`, ``,
    ...p.days.flatMap(d => [`## Day ${d.day}`, ``,
      ...Object.entries(d.slots).flatMap(([sk, list]) => list.length ? [`### ${{ morning: '上午', afternoon: '下午', evening: '晚上' }[sk]}`, ``,
        ...list.map(n => { const pt = byName.get(n); return `- **${n}**${pt ? `（${pt.type}）` : ''}`; }), ``] : []),
      ...(d.tip ? [`> 💡 ${d.tip}`, ``] : [])])].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = `${p.name}.md`;
  a.click();
  toast('已导出 Markdown');
}

$app.addEventListener('click', e => {
  const open = e.target.closest('[data-open]');
  if (open && !e.target.closest('[data-del],[data-export]')) {
    view.mode = 'detail'; view.planId = open.dataset.open; render(); return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    plans = plans.filter(x => x.id !== del.dataset.del);
    persistPlans();
    render(); toast('已删除'); return;
  }
  const exp = e.target.closest('[data-export]');
  if (exp) { const p = plans.find(x => x.id === exp.dataset.export); if (p) exportMd(p); }
});

(async () => {
  const [pts, rts, mt] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/routes.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
    loadAiInfo(),
  ]);
  cache.pts = pts; cache.rts = rts; meta = mt;
  render();
})().catch(err => {
  $app.innerHTML = `<div class="pl-empty">⚠️ 加载失败：${esc(err.message)}</div>`;
});
