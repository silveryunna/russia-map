#!/usr/bin/env node
// src/ 与已提交构建产物的一致性检查（多会话/多机纪律的 CI 兜底）
// 场景：某会话改了 src/ 直接 commit+push 而没跑 publish → 线上产物与源码分叉，
// 下一个会话 publish 时会带着别人的未发布改动一起上线，难以归因。
// 做法：npm run build 后比对 dist/assets 与仓库根 assets/ 的文件名集合（哈希名即内容指纹）。
// 用法: node tools/check-build-sync.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const KEEP = new Set(['tdt-key.js', 'tdt-key.example.js']); // 非构建产物豁免

console.log('构建中（npm run build）…');
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });

const distFiles = readdirSync('dist/assets').filter((f) => !f.endsWith('.map')).sort();
const rootFiles = readdirSync('assets').filter((f) => !KEEP.has(f)).sort();

const onlyDist = distFiles.filter((f) => !rootFiles.includes(f));
const onlyRoot = rootFiles.filter((f) => !distFiles.includes(f));

if (!onlyDist.length && !onlyRoot.length) {
  console.log(`✅ src 与产物一致（${distFiles.length} 个 bundle 文件名全对上）`);
  process.exit(0);
}

console.error('❌ src/ 与已提交产物分叉：');
if (onlyDist.length) console.error('  源码新构建多出：' + onlyDist.join(', '));
if (onlyRoot.length) console.error('  仓库产物多出：' + onlyRoot.join(', '));
console.error('\n说明有会话改了 src/ 但没跑 publish 就 push 了。修复：npm run publish');
process.exit(1);
