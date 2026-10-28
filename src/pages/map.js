// 旅行地图页：点位聚合 + 三级侧栏 + ⭐高亮 + 搜索 + 定位 + 全屏 + 每日动线 + 打卡
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.min.css';
import 'leaflet-geosearch/dist/geosearch.css';
import 'leaflet.fullscreen/dist/Control.FullScreen.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import { LocateControl } from 'leaflet.locatecontrol';
import { FullScreen } from 'leaflet.fullscreen';
import '../shared/base.css';
import './map.css';
import '../shared/leaflet-default-icon.js';
import { renderIcpFooter } from '../shared/icp-footer.js';
import { addAnnotations } from './map-annotations.js';

// 兼容只认全局 L 的老插件（leaflet.markercluster 的 UMD 内部引用自由变量 L）
window.L = L;

const CHECK_KEY = 'travel-checkin-v1';

// 全屏控件：原生请求被拒（iOS/部分浏览器）时自动降级为伪全屏
class SafeFullScreen extends FullScreen {
  async toggleFullScreen() {
    const map = this._map;
    const container = this.options.fullscreenElement || map.getContainer();
    if (map._isFullscreen) {
      if (this._screenfull.isEnabled && !container.classList.contains('leaflet-pseudo-fullscreen')) {
        await this._screenfull.exit();
      } else {
        container.classList.remove('leaflet-pseudo-fullscreen');
      }
      map.invalidateSize();
      map._isFullscreen = false;
      map.fire('exitFullscreen');
    } else {
      map._exitFired = false;
      if (this._screenfull.isEnabled) {
        try {
          await this._screenfull.request(container);
        } catch {
          container.classList.add('leaflet-pseudo-fullscreen');
        }
      } else {
        container.classList.add('leaflet-pseudo-fullscreen');
      }
      map.invalidateSize();
      map._isFullscreen = true;
      map.fire('enterFullscreen');
    }
  }
}

