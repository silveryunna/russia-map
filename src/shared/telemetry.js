// 埋点骨架（P0/W1）：第一方、最小、可关闭、不含 PII。
// 约束见 docs/PLATFORM-STRATEGY-2026-11.md §7.7 与 §10.3，实现上必须满足：
//   1. 只接受白名单事件 + 白名单属性，其余一律丢弃（隐私靠结构保证，不靠调用方自觉）
//   2. 先写本地环形缓冲；满 flushAt 条或页面隐藏时批量上报
//   3. 没有配置上报端点时只在本地留证，不发任何请求
//   4. 用户关闭后立即清空缓冲，track() 直接返回 false
//   5. 不采集 IP / 精确坐标 / 设备指纹，不引入任何第三方 SDK
//
// 本模块目前只被 __tests__ 使用，尚未在页面里初始化；接入时用：
//   const t = createTelemetry({ endpoint: '/api/telemetry' });
//   installAutoFlush(t);
//   t.track('page_view', { page: 'plan' });

export const EVENT_PROPS = Object.freeze({
  page_view: ['page'],
  city_viewed: ['city'],
  trip_generated: ['city', 'days', 'engine', 'itemCount'],
  capsule_exported: ['format', 'bytes', 'days'],
  share_created: ['visibility'],
  share_viewed: ['referrer'],
  guest_joined: ['role'],
  item_completed: ['delayMinutes', 'source'],
  verification_done: ['field', 'result'],
  mcp_called: ['tool'],
});

export const EVENT_NAMES = Object.freeze(Object.keys(EVENT_PROPS));
export const BUFFER_KEY = 'travel-telemetry-v1';
export const OPT_OUT_KEY = 'travel-telemetry-off';
export const MAX_BUFFER = 200;
export const FLUSH_AT = 20;
const MAX_STRING = 64;

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isScalar = (v) =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/** 白名单过滤。未知事件返回 null；属性只保留该事件声明过的标量字段。 */
export function sanitizeEvent(name, props) {
  if (!has(EVENT_PROPS, name)) return null;
  const out = {};
  if (props && typeof props === 'object') {
    for (const key of EVENT_PROPS[name]) {
      if (!has(props, key)) continue;
      const v = props[key];
      if (!isScalar(v)) continue; // 对象/数组/函数/NaN/Infinity 一律丢弃
      out[key] = typeof v === 'string' ? v.slice(0, MAX_STRING) : v;
    }
  }
  return { n: name, p: out };
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__telemetry_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null; // Safari 隐私模式等：宁可不记，也不抛给业务代码
  }
}

/**
 * 创建一个埋点实例。
 * @param {object} [options]
 * @param {Storage|null} [options.storage] 注入点（测试用）
 * @param {() => number} [options.now]
 * @param {string} [options.endpoint] 为空表示只写本地缓冲、不发送
 * @param {Function|null} [options.fetchImpl]
 * @param {number} [options.maxBuffer]
 * @param {number} [options.flushAt]
 */
export function createTelemetry({
  storage = defaultStorage(),
  now = () => Date.now(),
  endpoint = '',
  fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
  maxBuffer = MAX_BUFFER,
  flushAt = FLUSH_AT,
} = {}) {
  const readBuffer = () => {
    if (!storage) return [];
    try {
      const raw = storage.getItem(BUFFER_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const writeBuffer = (arr) => {
    if (!storage) return;
    try {
      storage.setItem(BUFFER_KEY, JSON.stringify(arr));
    } catch {
      /* 配额满/被禁用：放弃持久化，不阻断业务 */
    }
  };

  const isEnabled = () => {
    if (!storage) return false;
    try {
      return storage.getItem(OPT_OUT_KEY) !== '1';
    } catch {
      return false;
    }
  };

  function setEnabled(on) {
    if (!storage) return false;
    try {
      if (on) {
        storage.removeItem(OPT_OUT_KEY);
      } else {
        storage.setItem(OPT_OUT_KEY, '1');
        storage.removeItem(BUFFER_KEY);
      }
      return true;
    } catch {
      return false;
    }
  }

  function track(name, props) {
    if (!isEnabled()) return false;
    const ev = sanitizeEvent(name, props);
    if (!ev) return false;
    const buf = readBuffer();
    buf.push({ ...ev, t: now() });
    const trimmed = buf.length > maxBuffer ? buf.slice(buf.length - maxBuffer) : buf;
    writeBuffer(trimmed);
    if (trimmed.length >= flushAt) void flushNow();
    return true;
  }

  async function flushNow() {
    const buf = readBuffer();
    if (!buf.length) return { sent: 0, ok: true };
    if (!endpoint || !fetchImpl) return { sent: 0, ok: false, skipped: 'no-endpoint' };
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v: 1, events: buf }),
        keepalive: true,
        credentials: 'omit',
      });
      if (!res || !res.ok) return { sent: 0, ok: false, status: res ? res.status : 0 };
      // 只移除已发送的那一段：发送期间新增的事件必须保留
      const rest = readBuffer();
      writeBuffer(rest.length >= buf.length ? rest.slice(buf.length) : []);
      return { sent: buf.length, ok: true };
    } catch {
      return { sent: 0, ok: false };
    }
  }

  return {
    track,
    flush: flushNow,
    setEnabled,
    isEnabled,
    pending: () => readBuffer().length,
    snapshot: () => readBuffer(),
    endpoint,
  };
}

/** 页面隐藏/离开时冲刷缓冲；返回卸载函数。 */
export function installAutoFlush(telemetry, target = globalThis) {
  if (!telemetry || !target || typeof target.addEventListener !== 'function') return () => {};
  const onHide = () => { void telemetry.flush(); };
  const onVisibility = () => {
    const doc = target.document;
    if (doc && doc.visibilityState === 'hidden') void telemetry.flush();
  };
  const doc = target.document;
  target.addEventListener('pagehide', onHide);
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    if (typeof target.removeEventListener === 'function') target.removeEventListener('pagehide', onHide);
    if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
  };
}
