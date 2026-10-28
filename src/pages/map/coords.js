// WGS84 → GCJ-02 坐标变换（高德/腾讯底图用；OSM/天地图/Esri 不需要）
// 境外直接返回原值。算法为公开标准实现。
const A = 6378245;
const EE = 0.006693421622965943;

export function wgs2gcj(lat, lon) {
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lat, lon];
  const dLat = lat - 35;
  const dLon = lon - 105;
  const tfLat = (p) => {
    let e = -100 + 2 * p.lat + 3 * p.lng + 0.2 * p.lng * p.lng + 0.1 * p.lat * p.lng + 0.2 * Math.sqrt(Math.abs(p.lat));
    e += (2 * (20 * Math.sin(6 * p.lat * Math.PI) + 20 * Math.sin(2 * p.lat * Math.PI)) * 2) / 3;
    e += (2 * (20 * Math.sin(p.lat * Math.PI) + 40 * Math.sin((p.lat / 3) * Math.PI)) * 2) / 3;
    e += (2 * (160 * Math.sin((p.lat / 12) * Math.PI) + 320 * Math.sin((p.lat * Math.PI) / 30)) * 2) / 3;
    return e;
  };
  const tfLon = (p) => {
    let e = 300 + p.lat + 2 * p.lng + 0.1 * p.lat * p.lat + 0.1 * p.lat * p.lng + 0.1 * Math.sqrt(Math.abs(p.lat));
    e += (2 * (20 * Math.sin(6 * p.lat * Math.PI) + 20 * Math.sin(2 * p.lat * Math.PI)) * 2) / 3;
    e += (2 * (20 * Math.sin(p.lat * Math.PI) + 40 * Math.sin((p.lat / 3) * Math.PI)) * 2) / 3;
    e += (2 * (150 * Math.sin((p.lat / 12) * Math.PI) + 300 * Math.sin((p.lat / 30) * Math.PI)) * 2) / 3;
    return e;
  };
  let s = tfLat({ lat: dLat, lng: dLon });
  let h = tfLon({ lat: dLat, lng: dLon });
  const g = (lat * Math.PI) / 180;
  const c = Math.sin(g);
  const p = 1 - EE * c * c;
  const u = Math.sqrt(p);
  s = (s * 180) / (((A * (1 - EE)) / (p * u)) * Math.PI);
  h = (h * 180) / ((A / u) * Math.cos(g) * Math.PI);
  return [+(lat + s).toFixed(6), +(lon + h).toFixed(6)];
}

// 当前底图是否需要 GCJ 偏移（高德/腾讯激活时 true，由 layers.js 维护）
export function xy(lat, lon) {
  return window.__amapActive__ ? wgs2gcj(lat, lon) : [lat, lon];
}
