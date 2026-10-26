// 日程计划 v2：规则引擎离线生成 + TokenHub AI（站内通道，api/index.php?a=plan 代理）
// 默认走站内接口，Bearer 用本站登录 token（friend-token / admin-token）；Key 只在服务器侧
// 高级设置可会话级覆盖 endpoint/key（不落盘）；长期自定义接入在 friend.html「我的 AI 接入」保存
// 协议：POST {endpoint, headers:{Authorization:Bearer key}, body:{model?, params:{city,date,days,interests}, context:{points,routes}}}
// 期望返回：{plan:{name,days:[{day,slots:{morning:[],afternoon:[],evening:[]},tip}]}, remaining?, model?}
import './base-BJw1lW7I.js';

const $app = document.getElementById('plan-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS_PLANS = 'travel-plans-v1';
const LS_AI = 'planner-ai-config';

let points = [], routes = [], meta = { cities: [], cityColors: {} };
let plans = JSON.parse(localStorage.getItem(LS_PLANS) || '[]');
let view = { mode: 'list', planId: null, form: null, showAI: false };
let cache = { pts: null, rts: null };

/* ---------- 数据 ---------- */
async function loadData(force) {
  if (!cache.pts || force) {
    [cache.pts, cache.rts] = await Promise.all([
      fetch('./data/points.json').then(r => r.json()),
      fetch('./data/routes.json').then(r => r.json()),
    ]);
  }
  return cache;
}

/* ---------- 兴趣标签 ---------- */
const INTERESTS = {
  '建筑': /建筑|构成主义|斯大林|现代主义|粗野|先锋派|新艺术|折衷|古典主义|摩天|工业遗产/,
  '美食': /餐厅|咖啡|食堂|小吃|甜品|酒吧|美食|饮品|冰淇淋|下午茶|大排档|自助|火锅/,
  '博物馆': /博物馆|美术馆|展览|画廊/,
  '自然': /海湾|公园|湖泊|雨林|峡谷|海岛|沙滩|森林|冰川|温泉|湿地|草原/,
  '摄影': /拍照|摄影|观景|登顶|全景|机位|出片|扫街/,
  '地铁': /地铁站|火车站|交通|口岸|机场/,
  '文学': /文学|故居|书店|诗人|作家|纪念雕像/,
  '购物': /商场|市场|免税|巴扎|市集|步行街/,
};
function interestHits(p) {
  const t = `${p.type} ${p.cluster} ${p.highlight || ''} ${(p.tags || []).join(' ')}`;
  return Object.keys(INTERESTS).filter(k => INTERESTS[k].test(t));
}

/* ---------- 规则引擎 ---------- */
function ruleEngine(params) {
  const cityPts = cache.pts.filter(p => !p.pending && p.city === params.city);
  let pool = cityPts;
  if (params.interests.length) {
    const hit = cityPts.filter(p => interestHits(p).some(i => params.interests.includes(i)));
    if (hit.length >= 4) pool = hit; // 兴趣过滤后点位太少则回退全城
  }
  // 优先使用已有动线做骨架
  const cityRoutes = cache.rts.filter(r => r.city === params.city);
  const byName = new Map(cache.pts.map(p => [p.name, p]));
  const used = new Set();
  const days = [];
  const pick = list => list.filter(p => !used.has(p.id));

  // 动线映射为日
  for (const r of cityRoutes.slice(0, params.days)) {
    const ids = r.steps.map(s => s.point).filter(Boolean).map(n => byName.get(n)).filter(Boolean);
    ids.forEach(p => used.add(p.id));
    days.push(mkDay(days.length + 1, distribute(ids), `参考动线：${r.name} · ${r.tip || r.summary || ''}`));
  }
  // 剩余点位按点位群聚类补齐
  const rest = pick(pool);
  const byCluster = new Map();
  for (const p of rest) {
    const key = p.cluster;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key).push(p);
  }
  const clusters = [...byCluster.values()].sort((a, b) => b.length - a.length);
  const PER_DAY = 6;
  let ci = 0;
  while (days.length < params.days && ci < clusters.length) {
    const dayPts = [];
    while (dayPts.length < PER_DAY && ci < clusters.length) dayPts.push(...clusters[ci++]);
    dayPts.forEach(p => used.add(p.id));
    days.push(mkDay(days.length + 1, distribute(dayPts), ''));
  }
  // 若动线+聚类仍不足天数，重复轮换补充（小城市）
  while (days.length < params.days && rest.length) {
    const c = clusters[(days.length * 7) % clusters.length] || rest;
    days.push(mkDay(days.length + 1, distribute(c.slice(0, PER_DAY)), '该城市点位有限，建议放慢节奏或搭配周边城市'));
  }
  return {
    id: 'p' + Date.now().toString(36),
    name: `${params.city}${params.days}日游草案`,
    city: params.city, date: params.date, daysN: days.length,
    source: 'rule', createdAt: Date.now(),
    interests: params.interests, days,
  };
}
function distribute(list) {
  const slots = { morning: [], afternoon: [], evening: [] };
  const food = list.filter(p => /餐厅|咖啡|甜品|酒吧|下午茶|大排档|自助|火锅|食堂|小吃|粥铺/.test(p.type));
  const rest = list.filter(p => !food.includes(p));
  slots.morning = rest.filter((_, i) => i % 2 === 0).slice(0, 3).map(p => p.name);
  slots.afternoon = rest.filter((_, i) => i % 2 === 1).slice(0, 3).map(p => p.name);
  slots.evening = food.slice(0, 2).map(p => p.name);
  const leftover = rest.filter(p => ![...slots.morning, ...slots.afternoon].includes(p.name));
  slots.afternoon.push(...leftover.map(p => p.name));
  return slots;
}
function mkDay(n, slots, tip) {
  return { day: n, slots, tip };
}

