#!/usr/bin/env node
// 构建产物体积预算门（N5）：给 assets/*.js 设阈值——单文件 ≤ maxFileBytes，
// 总体 ≤ 基线 total × totalGrowthRatio。构建正常增长就更新基线（--update），
// 但每次更新都必须在提交里显式可见，防止体积无声膨胀。
// 用法: node tools/check-asset-budget.mjs [--update]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';

const BASELINE = 'tools/fixtures/asset-budget.json';
const UPDATE = process.argv.includes('--update');

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error(`❌ 缺少基线 ${BASELINE}，先跑 --update 生成`);
  process.exit(1);
}

const files = readdirSync('assets').filter(f => f.endsWith('.js')).sort();
const sizes = {};
let total = 0;
for (const f of files) { sizes[f] = statSync(`assets/${f}`).size; total += sizes[f]; }

if (UPDATE) {
  const next = { ...baseline, total, files: sizes };
  writeFileSync(BASELINE, JSON.stringify(next, null, 1).replace(/\n/g, '\r\n') + '\r\n', 'utf8');
  console.log(`✅ 基线已更新：${files.length} 个文件，共 ${(total / 1024).toFixed(1)} KB`);
  process.exit(0);
}

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

for (const f of files) {
  if (sizes[f] > baseline.maxFileBytes) fail(`${f} ${sizes[f]}B 超过单文件阈值 ${baseline.maxFileBytes}B`);
}
if (!bad) ok(`全部 ${files.length} 个 js ≤ 单文件阈值 ${(baseline.maxFileBytes / 1024).toFixed(0)} KB`);

const cap = Math.round(baseline.total * baseline.totalGrowthRatio);
if (total > cap) {
  fail(`总量 ${total}B 超过基线 ${baseline.total}B × ${baseline.totalGrowthRatio} = ${cap}B；若是正常增长请跑 --update 并同提交说明`);
} else {
  ok(`总量 ${(total / 1024).toFixed(1)} KB ≤ 预算 ${(cap / 1024).toFixed(1)} KB（基线 ${(baseline.total / 1024).toFixed(1)} KB）`);
}

// 文件数暴涨也要吭声（防止意外多打包进整库）
if (files.length > baseline.files.length + 5) fail(`js 文件数 ${files.length} 比基线 ${baseline.files.length} 多出 5 个以上`);

if (bad) { console.error('\n体积预算超支'); process.exit(1); }
console.log('\n体积预算门通过');