// ===== 工具 =====
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 点位圆点图标：checked=灰色置灰，selected=大号黑边，highlighted=金色描边+光圈
function dotIcon(color, checked, selected, highlighted) {
  const size = selected ? 22 : highlighted ? 20 : 16;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;` +
      `background:${checked ? '#9E9E9E' : color};` +
      `border:${selected || highlighted ? 3 : 2}px solid ${selected ? '#111' : highlighted ? '#FFB300' : '#fff'};` +
      `box-shadow:0 1px 4px rgba(0,0,0,.45)${highlighted ? ',0 0 10px 2px rgba(255,179,0,.65)' : ''};` +
      `${checked ? 'opacity:.55;' : ''}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// 动线编号图标
function numberIcon(color, num, selected) {
  const size = selected ? 30 : 24;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;` +
      `background:${color};color:#fff;font:700 ${Math.round(size * 0.52)}px/1 system-ui;` +
      `display:flex;align-items:center;justify-content:center;` +
      `border:${selected ? 3 : 2}px solid ${selected ? '#111' : '#fff'};` +
      `box-shadow:0 1px 5px rgba(0,0,0,.5)">${num}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ===== 地图 App 链接 =====
// 坐标顺序坑（改动前先看清）：
//   Google query/destination：纬度,经度
//   Yandex pt/ll：经度,纬度（需要翻转！）
//   Yandex rtext：纬度,经度（~ 表示从当前位置出发）
// 均用官方 https 通用链接：装了 App 自动拉起，没装回落网页版
function navLinks(p) {
  const q = `${p.lat},${p.lon}`;
  return {
    yandexPin: `https://yandex.ru/maps/?pt=${p.lon},${p.lat}&ll=${p.lon},${p.lat}&z=17&l=map`,
    yandexNav: `https://yandex.ru/maps/?rtext=~${p.lat},${p.lon}&rtt=mt`,
    googlePin: `https://www.google.com/maps/search/?api=1&query=${q}`,
    googleNav: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=transit&dir_action=navigate`,
  };
}

// 点到我的距离（未定位时返回 null）
function myDist(p) {
  return state.myLoc ? map.distance(state.myLoc, [p.lat, p.lon]) : null;
}
function fmtDist(m) {
  return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
}

// 置信度徽章：缺省 100 = 已核实，75 = 中置信，0 = 未通过
function confBadge(p) {
  const c = p.confidence ?? 100;
  if (c === 75) return `<span style="color:#E65100;font-weight:700">⚠ 中置信</span>`;
  if (c === 0) return `<span style="color:#B71C1C;font-weight:700">✗ 未通过</span>`;
  return `<span style="color:#2E7D32;font-weight:700">✓ 已核实</span>`;
}

// 点位弹窗内容
function popupHtml(p) {
  const nav = navLinks(p);
  const d = myDist(p);
  return `
    <div style="max-width:260px;font-family:system-ui">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px">${esc(p.name)}</div>
      <div style="font-size:11px;color:#777;margin-bottom:6px">${esc(p.cluster)} · ${esc(p.type)}</div>
      ${(p.tags && p.tags.length) ? `<div style="margin-bottom:6px">${p.tags.map(t =>
        `<span style="display:inline-block;background:#EFEBE0;color:#5D4A1F;border-radius:4px;padding:1px 6px;margin:0 4px 3px 0;font-size:10px">#${esc(t)}</span>`).join('')}</div>` : ''}
      <div style="font-size:12px;line-height:1.5;margin-bottom:6px">${esc(p.highlight)}</div>
      ${p.note ? `<div style="font-size:11px;color:#555;margin-bottom:6px">📌 ${esc(p.note)}</div>` : ''}
      <div style="font-size:11px;color:#999;margin-bottom:6px">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · ${confBadge(p)}${d != null ? ` · 📏 距我 ${fmtDist(d)}` : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;font-size:12px">
        <a href="${nav.yandexPin}" target="_blank" rel="noopener" style="color:#B71C1C">📍 Yandex 落点</a>
        <a href="${nav.yandexNav}" target="_blank" rel="noopener" style="color:#B71C1C">🧭 Yandex 公交导航</a>
        <a href="${nav.googlePin}" target="_blank" rel="noopener" style="color:#1E5A8A">📍 Google 落点</a>
        <a href="${nav.googleNav}" target="_blank" rel="noopener" style="color:#1E5A8A">🧭 Google 公交导航</a>
      </div>
    </div>`;
}

// ===== 应用状态 =====
const state = {
  tab: 'points',          // points | routes
  city: '全部',
  query: '',
  collapsed: new Set(),   // 'city:名' 或 '市||群' 或 '__pending'
  tagFilter: new Set(),   // 标签筛选（多选 = 并集）
  selected: null,         // 选中点位 id（弹窗/高亮行）
  highlight: null,        // { type:'city'|'cluster', value, city? }
  routeId: null,
  sortBy: 'default',      // default | distance（定位后可用）
  myLoc: null,            // 定位到的当前位置 L.LatLng
  checked: new Set(JSON.parse(localStorage.getItem(CHECK_KEY) || '[]')),
};

let points = [];          // 全部点位（含 pending）
let routes = [];
let meta = { cities: [], cityColors: {} };
let pointByName = new Map();   // 动线 steps 按名称引用点位，保留名称索引
let pointById = new Map();

let map, clusterGroup, routesGroup;
const markerById = new Map();
let suppressFit = false;  // 手动飞向点位后，阻止本次重新 fitBounds
let lastFitKey = '';      // 上次 fitBounds 的视图钥匙

// ===== 派生数据 =====
const geoPoints = () => points.filter(p => !p.pending);
const pendingPoints = () => points.filter(p => p.pending);
const currentRoute = () => routes.find(r => r.id === state.routeId) || null;

// 地图上可见的点位（pending 永不上图）
function visiblePoints() {
  if (state.tab === 'routes' && currentRoute()) return routePoints(currentRoute()).map(x => x.p);
  const list = state.city === '全部' ? geoPoints() : geoPoints().filter(p => p.city === state.city);
  return list.filter(matchTags);
}

// 标签筛选：未选时全部通过；多选 = 并集（命中任一即通过）
function matchTags(p) {
  return !state.tagFilter.size || (p.tags && p.tags.some(t => state.tagFilter.has(t)));
}

// 动线落点：steps 中引用了点位的条目，编上序号
function routePoints(route) {
  const out = [];
  let n = 0;
  for (const s of route.steps) {
    if (!s.point) continue;
    const p = pointByName.get(s.point);
    if (p) out.push({ p, n: ++n, note: s.note });
  }
  return out;
}

// 侧栏分组：搜索过滤后按 城市 → 点位群 分组
function groupedByCity() {
  const q = state.query.trim().toLowerCase();
  let list = geoPoints().filter(matchTags);
  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) || p.cluster.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q) || p.highlight.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q)));
  }
  const cities = new Map();
  for (const p of list) {
    if (!cities.has(p.city)) cities.set(p.city, new Map());
    const clusters = cities.get(p.city);
    if (!clusters.has(p.cluster)) clusters.set(p.cluster, []);
    clusters.get(p.cluster).push(p);
  }
  return [...cities.entries()].map(([city, clusters]) => ({
    city,
    clusters: [...clusters.entries()].map(([cluster, pts]) => ({ cluster, points: pts })),
  }));
}

// 待核点位（跟随搜索/标签过滤）
function filteredPending() {
  const q = state.query.trim().toLowerCase();
  let list = pendingPoints().filter(matchTags);
  if (!q) return list;
  return list.filter(p =>
    p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) ||
    (p.highlight || '').toLowerCase().includes(q) || p.city.toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.toLowerCase().includes(q)));
}

function isHighlighted(p) {
  const h = state.highlight;
  if (!h) return false;
  if (h.type === 'city') return p.city === h.value;
  return p.cluster === h.value && p.city === h.city;
}

// ===== 侧栏渲染 =====
const sbBody = () => document.getElementById('sb-body');

function renderSidebar() {
  const body = sbBody();
  if (state.tab === 'routes') {
    body.innerHTML = currentRoute() ? routeDetailHtml(currentRoute()) : routeListHtml();
  } else {
    body.innerHTML = pointsTabHtml();
  }
}

function pointsTabHtml() {
  // 搜索行 + 排序切换（定位成功后出现"按距离"）
  let html = `
    <div class="sb-tools">
      <input class="sb-search" type="text" placeholder="搜索打卡点 / 类别 / 区域..." value="${esc(state.query)}">
      ${state.myLoc ? `<button class="sb-sort${state.sortBy === 'distance' ? ' active' : ''}" data-sort title="按离我距离排序">⇅ 距离</button>` : ''}
    </div>`;

  // 标签筛选 chips：全量点位按频次取前 12，多选 = 并集
  const freq = new Map();
  for (const p of geoPoints()) for (const t of p.tags || []) freq.set(t, (freq.get(t) || 0) + 1);
  if (freq.size) {
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    html += `<div class="sb-tags">${top.map(([t, n]) =>
      `<button class="tag-chip${state.tagFilter.has(t) ? ' active' : ''}" data-tag="${esc(t)}" title="筛选标签（可叠加）">#${esc(t)} ${n}</button>`).join('')}</div>`;
  }

  // 按距离排序：扁平列表，不再按城市/点位群分组
  if (state.sortBy === 'distance' && state.myLoc) {
    const q = state.query.trim().toLowerCase();
    const list = geoPoints()
      .filter(matchTags)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.cluster.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) || (p.highlight || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q)))
      .map(p => ({ p, d: map.distance(state.myLoc, [p.lat, p.lon]) }))
      .sort((a, b) => a.d - b.d);
    for (const { p, d } of list) {
      html += pointRowHtml(p, state.myLoc ? d : null);
    }
    if (!list.length) html += `<div style="padding:16px;font-size:12px;color:#999;text-align:center">无匹配点位</div>`;
    return html;
  }

  for (const { city, clusters } of groupedByCity()) {
    const color = meta.cityColors[city] || '#546E7A';
    const key = 'city:' + city;
    const isCollapsed = state.collapsed.has(key);
    const count = clusters.reduce((n, c) => n + c.points.length, 0);
    const hl = state.highlight?.type === 'city' && state.highlight.value === city;
    html += `
      <div class="city-head${hl ? ' hl' : ''}" data-toggle="${esc(key)}">
        <span class="head-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <span class="head-dot" style="background:${color}"></span>${esc(city)}
        <span class="head-count">（${count}）</span>
        <button class="star-btn" data-star="city" data-value="${esc(city)}" title="${hl ? '取消高亮' : '在地图上高亮该城市点位'}">${hl ? '⭐' : '☆'}</button>
      </div>`;
    if (isCollapsed) continue;
    for (const { cluster, points: pts } of clusters) {
      const ckey = city + '||' + cluster;
      const cCollapsed = state.collapsed.has(ckey);
      const chl = state.highlight?.type === 'cluster' && state.highlight.value === cluster && state.highlight.city === city;
      html += `
        <div class="cluster-wrap">
          <div class="cluster-head${chl ? ' hl' : ''}" style="color:${color}" data-toggle="${esc(ckey)}">
            <span class="head-arrow">${cCollapsed ? '▶' : '▼'}</span>
            <span class="head-dot" style="background:${color}"></span>${esc(cluster)}
            <span class="head-count">（${pts.length}）</span>
            <button class="star-btn" data-star="cluster" data-city="${esc(city)}" data-value="${esc(cluster)}" title="${chl ? '取消高亮' : '在地图上高亮该点位群'}">${chl ? '⭐' : '☆'}</button>
          </div>`;
      if (!cCollapsed) {
        for (const p of pts) html += pointRowHtml(p, state.myLoc);
      }
      html += `</div>`;
    }
  }
  // 待核实坐标：独立点位群（无坐标，不上图）
  const pend = filteredPending();
  if (pend.length) {
    const isCollapsed = state.collapsed.has('__pending');
    html += `
      <div class="city-head pending-head" data-toggle="__pending">
        <span class="head-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${pend.length}）</span>
      </div>`;
    if (!isCollapsed) {
      for (const p of pend) {
        html += `
        <div class="point-row pending">
          <span class="pr-badge">待核</span>
          <div class="pr-main">
            <div class="pr-name">${esc(p.name)}</div>
            <div class="pr-sub">${esc(p.city)} · ${esc(p.type)} · ${esc(p.highlight)}</div>
          </div>
        </div>`;
      }
    }
  }
  return html;
}

// 点位行：id 作键，定位后显示"距我 X"
function pointRowHtml(p, loc) {
  const done = state.checked.has(p.id);
  const d = loc ? fmtDist(map.distance(loc, [p.lat, p.lon])) : null;
  return `
    <div class="point-row${state.selected === p.id ? ' selected' : ''}" data-pid="${esc(p.id)}">
      <input type="checkbox" data-check="${esc(p.id)}" style="accent-color:${meta.cityColors[p.city] || '#546E7A'}" ${done ? 'checked' : ''} title="标记已打卡">
      <div class="pr-main">
        <div class="pr-name${done ? ' done' : ''}">${esc(p.name)}</div>
        <div class="pr-sub">${p.confidence != null && p.confidence < 100 ? '⚠ ' : ''}${esc(p.type)} · ${esc(p.highlight)}${d ? ` · 📏 ${d}` : ''}</div>
      </div>
    </div>`;
}

function routeListHtml() {
  const list = state.city === '全部' ? routes : routes.filter(r => r.city === state.city);
  if (!list.length) return `<div style="padding:20px 16px;font-size:12px;color:#999">该城市暂无动线</div>`;
  return list.map(r => {
    const color = meta.cityColors[r.city] || '#546E7A';
    return `
    <div class="route-card" data-route="${esc(r.id)}" style="border-color:${color}33;border-left-color:${color}">
      <div class="rc-title"><span style="color:${color}">${esc(r.day)}</span> · ${esc(r.name)}</div>
      <div class="rc-summary">${esc(r.summary)}</div>
      <div class="rc-meta">${esc(r.city)} · ${esc(r.duration)} · ${routePoints(r).length} 个落点</div>
    </div>`;
  }).join('');
}

function routeDetailHtml(r) {
  const color = meta.cityColors[r.city] || '#546E7A';
  const numbered = routePoints(r);
  let html = `<button class="route-back">← 返回动线列表</button>
    <div style="padding:0 12px">
      <div class="route-card" style="border-color:${color}44;border-left-color:${color};cursor:default;margin:0 0 8px">
        <div class="rc-title"><span style="color:${color}">${esc(r.day)}</span> · ${esc(r.name)}</div>
        <div class="rc-summary">${esc(r.summary)}</div>
        <div style="font-size:11px;margin-top:8px;line-height:1.7;background:#F6F4EE;border-radius:6px;padding:6px 8px">
          <div>🚇 <b>交通</b>：${esc(r.transport)}</div>
          <div>⏱ <b>时长</b>：${esc(r.duration)}</div>
          <div>💡 <b>贴士</b>：${esc(r.tip)}</div>
        </div>
      </div>`;
  r.steps.forEach((s) => {
    const p = s.point ? pointByName.get(s.point) : null;
    const idx = p ? numbered.findIndex(x => x.p.id === p.id) + 1 : 0;
    html += `
      <div class="route-step" ${p ? `data-pid="${esc(p.id)}"` : ''} style="cursor:${p ? 'pointer' : 'default'}${state.selected && p && state.selected === p.id ? ';background:#F0EBE0' : ''}">
        ${p
          ? `<span class="rs-num" style="background:${color}">${idx}</span>`
          : `<span class="rs-num" style="background:transparent;color:#BBB">…</span>`}
        <div style="flex:1;min-width:0">
          <div class="rs-name">${esc(s.label || s.point || '')}</div>
          ${s.note ? `<div class="rs-note">${esc(s.note)}</div>` : ''}
        </div>
      </div>`;
  });
  return html + '</div>';
}

// ===== 地图标记刷新 =====
function refreshMarkers() {
  clusterGroup.clearLayers();
  routesGroup.clearLayers();
  markerById.clear();
  const bounds = [];
  const route = state.tab === 'routes' ? currentRoute() : null;

  if (route) {
    const color = meta.cityColors[route.city] || '#546E7A';
    const pts = [];
    for (const { p, n } of routePoints(route)) {
      const m = L.marker([p.lat, p.lon], { icon: numberIcon(color, n, state.selected === p.id) });
      m.bindPopup(popupHtml(p), { closeButton: true, autoPan: false });
      m.on('click', () => { state.selected = p.id; refreshMarkers(); renderSidebar(); });
      m.addTo(routesGroup);
      markerById.set(p.id, m);
      if (state.selected === p.id) m.openPopup();
      pts.push([p.lat, p.lon]);
      bounds.push([p.lat, p.lon]);
    }
    if (!route.branch && pts.length > 1) {
      L.polyline(pts, { color, weight: 3, opacity: 0.75, dashArray: '8 6' }).addTo(routesGroup);
    }
  } else if (state.tab === 'points') {
    for (const p of visiblePoints()) {
      const color = meta.cityColors[p.city] || '#546E7A';
      const m = L.marker([p.lat, p.lon], {
        icon: dotIcon(color, state.checked.has(p.id), state.selected === p.id, isHighlighted(p)),
      });
      m.bindPopup(popupHtml(p), { closeButton: true, autoPan: false });
      m.on('click', () => { state.selected = p.id; refreshMarkers(); renderSidebar(); });
      clusterGroup.addLayer(m);
      markerById.set(p.id, m);
      if (state.selected === p.id) clusterGroup.zoomToShowLayer(m, () => m.openPopup());
      bounds.push([p.lat, p.lon]);
    }
  }

  // 视图钥匙变化时才 fitBounds（筛选/切换页签/选动线），点选/高亮/打卡不移动地图
  const key = state.tab + '|' + state.city + '|' + (route ? route.id : '');
  if (bounds.length && !suppressFit && key !== lastFitKey) {
    map.fitBounds(L.latLngBounds(bounds).pad(0.15));
    lastFitKey = key;
  }
  suppressFit = false;
}

// 飞到点位并弹窗（手机端自动收起侧栏，让地图露出来）
function flyToPoint(p) {
  suppressFit = true;
  state.selected = p.id;
  closeSidebarMobile();
  refreshMarkers();
  renderSidebar();
  map.flyTo([p.lat, p.lon], 14, { duration: 0.8 });
  setTimeout(() => {
    const m = markerById.get(p.id);
    if (!m) return;
    if (state.tab === 'routes') m.openPopup();
    else clusterGroup.zoomToShowLayer(m, () => m.openPopup());
  }, 850);
}

// 手机端收起侧栏（桌面端不动）
function closeSidebarMobile() {
  if (window.innerWidth >= 768) return;
  const sb = document.getElementById('sidebar');
  sb.classList.add('closed');
  document.getElementById('sidebar-toggle').textContent = '▶ 清单/动线';
}

// ===== 统计 / 图例 / 城市胶囊 =====
function renderChrome() {
  const done = geoPoints().filter(p => state.checked.has(p.id)).length;
  document.getElementById('sb-stats').textContent =
    `${geoPoints().length} 点位 · ${routes.length} 条动线 · 已打卡 ${done} · 待核 ${pendingPoints().length}`;

  document.getElementById('legend').innerHTML =
    meta.cities.map(c => {
      const n = geoPoints().filter(p => p.city === c).length;
      return `<div><span class="lg-dot" style="background:${meta.cityColors[c]}"></span>${esc(c)}（${n}）</div>`;
    }).join('') +
    `<div class="lg-note">灰色 = 已打卡 · 数字 = 动线顺序 · ⭐ = 高亮</div>`;

  const pills = ['全部', ...meta.cities];
  document.getElementById('city-pills').innerHTML = pills.map(c => {
    const color = c === '全部' ? '#111' : (meta.cityColors[c] || '#546E7A');
    const active = state.city === c;
    return `<button data-city="${esc(c)}" class="${active ? 'active' : ''}" style="border:1.5px solid ${color};background:${active ? color : 'transparent'};color:${active ? '#fff' : color}">${esc(c)}</button>`;
  }).join('');

  document.getElementById('tab-points').classList.toggle('active', state.tab === 'points');
  document.getElementById('tab-routes').classList.toggle('active', state.tab === 'routes');
}

// ===== 地图初始化 =====
async function initMap() {
  map = L.map('map', { zoomControl: false }).setView([56.5, 37.6], 5);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const esriTopo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Source: Esri, USGS, NOAA, Garmin, OpenStreetMap contributors', maxZoom: 19,
  });
  const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Source: Esri, HERE, Garmin, OpenStreetMap contributors', maxZoom: 19,
  });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
  });
  osm.addTo(map);

  // OSM 瓦片国内网络环境偶发加载失败：连续出错自动切换 Esri 备用图层
  let osmErrors = 0;
  osm.on('tileerror', () => {
    if (++osmErrors >= 6 && map.hasLayer(osm)) {
      map.removeLayer(osm);
      esriStreet.addTo(map);
      mapToast('OSM 瓦片加载失败，已切换 Esri 备用图层（右上角可切回）');
    }
  });
  L.control.layers({
    '当地原文 (OSM)': osm,
    'English（推荐）': esriStreet,
    '中文概览（仅大区域）': esriTopo,
  }, {}, { position: 'topright' }).addTo(map);

  // 点位聚合层（红色数字气泡，街区级散开）
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 14,
    showCoverageOnHover: false,
    chunkedLoading: true,
    iconCreateFunction: (cluster) => L.divIcon({
      className: '',
      html: `<div style="width:34px;height:34px;border-radius:50%;background:#B71C1C;color:#fff;` +
        `font:700 14px/1 system-ui;display:flex;align-items:center;justify-content:center;` +
        `border:3px solid #FFD54F;box-shadow:0 1px 6px rgba(0,0,0,.5)">${cluster.getChildCount()}</div>`,
      iconSize: [34, 34],
    }),
  }).addTo(map);
  routesGroup = L.layerGroup().addTo(map);

  // 固定标注：机场/酒店/火车站/地堡/水上巴士/构成主义动线
  addAnnotations(L, map);

  // 定位到我
  new LocateControl({
    position: 'bottomright',
    flyTo: true,
    keepCurrentZoomLevel: false,
    drawCircle: true,
    drawMarker: true,
    metric: true,
    strings: {
      title: '定位到我的位置',
      popup: '你在这里（误差 ±{distance}{unit}）',
      outsideMapBoundsMsg: '你似乎不在当前地图区域内',
      metersUnit: '米',
      feetUnit: '英尺',
    },
    locateOptions: { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  }).addTo(map);

  // 全屏（原生失败自动降级伪全屏）
  new SafeFullScreen({ position: 'bottomright', title: '全屏显示', titleCancel: '退出全屏' }).addTo(map);

  // 地址搜索（Nominatim，限俄罗斯，俄/英文）
  map.addControl(new GeoSearchControl({
    provider: new OpenStreetMapProvider({
      params: { 'accept-language': 'ru,en', countrycodes: 'ru', addressdetails: 1, limit: 6 },
    }),
    style: 'bar',
    position: 'topleft',
    showMarker: true,
    showPopup: true,
    autoClose: true,
    retainZoomLevel: false,
    animateZoom: true,
    keepResult: false,
    searchLabel: window.innerWidth < 768 ? '搜索地址（俄语/英语）' : '搜索地址（俄语/英语，如 Красная площадь / Red Square）',
    notFoundMessage: '没有找到，请换俄语或英语拼写再试',
  }));

  // 定位成功：记住位置，侧栏显示"距我 X"并提供按距离排序
  map.on('locationfound', (e) => {
    if (state.myLoc) return; // 首次定位即可，不持续追踪
    state.myLoc = e.latlng;
    renderSidebar();
    mapToast('定位成功：清单已显示各点位距离，可按距离排序');
  });
}

