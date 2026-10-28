// 重构验收脚本：验证从产物回译的 10 个功能块在新构建中真实存在
import { createRequire } from 'node:module';
const req = createRequire((process.env.SMOKE_DEPS || '.') + '/x.js');
const { chromium } = req('playwright');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8899';
let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) fail++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`${BASE}/map.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// 1. 侧栏三页签（打卡清单/每日动线/美食住行）
ok('三页签存在', await page.locator('#tab-life').count() === 1);

// 2. 国家分组头（四级侧栏）
const countryHeads = await page.locator('.country-head').count();
ok('国家分组头', countryHeads >= 2, `${countryHeads} 个`);

// 3. 城市默认折叠（opened 逻辑）：城市头存在但点位行收起
const cityHeads = await page.locator('.city-head[data-toggle^="city:"]').count();
ok('城市头渲染', cityHeads >= 5, `${cityHeads} 个`);

// 4. 标签 chips + 展开钮（>5 个标签时）
ok('标签 chips', await page.locator('.tag-chip').count() > 5);
ok('标签展开钮', await page.locator('[data-tags-toggle]').count() === 1);

// 5. 图层方案控件 + 刷新控件 + 城市快跳
ok('图层方案控件 🌐', await page.locator('.region-ctl').count() === 1);
ok('刷新控件 🔄', await page.locator('.refresh-ctl').count() === 1);
ok('城市快跳 🏙️', await page.locator('.cityjump-ctl').count() === 1);

// 6. 搜索控件（本地打卡点搜索，button 样式）
ok('打卡点搜索', (await page.locator('.leaflet-control-geosearch').count()) >= 1);

// 7. 城市折叠/展开交互：点开第一个城市头 → 出现点位群
const firstCity = page.locator('.city-head[data-toggle^="city:"]').first();
await firstCity.click();
await page.waitForTimeout(300);
ok('城市展开出点位群', await page.locator('.cluster-head').count() >= 1);

// 8. 美食住行页签：切过去有分类城市组
await page.click('#tab-life');
await page.waitForTimeout(300);
const lifeHeads = await page.locator('.city-head[data-toggle^="life:"]').count();
ok('美食住行分组', lifeHeads >= 1, `${lifeHeads} 组`);

// 9. 动线页签：国家分组 + 播放按钮
await page.click('#tab-routes');
await page.waitForTimeout(300);
ok('动线分组头', await page.locator('.city-head[data-toggle^="rg:"]').count() >= 1);
const firstRoute = page.locator('.route-card[data-route]').first();
await firstRoute.click();
await page.waitForTimeout(400);
ok('动线播放按钮', await page.locator('[data-play]').count() === 1);

// 10. 点位弹窗：点一个地图标记，验证一键导航按钮
await page.click('#tab-points');
await page.waitForTimeout(300);
const marker = page.locator('.leaflet-marker-icon').first();
await marker.click();
await page.waitForTimeout(800);
const popupNav = await page.locator('.leaflet-popup .popup-nav').count();
ok('弹窗一键导航按钮', popupNav === 1);

// 11. 分类图标（餐厅/酒店等方块图标存在）：先城市快跳放大到莫斯科，点位散开后检查
await page.click('.cityjump-ctl > button');
await page.waitForTimeout(300);
await page.locator('.cj-item', { hasText: '莫斯科' }).first().click();
await page.waitForTimeout(3500);
const hasBoxIcons = await page.evaluate(() =>
  [...document.querySelectorAll('.leaflet-marker-icon')].some(i => i.innerHTML.includes('border-radius:8px')));
ok('分类图标渲染', hasBoxIcons);

// 12. 覆盖层（水上巴士航线等）
const polylines = await page.evaluate(() => document.querySelectorAll('path.leaflet-interactive').length);
ok('覆盖层折线', polylines >= 3, `${polylines} 条 path`);

// 致命错误汇总
const fatal = errors.filter(e => /SyntaxError|JSON\.parse/i.test(e));
ok('无致命 JS 错误', fatal.length === 0, fatal[0] || '');
if (errors.length) console.log('  [全部 pageerror]', JSON.stringify(errors.slice(0, 5)));

await page.screenshot({ path: 'verify-desktop.png' });
await browser.close();
console.log(fail ? `\n${fail} 项未通过` : '\n全部通过');
process.exit(fail ? 1 : 0);
