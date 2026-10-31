#!/usr/bin/env node
// 埋点骨架质量门：白名单、环形缓冲、关闭即清空、批量上报、失败保留
// 口径见 docs/PLATFORM-STRATEGY-2026-11.md §7.7 / §10.3（只采 10 个事件、不含 PII）
// 用法: node tools/test-telemetry.mjs
import {
  EVENT_NAMES,
  MAX_BUFFER,
  OPT_OUT_KEY,
  BUFFER_KEY,
  sanitizeEvent,
  createTelemetry,
  installAutoFlush,
} from '../src/shared/telemetry.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// 1) 事件白名单与属性白名单
{
  assert(EVENT_NAMES.length === 10, '事件总数锁定为 10（§10.3：多一个都不加）');
  const ev = sanitizeEvent('page_view', { page: 'plan', extra: '不该留下', nested: { a: 1 } });
  assert(eq(ev.p, { page: 'plan' }), '未声明的属性被丢弃');
  assert(sanitizeEvent('not_an_event', {}) === null, '未知事件直接拒绝');
  assert(sanitizeEvent('page_view', null).p.page === undefined, '缺属性时产出空属性对象');
}

// 2) 类型与长度约束
{
  const ev = sanitizeEvent('item_completed', { delayMinutes: 12, source: 'auto', bad: [1] });
  assert(ev.p.delayMinutes === 12 && ev.p.source === 'auto', '数字与字符串保留');
  assert(!('bad' in ev.p), '数组属性被丢弃');
  assert(sanitizeEvent('item_completed', { delayMinutes: NaN }).p.delayMinutes === undefined, 'NaN 被丢弃');
  assert(sanitizeEvent('item_completed', { delayMinutes: Infinity }).p.delayMinutes === undefined, 'Infinity 被丢弃');
  const long = 'x'.repeat(200);
  assert(sanitizeEvent('page_view', { page: long }).p.page.length === 64, '字符串截断到 64 字符');
}

// 3) 基本写入 + 缓冲上限（丢最旧）
{
  const storage = fakeStorage();
  const t = createTelemetry({ storage, maxBuffer: 5 });
  for (let i = 1; i <= 8; i++) t.track('page_view', { page: 'p' + i });
  const snap = t.snapshot();
  assert(snap.length === 5, '缓冲按 maxBuffer 截断');
  assert(snap[0].p.page === 'p4' && snap[4].p.page === 'p8', '截断丢弃最旧、保留最新');
  assert(typeof snap[0].t === 'number', '事件带时间戳');
}

// 4) 关闭即清空，且后续 track 直接拒绝
{
  const storage = fakeStorage();
  const t = createTelemetry({ storage });
  t.track('page_view', { page: 'plan' });
  assert(t.pending() === 1, '开启状态下正常入队');
  assert(t.setEnabled(false) === true, '置为关闭成功');
  assert(storage.getItem(OPT_OUT_KEY) === '1', '关闭标记落盘');
  assert(storage.getItem(BUFFER_KEY) === null, '关闭时清空缓冲');
  assert(t.track('page_view', { page: 'map' }) === false, '关闭后 track 返回 false');
  assert(t.pending() === 0, '关闭后队列保持为空');
  t.setEnabled(true);
  assert(t.track('page_view', { page: 'map' }) === true, '重新开启后恢复采集');
}

// 5) 未配置端点：只留本地，不发请求
{
  const storage = fakeStorage();
  let called = 0;
  const t = createTelemetry({ storage, fetchImpl: async () => { called++; return { ok: true }; } });
  t.track('page_view', { page: 'map' });
  const r = await t.flush();
  assert(r.ok === false && r.skipped === 'no-endpoint', '无端点时 flush 明确标记 skipped');
  assert(called === 0, '无端点时不发任何请求');
  assert(t.pending() === 1, '无端点时事件保留在本地');
}

// 6) 有端点：POST 批量上报并清空
{
  const storage = fakeStorage();
  const calls = [];
  const t = createTelemetry({
    storage,
    endpoint: '/api/telemetry',
    flushAt: 999,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 204 }; },
  });
  t.track('trip_generated', { city: '莫斯科', days: 3, engine: 'rule', itemCount: 19 });
  t.track('page_view', { page: 'plan' });
  const r = await t.flush();
  assert(r.ok === true && r.sent === 2, '上报成功并返回条数');
  assert(calls.length === 1 && calls[0].url === '/api/telemetry', '只发一次请求');
  assert(calls[0].init.method === 'POST' && calls[0].init.credentials === 'omit', 'POST 且不带凭证');
  const body = JSON.parse(calls[0].init.body);
  assert(body.v === 1 && body.events.length === 2, '载荷结构为 { v, events[] }');
  assert(body.events[0].n === 'trip_generated' && body.events[0].p.city === '莫斯科', '事件名与属性原样保留');
  assert(t.pending() === 0, '成功后清空已发送部分');
}

// 7) 上报失败保留缓冲，不清数据
{
  const storage = fakeStorage();
  const t = createTelemetry({
    storage,
    endpoint: '/api/telemetry',
    flushAt: 999,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  t.track('page_view', { page: 'map' });
  const r = await t.flush();
  assert(r.ok === false && r.status === 500, '非 2xx 判为失败');
  assert(t.pending() === 1, '失败时保留缓冲等待重试');

  const t2 = createTelemetry({
    storage: fakeStorage(),
    endpoint: '/api/telemetry',
    flushAt: 999,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  t2.track('page_view', { page: 'map' });
  const r2 = await t2.flush();
  assert(r2.ok === false && t2.pending() === 1, '断网抛错不外泄，缓冲保留');
}

// 8) 存储不可用时不阻断业务
{
  const storage = fakeStorage();
  storage.setItem = () => { throw new Error('QuotaExceeded'); };
  const t = createTelemetry({ storage });
  let threw = false;
  try { t.track('page_view', { page: 'plan' }); } catch { threw = true; }
  assert(!threw, '配额异常不会抛给调用方');
}

// 9) 页面隐藏自动冲刷
{
  const storage = fakeStorage();
  let called = 0;
  const t = createTelemetry({
    storage,
    endpoint: '/api/telemetry',
    flushAt: 999,
    fetchImpl: async () => { called++; return { ok: true, status: 204 }; },
  });
  const handlers = {};
  const target = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    removeEventListener: (type, fn) => { if (handlers[type] === fn) delete handlers[type]; },
    document: { addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: () => {} },
  };
  const uninstall = installAutoFlush(t, target);
  assert(typeof handlers.pagehide === 'function', '注册了 pagehide 监听');
  t.track('page_view', { page: 'today' });
  handlers.pagehide();
  assert(called === 1, 'pagehide 触发一次上报');
  uninstall();
  assert(!handlers.pagehide, '卸载后移除监听');
}

// 10) 内置上限与文档口径一致
{
  assert(MAX_BUFFER === 200, '默认缓冲上限 200 条');
}

if (bad) { console.error(`\n${bad} 处埋点骨架不符合约定`); process.exit(1); }
console.log('\n埋点骨架质量门通过');
