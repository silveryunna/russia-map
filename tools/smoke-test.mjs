// Playwright 页面冒烟测试（CI 专用）：加载 map.html（桌面+手机）与 plan.html（Trip v2 生成→编辑→刷新恢复）
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

// 计划页现在是 Trip v2 编辑器：生成 → 落 IndexedDB → 排序/撤销 → 刷新恢复
async function probePlan(name, viewport, shot) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${BASE}/plan.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 清空旧计划与本地数据库（直接清 store，避免 deleteDatabase 被已打开的连接阻塞）
  await page.evaluate(async () => {
    localStorage.removeItem('travel-plans-v1');
    localStorage.removeItem('travel-checkin-v2');
    // 只清已存在的库：不带版本号 open 一个不存在的库会凭空建出「没有任何 object store 的 v1 空库」，
    // 之后应用 open(name, 1) 不再触发 upgrade，trips store 永远建不起来 —— CI 冒烟随机挂的根因。
    const known = await indexedDB.databases();
    if (!known.some(d => d.name === 'travel-trips')) return;
    const db = await new Promise(res => {
      const r = indexedDB.open('travel-trips', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    });
    if (!db) return;
    const names = [...db.objectStoreNames];
    if (names.length) {
      await new Promise(res => {
        const t = db.transaction(names, 'readwrite');
        names.forEach(n => t.objectStore(n).clear());
        t.oncomplete = res;
        t.onerror = res;
      });
    }
    db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pl-new', { timeout: 30000 });
  ok(`${name} 行程页渲染`, true);

  const readTrips = () => page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some(d => d.name === 'travel-trips')) return [];
    const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-trips', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (!db.objectStoreNames.contains('trips')) { db.close(); return []; }
    const list = await new Promise((res, rej) => {
      const t = db.transaction('trips', 'readonly');
      const r = t.objectStore('trips').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return list;
  });

  await page.click('#pl-new');
  await page.waitForSelector('#pl-gen-rule', { timeout: 15000 });
  await page.fill('#pl-date', '2026-11-01');
  const days = await page.inputValue('#pl-days').catch(() => '');
  ok(`${name} 新建表单可选天数`, Number(days) >= 1, `days=${days}`);
  await page.click('#pl-gen-rule');
  await page.waitForSelector('.pl-day', { timeout: 20000 });
  const dayCount = await page.locator('.pl-day').count();
  const itemCount = await page.locator('.tr-item').count();
  ok(`${name} 规则引擎生成行程`, dayCount > 0 && itemCount > 0, `${dayCount} 天 / ${itemCount} 项`);

  const stored = await readTrips();
  ok(`${name} 行程写入 IndexedDB（schemaVersion 2）`,
    stored.length === 1 && stored[0].schemaVersion === 2 && stored[0].days.length === dayCount,
    `${stored.length} 份 / rev ${stored[0] && stored[0].revision}`);
  ok(`${name} 软目标行渲染`, await page.locator('.tr-soft').count() > 0, '');
  ok(`${name} 顺序求解入口可见`, await page.locator('[data-optimize]').count() > 0, '');
  ok(`${name} 通行时间标注第三方路线来源`,
    (await page.locator('.tr-feas').filter({ hasText: '第三方路线' }).count()) > 0, '');

  // 排序 → 撤销
  const firstDay = page.locator('.pl-day').first();
  const namesBefore = await firstDay.locator('.tr-name').allTextContents();
  await firstDay.locator('[data-dn]').first().click();
  await page.waitForTimeout(400);
  const namesAfter = await firstDay.locator('.tr-name').allTextContents();
  ok(`${name} 点位可下移重排`, namesAfter[0] === namesBefore[1] && namesAfter[1] === namesBefore[0], `${namesBefore.slice(0, 2)} → ${namesAfter.slice(0, 2)}`);
  await page.click('#tr-undo');
  await page.waitForTimeout(400);
  const namesUndo = await firstDay.locator('.tr-name').allTextContents();
  ok(`${name} 撤销恢复顺序`, namesUndo[0] === namesBefore[0], namesUndo.slice(0, 2).join(' / '));

  // 时间轴视图：色块渲染 → 点选面板 → 拖动锁定
  await page.click('#tr-layout');
  await page.waitForSelector('.tl-block', { timeout: 10000 });
  const blockCount = await page.locator('.tl-block').count();
  ok(`${name} 时间轴视图渲染色块`, blockCount === itemCount, `${blockCount} 块 / ${itemCount} 项`);
  await page.locator('.tl-block').first().click();
  await page.waitForSelector('.tr-item-panel', { timeout: 5000 });
  ok(`${name} 时间轴点选打开控件面板`, await page.locator('.tr-item-panel').count() === 1, '');
  ok(`${name} Plan B 候选可见`, await page.locator('.tr-planb [data-alt-place]').count() > 0, '');
  const dragBlock = page.locator('.tl-block').nth(1);
  await dragBlock.scrollIntoViewIfNeeded();
  const dragBox = await dragBlock.boundingBox();
  if (dragBox) {
    await page.mouse.move(dragBox.x + 40, dragBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + 40, dragBox.y + 90, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const afterDrag = await readTrips();
    const pin = afterDrag[0].days.flatMap(d => d.items).map(i => i.pinnedStart).find(Boolean);
    ok(`${name} 拖动色块写入 pinnedStart`, /^\d{2}:\d{2}$/.test(pin || ''), pin || '');
  }
  await page.screenshot({ path: shot.replace(/\.png$/, '-timeline.png'), fullPage: false });
  await page.click('#tr-layout');
  await page.waitForSelector('.tr-item', { timeout: 5000 });

  // 刷新后完整恢复
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pl-card', { timeout: 20000 });
  const cards = await page.locator('.pl-card').count();
  ok(`${name} 刷新后行程仍在列表`, cards === 1, `${cards} 份`);
  await page.locator('.pl-card [data-open]').first().click();
  await page.waitForSelector('.pl-day', { timeout: 20000 });
  const itemsAfterReload = await page.locator('.tr-item').count();
  ok(`${name} 刷新后逐日内容完整`, itemsAfterReload === itemCount, `${itemsAfterReload} 项`);

  // 午餐快捷插入 + 就地改停留
  await page.locator('[data-lunch="0"]').first().click();
  await page.waitForTimeout(700);
  const withMeal = await readTrips();
  const meal = withMeal[0].days[0].items.find(i => i.type === 'meal');
  ok(`${name} 午餐快捷插入`, !!meal && meal.estimatedDuration === 60 && meal.mustVisit === false,
    meal ? `${meal.placeNameSnapshot}/${meal.estimatedDuration}m` : '');
  const plus = page.locator('[data-dwell][data-step="15"]').first();
  if (await plus.count()) {
    await plus.click();
    await page.waitForTimeout(600);
    const afterDwell = await readTrips();
    ok(`${name} 就地改停留时长`, afterDwell[0].days[0].items.some(i => i.estimatedDuration === 75), '');
  }
  await page.locator('[data-rest="0"]').first().click();
  await page.waitForTimeout(700);
  const withRest = await readTrips();
  const rest = withRest[0].days[0].items.find(i => i.type === 'break');
  ok(`${name} 休息快捷插入`, !!rest && rest.estimatedDuration === 20 && rest.mustVisit === false,
    rest ? `${rest.placeNameSnapshot}/${rest.estimatedDuration}m` : '');
  const modeSel = page.locator('[data-day-mode="0"]').first();
  if (await modeSel.count()) {
    await modeSel.selectOption('taxi');
    await page.waitForTimeout(500);
    const withTaxi = await readTrips();
    ok(`${name} 交通预算可切打车`, withTaxi[0].days[0].transportMode === 'taxi', withTaxi[0].days[0].transportMode || '');
    const taxiChip = await page.locator('.tr-soft-chip').filter({ hasText: '打车' }).first().textContent().catch(() => '');
    ok(`${name} 打车费用显示`, taxiChip.includes('₽'), taxiChip);
  }

  const fatal = errors.filter(e => /SyntaxError|JSON\.parse|is not defined/i.test(e));
  ok(`${name} 行程页无致命 JS 错误`, fatal.length === 0, fatal[0] || '');
  if (errors.length) console.log(`  [${name} 行程页全部 console 错误]`, JSON.stringify(errors.slice(0, 5)));
  await page.screenshot({ path: shot, fullPage: false });
  await page.close();
}

await probe('桌面', { width: 1280, height: 800 }, 'smoke-desktop.png');
await probe('手机', { width: 390, height: 844 }, 'smoke-mobile.png');
await probePlan('桌面', { width: 1280, height: 800 }, 'smoke-plan-desktop.png');
await browser.close();
console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
