#!/usr/bin/env node
// 评分链接体检：批量探测 data/ratings.json 里的 url 是否存活，并抓 <title> 供人工比对
//
// 用法: node tools/verify-rating-urls.mjs              # 全量（items + resolved）
//       node tools/verify-rating-urls.mjs --low        # 仅低置信条目（count<10，前端不展示的那些）
//
// 用途：
//   • 404/410 → POI 下架或当初就匹配错了，应剔除
//   • title 与点位名一致 → 可把 unverified 条目「转正」（补 poiId/matched 后入库）
//   • 注意：携程/点评有反爬，403/「身份核实」页不代表链接失效，需人工判读
//
// 需要外网；若 Node 直连不通，设置 HTTPS_PROXY 环境变量（脚本遵循 NODE_USE_ENV_PROXY）。

import { readFileSync } from 'node:fs';

const LOW = process.argv.includes('--low');
const r = JSON.parse(readFileSync('data/ratings.json', 'utf8'));
const pts = JSON.parse(readFileSync('data/points.json', 'utf8'));
const byId = new Map(pts.map((p) => [p.id, p]));
const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' };

const jobs = [];
for (const [id, v] of Object.entries(r.items || {})) {
  for (const rr of v.ratings) {
    const low = typeof rr.count === 'number' && rr.count < 10 && !(rr.src === '大众点评' && rr.count >= 5);
    if (LOW && !low) continue;
    if (!rr.url) continue;
    jobs.push({ id, url: rr.url, src: rr.src, score: rr.score, count: rr.count, low });
  }
}
if (!LOW) {
  for (const [id, v] of Object.entries(r.resolved || {})) {
    if (v?.url) jobs.push({ id, url: v.url, src: 'resolved', score: '-', count: '-', low: false });
  }
}

console.log(`待探测 ${jobs.length} 条${LOW ? '（仅低置信）' : ''}\n`);
for (const j of jobs) {
  const name = (byId.get(j.id)?.name || '').slice(0, 16);
  try {
    const res = await fetch(j.url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const txt = await res.text().catch(() => '');
    const m = txt.match(/<title>([^<]{0,90})/);
    const title = m ? m[1].replace(/\s+/g, ' ').trim() : '(无 title)';
    const flag = res.status >= 400 ? '❌' : (j.low ? '⚠️' : '✅');
    console.log(`${flag} ${j.id} ${String(res.status).padEnd(3)} ${j.src} ${j.score}/${j.count} ${name}`);
    console.log(`     ${title.slice(0, 70)}`);
  } catch (e) {
    console.log(`❌ ${j.id} ERR ${name} ${e.message.slice(0, 30)}`);
  }
}
console.log('\n提示：标题与点位名一致 → 可转正；404 → 剔除；403/身份核实 → 反爬，非失效');
