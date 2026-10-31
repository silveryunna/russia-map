#!/usr/bin/env node
// PlannerAI 质量门（W2 拆分后新增）
// 以前这段逻辑埋在 plan.js 里，只能靠人肉点"生成"验证；拆成工厂后可以在这里
// 把鉴权头、请求体、模型覆盖、错误分支、配额回写全部断言掉。
// 用法: node tools/test-plan-ai.mjs
import { createAIClient, AI_MODEL_KEY, LEGACY_AI_KEY, SITE_PLAN_ENDPOINT } from '../src/pages/plan/ai.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map),
  };
}

const jsonResp = (body, { ok = true, status = 200 } = {}) => ({
  ok, status,
  json: async () => body,
});

const planBody = {
  plan: { days: [{ day: 1, slots: { morning: ['红场'], afternoon: [], evening: [] } }] },
  model: 'server-model',
  remaining: 4,
};

// 1) 登录态与可用性
{
  const none = createAIClient({ storage: memStorage(), readLegacy: false });
  assert(none.siteToken() === '', '无 token 时 siteToken 为空串');
  assert(none.ready === false, '无 token 且无自定义接口 → 不可用');
  assert(none.buttonLabel() === '✨ AI 生成（需登录）', '未登录时按钮写明需要登录');

  const friend = createAIClient({ storage: memStorage({ 'friend-token': 'f1' }), readLegacy: false });
  assert(friend.siteToken() === 'f1', '朋友页 token 生效');
  assert(friend.ready === true, '有 token → 可用');

  const both = createAIClient({
    storage: memStorage({ 'friend-token': 'f1', 'admin-token': 'a1' }), readLegacy: false,
  });
  assert(both.siteToken() === 'f1', '朋友 token 优先于管理 token');
}

// 2) 自定义接入覆盖按钮文案与可用性
{
  const custom = createAIClient({ storage: memStorage(), readLegacy: false });
  custom.session = { endpoint: 'https://api.example.com/v1/chat' };
  assert(custom.ready === true, '自定义 endpoint 让未登录用户也能用');
  assert(custom.buttonLabel() === '✨ AI 生成（自定义接口）', '自定义接口时按钮标注来源');
}

// 3) 站点策略：站内通道停用
{
  const calls = [];
  const c = createAIClient({
    storage: memStorage({ 'friend-token': 't' }),
    readLegacy: false,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResp({ site_enabled: false, has_custom: false, models: [] }); },
  });
  const info = await c.loadInfo();
  assert(info && info.site_enabled === false, '策略信息被保存');
  assert(calls.length === 1 && calls[0].init.headers.Authorization === 'Bearer t', '策略请求带 Bearer token');
  assert(c.buttonLabel() === '✨ AI 生成（站内通道停用）', '通道停用写在按钮上，不静默降级');
}

// 4) loadInfo 失败与无 token
{
  const noToken = createAIClient({ storage: memStorage(), readLegacy: false, fetchImpl: async () => { throw new Error('should not call'); } });
  assert(await noToken.loadInfo() === null, '无 token 时不请求策略接口');
  const broken = createAIClient({
    storage: memStorage({ 'friend-token': 't' }),
    readLegacy: false,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert(await broken.loadInfo() === null, '策略接口断网返回 null 而不抛错');
  assert(broken.ready === true, '策略失败不影响站内通道可用性判断');
}

// 5) 模型列表回填：当前模型不在列表里就切到第一个
{
  const storage = memStorage({ 'friend-token': 't', [AI_MODEL_KEY]: 'ghost-model' });
  const c = createAIClient({ storage, readLegacy: false, fetchImpl: async () => jsonResp({ models: ['m1', 'm2'] }) });
  await c.loadInfo();
  assert(c.model === 'm1', '模型不在服务端列表时回落到第一个');
  assert(storage.getItem(AI_MODEL_KEY) === 'm1', '回落的模型写回本地存储');

  const keep = createAIClient({
    storage: memStorage({ 'friend-token': 't', [AI_MODEL_KEY]: 'm2' }),
    readLegacy: false,
    fetchImpl: async () => jsonResp({ models: ['m1', 'm2'] }),
  });
  await keep.loadInfo();
  assert(keep.model === 'm2', '当前模型仍在列表里就不改动');
}

// 6) generate：站内通道默认请求形态
{
  const calls = [];
  const c = createAIClient({
    storage: memStorage({ 'friend-token': 't', [AI_MODEL_KEY]: 'm2' }),
    readLegacy: false,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResp(planBody); },
  });
  const plan = await c.generate({ city: '莫斯科', date: '2026-11-01' }, { points: [], routes: [] });
  assert(calls[0].url === SITE_PLAN_ENDPOINT, '默认走站内通道 endpoint');
  assert(calls[0].init.method === 'POST', '用 POST');
  assert(calls[0].init.headers.Authorization === 'Bearer t', '站内通道用登录 token 鉴权');
  const body = JSON.parse(calls[0].init.body);
  assert(body.params.city === '莫斯科' && Array.isArray(body.context.points), '请求体包含 params 与 context');
  assert(body.model === 'm2', '带上选中的模型');
  assert(plan.source === 'ai' && plan.channel === 'site', '结果标注 AI / 站内通道');
  assert(plan.model === 'server-model', '优先使用服务端回报的模型名');
  assert(plan.city === '莫斯科' && plan.date === '2026-11-01', '城市与日期写回计划');
  assert(plan.name === '莫斯科行程', '缺名字时按城市生成默认名');
  assert(typeof plan.id === 'string' && plan.id.startsWith('p'), '生成稳定前缀的临时 id');
  assert(typeof plan.createdAt === 'number', '带创建时间');
  assert(plan.days.length === 1, '保留服务端返回的 days');
}

// 7) generate：自定义接口覆盖 endpoint / key / 模型
{
  const calls = [];
  const c = createAIClient({
    storage: memStorage({ 'friend-token': 't' }),
    readLegacy: false,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResp({ days: [] }); },
  });
  c.session = { endpoint: 'https://custom.example/v1/plan', key: 'sk-custom', model: 'my-model' };
  const plan = await c.generate({ city: '三亚' }, {});
  assert(calls[0].url === 'https://custom.example/v1/plan', '自定义 endpoint 生效');
  assert(calls[0].init.headers.Authorization === 'Bearer sk-custom', '自定义 Key 优先于站内 token');
  assert(JSON.parse(calls[0].init.body).model === 'my-model', '会话模型优先于本地存储模型');
  assert(plan.channel === 'custom', '结果标注自定义接口');
  assert(plan.model === 'my-model', '服务端未回报模型时用请求模型');
  assert(plan.title === undefined, '不臆造字段（标题仍是 plan.name）');
}

