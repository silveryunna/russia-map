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

/* ---------------- BD-09（百度） ---------------- */
// 百度在 GCJ-02 之上再叠一次非线性偏移，境内合计比 WGS84 偏 ~800m 东北。
// 公式与 wandergis/coordtransform 一致，由 tools/coords-test.mjs 用 24 点基线守护。
// 仅用于核对/取数（tools/audit-baidu.mjs 等）；页面底图不用百度，故不在运行时调用。
const X_PI = (PI * 3000) / 180;
const inChina = (lat, lon) => !(lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271);

// BD-09 → GCJ-02
export function bd09ToGcj02(lat, lon) {
  if (!inChina(lat, lon)) return [lat, lon];
  const x = lon - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [+(z * Math.sin(theta)).toFixed(6), +(z * Math.cos(theta)).toFixed(6)];
}

// GCJ-02 → BD-09
export function gcj2bd09(lat, lon) {
  if (!inChina(lat, lon)) return [lat, lon];
  const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * X_PI);
  return [+(z * Math.sin(theta) + 0.006).toFixed(6), +(z * Math.cos(theta) + 0.0065).toFixed(6)];
}

// BD-09 → WGS84（百度接口返回值入库前的唯一正确路径）
export function bd09ToWgs(lat, lon) {
  const [gLat, gLon] = bd09ToGcj02(lat, lon);
  return gcj2wgs(gLat, gLon);
}

// WGS84 → BD-09（向百度接口回传坐标时用，如 direction 的 location）
export function wgsToBd09(lat, lon) {
  const [gLat, gLon] = wgs2gcj(lat, lon);
  return gcj2bd09(gLat, gLon);
}
