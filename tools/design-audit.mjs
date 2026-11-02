#!/usr/bin/env node
// 设计门（渲染层，CI 强制）：在真实浏览器里量对比度 / 触摸热区 / 溢出 / 可达命名 / 版权遮挡
// 为什么需要它：DESIGN.md 的对比度是公式算的，静态 lint 也看不出"渲染出来糊不糊"。
//   首轮实测就发现：plan 页 225 个文本节点里 99 个不达 4.5:1（10px 小灰字 2.22:1），
//   而 210 个可交互控件短边 <32px —— 这些都不是靠读 CSS 能发现的。
// 分级：棘轮（只准降不准升）。FAIL 立即阻断。
// 用法: SMOKE_DEPS=/tmp/smoke node tools/design-audit.mjs [BASE] [--all]
//   BASE 默认 http://127.0.0.1:8080；--all 跑 320/375/390/768/1440 全矩阵（默认只跑 390 + 1440）
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const req = createRequire((process.env.SMOKE_DEPS || process.cwd()) + '/x.js');
const { chromium } = req('playwright');

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const BASELINE_FILE = 'tools/design-audit-baseline.json';
const BASE = (process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || 'http://127.0.0.1:8080').replace(/\/$/, '');
const ALL = process.argv.includes('--all');
const SIZES = ALL ? [[320, 568], [375, 812], [390, 844], [768, 1024], [1440, 900]] : [[390, 844], [1440, 900]];
const PAGES = ['map', 'plan', 'today'];
const tighten = process.argv.includes('--tighten');

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

const MEASURE = `(() => {
  const lum=(r,g,b)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const parse=c=>{const m=String(c).match(/[\\d.]+/g);if(!m)return null;return{r:+m[0],g:+m[1],b:+m[2],a:m.length>3?+m[3]:1};};
  const ratio=(a,b)=>{const l1=lum(a.r,a.g,a.b),l2=lum(b.r,b.g,b.b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
  const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0.85)return c;n=n.parentElement;}return {r:250,g:250,b:247,a:1};};
  const vis=el=>{const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return false;const s=getComputedStyle(el);return s.visibility!=='hidden'&&+s.opacity>0.15;};
  const sel=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className.trim()?'.'+String(el.className).trim().split(/\\s+/)[0]:'');
  const o={text:0,contrastFail:0,contrastFail3:0,worst:[],tapUnder32:0,tapUnder44:0,tapOverlap:0,emojiOnly:0,unnamed:0,aria:0,hScroll:0,attribCovered:0,attribOff:0,microNecessary:0};
  for(const el of document.querySelectorAll('body *')){
    if(el.children.length||!vis(el))continue;if(el.closest('.leaflet-map-pane'))continue;   // 瓦片上的文字随地图像素变化，不纳入确定性对比度
    const t=(el.textContent||'').trim();if(t.length<2)continue;
    const s=getComputedStyle(el);const fg=parse(s.color);if(!fg)continue;const cr=ratio(fg,bgOf(el));o.text++;
    const px=parseFloat(s.fontSize),bold=+s.fontWeight>=700,need=(px>=24||(px>=18.66&&bold))?3:4.5;
    if(cr<need)o.contrastFail++;
    if(cr<3)o.contrastFail3++;
    if(cr<need&&o.worst.length<5)o.worst.push({sel:sel(el),px:Math.round(px),text:t.slice(0,14),ratio:+cr.toFixed(2)});
  }
  o.worst.sort((a,b)=>a.ratio-b.ratio);
  const boxes=[];
  for(const el of document.querySelectorAll('button,a[href],input,select,[role=button],[onclick],summary')){
    if(!vis(el))continue;const r=el.getBoundingClientRect();const min=Math.min(r.width,r.height);
    if(r.height<44)o.tapUnder44++;
    if(min<32)o.tapUnder32++;
    if(min<44)boxes.push({sel:sel(el),l:r.left,t:r.top,r:r.right,b:r.bottom});
    const name=(el.getAttribute('aria-label')||el.textContent||el.title||el.placeholder||'').trim();
    if(!name)o.unnamed++;
    else if(/\\p{Extended_Pictographic}/u.test(name)&&!/\\p{Script=Han}|[A-Za-z\\d]/u.test(name))o.emojiOnly++;
  }
  // 热区互相重叠（39b 的守卫：扩了热区却不许叠，否则后一个吃掉前一个的点击）
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    if(a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b){const ox=Math.min(a.r,b.r)-Math.max(a.l,b.l),oy=Math.min(a.b,b.b)-Math.max(a.t,b.t);if(ox>6&&oy>6)o.tapOverlap++;}
  }
  o.aria=document.querySelectorAll('[aria-label]').length;
  if(document.documentElement.scrollWidth>innerWidth+1){o.hScroll=document.documentElement.scrollWidth-innerWidth;}
  const at=document.querySelector('.leaflet-control-attribution');
  if(at){const r=at.getBoundingClientRect();
    if(r.bottom>innerHeight||r.top<0)o.attribOff=1;
    const px=Math.min(r.x+r.width/2,innerWidth-4),py=Math.max(0,Math.min(r.bottom-6,innerHeight-1));
    const probe=document.elementFromPoint(px,py);
    if(probe&&!probe.contains(at)&&!at.contains(probe))o.attribCovered=1;}
  return JSON.stringify(o);
})()`;

