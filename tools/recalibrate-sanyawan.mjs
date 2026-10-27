#!/usr/bin/env node
// 三亚湾沿岸点位重校准：修「画到海里」的坐标漂移
//
// 背景（2026-10-28 截图反馈）：三亚湾路沿线一批餐饮/海滩点位「画到海里」。
//
// ⚠️ 结论先行：这批点的坐标是对的，本脚本【不要】--apply！
//   dry-run 显示 p545/p540/p544/p547/p553/p608 与腾讯官方 POI 换算后移动 0m，
//   证明库里存的就是正确 WGS-84。真因是高德/腾讯底图为 GCJ-02 瓦片、前端不做
//   坐标转换，导致整体偏移 500-700m（三亚湾路贴海岸线 → 餐厅落到海里）。
//   详见 MAINTENANCE.md §7.9。
//
// 本脚本的价值是【诊断】：用腾讯官方坐标套 gcj2wgs 后比对移动量——
//   • 移动 ~0m   → 坐标正确，问题在底图坐标系，别改数据
//   • 移动 >1km  → 多半是分店/同名楼盘错配（如 p539「椰林伯伯」被配到迎宾路另一家店），
//                  同样别改，需人工按地址确认
//
// 用法: QQ_LBS_KEY=xxx node tools/recalibrate-sanyawan.mjs --dry
//       QQ_LBS_KEY=xxx node tools/recalibrate-sanyawan.mjs --apply
//
// 写入门（与 geocode-cn-pending 一致，宁空置勿错配）：
//   • 名称字符完全覆盖（sim=1.0）→ 写入，confidence=100（有 POI 证据）
//   • 0.8~1.0 → 只打印候选供人工确认，不自动写（假阳性教训：「海螺号」→「四川小海螺」）
//   • 落点必须位于三亚湾陆地区域 bbox 内，否则进 REVIEW

import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.QQ_LBS_KEY;
if (!KEY) { console.error('缺少环境变量 QQ_LBS_KEY'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const FILE = 'data/points.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GCJ-02 → WGS-84（与 recalibrate-sanya.mjs 同一份实现）
const PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
function tLat(x, y) { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3; r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3; return r; }
function tLng(x, y) { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3; r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3; return r; }
function gcj2wgs(lat, lng) { if (outOfChina(lat, lng)) return [lat, lng]; let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35); const radLat = lat / 180 * PI; let magic = Math.sin(radLat); magic = 1 - EE * magic * magic; const sq = Math.sqrt(magic); dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sq) * PI); dLng = (dLng * 180) / (A / sq * Math.cos(radLat) * PI); return [lat - dLat, lng - dLng]; }

