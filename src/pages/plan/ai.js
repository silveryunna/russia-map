// PlannerAI：站内通道 + 会话级自定义接入。
// 拆出来的理由：AI 状态（自定义 endpoint / 模型 / 配额）与生成请求是一个整体，
// 但页面只关心「能不能用、按钮叫什么、发一次生成」。这里用工厂 + 依赖注入，
// 于是 node 里可以不碰 localStorage / fetch 就把请求体、鉴权头、错误分支全测掉。
// 契约由 tools/test-plan-ai.mjs 守护。

export const AI_MODEL_KEY = 'planner-ai-model';
export const LEGACY_AI_KEY = 'planner-ai-config';
export const SITE_PLAN_ENDPOINT = './api/index.php?a=plan';
export const SITE_POLICY_ENDPOINT = './api/index.php?a=ai_policy';
// 失败重试上限（不含首次请求）与指数退避基数：1s → 2s，重试共用同一个 idem，服务端据此防双计费
export const AI_MAX_RETRIES = 2;
export const AI_RETRY_BASE_MS = 1000;

function newIdem() {
  const uuid = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `a${Date.now().toString(36)}-${String(uuid).replace(/[^\w-]/g, '').slice(0, 12)}`;
}

/** localStorage 在隐私模式下会抛错，取不到就退化为内存态（本次会话仍可用）。 */
function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__ai_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {Storage|null} [options.storage] 注入点（测试用）
 * @param {Function|null} [options.fetchImpl]
 * @param {(msg: string) => void} [options.toast]
 * @param {boolean} [options.readLegacy] 是否执行旧版配置的一次性清理（默认是）
 * @param {(ms: number) => Promise<void>} [options.sleep] 退避注入点（测试免等待）
 * @param {number} [options.maxRetries]
 * @param {number} [options.retryBaseMs]
 */
