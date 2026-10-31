#!/usr/bin/env node
// 文档事实门（CI 强制）：README/AGENTS 里写死的数字必须与代码/数据一致
// 手写数字迟早过期（历史上 AGENTS 写"21 变异"，实际已 26 个）。这里只校验可机检的事实。
// 用法: node tools/check-doc-facts.mjs
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

const agents = read('AGENTS.md');
const readme = read('README.md');

// 1) AGENTS 的变异数 = mutation-test.mjs 里实际注册的变异数
{
  const actual = (read('tools/mutation-test.mjs').match(/M\.push\(/g) || []).length;
  const m = agents.match(/变异测试（(\d+)\s*变异/);
  if (!m) fail('AGENTS.md 未写明变异测试数量（格式：变异测试（N 变异须全捕获））');
  else if (+m[1] === actual && actual > 0) ok(`AGENTS 变异数 ${actual} 与实际一致`);
  else fail(`AGENTS 写 ${m[1]} 个变异，tools/mutation-test.mjs 实际注册 ${actual} 个`);
}

// 2) README 的点位/动线数 = data/*.json 实际条数
{
  const pts = JSON.parse(read('data/points.json'));
  const rts = JSON.parse(read('data/routes.json'));
  const nPts = Array.isArray(pts) ? pts.length : (pts.points || []).length;
  const nRts = Array.isArray(rts) ? rts.length : (rts.routes || []).length;

  const m = readme.match(/\*\*(\d+)\s*个打卡点位\*\*/);
  if (m && +m[1] === nPts) ok(`README 点位数 ${nPts} 与 data/points.json 一致`);
  else fail(`README 点位数写 ${m ? m[1] : '（未写）'}，data/points.json 实际 ${nPts}`);

  const m2 = readme.match(/(\d+)\s*条每日动线/);
  if (m2 && +m2[1] === nRts) ok(`README 动线数 ${nRts} 与 data/routes.json 一致`);
  else fail(`README 动线数写 ${m2 ? m2[1] : '（未写）'}，data/routes.json 实际 ${nRts}`);

  const m3 = readme.match(/data\/\s+points\/routes\/ratings 等 JSON 数据（(\d+) 点位）/);
  if (m3 && +m3[1] === nPts) ok('README 仓库结构里的点位数一致');
  else if (m3) fail(`README 结构速览写 ${m3[1]} 点位，实际 ${nPts}`);
}

// 3) AGENTS 的页面数 = src/*.html 实际页面数
{
  const n = readdirSync(new URL('src/', root)).filter(f => f.endsWith('.html')).length;
  const m = agents.match(/(\d+)\s*个 HTML/);
  if (m && +m[1] === n) ok(`AGENTS 页面数 ${n} 与实际一致`);
  else fail(`AGENTS 页面数写 ${m ? m[1] : '（未写）'}，src/ 实际 ${n} 个 HTML`);
}

// 4) package.json 的 test 脚本必须覆盖所有 tools/*test*.mjs
{
  const pkg = JSON.parse(read('package.json'));
  const script = String(pkg.scripts?.test || '');
  const tests = readdirSync(new URL('tools/', root)).filter(f => /^(test-|coords-test|sw-policy-test|check-doc-facts)/.test(f) && f.endsWith('.mjs'));
  const missing = tests.filter(t => !script.includes(t));
  if (!missing.length) ok(`npm test 覆盖全部 ${tests.length} 个本地质量门`);
  else fail(`npm test 未包含：${missing.join('、')}`);
}

// 5) CI 覆盖不再在这里手写清单：由 tools/check-ci-parity.mjs 从 package.json 派生双向校验。
//    2026-11-01 的教训：这份手写 required 数组漏了 4 个门，文档事实门自己漂移成了假绿灯。

if (bad) { console.error(`\n${bad} 处文档与实现不一致`); process.exit(1); }
console.log('\n文档事实门通过');
