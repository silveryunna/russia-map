// WGS84 → GCJ-02 坐标变换（高德/腾讯底图用；OSM/天地图/Esri 不需要）
// 境外直接返回原值。算法为主流公开实现（coordtransform / eviltransform 同款），
// 与 tools/recalibrate-*.mjs 的 gcj2wgs 保持一致，由 tools/coords-test.mjs 在 CI 守护。
// ⚠️ 历史教训（2026-10-28 发现）：旧实现把多项式里 lat/lon 两组系数写反、正弦项加倍，
//    与主流算法差 ~200m，导致 GCJ 底图上点位补偿不准。改动本文件必须先跑 coords-test。
const A = 6378245;
const EE = 0.006693421622965943;
const PI = Math.PI;

// x = 经度偏移(lon-105)，y = 纬度偏移(lat-35)
function tfLat(x, y) {
  let e = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  e += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  e += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  e += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return e;
}

function tfLon(x, y) {
  let e = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  e += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  e += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  e += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return e;
}

export function wgs2gcj(lat, lon) {
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lat, lon];
  const x = lon - 105;
  const y = lat - 35;
  let dLat = tfLat(x, y);
  let dLon = tfLon(x, y);
  const rad = (lat * PI) / 180;
  let magic = Math.sin(rad);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * PI);
  dLon = (dLon * 180) / ((A / sq) * Math.cos(rad) * PI);
  return [+(lat + dLat).toFixed(6), +(lon + dLon).toFixed(6)];
}

// GCJ-02 → WGS84：不动点迭代 3 次（误差 <0.1m；单迭代最坏 ~6m 不够）
export function gcj2wgs(lat, lon) {
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lat, lon];
  let w = [lat, lon];
  for (let i = 0; i < 3; i++) {
    const g = wgs2gcj(w[0], w[1]);
    w = [w[0] - (g[0] - lat), w[1] - (g[1] - lon)];
  }
  return [+w[0].toFixed(6), +w[1].toFixed(6)];
}

// 当前底图是否需要 GCJ 偏移（高德/腾讯激活时 true，由 layers.js 维护）
export function xy(lat, lon) {
  return window.__amapActive__ ? wgs2gcj(lat, lon) : [lat, lon];
}
