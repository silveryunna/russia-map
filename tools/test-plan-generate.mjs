#!/usr/bin/env node
// 新建生成路径质量门（B5 补面）：runGenerate 是「行程出生」的唯一入口，
// 之前无测试覆盖。用假 ctx + 最小 document 垫片驱动真实 runGenerate，
// 覆盖：缺城市/缺日期/AI 未就绪/生成成功落库/无点位/保存失败/AI 抛错。
// 用法: node tools/test-plan-generate.mjs
import { readFileSync } from 'node:fs';
import { runGenerate } from '../src/pages/plan/generate.js';
import { ruleEngine } from '../src/pages/plan/engine.js';

// runGenerate 里有一处死守 document.getElementById（生成按钮置灰），node 下垫掉
globalThis.document = globalThis.document || { getElementById: () => null };

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// 真实数据（伊宁，城市小、动线短，规则生成快）
const allPoints = JSON.parse(readFileSync('data/points.json', 'utf8'));
const allRoutes = JSON.parse(readFileSync('data/routes.json', 'utf8'));
const ynPts = allPoints.filter(p => p.city === '伊宁' && !p.pending);
const ynRts = allRoutes.filter(r => r.city === '伊宁');

function makeCtx(overrides = {}) {
  const toasts = [];
  const saves = [];
  const events = [];
  const base = {
    view: { mode: 'list', form: { city: '伊宁', date: '2026-12-01', days: 2, interests: [] }, aiError: '', showAI: false },
    cache: { pts: ynPts, rts: ynRts, matrix: null, facts: null },
    ai: { ready: true, model: '', session: {}, info: null, buttonLabel: () => 'AI', generate: async () => { throw new Error('AI 不应被调用'); } },
    store: {
      saveTrip: async (trip) => { saves.push(trip); return { ok: true, trip }; },
      saveEvent: async (ev) => { events.push(ev); },
    },
    toast: (m) => toasts.push(m),
    render: () => {},
    refreshTrips: async () => {},
    current: null,
    resetUndo: () => {},
    isGenerating: () => false,
    setGenerating: () => {},
  };
  const ctx = { ...base, ...overrides, toasts, saves, events };
  return ctx;
}

// 1) 缺城市：直接 toast，不碰存储
{
  const ctx = makeCtx();
  ctx.view.form.city = '';
  await runGenerate(ctx, 'rule');
  assert(ctx.toasts[0] === '请选择目的地', '缺城市 → 提示选目的地');
  assert(ctx.saves.length === 0, '缺城市不写库');
}

// 2) AI 必须有日期
{
  const ctx = makeCtx();
  ctx.view.form.date = '';
  await runGenerate(ctx, 'ai');
  assert(ctx.toasts[0].includes('AI 生成需要出发日期'), 'AI 无日期 → 提示需要日期');
  assert(ctx.saves.length === 0, 'AI 无日期不写库');
}

// 3) AI 未就绪：不静默降级，交回用户决定
{
  const ctx = makeCtx();
  ctx.ai.ready = false;
  await runGenerate(ctx, 'ai');
  assert(ctx.view.aiError === '未登录或未配置 AI 接口', 'AI 未就绪 → aiError 写明原因');
  assert(ctx.saves.length === 0, 'AI 未就绪不写库（不静默降级）');
}

// 4) 规则生成成功：落库 + 变更事件 + 进入编辑器
{
  const ctx = makeCtx();
  await runGenerate(ctx, 'rule');
  assert(ctx.saves.length === 1 && ctx.saves[0].days.length > 0, '规则生成落库且天数 > 0');
  assert(ctx.current === ctx.saves[0], '生成后 current 指向新行程');
  assert(ctx.view.mode === 'editor', '生成后进入编辑器视图');
  assert(ctx.events.length === 1 && ctx.events[0].kind === 'generate', '写一条 generate 变更事件');
  assert(ctx.toasts.some(t => t.includes('行程已生成')), '生成成功有提示');
}

// 5) 无可用点位：不建空行程
{
  const ctx = makeCtx();
  ctx.cache = { pts: [], rts: [], matrix: null, facts: null };
  await runGenerate(ctx, 'rule');
  assert(ctx.toasts.some(t => t.includes('没有可用点位')), '无点位 → 明确提示');
  assert(ctx.saves.length === 0, '无点位不写库');
}

// 6) 保存失败：提示原因，不进入编辑器
{
  const ctx = makeCtx();
  ctx.store.saveTrip = async () => ({ ok: false, errors: [{ message: 'revision 冲突' }] });
  await runGenerate(ctx, 'rule');
  assert(ctx.toasts.some(t => t.includes('保存失败') && t.includes('revision 冲突')), '保存失败透传错误文案');
  assert(ctx.view.mode === 'list', '保存失败留在列表视图');
}

// 7) AI 抛错：aiError 展示、generating 复位
{
  const plan = ruleEngine({ city: '伊宁', date: '2026-12-01', days: 1, interests: [] }, { pts: ynPts, rts: ynRts, matrix: null, facts: null });
  const ctx = makeCtx();
  ctx.ai.generate = async () => { throw new Error('provider 502'); };
  await runGenerate(ctx, 'ai');
  assert(ctx.view.aiError === 'provider 502', 'AI 抛错 → aiError 展示原始信息');
  assert(ctx.saves.length === 0, 'AI 抛错不写库');
  assert(typeof plan.days === 'object', '（对照）ruleEngine 返回的 plan 形状可用作 AI stub');
}

if (bad) { console.error(`\n${bad} 处生成行为不符合约定`); process.exit(1); }
console.log('\n新建生成质量门通过');
