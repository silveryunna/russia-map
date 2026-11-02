#!/usr/bin/env node
// 行程列表质量门（B5 补面）：list.js 的 openTrip/copyTrip/deleteTrip 是薄接线层，
// 用假 ctx 验证委托、错误路径与提示口径。duplicateTrip 本身由 test-trip-edit 守护。
// 用法: node tools/test-plan-list.mjs
import { openTrip, copyTrip, deleteTrip } from '../src/pages/plan/list.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const trip = { id: 't1', title: '莫斯科 3 日', cities: ['莫斯科'], days: [{ index: 1, items: [] }] };

function makeCtx(storeOverrides = {}) {
  const toasts = [];
  const state = { rendered: 0, refreshed: 0, undoReset: 0 };
  const base = {
    trips: [trip],
    view: { mode: 'list' },
    store: {
      getTrip: async () => trip,
      saveTrip: async (t) => ({ ok: true, trip: t }),
      deleteTrip: async () => ({ ok: true, detachedVisits: 3 }),
      ...storeOverrides,
    },
    toast: (m) => toasts.push(m),
    render: () => { state.rendered++; },
    refreshTrips: async () => { state.refreshed++; },
    resetUndo: () => { state.undoReset++; },
  };
  return { ...base, toasts, state };
}

// 1) openTrip：存在 → current + 编辑器 + 撤销栈复位
{
  const ctx = makeCtx();
  await openTrip(ctx, 't1');
  assert(ctx.current === trip, '打开后 current 指向该行程');
  assert(ctx.view.mode === 'editor', '打开后进入编辑器');
  assert(ctx.state.undoReset === 1, '打开后撤销栈复位');
  assert(ctx.state.rendered === 1, '打开后渲染一次');
}

// 2) openTrip：不存在 → 刷新 + 提示，不渲染编辑器
{
  const ctx = makeCtx({ getTrip: async () => null });
  await openTrip(ctx, 't1');
  assert(ctx.toasts[0] === '行程不存在', '行程不存在有提示');
  assert(ctx.state.refreshed === 1, '行程不存在触发刷新');
}

// 3) copyTrip：复制落库并提示
{
  const ctx = makeCtx();
  await copyTrip(ctx, 't1');
  assert(ctx.state.rendered === 1 && ctx.state.refreshed === 1, '复制后刷新并重渲染');
  assert(ctx.toasts[0] === '已复制为新行程', '复制成功提示');
}

// 4) copyTrip：保存失败透传错误
{
  const ctx = makeCtx({ saveTrip: async () => ({ ok: false, errors: [{ message: '校验失败' }] }) });
  await copyTrip(ctx, 't1');
  assert(ctx.toasts[0] === '复制失败：校验失败', '复制失败透传 store 错误');
  assert(ctx.state.rendered === 0, '复制失败不渲染');
}

// 5) deleteTrip：取消确认时不删除
{
  let deleted = 0;
  const ctx = makeCtx({ deleteTrip: async () => { deleted++; return { ok: true }; } });
  ctx.confirm = () => false;
  await deleteTrip(ctx, 't1');
  assert(deleted === 0, '取消确认不删除');
}

// 6) deleteTrip：确认后删除 + 打卡保留提示
{
  const ctx = makeCtx();
  ctx.confirm = () => true;
  await deleteTrip(ctx, 't1');
  assert(ctx.toasts[0] === '已删除，3 条打卡记录已解除关联', '删除后提示打卡解除关联条数');
  assert(ctx.state.refreshed === 1 && ctx.state.rendered === 1, '删除后刷新并重渲染');
}

// 7) deleteTrip：列表里找不到该行程时是空操作
{
  let deleted = 0;
  const ctx = makeCtx({ deleteTrip: async () => { deleted++; return { ok: true }; } });
  ctx.trips = [];
  await deleteTrip(ctx, 't1');
  assert(deleted === 0, '未知行程空操作');
}

if (bad) { console.error(`\n${bad} 处列表行为不符合约定`); process.exit(1); }
console.log('\n行程列表质量门通过');