async function openPlan(page) {
  await page.waitForSelector('#pl-new', { timeout: 20000 }).catch(() => {});
  await page.click('#pl-new').catch(() => {});
  await page.waitForSelector('#pl-gen-rule', { timeout: 15000 }).catch(() => {});
  await page.fill('#pl-date', '2026-11-13').catch(() => {});
  await page.fill('#pl-days', '6').catch(() => {});
  await page.click('#pl-gen-rule').catch(() => {});
  await page.waitForSelector('.pl-day', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
}

const browser = await chromium.launch();
const now = {};
for (const [w, h] of SIZES) {
  for (const name of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 800 ? 2 : 1, hasTouch: w < 800, isMobile: w < 800 });
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e.message).slice(0, 90)));
    await page.goto(`${BASE}/plan.html`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await openPlan(page);                       // 先生成一份 6 天行程：today 页与 plan 编辑器都要有真实数据才可测
    if (name === 'today') {
      await page.goto(`${BASE}/today.html`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);
    } else if (name === 'map') {
      await page.goto(`${BASE}/map.html`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3500);
    } else {
      await page.waitForTimeout(800);
    }
    let m;
    try { m = JSON.parse(await page.evaluate(MEASURE)); }
    catch (e) { fail(`${name}@${w}：测量失败 ${String(e.message).slice(0, 90)}`); await ctx.close(); continue; }
    const key = `${name}@${w}`;
    now[key] = { contrastFail: m.contrastFail, contrastFail3: m.contrastFail3, tapUnder32: m.tapUnder32, tapOverlap: m.tapOverlap, emojiOnly: m.emojiOnly, unnamed: m.unnamed, hScroll: m.hScroll, attribCovered: m.attribCovered, attribOff: m.attribOff };
    console.log(`${key.padEnd(14)} 文本${String(m.text).padStart(4)}｜对比度不达 ${String(m.contrastFail).padStart(3)}（其中<3:1 ${m.contrastFail3}）｜热区<32 ${String(m.tapUnder32).padStart(3)}｜热区互叠 ${m.tapOverlap}｜emoji独占 ${m.emojiOnly}｜无名 ${m.unnamed}｜横向溢出 ${m.hScroll}｜版权 ${m.attribCovered ? '被遮挡' : m.attribOff ? '滑出视口' : 'OK'}${jsErrors.length ? '｜JS错误 ' + jsErrors[0] : ''}`);
    if (m.worst.length) console.log(`    最差: ${m.worst.map(x => `${x.sel}(${x.px}px ${x.ratio}) ${x.text}`).join(' | ')}`);
    if (jsErrors.length) fail(`${key}：页面 JS 报错 ${jsErrors[0]}`);
    if (m.hScroll) fail(`${key}：${w}px 下出现横向滚动 ${m.hScroll}px`);
    if (m.attribCovered || m.attribOff) fail(`${key}：OSM 版权/备案号被遮挡或滑出视口（合规硬约束）`);
    await ctx.close();
  }
}
await browser.close();

let baseline = {};
try { baseline = JSON.parse(readFileSync(resolve(root, BASELINE_FILE), 'utf8')); } catch { baseline = {}; }
const METRICS = ['contrastFail', 'contrastFail3', 'tapUnder32', 'tapOverlap', 'emojiOnly', 'unnamed'];
if (tighten) {
  writeFileSync(resolve(root, BASELINE_FILE), JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), pages: now }, null, 1) + '\n', 'utf8');
  console.log('✅ 渲染基线已登记 → ' + BASELINE_FILE);
} else if (!baseline.pages) {
  console.log('⚠️  无渲染基线：先跑 `node tools/design-audit.mjs <BASE> --tighten`');
} else {
  for (const [key, caps] of Object.entries(baseline.pages)) {
    if (!now[key]) continue;                       // 本轮未跑该视口（--all 与 PR 档不同）
    for (const metric of METRICS) {
      const was = caps[metric]; if (was === undefined) continue;
      if (now[key][metric] > was) fail(`${key} ${metric}：${was} → ${now[key][metric]}（棘轮只准降不准升）`);
    }
  }
}
if (bad) { console.error(`\n设计门（渲染层）未通过：${bad} 项`); process.exit(1); }
console.log('\n设计门（渲染层）通过');
