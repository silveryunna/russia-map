// 数据驱动的覆盖层：data/overlays.json（水上巴士航线/动线/标注线等）
// 取代旧版硬编码的 map-annotations.js（机场/酒店/地堡等点位已并入 points.json）
import { xy } from './coords.js';

export function drawOverlays(L, map) {
  window.__overlayLayers__ = window.__overlayLayers__ || [];
  (window.__overlaysData__ || []).forEach((n) => {
    const line = L.polyline(
      n.pts.map((pt) => xy(pt[0], pt[1])),
      {
        color: n.color,
        weight: n.weight || 4,
        opacity: n.opacity || 0.85,
        dashArray: n.dash || '2 8',
        lineCap: 'round',
      },
    )
      .addTo(map)
      .bindPopup(n.popup, { autoPan: false });
    window.__overlayLayers__.push(line);
    (n.stops || []).forEach((s) => {
      const m = L.circleMarker(xy(s.lat, s.lon), {
        radius: 5,
        color: n.color,
        weight: 2,
        fillColor: '#fff',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip(s.label);
      window.__overlayLayers__.push(m);
    });
  });
}

// 图层切换（GCJ 偏移变化）后重建覆盖层
export function rebuildOverlays(L, map) {
  (window.__overlayLayers__ || []).forEach((l) => map.removeLayer(l));
  window.__overlayLayers__ = [];
  drawOverlays(L, map);
}
