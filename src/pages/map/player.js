// 动线播放：按落点顺序自动推进镜头 + 高亮当前点（拖动/缩放地图即停止）
import { xy } from './coords.js';

window.__playTimer__ = null;
window.__playEl__ = null;

let ctx = null; // { map, state, markerById, routePoints, currentRoute, renderSidebar }

export function initPlayer(deps) {
  ctx = deps;
}

export function stopPlay() {
  if (window.__playTimer__) {
    clearInterval(window.__playTimer__);
    window.__playTimer__ = null;
  }
  if (window.__playEl__) {
    window.__playEl__.classList.remove('mp');
    window.__playEl__ = null;
  }
  ctx?.map.off('dragstart zoomstart', stopPlay);
}

export function playRoute() {
  const { map, state, markerById, routePoints, currentRoute, renderSidebar } = ctx;
  if (window.__playTimer__) {
    stopPlay();
    renderSidebar();
    return;
  }
  const route = currentRoute();
  if (!route) return;
  const pts = routePoints(route);
  if (!pts.length) return;
  stopPlay();
  map.on('dragstart zoomstart', stopPlay);
  renderSidebar();
  let n = 0;
  const step = () => {
    if (!window.__playTimer__) return;
    if (n >= pts.length) {
      stopPlay();
      renderSidebar();
      return;
    }
    const p = pts[n++].p;
    state.selected = p.id;
    map.flyTo(xy(p.lat, p.lon), 15, { duration: 1.2 });
    setTimeout(() => {
      if (!window.__playTimer__) return;
      const m = markerById.get(p.id);
      if (!m) return;
      m.openPopup();
      if (window.__playEl__) window.__playEl__.classList.remove('mp');
      const el = m.getElement && m.getElement();
      if (el) {
        el.classList.add('mp');
        window.__playEl__ = el;
      }
      const row = document.querySelector(`.route-step[data-pid="${p.id}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 1000);
  };
  window.__playTimer__ = setInterval(step, 2600);
  step();
  renderSidebar();
}
