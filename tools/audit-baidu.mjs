#!/usr/bin/env node
// 百度地图 Agent Plan 坐标核对（第四商业源：语义检索 + 地理编码）
// 定位：给中国点位找「另一个独立商业图源」的证据，输出一致/偏差/未命中，默认只读不写库。
// 坐标口径：Agent Plan 返回 GCJ-02（SKILL.md「所有工具返回坐标类型统一为 gcj02」，2026-11-03 天安门实测校准），
//   经 gcj2wgs() 降到 WGS84 后再比距离；报告里的坐标一律 WGS84。
//   经典 Place Web 服务（/place/v2/search）返回 BD-09，两套口径别混用（混用会整体偏 ~800m）。
// 计费：place / geocoding 均按次消耗 Agent Plan 额度，因此必须显式选范围，结果带缓存（tools/.cache 已 gitignore）。
// 用法:
//   BAIDU_MAP_AUTH_TOKEN=xxx node tools/audit-baidu.mjs --ids p477,p490
//   BAIDU_MAP_AUTH_TOKEN=xxx node tools/audit-baidu.mjs --city 哈尔滨 [--limit 10] [--geocode]
//   BAIDU_MAP_AUTH_TOKEN=xxx node tools/audit-baidu.mjs --all [--refresh] [--apply-conf]
// 纪律：只升置信度（--apply-conf，需 <150m 且名称命中 ≥0.9），不改坐标；坐标调整一律人工。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gcj2wgs } from '../src/pages/map/coords.js';
import { CN_CITIES, CITY_REGION, PROVINCE, AGREE, FAR, distM, cleanName, coreName, nameScore } from './lib/audit-shared.mjs';

