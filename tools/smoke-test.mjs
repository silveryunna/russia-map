// Playwright 页面冒烟测试（CI 专用）：加载 map.html，抓白屏类错误，桌面+手机双截图
// CI: SMOKE_DEPS=/tmp/smoke node tools/smoke-test.mjs
// 依赖 playwright 不在仓库内安装，CI 里装到 /tmp/smoke 后通过 SMOKE_DEPS 指向
import { createRequire } from 'node:module';
const req = createRequire((process.env.SMOKE_DEPS || '.') + '/x.js');
const { chromium } = req('playwright');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8080';
let fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!cond) fail++; };

const browser = await chromium.launch();

async function probe(name, viewport, shot) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${BASE}/map.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 手动轮询而非 waitForFunction：首次加载 SW 注册后页面可能自动刷新，
  // waitForFunction 会因执行上下文销毁直接抛错（桌面首探必现的测试 bug，非产品 bug）
  let stats = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    stats = await page.textContent('#sb-stats').catch(() => '');
    if (/\d+\s*点位/.test(stats || '')) break;
    await page.waitForTimeout(500);
  }
  ok(`${name} 点位统计渲染`, /\d+\s*点位/.test(stats), stats.trim());
  const markers = await page.locator('.leaflet-marker-icon').count();
  ok(`${name} 地图标记渲染`, markers > 0, `${markers} 个`);
  // 白屏事故的特征错误（压缩产物补丁失败的表现就是 SyntaxError / JSON.parse）
  const fatal = errors.filter(e => /SyntaxError|JSON\.parse/i.test(e));
  ok(`${name} 无致命 JS 错误`, fatal.length === 0, fatal[0] || '');
  if (errors.length) console.log(`  [${name} 全部 console 错误]`, JSON.stringify(errors.slice(0, 5)));
  await page.screenshot({ path: shot, fullPage: false });
  await page.close();
}

await probe('桌面', { width: 1280, height: 800 }, 'smoke-desktop.png');
await probe('手机', { width: 390, height: 844 }, 'smoke-mobile.png');
await browser.close();
console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
