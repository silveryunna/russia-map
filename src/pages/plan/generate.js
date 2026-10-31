// 新建行程：表单渲染 + 规则引擎 / AI 生成 + 生成结果落库。
// 与 plan.js 的分工：这里只管"从表单到落库"，不碰列表与编辑器渲染。
// ctx 约定：app/view/meta/cache/ai/store/toast/render/refreshTrips/esc/
//           current(setter)/resetUndo/isGenerating()/setGenerating()

import { INTERESTS, PLAN_DAYS_MAX, clampDays, ruleEngine } from './engine.js';
import { createChangeEvent } from '../trip/schema.js';
import { countNeedsConfirm } from '../trip/edit.js';
import { migratePlansV1 } from '../trip/migrate.js';
import { sourceLabel } from './format.js';

export function renderCreateForm(ctx) {
  const { app, view, meta, esc, ai, toast, render } = ctx;
  const f = view.form;

  app.innerHTML = `
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
        <button class="pl-btn big" id="pl-gen-ai">${ai.buttonLabel()}</button>
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
      ${ai.info ? `<div class="pl-label">${ai.info.has_custom ? '已接入你自己的 AI（不占用本站次数）' : `今日剩余 ${ai.info.remaining_today}/${ai.info.quota} 次`}</div>` : ''}
      ${ai.info && !ai.info.has_custom && ai.info.models && ai.info.models.length ? `
      <label>AI 模型
        <select id="pl-model">${ai.info.models.map(m => `<option ${m === ai.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      </label>` : ''}
      <button class="pl-ai-toggle" id="pl-ai-cfg">高级：自定义接口${ai.session.endpoint ? '（本次会话已启用 ✓）' : ''}</button>
      ${view.showAI ? `
      <div class="pl-ai-box">
        <label>Endpoint（https）<input id="ai-endpoint" placeholder="https://api.example.com/v1/chat/completions" value="${esc(ai.session.endpoint || '')}"></label>
        <label>API Key（可选）<input id="ai-key" type="password" placeholder="sk-..." value="${esc(ai.session.key || '')}"></label>
        <label>模型名（可选）<input id="ai-model" placeholder="deepseek-v4-pro ..." value="${esc(ai.session.model || '')}"></label>
        <div class="pl-ai-note">仅本次会话有效，密钥不再存入浏览器。长期接入请到 <a href="./friend.html">朋友页</a> 登录后在「我的 AI 接入」保存（随账号存放于服务器）。</div>
        <button class="pl-btn small" id="ai-save">本次会话生效</button>
        <button class="pl-btn small" id="ai-clear">清除覆盖</button>
      </div>` : ''}
    </div>`;

  document.getElementById('pl-back').onclick = () => { view.mode = 'list'; render(); };
  app.onclick = null;
  app.onchange = null;
  document.getElementById('pl-city').onchange = e => { f.city = e.target.value; };
  document.getElementById('pl-date').onchange = e => { f.date = e.target.value; };
  document.getElementById('pl-days').onchange = e => { f.days = clampDays(e.target.value); e.target.value = f.days; };
  const modelSel = document.getElementById('pl-model');
  if (modelSel) modelSel.onchange = e => { ai.setModel(e.target.value); };
  app.querySelectorAll('[data-int]').forEach(b => b.onclick = () => {
    const k = b.dataset.int;
    f.interests = f.interests.includes(k) ? f.interests.filter(x => x !== k) : [...f.interests, k];
    render();
  });
  document.getElementById('pl-ai-cfg').onclick = () => { view.showAI = !view.showAI; render(); };
  const saveAI = document.getElementById('ai-save');
  if (saveAI) saveAI.onclick = () => {
    ai.session = {
      endpoint: document.getElementById('ai-endpoint').value.trim(),
      key: document.getElementById('ai-key').value.trim(),
      model: document.getElementById('ai-model').value.trim(),
    };
    toast(ai.session.endpoint ? '自定义接口已启用（本次会话）' : '已保存');
    render();
  };
  const clearAI = document.getElementById('ai-clear');
  if (clearAI) clearAI.onclick = () => { ai.session = {}; toast('已清除自定义覆盖'); render(); };
  document.getElementById('pl-gen-rule').onclick = () => runGenerate(ctx, 'rule');
  document.getElementById('pl-gen-ai').onclick = () => runGenerate(ctx, 'ai');
  const retry = document.getElementById('ai-retry');
  if (retry) retry.onclick = () => { view.aiError = ''; render(); runGenerate(ctx, 'ai'); };
  const fallback = document.getElementById('ai-fallback');
  if (fallback) fallback.onclick = () => { view.aiError = ''; render(); runGenerate(ctx, 'rule'); };
  const cancel = document.getElementById('ai-cancel');
  if (cancel) cancel.onclick = () => { view.aiError = ''; render(); };
}

export async function runGenerate(ctx, src) {
  const { view, cache, ai, store, toast, render, refreshTrips } = ctx;
  const f = view.form;
  if (!f.city) return toast('请选择目的地');
  if (ctx.isGenerating()) return;
  if (src === 'ai' && !f.date) return toast('AI 生成需要出发日期，请先选择日期（也可以留空用离线规则生成无日期行程）');
  // AI 不可用时不再静默降级：交给用户决定重试 / 用规则 / 取消，生成结果永远标注来源
  if (src === 'ai' && !ai.ready) {
    view.aiError = '未登录或未配置 AI 接口';
    render();
    return;
  }
  ctx.setGenerating(true);
  const btn = document.getElementById('pl-gen-ai');
  if (btn && src === 'ai') { btn.disabled = true; btn.textContent = '✨ 生成中（约 30-60 秒）…'; }
  toast('生成中…');
  try {
    const plan = src === 'ai'
      ? await ai.generate(f, {
          points: cache.pts.filter(p => p.city === f.city),
          routes: cache.rts.filter(r => r.city === f.city),
        })
      : ruleEngine(f, { pts: cache.pts, rts: cache.rts, matrix: cache.matrix });
    if (!Array.isArray(plan.interests)) plan.interests = Array.isArray(f.interests) ? f.interests : [];
    const mig = migratePlansV1({ plans: [plan], points: cache.pts });
    const trip = mig.trips[0];
    if (!trip || !trip.days.length) {
      ctx.setGenerating(false);
      toast('没有可用点位，试试减少天数或换城市');
      render();
      return;
    }
    const saved = await store.saveTrip(trip);
    ctx.setGenerating(false);
    if (!saved.ok) { toast('保存失败：' + (saved.errors[0] || {}).message); render(); return; }
    await refreshTrips();
    ctx.current = saved.trip;
    ctx.resetUndo();
    try {
      await store.saveEvent(createChangeEvent({
        tripId: ctx.current.id, at: Date.now(), kind: 'generate',
        summary: `生成行程（${sourceLabel(ctx.current)}）`,
      }));
    } catch { /* 日志失败不影响生成 */ }
    view.mode = 'editor';
    view.sel = null;
    render();
    const pending = countNeedsConfirm(ctx.current);
    toast(`行程已生成（${sourceLabel(ctx.current)}）${pending ? ` · ${pending} 个点位待确认` : ''}`);
    if (plan.note) setTimeout(() => toast(plan.note), 600);
  } catch (err) {
    ctx.setGenerating(false);
    view.aiError = err.message;
    render();
  }
}
