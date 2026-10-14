#!/usr/bin/env node
// 携程评分快照抓取（构建期工具；站点运行时不调用任何外部接口）
//
// 用法：
//   WENDAO_API_KEY=tok1,tok2 node tools/fetch-ctrip-ratings.mjs [--city=三亚] [--only=p531,p532]
//                       [--limit=25] [--retry-nodata] [--pages-only] [--dry]
//
// 三条经验（都踩过）：
//   1) 问法很关键：用自然提问（"X 在携程的评分是多少分？有多少条点评？"）它才会真去检索；
//      要求"只输出 JSON"反而经常偷懒返回 0。所以主提示词用自然问句，解析同时兼容 JSON 与散文。
//   2) 令牌有每日真查询配额（约 30 次/天/令牌），返回 0 的偷懒答案不计数；配额用尽脚本会优雅退出、断点续跑。
//   3) 拿到链接后用官方 POI 页面 HTML 复核数值（robots.txt 未禁规范 POI 页；服务端渲染的页面能解析，
//      客户端渲染的解析不到就保留 API 值）。
//
// 产物：data/ratings.json（静态快照 + 采集日期）。token 只从环境变量读，不落盘、不进仓库、不上服务器。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = resolve(ROOT, 'data');
const OUT = resolve(DATA, 'ratings.json');
const ENDPOINT = 'https://externalcallback.ctrip.com/skills/api/crew/workbuddy/searchInfo';
const TOKENS = (process.env.WENDAO_API_KEY || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
const pool = [...TOKENS];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const CN_CITIES = new Set(['哈尔滨', '伊宁', '三亚']);
const args = process.argv.slice(2);
const has = k => args.some(a => a === `--${k}` || a.startsWith(`--${k}=`));
const val = k => { const a = args.find(a => a.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : ''; };
const CITY = val('city'), ONLY = new Set(val('only').split(',').filter(Boolean));
const PAGES_ONLY = has('pages-only'), RETRY = has('retry-nodata'), DRY = has('dry');
const LIMIT = Number(val('limit') || 25 * Math.max(1, TOKENS.length));

if (!TOKENS.length && !PAGES_ONLY) { console.error('缺少 WENDAO_API_KEY（多令牌用逗号分隔）。用法：WENDAO_API_KEY=tok1,tok2 node tools/fetch-ctrip-ratings.mjs'); process.exit(1); }

const points = JSON.parse(readFileSync(resolve(DATA, 'points.json'), 'utf8'));
const targets = points.filter(p => !p.pending && CN_CITIES.has(p.city))
  .filter(p => !CITY || p.city === CITY)
  .filter(p => !ONLY.size || ONLY.has(p.id));

const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8'))
  : { updated: '', source: '携程/大众点评', items: {}, resolved: {}, nodata: [] };
state.items ||= {}; state.resolved ||= {}; state.nodata ||= [];
state.source ||= '携程/大众点评';
// 旧版扁平结构 → 多来源结构 { ratings: [ {src,...} ] }
for (const [id, v] of Object.entries(state.items)) {
  if (!v.ratings) state.items[id] = { ratings: [{ src: v.src || '携程', score: v.score, count: v.count, url: v.url, poiId: v.poiId, matched: v.matched, checked: v.checked, page: v.page, unverified: v.unverified }] };
}
// 人工录入的大众点评分数（data/dianping-manual.json）：{ "p470": {score,count?,url?} }
const MANUAL = resolve(DATA, 'dianping-manual.json');
if (existsSync(MANUAL)) {
  try {
    const man = JSON.parse(readFileSync(MANUAL, 'utf8'));
    let n = 0;
    for (const [id, m] of Object.entries(man)) {
      if (!m || !(m.score > 0)) continue;
      const entry = { src: '大众点评', score: +Number(m.score).toFixed(1), count: Number(m.count) || 0, url: String(m.url || `https://www.dianping.com/search/keyword/0/0_${encodeURIComponent(m.name || '')}`), checked: m.checked || 'manual' };
      const rec = state.items[id] || (state.items[id] = { ratings: [] });
      rec.ratings = rec.ratings.filter(r => r.src !== '大众点评');
      rec.ratings.push(entry);
      state.nodata = state.nodata.filter(x => x !== id);
      n++;
    }
    if (n) console.log(`已并入人工录入的大众点评分数 ${n} 条`);
  } catch (e) { console.warn('dianping-manual.json 解析失败：' + e.message); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- 问法：自然提问（关键），多句式轮换以规避"偷懒答案" ---------- */
const PHRASES = [
  p => `${p.name}（${p.city}）在携程的评分是多少分？有多少条点评？请给出评分、点评数和携程页面链接`,
  p => `我想去${p.city}玩，帮我查一下${p.name}在携程上的评分和点评数，顺便给个携程链接`,
  p => `${p.name}（${p.city}）携程点评多少分？多少条评价？`,
  p => `携程上「${p.name}」的评分和点评数量是多少？城市：${p.city}`,
];
let phraseIdx = 0;
function promptFor(p, retry = false) {
  if (retry) return `${p.name}（${p.city}）携程上的评分是多少？多少条点评？给出携程链接`;
  return PHRASES[phraseIdx++ % PHRASES.length](p);
}

/* ---------- 解析：JSON 优先，散文兜底 ---------- */
function extractJson(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
}
function parseProse(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const score = Number((t.match(/评分[为是约]?\s*\*{0,2}([\d.]+)\s*分/) || t.match(/\*{0,2}([\d.]+)\s*\/\s*5/) || [])[1]);
  const cntRaw = (t.match(/([\d,]{2,})\s*条(?:点评|评价|评论)?/) || [])[1] || '';
  const count = Number(cntRaw.replace(/,/g, ''));
  const url = (t.match(/https?:\/\/[^\s)\]<>"，、]*/i) || [])[0] || '';
  return { score: Number.isFinite(score) ? score : 0, count: Number.isFinite(count) ? count : 0, url };
}
const ALLOWED_HOST = /(^|\.)(ctrip\.com|trip\.com|trip\.cn)$/i;
function cleanUrl(u) {
  try {
    const url = new URL(String(u));
    if (!/^https?:$/.test(url.protocol) || !ALLOWED_HOST.test(url.hostname)) return '';
    url.searchParams.delete('allianceid');   // 剥掉问道项目自带的联盟追踪参数
    url.searchParams.delete('sid');
    return url.toString().replace(/\?$/, '');
  } catch { return ''; }
}

/* ---------- 来源 1：问道 API ---------- */
class QuotaExhausted extends Error {}
async function askOnce(tk, p, retry) {
  const res = await fetch(ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: { token: tk, query: promptFor(p, retry) } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) { if (/daily limit/i.test(j.error)) throw new QuotaExhausted(j.error); throw new Error(String(j.error)); }
  return String(j.result ?? '');
}
async function askAny(p, retry = false) {
  // 令牌轮询：成功即放回队尾；报"配额用尽"的直接剔除；网络类错误换下一个令牌重试
  if (!pool.length) throw new QuotaExhausted('所有令牌配额均用尽');
  let lastErr = null;
  const errored = [];
  while (pool.length) {
    const tk = pool.shift();
    try {
      const r = await askOnce(tk, p, retry);
      pool.push(tk);
      return r;
    } catch (e) {
      if (e instanceof QuotaExhausted) { console.log(`  ⚠️ 令牌 …${tk.slice(-4)} 配额用尽，剔除（剩 ${pool.length}）`); continue; }
      lastErr = e; errored.push(tk);
    }
  }
  pool.push(...errored);
  if (lastErr) throw lastErr;
  throw new QuotaExhausted('所有令牌配额均用尽');
}
function readAnswer(text) {                       // 一次回答 → {score,count,url,matched}
  const j = extractJson(text);
  if (j && Number(j.score) > 0) return { score: Number(j.score), count: Number(j.count) || 0, url: cleanUrl(j.url), matched: String(j.name || '').replace(/[<>]/g, ''), poiId: String(j.poiId || '') };
  const m = String(text).match(/<(?:|\w+)>([^<>\n]{2,30})<\/?>/);   // 散文里常用 <规范名> 标出
  const pr = parseProse(text);
  return { ...pr, url: cleanUrl(pr.url), matched: (m ? m[1] : '').trim(), poiId: '' };
}

/* ---------- 来源 2：官方 POI 页面（复核数值） ---------- */
async function readPage(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    const html = await r.text();
    const score = Number((html.match(/class="averageScore">([\d.]+)</) || [])[1]);
    const count = Number((html.match(/用户点评<!-- -->\((\d+)\)/) || [])[1]);
    if (!(score > 0 && score <= 5)) return null;
    return { score, count: Number.isFinite(count) ? count : 0 };
  } catch { return null; }
}

function setRating(id, entry) {          // 按来源 upsert，保持多来源结构
  const rec = state.items[id] || (state.items[id] = { ratings: [] });
  rec.ratings = (rec.ratings || []).filter(r => r.src !== entry.src);
  rec.ratings.push(entry);
  delete state.resolved[id];
}

function save() {
  state.updated = today();
  state.nodata = [...new Set(state.nodata)];
  if (!DRY) writeFileSync(OUT, JSON.stringify(state, null, 1) + '\n');
}

/* ---------- 模式 A：只用页面刷新数值（零配额） ---------- */
if (PAGES_ONLY) {
  const ids = [...new Set([...Object.keys(state.items), ...Object.keys(state.resolved)])].filter(id => !ONLY.size || ONLY.has(id));
  let ok = 0, miss = 0;
  for (const id of ids) {
    const rec = state.items[id] || state.resolved[id];
    const recUrl = (rec.ratings && rec.ratings[0] && rec.ratings[0].url) || rec.url;
    const page = await readPage(recUrl);
    if (page) {
      setRating(id, { src: '携程', score: page.score, count: page.count, url: recUrl, poiId: (rec.poiId || (rec.ratings && rec.ratings[0] && rec.ratings[0].poiId) || ''), checked: today(), page: true });
      delete state.resolved[id]; ok++;
      console.log(`  ✓ ${id} → 页面 ${page.score} 分 / ${page.count} 条`);
    } else { miss++; }
    await sleep(300);
  }
  save();
  console.log(`页面刷新：命中 ${ok} / 未命中 ${miss}（共 ${ids.length}）→ ${OUT}`);
  process.exit(0);
}

/* ---------- 模式 B：逐点抓取 ---------- */
(async () => {
  console.log(`目标 ${targets.length} 点位 | 令牌 ${TOKENS.length} 个 | 本次调用上限 ${LIMIT}`);
  let got = 0, urlOnly = 0, noData = 0, skipped = 0, failed = 0, calls = 0, streakNoData = 0;
  for (const p of targets) {
    const known = state.items[p.id] || state.resolved[p.id];
    if (known && !has('force')) { skipped++; continue; }
    if (!RETRY && state.nodata.includes(p.id) && !known) { skipped++; continue; }
    if (calls >= LIMIT) { console.log(`\n达到本次运行上限 ${LIMIT} 次调用，停止（进度已保存，明天再跑即可继续）`); break; }
    try {
      calls++;
      let ans = readAnswer(await askAny(p));
      if (!(ans.score > 0 && ans.score <= 5)) {           // 偷懒/没搜到：换更直白的问法再试一次
        await sleep(600); calls++;
        const alt = readAnswer(await askAny(p, true));
        if (alt.score > 0 && alt.score <= 5) ans = alt;
      }
      if (!(ans.score > 0 && ans.score <= 5)) {
        if (ans.url) {
          const page = await readPage(ans.url);
          if (page) {
            setRating(p.id, { src: '携程', score: page.score, count: page.count, url: ans.url, poiId: ans.poiId, matched: ans.matched, checked: today(), page: true });
            console.log(`  ✓ ${p.id} ${p.name} → 页面 ${page.score} 分 / ${page.count} 条`);
            got++;
          } else {
            state.resolved[p.id] = { url: ans.url, poiId: ans.poiId, matched: ans.matched };
            console.log(`  ▷ ${p.id} ${p.name} → 仅链接，数值待补`);
            urlOnly++;
          }
          state.nodata = state.nodata.filter(x => x !== p.id);
        } else {
          state.nodata.push(p.id); delete state.items[p.id];
          console.log(`  ○ ${p.id} ${p.name} → 未找到`);
          noData++;
          // 熔断：连续多点是"未找到"多半是配额被静默耗尽（接口此时答"查不到"而不报错），停止本轮以免空烧
          if (++streakNoData >= 6) {
            console.log(`\n⚠️ 连续 ${streakNoData} 个点位都"未找到"，疑似配额已静默耗尽（接口不再真检索）。本轮提前结束，进度已保存。`);
            save(); process.exit(0);
          }
        }
      } else {
        const page = await readPage(ans.url);
        setRating(p.id, page
          ? { src: '携程', score: page.score, count: page.count, url: ans.url, poiId: ans.poiId, matched: ans.matched, checked: today(), page: true }
          : { src: '携程', score: +ans.score.toFixed(1), count: Math.round(ans.count), url: ans.url, poiId: ans.poiId, matched: ans.matched, checked: today(), unverified: true });
        state.nodata = state.nodata.filter(x => x !== p.id);
        console.log(`  ✓ ${p.id} ${p.name} → ${ans.score} 分 / ${ans.count} 条${page ? '（页面核对）' : ans.url ? '' : '（无链接）'}`);
        got++;
      streakNoData = 0;
      }
      save();
    } catch (e) {
      if (e instanceof QuotaExhausted) { console.log(`\n⚠️ 配额用尽：${e.message}\n进度已保存，明天同样命令可续跑`); break; }
      failed++; console.log(`  ✗ ${p.id} ${p.name} → ${e.message}`);
    }
    await sleep(4000);   // 拉长间隔，降低被偷懒降级的概率
  }
  save();
  console.log(`\n本次：调用 ${calls} 次；取到数值 ${got}，仅链接 ${urlOnly}，未找到 ${noData}，跳过 ${skipped}，失败 ${failed}`);
  console.log(`累计：${Object.keys(state.items).length} 条评分，${Object.keys(state.resolved).length} 条仅链接，${state.nodata.length} 条未找到 → ${OUT}`);
})();
