// 板块边界图层：boundaryFile 有值时加载 GeoJSON；缺失 / 为空 / 加载失败时统一降级为 bounds.bbox 矩形；
// 两者都没有则不画边界。所有失败都在本模块内消化，不阻塞地图与点位渲染。
// 切换用自增 token 判定「最后一次点击为准」，快速连点不会残留旧边界。
let ctx = null; // { L, map }
let current = null;
let currentId = '';
let seq = 0;
const cache = new Map();

export function initBoundaries(deps) {
  ctx = deps;
  const pane = ctx.map.createPane('region-boundary-pane');
  pane.style.zIndex = 420;
  pane.style.pointerEvents = 'none';
}

// 纯函数：板块可画边界的外接矩形 [minLon, minLat, maxLon, maxLat]
// 单点板块（ge）补最小 0.02° 跨度，避免矩形退化成看不见的零面积；再外扩 2% 让最外侧的点不被描边压住
export function boundaryBounds(region) {
  const b = region && region.bounds && region.bounds.bbox;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite)) return null;
  let [w, s, e, n] = b;
  if (e - w < 0.02) { const c = (e + w) / 2; w = c - 0.01; e = c + 0.01; }
  if (n - s < 0.02) { const c = (n + s) / 2; s = c - 0.01; n = c + 0.01; }
  const px = Math.max((e - w) * 0.02, 0.005);
  const py = Math.max((n - s) * 0.02, 0.005);
  return [w - px, s - py, e + px, n + py];
}

async function load(file) {
  if (cache.has(file)) return cache.get(file);
  const res = await fetch(file, { cache: 'force-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = await res.json();
  cache.set(file, doc);
  return doc;
}

function makeGeo(doc) {
  const okType = doc && (doc.type === 'FeatureCollection' || doc.type === 'Feature' ||
    doc.type === 'Polygon' || doc.type === 'MultiPolygon');
  if (!okType) return null;
  return ctx.L.geoJSON(doc, {
    className: 'region-boundary',
    interactive: false,
    pane: 'region-boundary-pane',
  });
}

function makeRect(region) {
  const b = boundaryBounds(region);
  if (!b) return null;
  return ctx.L.rectangle([[b[1], b[0]], [b[3], b[2]]], {
    className: 'region-boundary',
    interactive: false,
    pane: 'region-boundary-pane',
  });
}

function replace(next) {
  if (current && ctx.map.hasLayer(current)) ctx.map.removeLayer(current);
  current = next;
  if (current) current.addTo(ctx.map);
}

export async function showRegionBoundary(region) {
  if (!ctx) return;
  const my = ++seq;
  if (!region) {
    currentId = '';
    replace(null);
    return;
  }
  // 同一板块且已有边界：不重画，避免重复请求
  if (region.id === currentId && current) return;

  let next = null;
  if (region.boundaryFile) {
    try { next = makeGeo(await load(region.boundaryFile)); } catch { next = null; }
  }
  if (!next) next = makeRect(region); // 边界文件缺失/失败 → 统一降级为 bbox 矩形
  if (my !== seq) return;             // 已被更晚的点击取代，丢弃本次结果
  replace(next);
  currentId = region.id;
}

export function clearRegionBoundary() {
  seq++;
  currentId = '';
  if (ctx) replace(null);
}