/* ---------- PlannerAI（站内通道 + 会话级自定义覆盖） ---------- */
const siteToken = () => localStorage.getItem('friend-token') || localStorage.getItem('admin-token') || '';
let aiSession = {};  // 高级设置：仅本次会话生效，不落盘（密钥不进 localStorage）
let aiInfo = null;   // ?a=ai_policy：配额 / 可选模型 / 是否有个人接入
let aiModel = '';    // 当前选中的模型
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
    return { ...plan, id: 'p' + Date.now().toString(36), city: params.city, date: params.date, source: 'ai', createdAt: Date.now() };
  },
};
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
  document.getElementById('pl-new').onclick = () => { view.mode = 'create'; view.form = { city: meta.cities[0] || '', date: '', days: 3, interests: [] }; render(); };
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
      <label>天数 <input id="pl-days" type="number" min="1" max="14" value="${f.days}"></label>
      <div class="pl-label">兴趣标签（可多选，不选=全城点位）</div>
      <div class="pl-chips">${Object.keys(INTERESTS).map(k => `<button class="chip ${f.interests.includes(k) ? 'on' : ''}" data-int="${k}">${k}</button>`).join('')}</div>
      <div class="pl-gen">
        <button class="pl-btn primary big" id="pl-gen-rule">⚙️ 规则引擎生成（离线）</button>
        <button class="pl-btn big" id="pl-gen-ai">${aiBtnLabel()}</button>
      </div>
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
  document.getElementById('pl-days').onchange = e => f.days = Math.max(1, Math.min(14, +e.target.value || 3));
  const modelSel = document.getElementById('pl-model');
  if (modelSel) modelSel.onchange = e => aiModel = e.target.value;
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
}

async function doGenerate(src) {
  const f = view.form;
  if (!f.city) return toast('请选择目的地');
  if (generating) return;
  if (src === 'ai' && !PlannerAI.ready) {
    toast('未登录，已用规则引擎离线生成（登录后可用 AI）');
    src = 'rule';
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
      : ruleEngine(f);
    plans.unshift(plan);
    localStorage.setItem(LS_PLANS, JSON.stringify(plans));
    view.mode = 'detail'; view.planId = plan.id;
    generating = false;
    render();
    toast('计划已生成 ✓');
    if (plan.note) setTimeout(() => toast(plan.note), 600);
  } catch (err) {
    generating = false;
    toast('AI 生成失败：' + err.message + '，已回退规则引擎');
    const plan = ruleEngine(f);
    plans.unshift(plan);
    localStorage.setItem(LS_PLANS, JSON.stringify(plans));
    view.mode = 'detail'; view.planId = plan.id;
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
    <div class="pl-meta" style="margin:0 0 12px">${esc(p.city)} · ${esc(p.date || '日期待定')} · ${p.days.length} 天 · 来源：${p.source === 'ai' ? 'AI' : '规则引擎'}</div>
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
    localStorage.setItem(LS_PLANS, JSON.stringify(plans));
    view.mode = 'list'; render(); toast('已删除');
  };
}

function exportMd(p) {
  const byName = new Map(cache.pts.map(x => [x.name, x]));
  const md = [`# ${p.name}`, ``, `> ${p.city} · ${p.date || '日期待定'} · 来源：${p.source === 'ai' ? 'AI' : '规则引擎'}`, ``,
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
    localStorage.setItem(LS_PLANS, JSON.stringify(plans));
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
  cache.pts = pts; cache.rts = rts; points = pts; routes = rts; meta = mt;
  render();
})().catch(err => {
  $app.innerHTML = `<div class="pl-empty">⚠️ 加载失败：${esc(err.message)}</div>`;
});