export function createAIClient({
  storage = safeStorage(),
  fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
  toast = () => {},
  readLegacy = true,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = AI_MAX_RETRIES,
  retryBaseMs = AI_RETRY_BASE_MS,
} = {}) {
  const read = (k) => {
    try { return storage ? storage.getItem(k) : null; } catch { return null; }
  };
  const write = (k, v) => {
    try { if (storage) storage.setItem(k, v); } catch { /* 存不下不影响本次会话 */ }
  };
  const remove = (k) => {
    try { if (storage) storage.removeItem(k); } catch { /* 同上 */ }
  };

  /** 登录态 token：朋友页或管理页写入，AI 走站内通道时作为 Bearer 使用。 */
  const siteToken = () => read('friend-token') || read('admin-token') || '';

  let session = {}; // 高级设置：仅本次会话生效，不落盘（密钥不进 localStorage）
  let info = null;  // ?a=ai_policy：配额 / 可选模型 / 是否有个人接入
  let model = read(AI_MODEL_KEY) || '';

  // 旧版把自定义 Key 存在 localStorage；现在改为会话级，读到就清掉并提示一次。
  if (readLegacy) {
    try {
      const old = JSON.parse(read(LEGACY_AI_KEY) || 'null');
      if (old && (old.endpoint || old.key || old.model)) {
        session = { endpoint: old.endpoint, key: old.key, model: old.model };
        remove(LEGACY_AI_KEY);
        setTimeout(() => toast('旧版 AI 配置已改为本次会话有效；长期接入请在朋友页「我的 AI 接入」保存'), 800);
      }
    } catch { /* 忽略损坏的旧配置 */ }
  }

  async function loadInfo() {
    // 未登录也要能显示额度：ai_policy GET 公开，匿名请求拿到的是 IP 维度剩余次数
    if (!fetchImpl) { info = null; return null; }
    try {
      const token = siteToken();
      const r = await fetchImpl(SITE_POLICY_ENDPOINT, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      const j = await r.json().catch(() => ({}));
      info = r.ok && !j.error ? j : null;
      if (info && Array.isArray(info.models) && info.models.length && !info.models.includes(model)) {
        model = info.models[0];
        write(AI_MODEL_KEY, model); // 存下来，下次打开表单时下拉框与请求体保持一致
      }
    } catch {
      info = null;
    }
    return info;
  }

  /** 统一的额度文案：生成前就告诉用户还剩几次，接近上限标红。 */
  function quotaHint() {
    if (!info) return null;
    if (info.has_custom) return { text: '已接入你自己的 AI（不占用本站次数）', warn: false };
    const q = Number(info.quota);
    const rem = Number(info.remaining_today);
    const ip = info.ip_limit && Number.isFinite(Number(info.ip_limit.remaining)) ? info.ip_limit : null;
    const parts = [];
    if (Number.isFinite(q) && Number.isFinite(rem)) {
      parts.push(`${info.anonymous ? '今日剩余（按 IP）' : '今日剩余'} ${rem}/${q} 次`);
    }
    if (!info.anonymous && ip) parts.push(`本 IP ${ip.remaining}/${ip.max} 次`);
    if (!parts.length) return null;
    const nearQuota = Number.isFinite(q) && Number.isFinite(rem) && rem <= Math.max(1, Math.floor(q * 0.2));
    const nearIp = !!ip && Number(ip.remaining) <= 1;
    return { text: parts.join(' · '), warn: nearQuota || nearIp };
  }

  async function generate(params, context) {
    if (!fetchImpl) throw new Error('当前环境不支持网络请求');
    const endpoint = session.endpoint || SITE_PLAN_ENDPOINT;
    const key = session.key || siteToken();
    const onSite = !session.endpoint;
    // 同一次生成的所有重试共用 idem：服务端重放已存结果，不再调用模型、不重复计费/计数
    const idem = onSite ? newIdem() : '';
    const body = { params, context };
    const m = session.model || model;
    if (m) body.model = m;
    if (idem) body.idem = idem;
    let lastErr = null;
    let attempts = 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts++;
      try {
        const resp = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const e = new Error(data.error || `AI 接口 ${resp.status}`);
          e.status = resp.status;
          // 只有网络错误与 5xx/408 值得重试；429（配额/并发）与 4xx 立即失败，避免白烧次数
          e.retryable = resp.status >= 500 || resp.status === 408;
          throw e;
        }
        const plan = data.plan || data;
        if (!plan || !Array.isArray(plan.days)) {
          const e = new Error('AI 返回格式不符');
          e.retryable = false;
          throw e;
        }
        if (typeof data.remaining === 'number' && info) info.remaining_today = data.remaining;
        if (data.ip_limit && info) info.ip_limit = data.ip_limit;
        return {
          ...plan,
          id: `p${Date.now().toString(36)}`,
          name: plan.name || `${params.city}行程`,
          city: params.city,
          date: params.date,
          source: 'ai',
          channel: session.endpoint ? 'custom' : 'site',
          model: data.model || m || '',
          createdAt: Date.now(),
        };
      } catch (e) {
        lastErr = e;
        const retryable = e && e.retryable !== undefined ? e.retryable : (e && e.status === undefined);
        if (!retryable || attempt >= maxRetries) break;
        await sleep(retryBaseMs * Math.pow(2, attempt));
      }
    }
    const msg = (lastErr && lastErr.message) || 'AI 生成失败';
    const retried = attempts - 1;
    throw new Error(retried > 0 ? `${msg}（已自动重试 ${retried} 次仍失败，请稍后再试或改用离线规则）` : msg);
  }

  return {
    siteToken,
    get session() { return session; },
    set session(next) { session = next && typeof next === 'object' ? next : {}; },
    get info() { return info; },
    get model() { return model; },
    setModel(next) {
      model = next || '';
      write(AI_MODEL_KEY, model);
    },
    /** 站内通道可用，或本次会话已配置自定义 endpoint。 */
    get ready() { return !!siteToken() || !!session.endpoint; },
    loadInfo,
    generate,
    quotaHint,
    /** 生成按钮文案：把「为什么点不了」直接写在按钮上，而不是失败后才解释。 */
    buttonLabel() {
      if (session.endpoint) return '✨ AI 生成（自定义接口）';
      if (!siteToken()) return '✨ AI 生成（需登录）';
      if (info && !info.has_custom && !info.site_enabled) return '✨ AI 生成（站内通道停用）';
      return '✨ AI 生成';
    },
  };
}
