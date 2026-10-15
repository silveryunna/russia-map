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
    const lat = +best.it.latitude, lon = +best.it.longitude;
    if (!(lat > 3 && lat < 54 && lon > 73 && lon < 136)) { console.log(`  ✗ ${p.id} ${p.name} → 坐标越界，跳过`); miss++; continue; }
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
