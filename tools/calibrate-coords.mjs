#!/usr/bin/env node
// 用飞猪 FlyAI search-poi 校准"中置信/pending"点位的坐标（构建期工具）
// 用法：node tools/calibrate-coords.mjs [--city=三亚] [--only=p595,p596]
// 原理：search-poi 返回 name/latitude/longitude/address，按名称相似度匹配后回写 points.json
// - 名称完全匹配 → confidence=100（取消 ⚠ 中置信）
// - 部分匹配     → 更新坐标但保留 confidence=75
// - pending 点位匹配到 → 补坐标并取消 pending
// - 匹配不到     → 保持原样
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const P = resolve(ROOT, 'data/points.json');
const args = process.argv.slice(2);
const val = k => { const a = args.find(a => a.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : ''; };
const CITY = val('city'), ONLY = new Set(val('only').split(',').filter(Boolean));

const points = JSON.parse(readFileSync(P, 'utf8'));
const CN = ['哈尔滨', '伊宁', '三亚'];
const targets = points.filter(p => CN.includes(p.city) && (p.confidence === 75 || p.pending))
  .filter(p => !CITY || p.city === CITY)
  .filter(p => !ONLY.size || ONLY.has(p.id));

// 注：flyai CLI 在非控制台父进程下退出时会崩（exit 0xC0000409），但 JSON 已完整输出，
// 所以以"stdout 能否解析出 data"为准，忽略退出码。
import { existsSync } from 'node:fs';
const BUNDLE = [
  `${process.env.APPDATA}/npm/node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs`,
  `${process.env.HOME}/.npm-global/lib/node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs`,
  '/usr/local/lib/node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs',
].find(p => p && existsSync(p)) || null;
const run = (city, kw) => new Promise((res) => {
  if (!BUNDLE) return res(null);
  execFile(process.execPath, [BUNDLE, 'search-poi', '--city-name', city, '--keyword', kw], { timeout: 40000 },
    (e, stdout) => {
      try { const j = JSON.parse(stdout); if (j && j.data) return res(j); } catch { /* fallthrough */ }
      res(null);
    });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const core = n => n.replace(/（[^（）]*）|\([^()]*\)/g, '').replace(/["'“”‘’]/g, '').trim();
const norm = s => String(s).replace(/[\s·•・\-—–_"'“”‘’()（）【】\[\]《》]/g, '').toLowerCase();
function matchScore(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  // 词组匹配：逐段包含
  const segs = nb.split(/[·,，、]/).filter(s => s.length >= 2);
  if (segs.length && segs.every(s => na.includes(s))) return 0.6;
  return 0;
}
const cityCandidates = p => {
  const m = p.name.match(/（(万宁|陵水|保亭)）/);
  return m ? [p.city, m[1]] : [p.city];
};

// 飞猪/腾讯等国内图商返回 GCJ-02（火星坐标），项目数据统一 WGS84，必须逆变换
const PI = Math.PI, AXIS = 6378245.0, EE = 0.00669342162296594323;
const tLat = (x, y) => {
  let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  r += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI)) * 2/3;
  r += (20*Math.sin(y*PI) + 40*Math.sin(y/3*PI)) * 2/3;
  r += (160*Math.sin(y/12*PI) + 320*Math.sin(y*PI/30)) * 2/3;
  return r;
};
const tLon = (x, y) => {
  let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  r += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI)) * 2/3;
  r += (20*Math.sin(x*PI) + 40*Math.sin(x/3*PI)) * 2/3;
  r += (150*Math.sin(x/12*PI) + 300*Math.sin(x/30*PI)) * 2/3;
  return r;
};
export function gcjToWgs(lat, lon) {
  const dLat = tLat(lon - 105, lat - 35), dLon = tLon(lon - 105, lat - 35);
  const radLat = lat / 180 * PI;
  let magic = Math.sin(radLat); magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat2 = (dLat * 180) / ((AXIS * (1 - EE)) / (magic * sqrtMagic) * PI);
  const dLon2 = (dLon * 180) / (AXIS / sqrtMagic * Math.cos(radLat) * PI);
  return [lat - dLat2, lon - dLon2];
}

(async () => {
  console.log(`待校准 ${targets.length} 个点位`);
  let ok100 = 0, ok75 = 0, miss = 0;
  for (const p of targets) {
    const kw = core(p.name);
    let items = null, usedCity = '';
    for (const c of cityCandidates(p)) {
      const j = await run(c, kw);
      const list = j && j.data && j.data.itemList;
      if (list && list.length) { items = list; usedCity = c; break; }
      await sleep(300);
    }
    if (!items) { console.log(`  ✗ ${p.id} ${p.name} → 未搜到`); miss++; continue; }
    const best = items.map(it => ({ it, s: matchScore(it.name, kw) })).sort((a, b) => b.s - a.s)[0];
    if (best.s < 0.6) { console.log(`  ✗ ${p.id} ${p.name} → 匹配度不足（最佳：${best.it.name} ${best.s}）`); miss++; continue; }
    const rawLat = +best.it.latitude, rawLon = +best.it.longitude;
    if (!(rawLat > 3 && rawLat < 54 && rawLon > 73 && rawLon < 136)) { console.log(`  ✗ ${p.id} ${p.name} → 坐标越界，跳过`); miss++; continue; }
    const [lat, lon] = gcjToWgs(rawLat, rawLon).map(v => +v.toFixed(6));
    const old = `${(p.lat ?? '?').toFixed?.(4) ?? p.lat},${(p.lon ?? '?').toFixed?.(4) ?? p.lon}`;
    p.lat = lat; p.lon = lon; delete p.pending;
    if (best.s >= 1) { p.confidence = 100; ok100++; }
    else { p.confidence = 75; ok75++; }
    console.log(`  ✓ ${p.id} ${p.name} → ${best.it.name} [${usedCity}] ${old} ⇒ ${lat.toFixed(4)},${lon.toFixed(4)} ${best.s >= 1 ? '已核实' : '中置信'}`);
    writeFileSync(P, JSON.stringify(points, null, 1));   // 边跑边存，中断可续
    await sleep(500);
  }
  console.log(`\n完成：转正 ${ok100}，补坐标(仍中置信) ${ok75}，未匹配 ${miss}`);
})();
