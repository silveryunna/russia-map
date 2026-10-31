#!/usr/bin/env node
// CI / 本地质量门一致性门（2026-11-01 P0/W1）
// 事故背景：check.yml 漏跑 test-visit-repository / test-trip-execution / test-trip-offline /
// check-transit-matrix-anomalies 四个质量门，而 check-doc-facts.mjs 里那份「手写 required 清单」
// 没跟着更新，于是文档事实门自己漂移、CI 一路绿灯。
// 规则：清单不再手写，一律从 package.json 的 test 脚本派生（单一事实源）。
// 用法: node tools/check-ci-parity.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// CI 专属步骤：需要构建产物 / 浏览器 / 外部依赖，无法放进 npm test。
// 新增 CI 步骤要么同步进 npm test，要么显式登记在这里——登记本身就是一次评审。
const CI_ONLY = new Set([
  'tools/check-data.mjs',       // 由 npm run check-data 承担，且 pre-commit 也会跑
  'tools/mutation-test.mjs',    // 变异测试较慢，单独在 CI 跑
  'tools/check-esm.mjs',        // 需要先 build（--experimental-vm-modules）
  'tools/check-build-sync.mjs', // 需要 npm ci + vite build
  'tools/smoke-test.mjs',       // 需要 Playwright 与静态服务器
]);

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const warn = (m) => console.log('⚠️  ' + m);

// 1) 本地质量门：从 package.json 的 test 脚本派生，不维护第二份清单
const pkg = JSON.parse(read('package.json'));
const testScript = String(pkg.scripts?.test || '');
const localGates = [...new Set(
  [...testScript.matchAll(/\bnode\s+(tools\/[\w./-]+\.mjs)/g)].map((m) => m[1]),
)];
if (!localGates.length) fail('package.json 的 test 脚本里没有解析到任何 tools/*.mjs');
else ok(`从 npm test 派生 ${localGates.length} 个本地质量门`);

// 2) CI 实际执行的脚本：先剔除注释行，避免「只在注释里提到」被误判为已执行
const ciRaw = read('.github/workflows/check.yml');
const ciText = ciRaw.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
const ciGates = new Set(
  [...ciText.matchAll(/tools\/([\w.-]+\.mjs)/g)].map((m) => 'tools/' + m[1]),
);

// 3) 正向：npm test 跑的每个门，CI 必须也跑（本次事故就是这一条被破坏）
const missingInCi = localGates.filter((g) => !ciGates.has(g));
if (missingInCi.length) fail(`CI 未执行（npm test 有）：${missingInCi.join('、')}`);
else ok('npm test 的每个质量门都在 CI 里执行');

// 4) 反向：CI 跑的每个脚本，要么在 npm test 里，要么显式登记为 CI 专属
const notLocal = [...ciGates].filter((g) => !localGates.includes(g) && !CI_ONLY.has(g));
if (notLocal.length) fail(`CI 执行但 npm test 未覆盖、也未登记 CI_ONLY：${notLocal.join('、')}`);
else ok('CI 执行的所有脚本都有本地对应或显式登记');

// 5) 两边引用的脚本必须真实存在（防改名后留下幽灵引用）
const referenced = new Set([...localGates, ...ciGates]);
const ghosts = [];
for (const g of referenced) {
  try { read(g); } catch { ghosts.push(g); }
}
if (ghosts.length) fail(`引用了不存在的脚本：${ghosts.join('、')}`);
else ok(`${referenced.size} 个被引用的脚本都存在`);

// 6) 白名单过期提醒（不判死）：登记了 CI_ONLY，但 CI 已经不再执行
const stale = [...CI_ONLY].filter((g) => !ciGates.has(g));
if (stale.length) warn(`CI_ONLY 已过期，可从清单删除：${stale.join('、')}`);

if (bad) { console.error(`\n${bad} 处 CI 与本地质量门不一致`); process.exit(1); }
console.log('\nCI 一致性门通过');
