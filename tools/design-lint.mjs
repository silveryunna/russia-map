#!/usr/bin/env node
// 设计门（静态层，CI 强制）：把 DESIGN.md 的视觉纪律变成会红的检查
// 背景：仓库有 41 道门守着数据与逻辑，视觉与可用性是 0 道 —— DESIGN.md 写了令牌与对比度，
//       但没有任何东西阻止新页面继续硬编码颜色（实测 plan.css 190 处、today.css 0 次引用令牌）。
// 分级：FAIL 立即阻断 · RATCHET 只准降不准升（baseline 逐期收缩）· WAIVED 必须带证据与理由
// 用法: node tools/design-lint.mjs [--tighten]   # --tighten 把当前值写回 baseline（改善后收紧）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const BASELINE_FILE = 'tools/design-lint-baseline.json';
const tighten = process.argv.includes('--tighten');

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const warn = (m) => console.log('⚠️  ' + m);

// 遍历 src 下所有 CSS
const cssFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (e.name.endsWith('.css')) cssFiles.push(p);
  }
})(resolve(root, 'src'));

// 全局层是否提供 :focus-visible 兜底（所有页面都 import base.css，所以兜底一次即全站生效）
const globalFocusFallback = cssFiles
  .filter(f => /[\\/]src[\\/](shared|pages)[\\/][\w.-]+\.css$/.test(f) && /base\.css$/.test(f))
  .some(f => /:focus-visible/.test(readFileSync(f, 'utf8')));

// micro 字号白名单：只允许用于版权/备案号/图例这类"不得承载必要信息"的位置（DESIGN.md §3.2）
const MICRO_ALLOW = /(\.site-footer|#icp-link|\.icp|\.legend|\.sb-sub|\.td-muted|\.caption|\.micro|\.leaflet-control-attribution|\.ae-tip|\.muted|\.sub\b|\.hint|\.badge-count)/;

const findings = {};   // file -> { rule: count }
const details = [];    // 供报告
function add(file, rule, line, snippet) {
  const rel = relative(root, file).replace(/\\/g, '/');
  findings[rel] = findings[rel] || {};
  findings[rel][rule] = (findings[rel][rule] || 0) + 1;
  if (details.length < 400) details.push({ rel, rule, line, snippet: snippet.trim().slice(0, 90) });
}

const COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\brgba?\(|\bhsla?\(|\b(?:white|black|red|gray|grey|silver|gold)\b(?=\s*[,;)])/g;
const PURE_RE = /#(?:fff|ffffff|000|000000)\b|\brgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]|\brgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/g;
const SPACE_RE = /(?:padding|margin|gap|row-gap|column-gap|padding-[\w-]+|margin-[\w-]+)\s*:\s*[^;}]*/g;
const SMALL_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)px/g;

