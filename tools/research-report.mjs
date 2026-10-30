#!/usr/bin/env node
// 研究进度报告：候选状态、过期复核、队列剩余
// 用法: node tools/research-report.mjs <candidates.json> [--queue queue.json] [--today YYYY-MM-DD] [--out <file.md>]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeCandidates } from './research-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : ''; };
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('用法: node tools/research-report.mjs <candidates.json> [--queue queue.json] [--today YYYY-MM-DD] [--out <file.md>]');
  process.exit(1);
}

const candidates = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const today = arg('--today') || new Date().toISOString().slice(0, 10);
const s = summarizeCandidates(candidates, { today });
const expired = (Array.isArray(candidates) ? candidates : [])
  .filter((c) => c && c.status !== 'unknown' && c.reviewAfter && c.reviewAfter < today);

let queuePending = null;
const queueFile = arg('--queue');
if (queueFile) {
  const q = JSON.parse(readFileSync(path.resolve(queueFile), 'utf8'));
  queuePending = (q.items || []).filter((i) => i.status === 'pending').length;
}

const lines = [
  `# 资料补全报告（${today}）`,
  '',
  `- 候选总数：${s.total}`,
  `- verified：${s.byStatus.verified}｜estimated：${s.byStatus.estimated}｜conflict：${s.byStatus.conflict}｜unknown：${s.byStatus.unknown}`,
  `- 已过复核期：${s.expired}`,
  queuePending === null ? '- 队列：未提供' : `- 队列剩余 pending：${queuePending}`,
  '',
  '## 按字段',
  ...Object.entries(s.byField).filter(([, n]) => n).map(([f, n]) => `- ${f}：${n}`),
  '',
  '## 按来源',
  ...Object.entries(s.bySource).filter(([, n]) => n).map(([t, n]) => `- ${t}：${n}`),
  '',
  '## 需要复核',
  ...(expired.length ? expired.map((c) => `- ${c.pointId} ${c.field}（reviewAfter ${c.reviewAfter}）`) : ['- 无']),
];

const text = lines.join('\n') + '\n';
const out = arg('--out');
if (out) {
  const target = path.resolve(out);
  if (target.startsWith(repoRoot + path.sep) || target === repoRoot) {
    console.error('报告不能写进仓库（webroot 全公开），请用 --out 指向仓库外或 NAS 目录');
    process.exit(1);
  }
  writeFileSync(target, text);
  console.log(`✅ 报告 → ${target}`);
} else {
  process.stdout.write(text);
}
