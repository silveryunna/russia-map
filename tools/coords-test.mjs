#!/usr/bin/env node
// 坐标变换质量门（CI 强制）：防 coords.js 被误改导致中国点位批量偏移
// 三个独立证据源交叉验证：
//   1) 往返一致性：境内网格采样 wgs→gcj→wgs 误差 < 1m（gcj2wgs 为 3 次不动点迭代）
//   2) 主流库基准：coordtransform README 公开示例逐值比对（< 5m）
//   3) 项目实测：MAINTENANCE.md §7.9 三城偏移量/方向交叉核对（量级+方向区间断言）
//   4) 境外不变换：矩形外原样返回
// 用法: node tools/coords-test.mjs
import { readFileSync } from 'node:fs';
import { wgs2gcj, gcj2wgs } from '../src/pages/map/coords.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 1) 往返一致性
{
  let worst = 0, worstAt = null;
  for (let lat = 18; lat <= 53; lat += 2.9) {
    for (let lon = 76; lon <= 134; lon += 4.7) {
      const g = wgs2gcj(lat, lon);
      const back = gcj2wgs(g[0], g[1]);
      const d = distM([lat, lon], back);
      if (d > worst) { worst = d; worstAt = [lat.toFixed(1), lon.toFixed(1)]; }
    }
  }
  if (worst < 1) ok(`往返误差最大 ${worst.toFixed(3)}m（@ ${worstAt}），< 1m 门槛`);
  else fail(`往返误差 ${worst.toFixed(2)}m（@ ${worstAt}）超 1m 门槛——gcj2wgs 迭代次数或算法被改`);
}

// 2) 主流库基准：tools/fixtures/coord-baseline.json（24 点，由 wandergis/coordtransform 生成，逐值比对 < 0.5m）
{
  const base = JSON.parse(readFileSync(new URL('./fixtures/coord-baseline.json', import.meta.url), 'utf8'));
  let worst = 0, at = '';
  for (const p of base.points) {
    const d = distM(wgs2gcj(...p.wgs), p.gcj);
    if (d > worst) { worst = d; at = p.name; }
  }
  if (worst < 0.5) ok(`coordtransform 24 点基线最大差 ${worst.toFixed(3)}m（@${at}），< 0.5m 门槛`);
  else fail(`与 coordtransform 基线差 ${worst.toFixed(1)}m（@${at}，>0.5m）——算法与主流实现不一致（历史 bug：系数错位/正弦加倍曾差 ~200m）`);
}

// 3) 项目实测交叉核对（MAINTENANCE.md §7.9）：量级区间 + 方向
//    天安门 555m 东北；哈尔滨中央大街 508m 东北；三亚湾椰梦长廊 476m 东南
{
  const cases = [
    ['天安门', [39.9042, 116.4074], 400, 700, 'NE'],
    ['哈尔滨', [45.7737, 126.6225], 380, 650, 'NE'],
    ['三亚湾', [18.2528, 109.4742], 350, 600, 'SE'],
  ];
  for (const [name, wgs, lo, hi, dir] of cases) {
    const g = wgs2gcj(wgs[0], wgs[1]);
    const d = distM(wgs, g);
    const dLat = g[0] - wgs[0], dLon = g[1] - wgs[1];
    const dirOk = dir === 'NE' ? dLat > 0 && dLon > 0 : dLat < 0 && dLon > 0;
    if (d >= lo && d <= hi && dirOk) ok(`${name} 偏移 ${Math.round(d)}m ${dir}，落在 §7.9 实测区间`);
    else fail(`${name} 偏移 ${Math.round(d)}m 方向(${dLat > 0 ? 'N' : 'S'}${dLon > 0 ? 'E' : 'W'})，不在 §7.9 区间 [${lo},${hi}]m ${dir}`);
  }
}

// 4) 境外不变换
{
  const mos = wgs2gcj(55.7558, 37.6173);
  if (mos[0] === 55.7558 && mos[1] === 37.6173) ok('境外（莫斯科）原样返回，未误偏移');
  else fail(`境外坐标被误偏移：${mos}`);
}

if (bad) { console.error(`\n${bad} 项坐标测试失败`); process.exit(1); }
console.log('\n坐标变换质量门通过（4/4）');
