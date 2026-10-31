#!/usr/bin/env node
// 计划导入导出质量门（W2 拆分后新增）
// 重点：Markdown 文案与页面口径一致；备份导入的 replace/merge 分支、失败不改本机数据。
// 用法: node tools/test-plan-io.mjs
import {
  buildMarkdown, exportMarkdown, exportBackup, importBackup, IMPORT_CONFIRM,
} from '../src/pages/plan/io.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const trip = {
  title: '莫斯科 3 日', cities: ['莫斯科'], dateMode: 'fixed', startDate: '2026-11-01', endDate: '2026-11-03',
  notes: '落地先买交通卡',
  days: [
    {
      index: 1, date: '2026-11-01', note: '早点出门',
      items: [
        { id: 'i1', refId: 'p1', placeNameSnapshot: '红场', type: 'visit', period: 'morning', confirm: 'ok' },
        { id: 'i2', placeNameSnapshot: '午餐', type: 'meal', confirm: 'pending', startLocal: '2026-11-01T12:30' },
      ],
    },
    { index: 2, date: '2026-11-02', items: [] },
  ],
};

// 1) Markdown 结构与口径
{
  const md = buildMarkdown(trip, { nameOf: it => it.placeNameSnapshot });
  const lines = md.split('\n');
  assert(lines[0] === '# 莫斯科 3 日', '标题为一级标题');
  assert(md.includes('> 莫斯科 · 11/01–11/03 · 来源：规则引擎（离线）'), '城市 / 日期 / 来源同一行');
  assert(md.includes('> 📌 落地先买交通卡'), '行程备注写成引用块');
  assert(md.includes('## Day 1 · 2026-11-01'), '每天一个二级标题并带日期');
  assert(md.includes('- **红场**（上午）'), '条目带时段');
  assert(md.includes('- **午餐** 〔待确认〕 2026-11-01 12:30'), '待确认标记与 T 换成空格');
  assert(md.includes('> 💡 早点出门'), '当天备注写成提示块');
  assert(md.includes('## Day 2 · 2026-11-02'), '空天仍然输出标题');
}

// 2) 未注入 nameOf 时不崩（离线包被单独调用）
{
  const md = buildMarkdown({ title: 'T', days: [{ index: 1, items: [{ placeNameSnapshot: '无名点' }] }] });
  assert(md.includes('- **无名点**'), '缺 nameOf 时回落到快照');
  const md2 = buildMarkdown({ title: 'T', days: [{ index: 1, items: [{}] }] });
  assert(md2.includes('未命名'), '完全没有名字时用兜底文案');
  assert(buildMarkdown({ title: 'T' }).includes('# T'), '缺 days 不抛错');
}

// 3) exportMarkdown：文件名、MIME、提示
{
  const calls = [];
  const toasts = [];
  exportMarkdown(trip, {
    nameOf: it => it.placeNameSnapshot,
    save: (name, text, type) => calls.push({ name, text, type }),
    toast: m => toasts.push(m),
  });
  assert(calls.length === 1 && calls[0].name === '莫斯科 3 日.md', '文件名为行程标题 + .md');
  assert(calls[0].type === 'text/markdown', 'MIME 为 text/markdown');
  assert(toasts[0] === '已导出 Markdown', '导出后有提示');
  const fallback = [];
  exportMarkdown({ title: '', days: [] }, { save: (name) => fallback.push(name) });
  assert(fallback[0] === '行程.md', '无标题时用兜底文件名');
}

// 4) exportBackup：payload 原样落盘 + 统计提示
{
  const payload = { schemaVersion: 2, trips: [trip], visits: [{ id: 'v1' }], events: [], legs: [] };
  const calls = [];
  const toasts = [];
  await exportBackup({
    store: { exportAll: async () => payload },
    save: (name, text) => calls.push({ name, text }),
    toast: m => toasts.push(m),
  });
  assert(/^trips-backup-\d{4}-\d{2}-\d{2}\.json$/.test(calls[0].name), '备份文件名带日期');
  assert(JSON.parse(calls[0].text).visits.length === 1, '导出内容为 exportAll 的完整载荷');
  assert(toasts[0] === '已导出 1 份行程、1 条打卡记录', '提示行程与打卡条数');
}

// 5) importBackup：非法 JSON 不碰存储
{
  const toasts = [];
  let called = 0;
  const r = await importBackup({ text: async () => '{oops' }, {
    store: { importAll: async () => { called++; return { ok: true }; } },
    toast: m => toasts.push(m),
  });
  assert(r.ok === false && r.reason === 'parse', '非法 JSON 返回 parse 失败');
  assert(called === 0, '解析失败时完全不调用 importAll');
  assert(toasts[0] === '备份文件不是合法 JSON', '给出明确提示');
}

// 6) importBackup：确定=覆盖，取消=合并
{
  const calls = [];
  const toasts = [];
  const store = {
    importAll: async (payload, opts) => { calls.push({ payload, opts }); return { ok: true, added: 2, updated: 1, skipped: 0 }; },
  };
  let refreshed = 0;
  const file = { text: async () => JSON.stringify({ trips: [], visits: [] }) };

  const rep = await importBackup(file, { store, confirm: () => true, toast: m => toasts.push(m), onImported: () => { refreshed++; } });
  assert(rep.mode === 'replace' && calls[0].opts.mode === 'replace', '确定 → replace 模式');
  assert(refreshed === 1, '导入成功后刷新一次');
  assert(toasts[0] === '已覆盖：2 份行程', '覆盖提示只报行程数');

  const mer = await importBackup(file, { store, confirm: () => false, toast: m => toasts.push(m) });
  assert(mer.mode === 'merge' && calls[1].opts.mode === 'merge', '取消 → merge 模式');
  assert(toasts[1] === '合并完成：新增 2、更新 1、跳过 0', '合并提示区分新增/更新/跳过');
  assert(IMPORT_CONFIRM.includes('覆盖'), '确认文案说明确定＝覆盖');
}

// 7) importBackup：裸数组兼容 + 存储失败不清场
{
  const calls = [];
  const toasts = [];
  let refreshed = 0;
  const store = {
    importAll: async (payload, opts) => {
      calls.push({ payload, opts });
      return { ok: false, error: '备份数据未通过校验' };
    },
  };
  const r = await importBackup({ text: async () => JSON.stringify([{ id: 't1', days: [] }]) }, {
    store, confirm: () => false, toast: m => toasts.push(m), onImported: () => { refreshed++; },
  });
  assert(Array.isArray(calls[0].payload.trips) && calls[0].payload.trips.length === 1, '旧版裸数组被包装成 { trips, visits }');
  assert(Array.isArray(calls[0].payload.visits), '包装后补空 visits 数组');
  assert(r.ok === false && r.reason === 'store', '存储失败返回 store 失败');
  assert(toasts[0] === '备份数据未通过校验', '透传存储层错误文案');
  assert(refreshed === 0, '失败时不刷新、不重渲染');
}

if (bad) { console.error(`\n${bad} 处导入导出行为不符合约定`); process.exit(1); }
console.log('\n计划导入导出质量门通过');
