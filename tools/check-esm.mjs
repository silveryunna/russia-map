// assets/*.js 严格 ESM 解析校验（node --check 对含 import 的文件不可靠，历史上白屏事故由此漏检）
// 用法: node --experimental-vm-modules tools/check-esm.mjs
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0;
for (const f of readdirSync('assets').filter(f => f.endsWith('.js'))) {
  try {
    new vm.SourceTextModule(readFileSync('assets/' + f, 'utf8'), { identifier: f });
    console.log('✅ ' + f);
  } catch (e) {
    console.error(`❌ ${f}: ${e.message}`);
    bad++;
  }
}
if (bad) { console.error(`\n${bad} 个文件 ESM 解析失败（浏览器会整页白屏）`); process.exit(1); }
console.log('\n全部通过');
