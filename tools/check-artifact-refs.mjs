#!/usr/bin/env node
// 产物引用门：根目录 HTML 里引用的 assets/* 必须真实存在。
// 背景（2026-11-03）：9 个构建产物被删而 HTML 仍引用，本地打开 map/plan/today/list 直接 404，
// 而当时 40 道门没有一道能发现——因为它们只检查源码，不检查"源码引用的文件是否还在"。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 产物引用形如 src="./assets/map-xxxx.js"（可能有 ./ 或 / 前缀）
const REF = /(?:src|href)\s*=\s*["'](?:\.\/|\/)?(assets\/[^"']+)["']/g;

let refs = 0;
const missing = [];
for (const name of readdirSync(root)) {
  if (!name.endsWith('.html')) continue;
  const html = readFileSync(join(root, name), 'utf8');
  for (const m of html.matchAll(REF)) {
    refs += 1;
    if (!existsSync(join(root, m[1]))) missing.push(`${name} → ${m[1]}`);
  }
}

// 门自身必须真扫到东西，否则"0 个引用、缺失 0"是假绿
if (refs === 0) {
  console.error('❌ 未扫描到任何 ./assets/* 引用：HTML 结构或正则已变，门本身失效');
  process.exit(1);
}

if (missing.length) {
  console.error(`❌ 产物引用缺失 ${missing.length} 个（共 ${refs} 个引用）`);
  for (const line of missing) console.error(`   ${line}`);
  console.error('   修复：git checkout -- assets/（还原已提交产物）或 npm run publish（重新构建）');
  process.exit(1);
}

console.log(`产物引用门通过（${refs} 个引用，缺失 0）`);
