#!/usr/bin/env node
// 生成 sitemap.xml：只收录可公开页面；私有页（admin / account / friend）永不进 sitemap。
// 用法：node tools/gen-sitemap.mjs          生成
//       node tools/gen-sitemap.mjs --check  只比对是否最新（有差异则退出 1）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://julyyunna.art';
const PUBLIC = ['index.html', 'map.html', 'plan.html', 'today.html', 'list.html', 'notes.html', 'album.html'];

const missing = PUBLIC.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error(`❌ 声明为公开页但文件不存在：${missing.join(', ')}`);
  process.exit(1);
}

const urls = PUBLIC
  .map((p) => `  <url><loc>${ORIGIN}/${p === 'index.html' ? '' : p}</loc></url>`)
  .join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

const out = join(root, 'sitemap.xml');
if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current.replace(/\r\n/g, '\n').trim() !== xml.trim()) {
    console.error('❌ sitemap.xml 与公开页清单不同步，运行 node tools/gen-sitemap.mjs');
    process.exit(1);
  }
  console.log(`sitemap 同步检查通过（${PUBLIC.length} 条）`);
} else {
  writeFileSync(out, xml);
  console.log(`sitemap.xml 已生成（${PUBLIC.length} 条）`);
}