const TOKEN = process.env.BAIDU_MAP_AUTH_TOKEN || '';
if (!TOKEN) {
  console.error('缺少 BAIDU_MAP_AUTH_TOKEN 环境变量（百度地图 Agent Plan 的 SK，不要写进仓库）');
  console.error('Windows: [Environment]::SetEnvironmentVariable("BAIDU_MAP_AUTH_TOKEN","<SK>","User") 后重开终端');
  process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const cities = argv.reduce((acc, a, i) => (a === '--city' && argv[i + 1] ? acc.concat(argv[i + 1]) : acc), []);
const ids = (opt('--ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const limit = Number(opt('--limit', '0')) || 0;
const ALL = flag('--all');
const APPLY = flag('--apply-conf');
const REFRESH = flag('--refresh');
const GEOCODE = flag('--geocode');
const DRY = flag('--dry');

const FILE = 'data/points.json';
const CACHE_DIR = 'tools/.cache';
const CACHE_FILE = `${CACHE_DIR}/baidu-audit.json`;
const REPORT_FILE = `${CACHE_DIR}/baidu-audit-report.json`;
const API = 'https://api.map.baidu.com/agent_plan/v1';

if (!ALL && !ids.length && !cities.length) {
  console.error('必须显式选择范围（百度按次计费）：--ids p477,p490 | --city 哈尔滨 | --all');
  process.exit(1);
}
if (ALL && !ids.length && !cities.length) {
  const n = JSON.parse(readFileSync(FILE, 'utf8')).filter((p) => CN_CITIES.has(p.city) && !p.pending).length;
  console.log(`⚠️ --all 会对 ${n} 个国内点位发起付费调用（最坏 ${n * (GEOCODE ? 3 : 2)} 次），3 秒后继续，Ctrl+C 可中断`);
  await new Promise((r) => setTimeout(r, 3000));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pts = JSON.parse(readFileSync(FILE, 'utf8'));
let targets = pts.filter((p) => CN_CITIES.has(p.city) && !p.pending);
if (ids.length) targets = targets.filter((p) => ids.includes(p.id));
if (cities.length) targets = targets.filter((p) => cities.includes(p.city));
if (limit) targets = targets.slice(0, limit);
if (!targets.length) { console.error('没有匹配的点位，检查 --ids / --city 拼写'); process.exit(1); }

mkdirSync(CACHE_DIR, { recursive: true });
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : { version: 1, entries: {} };
cache.entries ||= {};

let apiCalls = 0;
async function api(path, params, tries = 2) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let i = 1; i <= tries; i++) {
    apiCalls++;
    try {
      const r = await fetch(u, { headers: { authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(30000) });
      const d = await r.json();
      if (d.status === 0 || d.status === '0') return d;
      const err = new Error(`HTTP ${r.status} status=${d.status} ${d.message || ''}`.slice(0, 80));
      if (i < tries && (r.status === 429 || r.status >= 500)) { await sleep(1500); continue; }
      throw err;
    } catch (e) {
      if (i < tries && /timeout|fetch failed|ECONN|UND_ERR/i.test(e.message)) { await sleep(1500); continue; }
      throw e;
    }
  }
}

// 从 note 里抽一个「路/街/巷 + 门牌」的地址片段，作为语义检索的消歧线索。
// 只取地址本身，别把「2026年迁至…」这类叙述带进去——那会把检索带偏。
function addressHint(note) {
  for (const seg of String(note || '').split(/[；。;，,]/)) {
    const m = seg.match(/([\u4e00-\u9fa5]{2,10}(?:路|街|巷|大道|大街|胡同)\s*\d+(?:\s*[-—~至]\s*\d+)?\s*号?)/);
    if (!m) continue;
    const a = m[1].replace(/\s+/g, '');
    if (a.length >= 5 && a.length <= 24) return a;
  }
  return '';
}

function collect(d, p, scope) {
  const core = coreName(p.name, p.city);
  return (d.results || [])
    .filter((x) => x.location && Number.isFinite(x.location.lat) && Number.isFinite(x.location.lng))
    .map((x) => {
      const [lat, lon] = gcj2wgs(x.location.lat, x.location.lng);
      return {
        lat, lon, label: x.name, address: x.address || '', uid: x.uid,
        s: nameScore(x.name, core), scope,
        dist: Math.round(distM([p.lat, p.lon], [lat, lon])),
      };
    })
    .filter((c) => c.s >= 0.6);
}

// scoring: 名称得分优先，其次距离近（连锁店多分店时选离库存最近的那家）。
// 距离 >50km 的候选不参与择优（语义搜索偶尔会把千里外的同名店端上来），只留在候选列表里作旁证。
const bestOf = (pool) => pool.filter((c) => c.dist < 50000).sort((a, b) => (b.s - a.s) || (a.dist - b.dist))[0] || null;

// 语义检索：城市级 → 省级兜底。
// 实测两个坑：① 带城市名的长句会退化成「附近搜索」（乌鲁木齐站/亿恒夜市查不到）；
// ② region 传错行政区会返回同名不同地的 POI（分界洲岛 → 三亚市区潜水基地，差 74km）。
// 因此城市级答案明显偏远（>2km）或匹配不是精确同名时，再用省级 region 问一次。
async function queryPlace(p) {
  const cityRegion = CITY_REGION[p.city] || p.city;
  const province = PROVINCE[p.city] || '';
  const core = coreName(p.name, p.city);
  const hint = addressHint(p.note);
  const pool = [];

  const ask = async (q, region, scope) => {
    const d = await api('/place', { user_raw_request: q, region });
    pool.push(...collect(d, p, scope));
  };

  await ask(`帮我确认${p.city}的「${cleanName(p.name)}」的具体位置${hint ? `，地址在${hint}` : ''}`, cityRegion, 'city');
  let b = bestOf(pool);
  if (!b || b.dist > 2000 || b.s < 0.9) {
    await sleep(300);
    await ask(`${core}在哪里`, cityRegion, 'city');
    b = bestOf(pool);
  }
  if (province && (!b || b.dist > 2000 || b.s < 0.9)) {
    await sleep(300);
    await ask(`${core}在哪里`, province, 'province');
    b = bestOf(pool);
  }
  if (!b) return null;
  const alts = pool
    .filter((c) => c !== b && c.label !== b.label)
    .sort((x, y) => (y.s - x.s) || (x.dist - y.dist))
    .slice(0, 2)
    .map((c) => ({ label: c.label, dist: c.dist, scope: c.scope }));
  return {
    lat: b.lat, lon: b.lon, label: b.label, address: b.address, uid: b.uid,
    score: +b.s.toFixed(2), scope: b.scope, alts,
  };
}

// 地理编码：只在 note 里能取出街道门牌时用（道路级答案，精度低于 POI，默认关闭）
async function queryGeocode(p) {
  const hint = addressHint(p.note);
  if (!hint) return null;
  const d = await api('/geocoding', { address: hint, region: CITY_REGION[p.city] || p.city });
  const loc = d.result?.location || d.location;
  if (!loc || !Number.isFinite(loc.lat)) return null;
  const [lat, lon] = gcj2wgs(loc.lat, loc.lng);
  return { lat, lon, label: hint, score: +((d.result?.confidence ?? d.confidence ?? 0) / 100).toFixed(2) };
}

const keyOf = (p) => `${p.id}@${p.lat},${p.lon}`;
console.log(`百度核对目标：${targets.length} 个点位，最多 ${targets.length * (GEOCODE ? 3 : 2)} 次调用${DRY ? '（dry-run，不实际请求）' : ''}\n`);

const results = [];
for (const p of targets) {
  const k = keyOf(p);
  const hit = !REFRESH && cache.entries[k];
  if (hit) {
    results.push({ p, ...hit, cached: true });
    console.log(`  ${p.id} ${p.name.slice(0, 16).padEnd(18, ' ')} ${String(hit.verdict).padEnd(7)} ${String(hit.dist ?? '—').padStart(5)}m  ${(hit.wgs || []).join(',') || '—'}  ${hit.label || ''}  (缓存)`);
    continue;
  }
  const r = { p };
  try {
    if (!DRY) r.place = await queryPlace(p);
    if (GEOCODE && !DRY) { await sleep(300); r.geocode = await queryGeocode(p); }
  } catch (e) {
    r.error = e.message;
  }
  const src = r.place || r.geocode || null;
  if (DRY) {
    r.verdict = 'dry';
  } else if (src) {
    r.dist = Math.round(distM([p.lat, p.lon], src));
    const samePoi = (src.score ?? 0) >= 0.9;   // 连续同名/包含才算「百度认的是同一个地方」
    r.verdict = r.dist < AGREE ? 'agree'
      : r.dist < FAR ? 'near'
      : (!samePoi && r.dist >= 2000) ? 'mismatch'   // 名称对不上又隔着公里级 → 百度根本没这个点位
      : 'diverge';
  } else {
    r.verdict = r.error ? 'error' : 'empty';
  }
  const entry = {
    at: new Date().toISOString().slice(0, 10),
    wgs: src ? [+src.lat.toFixed(6), +src.lon.toFixed(6)] : null,
    label: src?.label || null,
    address: src?.address || null,
    score: src?.score ?? null,
    match: src ? (src.score >= 0.9 ? 'exact' : 'partial') : null,
    scope: src?.scope || null,
    alts: src?.alts || [],
    dist: r.dist ?? null,
    verdict: r.verdict,
    geo: r.geocode ? {
      dist: Math.round(distM([p.lat, p.lon], r.geocode)),
      wgs: [+r.geocode.lat.toFixed(6), +r.geocode.lon.toFixed(6)],
      label: r.geocode.label,
      score: r.geocode.score,
    } : null,
  };
  if (!DRY) { cache.entries[k] = entry; writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1)); }
  results.push({ p, ...entry });
  const shown = entry.wgs ? `${entry.wgs[0]},${entry.wgs[1]}` : '—';
  const mark = entry.match === 'partial' ? '~' : ' ';
  const scopeMark = entry.scope === 'province' ? '[省]' : '';
  console.log(`  ${p.id} ${p.name.slice(0, 16).padEnd(18, ' ')} ${entry.verdict.padEnd(7)} ${String(entry.dist ?? '—').padStart(5)}m  ${shown} ${mark} ${scopeMark}${entry.label || ''}`);
  if (entry.alts?.length) console.log(`      └ 其他候选：${entry.alts.map((a) => `${a.label} ${a.dist}m`).join(' / ')}`);
  if (entry.geo) console.log(`      └ geocoding ${entry.geo.dist}m  ${entry.geo.wgs.join(',')}  ${entry.geo.label}`);
}

const by = (v) => results.filter((r) => r.verdict === v);
const agree = by('agree'), near = by('near'), diverge = by('diverge'), mismatch = by('mismatch'), empty = by('empty'), error = by('error');
const exact = results.filter((r) => r.match === 'exact').length;

console.log(`\n═══ 百度核对结论（${results.length} 点，本次调用 ${apiCalls} 次${GEOCODE ? '，含 geocoding' : ''}）═══`);
console.log(`✅ 一致 (<${AGREE}m)：${agree.length}（名称精确命中 ${exact}/${results.length}，~ 为部分命中）`);
console.log(`🟡 偏差 (${AGREE}–${FAR}m)：${near.length}`); near.forEach((r) => console.log(`   ${r.p.id} ${r.p.name} → ${r.dist}m | 百度 ${r.label}`));
console.log(`🔴 分歧 (>${FAR}m，同名但口径不同：湾区/景区/机场基准点)：${diverge.length}`); diverge.forEach((r) => console.log(`   ${r.p.id} ${r.p.name} → ${r.dist}m | 百度 ${r.label}（${r.address || '无地址'}）| ${r.wgs?.join(',')}`));
console.log(`⚫ 百度没这个点（名字对不上且 >2km，不算证据）：${mismatch.length}`); mismatch.forEach((r) => console.log(`   ${r.p.id} ${r.p.name} → ${r.dist}m | 最近似 ${r.label}（${r.score}）`));
console.log(`⚪ 未命中：${empty.length}${empty.length ? '（' + empty.map((r) => r.p.id + r.p.name.slice(0, 6)).join('、') + '）' : ''}`);
if (error.length) { console.log(`⚠️ 请求失败：${error.length}`); error.slice(0, 5).forEach((r) => console.log(`   ${r.p.id} ${r.error}`)); }

if (APPLY && !DRY) {
  let up = 0;
  for (const r of agree) {
    if (r.p.confidence < 100 && (r.score ?? 0) >= 0.9) { r.p.confidence = 100; up++; }
  }
  if (up) { writeFileSync(FILE, JSON.stringify(pts, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8'); console.log(`\n✅ 已升级 ${up} 个 confidence→100（仅 <${AGREE}m 且名称命中 ≥0.9）`); }
  else console.log('\n没有可升级的置信度（未达 <150m + 名称命中 ≥0.9）');
}

if (!DRY) {
  writeFileSync(REPORT_FILE, JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    provider: 'baidu-agent-plan',
    coords: 'WGS84（入参 GCJ-02 经 gcj2wgs 转换）',
    agree: AGREE, far: FAR,
    results: results.map((r) => ({
      id: r.p.id, name: r.p.name, city: r.p.city, stored: [r.p.lat, r.p.lon], conf: r.p.confidence,
      verdict: r.verdict, dist: r.dist ?? null, wgs: r.wgs, label: r.label, address: r.address,
      score: r.score, match: r.match, geo: r.geo || null,
    })),
  }, null, 1));
  console.log(`\n明细（含百度坐标，仅供本地核对，不入库）→ ${REPORT_FILE}`);
} else {
  console.log('\n(dry-run：未请求、未写缓存、未写报告)');
}