// 地图底部提示条
function mapToast(text) {
  const el = document.createElement('div');
  el.className = 'map-toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 30);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3600);
}

// ===== 事件 =====
function bindEvents() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const syncToggle = () => {
    const closed = sidebar.classList.contains('closed');
    toggleBtn.textContent = closed ? '▶ 清单/动线' : '◀ 收起';
  };
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('closed');
    syncToggle();
    setTimeout(() => map.invalidateSize(), 260);
  });
  if (window.innerWidth < 768) sidebar.classList.add('closed');
  syncToggle();

  document.getElementById('tab-points').addEventListener('click', () => {
    if (state.tab === 'points') return;
    state.tab = 'points'; state.routeId = null; state.selected = null;
    refreshMarkers(); renderSidebar(); renderChrome();
  });
  document.getElementById('tab-routes').addEventListener('click', () => {
    if (state.tab === 'routes') return;
    state.tab = 'routes'; state.selected = null;
    refreshMarkers(); renderSidebar(); renderChrome();
  });
  document.getElementById('city-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-city]');
    if (!btn) return;
    state.city = btn.dataset.city;
    state.routeId = null; state.selected = null;
    refreshMarkers(); renderSidebar(); renderChrome();
  });

  // 侧栏内容：事件委托
  const body = sbBody();
  body.addEventListener('input', (e) => {
    if (e.target.classList.contains('sb-search')) {
      state.query = e.target.value;
      const pos = e.target.selectionStart;
      renderSidebar();
      const input = body.querySelector('.sb-search');
      input.focus();
      input.setSelectionRange(pos, pos);
    }
  });
  body.addEventListener('change', (e) => {
    const name = e.target.dataset?.check;
    if (!name) return;
    if (state.checked.has(name)) state.checked.delete(name);
    else state.checked.add(name);
    localStorage.setItem(CHECK_KEY, JSON.stringify([...state.checked]));
    refreshMarkers(); renderSidebar(); renderChrome();
  });
  body.addEventListener('click', (e) => {
    // 标签筛选 chips——须放在 input/button 提前返回之前（chips 是 button）
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) {
      const t = tagBtn.dataset.tag;
      if (state.tagFilter.has(t)) state.tagFilter.delete(t);
      else state.tagFilter.add(t);
      refreshMarkers(); renderSidebar();
      return;
    }
    // 排序切换（按距离）——须放在 input/button 提前返回之前
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      state.sortBy = state.sortBy === 'distance' ? 'default' : 'distance';
      renderSidebar();
      return;
    }
    // 复选框等控件：不触发飞向点位（避免 change 前侧栏重渲染导致打卡丢失）
    if (e.target.closest('input,button,a')) {
      if (e.target.closest('.star-btn')) { /* 交给下方 star 逻辑 */ } else return;
    }
    // ⭐ 高亮按钮（阻止冒泡到标题的折叠）
    const star = e.target.closest('.star-btn');
    if (star) {
      e.stopPropagation();
      const type = star.dataset.star;
      const value = star.dataset.value;
      const city = star.dataset.city;
      const cur = state.highlight;
      const same = cur && cur.type === type && cur.value === value && (type === 'city' || cur.city === city);
      state.highlight = same ? null : (type === 'city' ? { type, value } : { type, value, city });
      refreshMarkers(); renderSidebar();
      return;
    }
    // 城市/点位群标题：折叠/展开
    const head = e.target.closest('[data-toggle]');
    if (head) {
      const key = head.dataset.toggle;
      if (state.collapsed.has(key)) state.collapsed.delete(key);
      else state.collapsed.add(key);
      renderSidebar();
      return;
    }
    // 动线卡片 / 返回
    const card = e.target.closest('.route-card[data-route]');
    if (card) {
      state.routeId = card.dataset.route;
      state.selected = null;
      refreshMarkers(); renderSidebar();
      return;
    }
    if (e.target.closest('.route-back')) {
      state.routeId = null; state.selected = null;
      refreshMarkers(); renderSidebar();
      return;
    }
    // 点位行 / 动线步骤：飞向点位
    const row = e.target.closest('[data-pid]');
    if (row) {
      const p = pointById.get(row.dataset.pid);
      if (p) flyToPoint(p);
    }
  });
}

// ===== 启动 =====
async function main() {
  // markercluster 的 UMD 引用全局 L，须在设置 window.L 后动态加载
  await import('leaflet.markercluster');

  [points, routes, meta] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/routes.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
  ]);
  pointByName = new Map(points.map(p => [p.name, p]));
  pointById = new Map(points.map(p => [p.id, p]));

  await initMap();
  bindEvents();
  refreshMarkers();
  renderSidebar();
  renderChrome();
}

main().catch(err => {
  console.error(err);
  document.getElementById('sb-stats').textContent = '⚠️ 加载失败，请刷新重试';
});
import { registerSW } from '../shared/sw-register.js';
registerSW();
renderIcpFooter();