function distM(la1, lo1, la2, lo2) {
  const R = 6371000, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function similarity(kw, title) {
  const chars = [...new Set(kw.replace(/[·•\s（）()]/g, ''))];
  if (!chars.length) return 0;
  return chars.filter((c) => title.includes(c)).length / chars.length;
}

// 本批全部是「三亚湾沿岸、原坐标疑似偏移」的点位（海景餐厅/海滩/机位，非西部景点）
const IDS = [
  'p543', // 虎婆香草鸭
  'p536', // 回新村海鲜大排档
  'p597', // 亿恒夜市
  'p545', // 琼禧小馆
  'p553', // 琼爷清补凉
  'p539', // 椰林伯伯椰子鸡糟粕醋
  'p540', // 琼嗲香草鸭
  'p544', // 87号渔船海鲜
  'p608', // 琼乡阁·海南土菜馆（三亚湾店）
  'p547', // 阿龙海鲜农家乐
  'p549', // 老阿侬糟粕醋椰子鸡
  'p533', // 椰梦长廊
  'p534', // 三亚湾
  'p620', // 三亚湾婚纱摄影基地
  'p619', // 三亚海韵度假酒店（椰梦长廊草坪机位）
];

// 落点合理性 bbox：三亚湾滨海带（三亚湾路沿线+椰梦长廊），lat/lon 覆盖 18.24~18.31 / 109.478~109.52
// 注：不含海里——这批点的修正目标就是「回到岸上」
const BBOX = [18.235, 18.315, 109.478, 109.525];
const inBox = (la, lo) => la >= BBOX[0] && la <= BBOX[1] && lo >= BBOX[2] && lo <= BBOX[3];

const pts = JSON.parse(readFileSync(FILE, 'utf8'));
const byId = new Map(pts.map((p) => [p.id, p]));
const plan = [];

for (const id of IDS) {
  const p = byId.get(id);
  if (!p) { console.log(`⚠️ ${id} 不在 points.json`); continue; }
  const kw = p.name.replace(/[（(].*?[）)]/g, '').trim();   // 去掉「（三亚湾店）」等后缀再搜
  const url = `https://apis.map.qq.com/ws/place/v1/search?keyword=${encodeURIComponent(kw)}&boundary=region(${encodeURIComponent('三亚')},0)&page_size=10&key=${KEY}`;
  let data = [];
  try {
    const res = await fetch(url, { headers: { Referer: 'https://julyyunna.art/' }, signal: AbortSignal.timeout(15000) });
    data = (await res.json()).data || [];
  } catch (e) { console.log(`❌ ${id} 请求失败：${e.message}`); await sleep(260); continue; }
  await sleep(260);

  const cand = data
    .map((x) => { const [wla, wlo] = gcj2wgs(x.location.lat, x.location.lng); return { t: x.title, a: x.address, lat: wla, lon: wlo, s: similarity(kw, x.title), box: inBox(wla, wlo) }; })
    .sort((a, b) => (b.s - a.s) || (b.box - a.box));

  const ok = cand.filter((c) => c.box && c.s >= 1);
  const soft = cand.filter((c) => c.box && c.s >= 0.8 && c.s < 1);
  const dropped = cand.filter((c) => !c.box);

  const old = `(${p.lat.toFixed(5)}, ${p.lon.toFixed(5)})`;
  if (ok.length) {
    const c = ok[0];
    const moved = Math.round(distM(p.lat, p.lon, c.lat, c.lon));
    console.log(`✅ ${id} ${p.name}`);
    console.log(`    原 ${old} → 新 (${c.lat.toFixed(6)}, ${c.lon.toFixed(6)})  移动 ${moved}m`);
    console.log(`    ← ${c.t} | ${c.a}`);
    plan.push({ id, name: p.name, to: [+c.lat.toFixed(6), +c.lon.toFixed(6)], conf: 100, matched: c.t, moved });
  } else if (soft.length) {
    console.log(`⚠️ ${id} ${p.name}  [REVIEW：仅近似匹配，未自动写入]  原 ${old}`);
    for (const c of soft.slice(0, 2)) console.log(`    ${(c.s).toFixed(2)} ${c.t} | ${c.a} @ (${c.lat.toFixed(6)}, ${c.lon.toFixed(6)})`);
  } else {
    console.log(`⚠️ ${id} ${p.name}  [REVIEW：bbox 内无完全匹配]  原 ${old}`);
    for (const c of cand.slice(0, 2)) console.log(`    ${(c.s).toFixed(2)}${c.box ? '' : ' ✗bbox外'} ${c.t} | ${c.a} @ (${c.lat.toFixed(6)}, ${c.lon.toFixed(6)})`);
  }
}

const nUp = plan.length;
console.log(`\n可自动更新 ${nUp} 个（sim=1.0 且落点在三亚湾陆域 bbox）；其余保持原样待人工`);

if (!APPLY) { console.log('（dry-run，未改文件；确认后加 --apply）'); process.exit(0); }

let n = 0;
for (const e of plan) {
  const p = byId.get(e.id);
  p.lat = e.to[0]; p.lon = e.to[1]; p.confidence = e.conf; n++;
}
writeFileSync(FILE, JSON.stringify(pts, null, 2) + '\n');
console.log(`\n已写回 ${n} 个坐标到 ${FILE}；请跑 node tools/check-data.mjs ./data 复核`);
