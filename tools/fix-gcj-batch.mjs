// 一次性修复：HEAD 提交中飞猪校准写入的 GCJ-02 坐标 → WGS84
// 判定：与腾讯地图建议坐标比对，≈GCJ 则转换，≈WGS 则保留，其余人工复核
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = '4VQBZ-ZGO3G-VGSQE-ILN4G-LWFUK-5WB7H';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 标准 GCJ-02 → WGS-84 迭代逆变换
const PI = Math.PI, AXIS = 6378245.0, EE = 0.00669342162296594323;
function tLat(x, y) {
  let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  r += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI)) * 2/3;
  r += (20*Math.sin(y*PI) + 40*Math.sin(y/3*PI)) * 2/3;
  r += (160*Math.sin(y/12*PI) + 320*Math.sin(y*PI/30)) * 2/3;
  return r;
}
function tLon(x, y) {
  let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  r += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI)) * 2/3;
  r += (20*Math.sin(x*PI) + 40*Math.sin(x/3*PI)) * 2/3;
  r += (150*Math.sin(x/12*PI) + 300*Math.sin(x/30*PI)) * 2/3;
  return r;
}
export function gcjToWgs(lat, lon) {
  const dLat = tLat(lon - 105, lat - 35), dLon = tLon(lon - 105, lat - 35);
  const radLat = lat / 180 * PI;
  let magic = Math.sin(radLat); magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat2 = (dLat * 180) / ((AXIS * (1 - EE)) / (magic * sqrtMagic) * PI);
  const dLon2 = (dLon * 180) / (AXIS / sqrtMagic * Math.cos(radLat) * PI);
  return [lat - dLat2, lon - dLon2];
}
const dist = (a, b) => { // 米
  const dx = (a[1]-b[1]) * 111320 * Math.cos(a[0]*PI/180), dy = (a[0]-b[0]) * 110540;
  return Math.hypot(dx, dy);
};

// 本次待核点（p554 为人工回滚值，跳过）
const IDS = ['p464','p467','p475','p476','p485','p491','p492','p494','p498',
  'p587','p595','p596','p597','p598','p599','p600','p603'];
const data = JSON.parse(readFileSync('data/points.json', 'utf-8'));
const byId = Object.fromEntries(data.map(p => [p.id, p]));

async function qq(name, city) {
  const u = `https://apis.map.qq.com/ws/place/v1/suggestion?keyword=${encodeURIComponent(name)}&region=${encodeURIComponent(city)}&page_size=5&key=${KEY}`;
  const r = await fetch(u, { headers: { Referer: 'https://map.qq.com/' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  return (j.data || []).map(x => ({ t: x.title, loc: [x.location.lat, x.location.lng] }));
}
function core(name) { return name.replace(/（[^）]*）/g, '').replace(/\(.*?\)/g, '').trim(); }

const plan = [];
for (const id of IDS) {
  const p = byId[id];
  const cands = await qq(core(p.name), p.city);
  await sleep(300);
  if (!cands.length) { plan.push({ id, action: 'REVIEW', why: 'QQ无结果' }); continue; }
  // 取与当前坐标最近的结果做参照
  const cur = [p.lat, p.lon];
  let best = null, bd = 1e9;
  for (const c of cands) { const d = dist(cur, c.loc); if (d < bd) { bd = d; best = c; } }
  const wgs = gcjToWgs(best.loc[0], best.loc[1]);
  const dGcj = bd, dWgs = dist(cur, wgs);
  if (dGcj < 150 && dGcj <= dWgs) plan.push({ id, name: p.name, action: 'CONVERT', ref: best.t, dGcj: Math.round(dGcj), from: [p.lat, p.lon], to: wgs.map(v => +v.toFixed(6)) });
  else if (dWgs < 150) plan.push({ id, name: p.name, action: 'KEEP', why: '已是WGS', dWgs: Math.round(dWgs) });
  else plan.push({ id, name: p.name, action: 'REVIEW', why: `QQ最近${Math.round(bd)}m`, ref: best.t, qq: best.loc, cur });
  console.log(id, plan[plan.length-1].action, plan[plan.length-1].why || '', plan[plan.length-1].ref || '');
}
writeFileSync('tools/gcj-fix-plan.json', JSON.stringify(plan, null, 1), 'utf-8');
let n = 0;
for (const a of plan) if (a.action === 'CONVERT') { const p = byId[a.id]; [p.lat, p.lon] = a.to; n++; }
writeFileSync('data/points.json', JSON.stringify(data, null, 1) + '\n', 'utf-8');
console.log(`converted ${n}, keep/review see tools/gcj-fix-plan.json`);
