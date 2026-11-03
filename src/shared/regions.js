// 板块（region）配置：单一来源 data/regions.json，只读站点级配置，不做 IP 分区、不做用户开关。
// 约定：
//   • center 用 [lat, lon]（与 Leaflet setView 一致）；bounds.bbox 用 [minLon, minLat, maxLon, maxLat]（GeoJSON 顺序）
//   • enabled=false 的板块不出现在列表与地图；点位数据保留，只是不展示、不计入统计
//   • regions.json 缺失 → 单板块降级（全部可见），不得白屏
//   • 旧点位没有 region 字段 → 用 fallback 板块兜底，仍然可见

export const REGIONS_URL = './data/regions.json';

/**
 * 纯函数：把 regions.json 文档编译成查询索引。
 * @param {any} doc 解析后的文档；null/undefined 表示降级
 */
export function createRegionIndex(doc) {
  const regions = Array.isArray(doc && doc.regions) ? doc.regions.filter((r) => r && r.id) : [];
  const fallback = (doc && doc.fallback) || '';
  const byId = new Map(regions.map((r) => [r.id, r]));
  const on = new Set(regions.filter((r) => r.enabled !== false).map((r) => r.id));
  return {
    single: regions.length === 0,
    regions,
    fallback,
    byId,
    /** 未知板块不隐藏，避免旧数据或新板块数据在配置更新前整体消失 */
    isEnabled(id) {
      if (!id) return true;
      if (!byId.has(id)) return true;
      return on.has(id);
    },
    enabledIds: [...on],
  };
}

/** 点位所属板块：优先自身 region，缺失走 fallback。 */
export function regionOf(point, index) {
  if (!point) return '';
  if (point.region) return point.region;
  return index && index.fallback ? index.fallback : '';
}

/** 单板块降级时一律可见。 */
export function isPointVisible(point, index) {
  if (!index || index.single) return true;
  return index.isEnabled(regionOf(point, index));
}

/** 过滤后的点位：关闭板块的点位不计入列表/地图/统计。 */
export function visiblePoints(points, index) {
  if (!index || index.single) return points;
  return points.filter((p) => isPointVisible(p, index));
}

/** 拉取配置；任何失败（缺失/404/JSON 坏）都降级为单板块，不抛错。 */
export async function loadRegions(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(REGIONS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    return createRegionIndex(await res.json());
  } catch {
    return createRegionIndex(null);
  }
}