// 8) generate：错误分支
{
  const mk = (resp) => createAIClient({
    storage: memStorage({ 'friend-token': 't' }), readLegacy: false, fetchImpl: async () => resp,
  });
  const expectThrow = async (client, match, msg) => {
    try { await client.generate({ city: 'x' }, {}); fail(msg + '（没有抛错）'); }
    catch (e) { assert(match.test(e.message), msg); }
  };
  await expectThrow(mk(jsonResp({ error: '配额用完' }, { ok: false, status: 429 })), /配额用完/, '透传服务端错误文案');
  await expectThrow(mk(jsonResp({}, { ok: false, status: 500 })), /AI 接口 500/, '无错误文案时带状态码');
  await expectThrow(mk(jsonResp({ plan: { days: 'nope' } })), /AI 返回格式不符/, 'days 不是数组时报格式错误');
  await expectThrow(mk(jsonResp({})), /AI 返回格式不符/, '空响应报格式错误');
}

// 9) generate：剩余次数回写
{
  const c = createAIClient({
    storage: memStorage({ 'friend-token': 't' }),
    readLegacy: false,
    fetchImpl: async (url) => (url.includes('ai_policy')
      ? jsonResp({ remaining_today: 9, quota: 10, models: [] })
      : jsonResp(planBody)),
  });
  await c.loadInfo();
  assert(c.info.remaining_today === 9, '策略接口给出初始剩余次数');
  await c.generate({ city: '莫斯科' }, {});
  assert(c.info.remaining_today === 4, '生成后用服务端 remaining 回写剩余次数');
}

// 10) 旧版配置：读到就搬到会话并清掉存储
{
  const storage = memStorage({ [LEGACY_AI_KEY]: JSON.stringify({ endpoint: 'https://old.example', key: 'old-key', model: 'old-model' }) });
  const toasts = [];
  const c = createAIClient({ storage, fetchImpl: null, toast: (m) => toasts.push(m) });
  assert(c.session.endpoint === 'https://old.example' && c.session.key === 'old-key', '旧配置搬进本次会话');
  assert(storage.getItem(LEGACY_AI_KEY) === null, '旧配置从 localStorage 删除（密钥不再落盘）');
  await new Promise(r => setTimeout(r, 900));
  assert(toasts.length === 1 && toasts[0].includes('本次会话有效'), '提示用户配置只在本次会话有效');
}

// 11) 损坏的旧配置不影响启动
{
  const storage = memStorage({ [LEGACY_AI_KEY]: '{broken' });
  const c = createAIClient({ storage });
  assert(JSON.stringify(c.session) === '{}', '旧配置损坏时静默忽略');
}

// 12) 没有 fetch 实现时不抛同步异常
{
  const c = createAIClient({ storage: memStorage({ 'friend-token': 't' }), readLegacy: false, fetchImpl: null });
  try { await c.generate({ city: 'x' }, {}); fail('无网络实现时应当抛错'); }
  catch (e) { assert(/不支持网络请求/.test(e.message), '无网络实现时给出明确错误'); }
}

if (bad) { console.error(`\n${bad} 处 AI 客户端行为不符合约定`); process.exit(1); }
console.log('\nPlannerAI 质量门通过');
