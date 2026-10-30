#!/usr/bin/env node
// 生成资料补全队列（写到仓库外，默认 ~/travel-research/）
// 用法: node tools/research-queue.mjs [--city 莫斯科] [--fields openCalendar,ticket] [--limit 10] [--data ./data] [--out <file>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESEARCH_FIELDS, buildGapQueue } from './research-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const city = arg('--city', '莫斯科');
const fields = arg('--fields', 'openCalendar,ticket').split(',').map((s) => s.trim()).filter(Boolean);
const limit = Number.parseInt(arg('--limit', '10'), 10);
const dataDir = path.resolve(arg('--data', './data'));
const out = path.resolve(arg('--out', path.join(os.homedir(), 'travel-research', `queue-${city}.json`)));

const badFields = fields.filter((f) => !RESEARCH_FIELDS.includes(f));
if (badFields.length) {
  console.error(`未知字段：${badFields.join('、')}；可用：${RESEARCH_FIELDS.join('、')}`);
  process.exit(1);
}
if (out.startsWith(repoRoot + path.sep) || out === repoRoot) {
  console.error('研究产物不能写进仓库（webroot 全公开），请用 --out 指向仓库外或 NAS 目录');
  process.exit(1);
}

const points = JSON.parse(readFileSync(path.join(dataDir, 'points.json'), 'utf8'));
const routes = JSON.parse(readFileSync(path.join(dataDir, 'routes.json'), 'utf8'));
const pointList = Array.isArray(points) ? points : points.points;
const routeList = Array.isArray(routes) ? routes : routes.routes;
const items = buildGapQueue({ points: pointList, routes: routeList, city, fields, limit });

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  generatedAt: new Date().toISOString(),
  city,
  fields,
  scope: routeList.some((r) => r.city === city) ? 'routes' : 'city',
  total: items.length,
  items,
}, null, 2) + '\n');

console.log(`✅ 队列 ${items.length} 条 → ${out}`);
for (const it of items) {
  console.log(`  · ${it.pointId} ${it.name}｜缺 ${it.fields.join('/')}｜动线使用 ${it.routeUsage}`);
}
if (!items.length) console.log('  （当前字段已无缺口）');
if (!out.startsWith(os.homedir())) console.warn('⚠️ 输出不在用户目录下，请确认它不在任何公开 webroot 内');
