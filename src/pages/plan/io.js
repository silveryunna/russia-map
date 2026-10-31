// 计划页的导入导出：全量备份（JSON）、Markdown 行程单、通用文件下载。
// 拆出来的理由：这三件事都是「把内存里的 Trip 变成文本」，与编辑器渲染无关，
// 但要能单测就必须能替换 download / confirm / store。因此全部走依赖注入，
// 且 Markdown 生成（buildMarkdown）是纯函数。
// 契约由 tools/test-plan-io.mjs 守护。

import { PERIOD_LABEL, dateRange, sourceLabel } from './format.js';

/** 触发浏览器下载。文件名里的非法字符交给浏览器处理，这里只做 URL 生命周期回收。 */
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * 纯函数：Trip → Markdown 行程单。
 * @param {object} trip
 * @param {(item: object) => string} options.nameOf 条目显示名（需要点位库，故由调用方注入）
 */
export function buildMarkdown(trip, { nameOf } = {}) {
  const name = typeof nameOf === 'function' ? nameOf : (it) => it.placeNameSnapshot || it.type || '未命名';
  const lines = [
    `# ${trip.title}`, '',
    `> ${(trip.cities || []).join(' / ')} · ${dateRange(trip)} · 来源：${sourceLabel(trip)}`, '',
  ];
  if (trip.notes) lines.push(`> 📌 ${trip.notes}`, '');
  for (const d of trip.days || []) {
    lines.push(`## Day ${d.index}${d.date ? ` · ${d.date}` : ''}`, '');
    for (const it of d.items || []) {
      const parts = [`- **${name(it)}**`];
      if (it.period) parts.push(`（${PERIOD_LABEL[it.period]}）`);
      if (it.confirm !== 'ok') parts.push(' 〔待确认〕');
      if (it.startLocal) parts.push(` ${it.startLocal.replace('T', ' ')}`);
      lines.push(parts.join(''));
    }
    if ((d.items || []).length) lines.push('');
    if (d.note) lines.push(`> 💡 ${d.note}`, '');
  }
  return lines.join('\n');
}

/** 导出 Markdown 行程单并提示。 */
export function exportMarkdown(trip, { nameOf, save = download, toast = () => {} } = {}) {
  save(`${trip.title || '行程'}.md`, buildMarkdown(trip, { nameOf }), 'text/markdown');
  toast('已导出 Markdown');
}

/** 全量备份：行程 + 打卡 + 变更日志 + 实际通行记录。 */
export async function exportBackup({ store, save = download, toast = () => {} }) {
  const payload = await store.exportAll();
  save(`trips-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
  toast(`已导出 ${payload.trips.length} 份行程、${payload.visits.length} 条打卡记录`);
}

export const IMPORT_CONFIRM = '用备份覆盖本机全部行程吗？\n确定＝覆盖；取消＝合并（同一行程保留修订号更高的版本）';

/**
 * 导入备份：确定＝replace（全量覆盖），取消＝merge（按修订号取高）。
 * @param {File|Blob} file 需要支持 text()
 * @param {object} options
 * @param {object} options.store Trip store（需有 importAll）
 * @param {() => Promise<void>|void} [options.onImported] 导入成功后的刷新与重渲染
 */
export async function importBackup(file, {
  store, confirm = globalThis.confirm, toast = () => {}, onImported = async () => {},
} = {}) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
    if (Array.isArray(payload)) payload = { trips: payload, visits: [] };
  } catch {
    toast('备份文件不是合法 JSON');
    return { ok: false, reason: 'parse' };
  }
  const replace = !!confirm(IMPORT_CONFIRM);
  const r = await store.importAll(payload, { mode: replace ? 'replace' : 'merge' });
  if (!r.ok) {
    toast(r.error || '导入失败');
    return { ok: false, reason: 'store', result: r };
  }
  await onImported();
  toast(replace
    ? `已覆盖：${r.added} 份行程`
    : `合并完成：新增 ${r.added}、更新 ${r.updated}、跳过 ${r.skipped}`);
  return { ok: true, mode: replace ? 'replace' : 'merge', result: r };
}
