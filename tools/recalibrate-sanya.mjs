#!/usr/bin/env node
// 一次性：三亚点位批量重校准（腾讯 place/suggestion 取 GCJ-02 → 转 WGS-84 → 生成校准计划）
// 用法: node tools/recalibrate-sanya.mjs            # 生成 tools/sanya-recalibrate-plan.json + 控制台报告
//       node tools/recalibrate-sanya.mjs --apply     # 将 plan 中非 review 项写回 data/points.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const P = resolve(ROOT, 'data/points.json');
const DP = resolve(ROOT, 'data/dianping-manual.json');
const OUT = resolve(ROOT, 'tools/sanya-recalibrate-plan.json');
const KEY = process.env.QQ_LBS_KEY; if (!KEY) { console.error('缺少环境变量 QQ_LBS_KEY（腾讯地图Key，只存本机/NAS，不入库）'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// GCJ-02 -> WGS-84
const PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
function tLat(x, y) { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3; r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3; return r; }
function tLng(x, y) { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3; r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3; return r; }
function gcj2wgs(lat, lng) { if (outOfChina(lat, lng)) return [lat, lng]; let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35); const radLat = lat / 180 * PI; let magic = Math.sin(radLat); magic = 1 - EE * magic * magic; const sq = Math.sqrt(magic); dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sq) * PI); dLng = (dLng * 180) / (A / sq * Math.cos(radLat) * PI); return [lat - dLat, lng - dLng]; }
const distM = (la1, lo1, la2, lo2) => Math.hypot((la1 - la2) * 111320, (lo1 - lo2) * 95200);

// 从名称提取区域（括号内的市县），返回 [区域, 清洗后的关键词]
function regionOf(name) {
  const m = name.match(/（(陵水|万宁|文昌|琼海|海口|后海|石梅湾)）/);
  const region = m ? ({ 后海: '三亚', 石梅湾: '万宁' }[m[1]] || m[1]) : '三亚';
  return [region, name.replace(/（.*?）/g, '').trim()];
}
// 名称相似度：关键词字符覆盖率
function similarity(kw, title) {
  const chars = [...new Set(kw.replace(/[·•\s]/g, ''))];
  const hit = chars.filter(c => title.includes(c)).length;
  return hit / chars.length;
}

async function search(kw, region) {
  const u = `https://apis.map.qq.com/ws/place/v1/suggestion?keyword=${encodeURIComponent(kw)}&region=${encodeURIComponent(region)}&page_size=10&key=${KEY}`;
  const r = await fetch(u, { headers: { Referer: 'https://map.qq.com/' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  return j.data || [];
}

const points = JSON.parse(readFileSync(P, 'utf8'));
const dp = JSON.parse(readFileSync(DP, 'utf8'));
const targets = points.filter(p => p.city === '三亚');
console.log(`三亚点位共 ${targets.length} 个`);

const plan = [];
let done = 0;
for (const p of targets) {
  const [region, baseKw] = regionOf(p.name);
  const dpName = dp[p.id]?.dpName || '';
  // 餐厅类优先用大众点评分店全名（含分店后缀），其他用点位名
  const kw = dpName || baseKw;
  let candidates = [];
  try { candidates = await search(kw, region); } catch (e) { /* fallthrough */ }
  await sleep(260);
  // 大众点评名无结果时退回点位名
  if (!candidates.length && kw !== baseKw) {
    try { candidates = await search(baseKw, region); } catch (e) { /* fallthrough */ }
    await sleep(260);
  }
  if (!candidates.length) {
    plan.push({ id: p.id, name: p.name, action: 'NOT_FOUND', old: p.lat ? [p.lat, p.lon] : null });
    console.log(`${p.id} ${p.name} -> 未找到`);
    continue;
  }
  // 选最佳：名称相似度优先，并列取第1个
  let best = candidates[0], bestSim = similarity(baseKw, candidates[0].title);
  for (const c of candidates) {
    const s = Math.max(similarity(baseKw, c.title), dpName ? similarity(dpName, c.title) : 0);
    if (s > bestSim) { best = c; bestSim = s; }
  }
  const gLat = best.location.lat, gLng = best.location.lng;
  const [wLat, wLng] = gcj2wgs(gLat, gLng);
  const moved = p.lat ? distM(p.lat, p.lon, wLat, wLng) : null;
  const needReview = moved === null ? false : moved > 300;
  plan.push({
    id: p.id, name: p.name, action: needReview ? 'REVIEW' : 'UPDATE',
    old: p.lat ? [p.lat, p.lon] : null, to: [+wLat.toFixed(6), +wLng.toFixed(6)],
    moved_m: moved === null ? null : Math.round(moved),
    match: `${best.title} | ${best.address || ''} | sim=${bestSim.toFixed(2)}`,
    had_coords: !!p.lat,
  });
  done++;
  const tag = needReview ? 'REVIEW' : 'ok';
  console.log(`${p.id} ${p.name} -> ${best.title} [${tag}${moved === null ? ' 新增' : ' 移动' + Math.round(moved) + 'm'}]`);
}

writeFileSync(OUT, JSON.stringify(plan, null, 1));
const nUpdate = plan.filter(x => x.action === 'UPDATE').length;
const nReview = plan.filter(x => x.action === 'REVIEW').length;
const nNF = plan.filter(x => x.action === 'NOT_FOUND').length;
console.log(`\n计划已写入 tools/sanya-recalibrate-plan.json: UPDATE=${nUpdate} REVIEW=${nReview} NOT_FOUND=${nNF}`);

if (APPLY) {
  let applied = 0;
  for (const e of plan) {
    if (e.action !== 'UPDATE') continue;
    const p = points.find(x => x.id === e.id);
    if (!p) continue;
    p.lat = e.to[0]; p.lon = e.to[1];
    delete p.pending;
    p.confidence = 100;
    applied++;
  }
  writeFileSync(P, JSON.stringify(points, null, 1) + '\n');
  console.log(`已写回 points.json: ${applied} 条`);
}