for (const file of cssFiles) {
  const rel = relative(root, file).replace(/\\/g, '/');
  const raw = readFileSync(file, 'utf8');
  const isTokens = rel.endsWith('src/shared/tokens.css');

  // 豁免注释：/* 设计门 L1 · 豁免 · 证据 · 理由 */  —— 文件级，必须命中真实违规
  const waivers = new Map();
  for (const m of raw.matchAll(/\/\*\s*设计门\s+([A-Z0-9.]+)\s*·\s*豁免\s*·\s*([^*]+?)\s*\*\//g)) {
    const [, rule, rest] = m;
    if (!rest.includes('·')) { fail(`${rel}：豁免 ${rule} 缺"证据 · 理由"两段（格式：/* 设计门 L1 · 豁免 · 证据 · 理由 */）`); continue; }
    waivers.set(rule, rest.trim());
  }
  const hit = new Set();
  const waived = (rule) => { if (waivers.has(rule)) { hit.add(rule); return true; } return false; };

  const lines = raw.split('\n');
  let selector = '';   // 最近的规则选择器（字号白名单要看它，不能只看单行）
  lines.forEach((line, i) => {
    if (/^\s*(\/\*|\*|\/\/)/.test(line)) return;           // 注释行不计
    const code = line.replace(/\/\*.*?\*\//g, '');
    if (code.includes('{')) selector = code.split('{')[0].trim() || selector;
    if (!code.trim()) return;

    // L1 颜色字面量（tokens.css 唯一色源）
    if (!isTokens) {
      const colors = code.match(COLOR_RE);
      if (colors && !waived('L1')) add(file, 'L1', i + 1, line);
      else if (colors) findings[rel] = findings[rel] || {};
      // L2 纯黑纯白
      if (PURE_RE.test(code) && !waived('L2')) add(file, 'L2', i + 1, line);
      PURE_RE.lastIndex = 0;
    }
    // L3 transition: all
    if (/transition\s*:\s*all\b/.test(code) && !waived('L3')) add(file, 'L3', i + 1, line);
    // L7 间距字面量（有 --sp-* 时不得再写 px）
    if (SPACE_RE.test(code) && /[\d.]+px/.test(code) && !/var\(--sp/.test(code) && !waived('L7')) add(file, 'L7', i + 1, line);
    SPACE_RE.lastIndex = 0;
    // L6 字号 <12px 只允许出现在 micro 白名单选择器里
    for (const m of code.matchAll(SMALL_RE)) {
      if (Number(m[1]) < 12 && !MICRO_ALLOW.test(selector + ' ' + line) && !waived('L6')) add(file, 'L6', i + 1, line);
    }
  });

  // L4 outline:none 需要全局层 :focus-visible 兜底（base.css 的双环），否则键盘用户丢失焦点位置
  if (/outline\s*:\s*(none|0)/.test(raw) && !globalFocusFallback && !waived('L4')) {
    fail(`${rel}：出现 outline:none 且全局层没有 :focus-visible 焦点环兜底`);
  }
  // L5 reduced-motion 必须在全站层存在
  if (isTokens) { /* 稍后统一检查 */ }
  // 未命中的豁免 = 僵尸豁免
  for (const [rule] of waivers) if (!hit.has(rule) && !['L4', 'L5'].includes(rule)) warn(`${rel}：豁免 ${rule} 没有命中任何违规 —— 要么删掉，要么规则已修完`);
}

if (!cssFiles.some(f => /prefers-reduced-motion/.test(readFileSync(f, 'utf8')))) {
  fail('全站没有任何 prefers-reduced-motion 降级（DESIGN.md §8.2）');
} else ok('prefers-reduced-motion 已落地');

// L8 像素图标纪律：网格图标必须 crispEdges，且渲染尺寸是格数的整数倍映射
const iconCandidates = ['src/shared/pixel-icons.js', 'src/pages/map/pixel-icons.js', 'src/shared/icons.js'];
for (const rel of iconCandidates) {
  let src = null;
  try { src = readFileSync(resolve(root, rel), 'utf8'); } catch { continue; }
  if (!/viewBox/.test(src)) continue;
  if (!/shape-rendering|shapeRendering/.test(src)) fail(`${rel}：像素图标缺 shape-rendering="crispEdges"（DPR 1.25 下会被重采样，实测灰边 27%）`);
  for (const m of src.matchAll(/grid\s*=\s*(\d+)[\s\S]{0,400}?sizes?\s*=\s*\[([^\]]+)\]/g)) {
    const grid = Number(m[1]);
    for (const s of m[2].split(',').map(x => Number(x.trim()))) {
      if (!Number.isFinite(s) || (s / grid) % 1 !== 0) fail(`${rel}：${grid} 格图标不能用 ${s}px（每格 ${s / grid} CSS 像素非整数，DPR 1.5 下笔画会 1↔2 跳变）`);
    }
  }
}

// L1-JS：JS 模板里的颜色字面量（此前门只扫 CSS，是盲区：实测 src/**/*.js 里有 152 处）
// 例外写法：在行内或上一行写 /* 设计门 L1 · 例外 · 证据 · 理由 */（Leaflet 的 SVG 属性不吃 CSS 变量就是合法例外）
const jsFiles = [];
(function walkJs(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkJs(p); }
    else if (e.name.endsWith('.js')) jsFiles.push(p);
  }
})(resolve(root, 'src'));
for (const file of jsFiles) {
  const rel = relative(root, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) && !line.includes('#')) return;
    const hits = line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w])/g);
    if (!hits) return;
    if (/设计门 L1 · 例外/.test(line) || /设计门 L1 · 例外/.test(lines[i - 1] || '')) return;
    add(file, 'L1JS', i + 1, line);
  });
}

// 棘轮：与 baseline 比较，只准降不准升
let baseline = {};
try { baseline = JSON.parse(readFileSync(resolve(root, BASELINE_FILE), 'utf8')); } catch { baseline = {}; }
const RULES = ['L1', 'L2', 'L3', 'L6', 'L7', 'L1JS'];
let regressed = 0, improved = 0;
const summary = [];
for (const rel of Object.keys({ ...baseline, ...findings }).sort()) {
  const row = {};
  for (const rule of RULES) {
    const now = (findings[rel] || {})[rule] || 0;
    const was = (baseline.files?.[rel] || {})[rule];
    const cap = was === undefined ? now : was;      // 新文件：以当前值为初始上限（首次登记）
    row[rule] = { now, cap };
    if (was !== undefined && now > was) { fail(`${rel} ${rule}：${was} → ${now}（棘轮只准降不准升）`); regressed++; }
    if (was !== undefined && now < was) improved++;
  }
  const total = Object.values(findings[rel] || {}).reduce((a, b) => a + b, 0);
  if (total) summary.push(`${rel}  ${Object.entries(findings[rel]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
console.log(`\n扫描 ${cssFiles.length} 个 CSS；当前违规分布：`);
for (const s of summary) console.log('  ' + s);
const totalNow = Object.values(findings).reduce((a, f) => a + Object.values(f).reduce((x, y) => x + y, 0), 0);
const totalCap = Object.values(baseline.files || {}).reduce((a, f) => a + Object.values(f).reduce((x, y) => x + y, 0), 0);
console.log(`合计违规 ${totalNow} 处（基线 ${totalCap || '未登记'}）${improved ? `，${improved} 项已低于基线可收紧` : ''}`);

if (tighten) {
  writeFileSync(resolve(root, BASELINE_FILE), JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), files: findings }, null, 1) + '\n', 'utf8');
  console.log(`✅ 已把基线收紧为当前值 → ${BASELINE_FILE}`);
} else if (!Object.keys(baseline.files || {}).length) {
  console.log('⚠️  无基线文件：先跑 `node tools/design-lint.mjs --tighten` 登记现状，此后只准降不准升');
}

if (bad) { console.error(`\n设计门未通过：${bad} 项`); process.exit(1); }
console.log(regressed ? '' : '\n设计门（静态层）通过');
