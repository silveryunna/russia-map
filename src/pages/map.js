// 旅行地图页：点位聚合 + 国家/城市/点位群/点位四级侧栏 + ⭐高亮 + 搜索 + 定位 + 全屏
//   + 每日动线（可播放）+ 打卡 v2 + 评分体系 + 美食住行 + 中国/非中国图层方案
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet-geosearch/dist/geosearch.css';
import 'leaflet.fullscreen/dist/Control.FullScreen.css';
import { GeoSearchControl } from 'leaflet-geosearch';
import { FullScreen } from 'leaflet.fullscreen';
import '../shared/base.css';
import './map.css';
import '../shared/leaflet-default-icon.js';
import { renderIcpFooter } from '../shared/icp-footer.js';
import { registerSW } from '../shared/sw-register.js';
import { xy } from './map/coords.js';
import { categoryIcon } from './map/icons.js';
import { ratingTabs, ratingBadges, validRatings } from './map/ratings.js';
import { navLinks, navHref } from './map/nav.js';
import { drawOverlays, rebuildOverlays } from './map/overlays.js';
import { initPlayer, playRoute, stopPlay } from './map/player.js';
import { initLayers, countryOf, sortCities, COUNTRY_STYLE } from './map/layers.js';
import { loadCheckins, toggleCheckin } from '../modules/checkin.js';

// 兼容只认全局 L 的老插件（leaflet.markercluster 的 UMD 内部引用自由变量 L）
window.L = L;

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

// ===== 搜索（本地点位，中/俄/英） =====
// 打分：名称前缀=1 > 名称包含=2 > 类别/群/标签=3 > 亮点/备注/城市=4
function matchPoints(q) {
  q = (q || '').trim().toLowerCase();
  const out = [];
  if (!q) return out;
  for (const p of geoPoints()) {
    const name = p.name.toLowerCase();
    const nameEn = (p.name_en || '').toLowerCase();
    let score = 0;
    if (name.startsWith(q) || nameEn.startsWith(q)) score = 1;
    else if (name.includes(q) || nameEn.includes(q)) score = 2;
    else if ((p.type || '').toLowerCase().includes(q) || p.cluster.toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(q))) score = 3;
    else if ((p.highlight || '').toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q)) score = 4;
    if (score) out.push({ p, score });
  }
  return out.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));
}
function matchIds(q) {
  return new Set(matchPoints(q).map((x) => x.p.id));
}

// 搜索词高亮（输入已 esc 的文本，插入 <b class="hl">）
function hlRaw(escaped, q) {
  escaped = (escaped || '').toString();
  const n = (q || '').trim().toLowerCase();
  if (!n) return escaped;
  const i = escaped.toLowerCase().indexOf(n);
  if (i < 0) return escaped;
  return escaped.slice(0, i) + '<b class="hl">' + escaped.slice(i, i + n.length) + '</b>' + escaped.slice(i + n.length);
}

// 美食住行分类：按 tags 归 美食/住宿/交通
const LIFE_CATS = [
  ['美食', ['餐厅/咖啡']],
  ['住宿', ['酒店/旅馆']],
  ['交通', ['机场', '地铁站', '交通枢纽', '水上巴士']],
];
function lifeCat(p) {
  const tags = p.tags || [];
  for (const [c, keys] of LIFE_CATS) if (keys.some((k) => tags.includes(k))) return c;
  return null;
}

// ===== 点位弹窗内容 =====
function popupHtml(p) {
  const nav = navLinks(p);
  const d = myDist(p);
  const nv = navHref(p, nav);
  const r0 = window.__ratings__ && window.__ratings__.items ? window.__ratings__.items[p.id] : null;
  const rl = validRatings(r0);
  return `
    <div style="max-width:260px;font-family:system-ui">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px">${esc(p.name)}</div>${p.name_en ? `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#1E5A8A;margin:2px 0 4px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name_en)}</span><button data-en="${esc(p.name_en)}" onclick="__copyEn__(this)" style="flex-shrink:0;border:1px solid #B9CCE0;background:#F2F7FC;border-radius:4px;padding:1px 7px;font-size:10px;color:#1E5A8A;cursor:pointer">复制</button></div>` : ''}
      <div style="font-size:11px;color:#777;margin-bottom:6px">${esc(p.cluster)} · ${esc(p.type)}</div>
      ${(p.tags && p.tags.length) ? `<div style="margin-bottom:6px">${p.tags.map(t =>
        `<span style="display:inline-block;background:#EFEBE0;color:#5D4A1F;border-radius:4px;padding:1px 6px;margin:0 4px 3px 0;font-size:10px">#${esc(t)}</span>`).join('')}</div>` : ''}
      <div style="font-size:12px;line-height:1.5;margin-bottom:6px">${esc(p.highlight)}</div>
      ${p.note ? `<div style="font-size:11px;color:#555;margin-bottom:6px">📌 ${esc(p.note)}</div>` : ''}
      <div style="font-size:11px;color:#999;margin-bottom:6px">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · ${confBadge(p)}${d != null ? ` · 📏 距我 ${fmtDist(d)}` : ''}</div>${p.hours || p.ticket || p.mustOrder ? `<div style="font-size:11px;color:#666;margin-bottom:6px;line-height:1.7">${p.hours ? `🕐 ${esc(p.hours)}&nbsp; ` : ''}${p.ticket ? `🎫 ${esc(p.ticket)}&nbsp; ` : ''}${p.mustOrder ? `🍽 ${esc(p.mustOrder)}` : ''}</div>` : ''}${ratingTabs(p, rl)}${p.url ? `<div style="margin-bottom:6px"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:#00695C;font-size:12px">🌐 官方网站</a></div>` : ''}
      <div style="margin-bottom:6px"><a href="${nv.href}" ${nv.blank ? `target="_blank" rel="noopener"` : ''} class="popup-nav" style="display:block;text-align:center;background:#B71C1C;color:#fff;text-decoration:none;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:600">🧭 ${nv.label}</a></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;font-size:12px">
        ${nav.amapPin
          ? `<a href="${nav.amapPin}" target="_blank" rel="noopener" style="color:#2E7D32">📍 跳转高德</a>
        <a href="${nav.amapNav}" target="_blank" rel="noopener" style="color:#2E7D32">🧭 到这里去</a>`
          : `<a href="${nav.yandexPin}" target="_blank" rel="noopener" style="color:#B71C1C">📍 跳转Yandex</a>
        <a href="${nav.yandexNav}" target="_blank" rel="noopener" style="color:#B71C1C">🧭 到这里去</a>
        <a href="${nav.googlePin}" target="_blank" rel="noopener" style="color:#1E5A8A">📍 跳转Google</a>
        <a href="${nav.googleNav}" target="_blank" rel="noopener" style="color:#1E5A8A">🧭 到这里去</a>`}
      </div>
    </div>`;
}

// ===== 应用状态 =====
const state = {
  tab: 'points',          // points | routes | life
  city: '全部',
  query: '',
  collapsed: new Set(),   // 'country:名' | '市||群' | 'life:市' | 'rg:市' | '__pending'
  opened: new Set(),      // 'city:名'（城市默认折叠，点开进这里）
  tagFilter: new Set(),   // 标签筛选（多选 = 并集）
  tagsExpanded: false,
  citiesExpanded: false,
  selected: null,         // 选中点位 id（弹窗/高亮行）
  highlight: null,        // { type:'city'|'cluster', value, city? }
  routeId: null,
  sortBy: 'default',      // default | distance（定位后可用）
  myLoc: null,            // 定位到的当前位置 L.LatLng（WGS 原始值，绘制时过 xy()）
  myAcc: null,            // 定位精度（米）
  checked: new Set(),     // 打卡 v2：id 集合（见下初始化）
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

// 地图上可见的点位（pending 永不上图；life 页签只上美食/住宿/交通）
function visiblePoints() {
  if (state.tab === 'routes' && currentRoute()) return routePoints(currentRoute()).map(x => x.p);
  const list = state.city === '全部' ? geoPoints() : geoPoints().filter(p => p.city === state.city);
  return state.tab === 'life' ? list.filter(lifeCat) : list.filter(matchTags);
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

// 侧栏四级分组：国家 → 城市 → 点位群 → 点位（搜索/标签/城市过滤后）
function groupedByCountry() {
  const q = state.query.trim().toLowerCase();
  let list = q ? matchPoints(q).map(x => x.p).filter(matchTags) : geoPoints().filter(matchTags);
  list = list.filter(p => state.city === '全部' || p.city === state.city);
  const byCity = new Map();
  for (const p of list) {
    if (!byCity.has(p.city)) byCity.set(p.city, new Map());
    const clusters = byCity.get(p.city);
    if (!clusters.has(p.cluster)) clusters.set(p.cluster, []);
    clusters.get(p.cluster).push(p);
  }
  const byCountry = new Map();
  for (const [city, clusters] of byCity) {
    const cn = countryOf(city);
    if (!byCountry.has(cn)) byCountry.set(cn, []);
    byCountry.get(cn).push([city, clusters]);
  }
  const out = [];
  for (const cn of ['中国', '俄罗斯', '哈萨克斯坦', '其他']) {
    if (!byCountry.has(cn)) continue;
    out.push({
      country: cn,
      cities: byCountry.get(cn)
        .sort((a, b) =>
          (meta.cities.indexOf(a[0]) < 0 ? 99 : meta.cities.indexOf(a[0])) -
          (meta.cities.indexOf(b[0]) < 0 ? 99 : meta.cities.indexOf(b[0])))
        .map(([city, clusters]) => ({
          city,
          clusters: [...clusters.entries()].map(([cluster, pts]) => ({ cluster, points: pts })),
        })),
    });
  }
  return out;
}

// 待核点位（跟随搜索/标签/城市过滤）
function filteredPending() {
  const q = state.query.trim().toLowerCase();
  const list = pendingPoints()
    .filter(matchTags)
    .filter(p => state.city === '全部' || p.city === state.city);
  return q ? list.filter(p => matchIds(q).has(p.id)) : list;
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
  } else if (state.tab === 'life') {
    body.innerHTML = lifeTabHtml();
  } else {
    body.innerHTML = pointsTabHtml();
  }
}

// 点位行：id 作键；prefix 用于美食住行页签的分类 emoji；withBadges 追加评分徽章
function pointRowHtml(p, loc, prefix, withBadges) {
  const done = state.checked.has(p.id);
  const d = loc ? fmtDist(map.distance(loc, [p.lat, p.lon])) : null;
  return `
    <div class="point-row${state.selected === p.id ? ' selected' : ''}" data-pid="${esc(p.id)}">
      <input type="checkbox" data-check="${esc(p.id)}" style="accent-color:${meta.cityColors[p.city] || '#546E7A'}" ${done ? 'checked' : ''} title="标记已打卡">
      <div class="pr-main">
        <div class="pr-name${done ? ' done' : ''}">${prefix || ''}${hlRaw(esc(p.name), state.query)}${withBadges ? ratingBadges(p.id) : ''}</div>
        <div class="pr-sub">${p.confidence != null && p.confidence < 100 ? '⚠ ' : ''}${esc(p.type)} · ${esc(p.highlight)}${d ? ` · 📏 ${d}` : ''}</div>
      </div>
    </div>`;
}

function pointsTabHtml() {
  let html = '';

  // 标签筛选 chips：网红机位置顶，其余按频次；默认折叠（CSS 限高），>5 出展开钮
  const freq = new Map();
  for (const p of geoPoints()) for (const t of p.tags || []) freq.set(t, (freq.get(t) || 0) + 1);
  if (freq.size) {
    const all = [...freq.entries()];
    const pinned = ['网红机位'];
    all.sort((a, b) => {
      const ai = pinned.indexOf(a[0]), bi = pinned.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b[1] - a[1];
    });
    html += `<div class="sb-tags${state.tagsExpanded ? ' expanded' : ''}">${all.map(([t, n]) =>
      `<button class="tag-chip${state.tagFilter.has(t) ? ' active' : ''}" data-tag="${esc(t)}" title="筛选标签（可叠加）">#${esc(t)} ${n}</button>`).join('')}</div>${
      all.length > 5 ? `<button class="tags-toggle" data-tags-toggle title="展开/收起标签">${state.tagsExpanded ? '▴ 收起标签' : '▾ 展开全部标签'}</button>` : ''}`;
  }

  // 搜索行 + 排序切换（定位成功后出现"按距离"）
  html += `
    <div class="sb-tools">
      <input class="sb-search" type="text" placeholder="搜索打卡点 / 类别 / 区域..." value="${esc(state.query)}">
      ${state.myLoc ? `<button class="sb-sort${state.sortBy === 'distance' ? ' active' : ''}" data-sort title="按离我距离排序">⇅ 距离</button>` : ''}
    </div>`;

  // 按距离排序：扁平列表，不再按城市/点位群分组
  if (state.sortBy === 'distance' && state.myLoc) {
    const q = state.query.trim().toLowerCase();
    const list = geoPoints()
      .filter(matchTags)
      .filter(p => state.city === '全部' || p.city === state.city)
      .filter(p => !q || matchIds(q).has(p.id))
      .map(p => ({ p, d: map.distance(state.myLoc, [p.lat, p.lon]) }))
      .sort((a, b) => a.d - b.d);
    for (const { p, d } of list) html += pointRowHtml(p, state.myLoc ? d : null);
    if (!list.length) html += `<div style="padding:16px;font-size:12px;color:#999;text-align:center">无匹配点位</div>`;
    return html;
  }

  for (const { country, cities } of groupedByCountry()) {
    const cs = COUNTRY_STYLE[country] || COUNTRY_STYLE['其他'];
    const ck = 'country:' + country;
    const copen = !state.collapsed.has(ck);
    const ccount = cities.reduce((n, c) => n + c.clusters.reduce((m, cl) => m + cl.points.length, 0), 0);
    html += `
      <div class="country-head" data-toggle="${esc(ck)}" style="--cc:${cs.color}">
        <span class="ch-flag">${cs.flag}</span><span class="ch-name">${esc(country)}</span>
        <span class="head-pill">${ccount}</span>
        <span class="ch-arrow">${copen ? '▼' : '▶'}</span>
      </div>`;
    if (!copen) continue;
    html += `<div class="country-children" style="--cc:${cs.color}">`;
    for (const { city, clusters } of cities) {
      const color = meta.cityColors[city] || '#546E7A';
      const key = 'city:' + city;
      const isCollapsed = !state.opened.has(key);
      const count = clusters.reduce((n, c) => n + c.points.length, 0);
      const hl = state.highlight?.type === 'city' && state.highlight.value === city;
      html += `
      <div class="city-head${hl ? ' hl' : ''}" data-toggle="${esc(key)}">
        <span class="head-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <span class="head-dot" style="background:${color}"></span>${esc(city)}
        <span class="head-count">（${count}）</span>
        <button class="star-btn" data-star="city" data-value="${esc(city)}" title="${hl ? '取消高亮' : '在地图上高亮该城市点位'}">${hl ? '⭐' : '☆'}</button>
      </div>`;
      if (!isCollapsed) {
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
    }
    // 待核实坐标挂在「其他」国家组末尾（无坐标，不上图）
    if (country === '其他') {
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
    }
    html += `</div>`;
  }
  return html;
}

// 美食住行页签：按 LIFE_CATS 过滤，按 国家-城市 分组
function lifeTabHtml() {
  let html = `<div class="sb-tools"><input class="sb-search" type="text" placeholder="搜索美食 / 住宿 / 交通..." value="${esc(state.query)}"></div>`;
  const q = state.query.trim().toLowerCase();
  let list = geoPoints()
    .filter(lifeCat)
    .filter(p => state.city === '全部' || p.city === state.city);
  if (q) list = list.filter(p => matchIds(q).has(p.id));
  const icons = { 美食: '🍜 ', 住宿: '🏨 ', 交通: '🚇 ' };
  const byCity = new Map();
  for (const p of list) {
    if (!byCity.has(p.city)) byCity.set(p.city, []);
    byCity.get(p.city).push(p);
  }
  for (const city of sortCities([...byCity.keys()])) {
    const pts = byCity.get(city);
    const cn = countryOf(city);
    const cf = (COUNTRY_STYLE[cn] || COUNTRY_STYLE['其他']).flag;
    const key = 'life:' + city;
    const coll = state.collapsed.has(key);
    html += `
    <div class="city-head" data-toggle="${esc(key)}">
      <span class="head-arrow">${coll ? '▶' : '▼'}</span>
      <span class="head-dot" style="background:${meta.cityColors[city] || '#546E7A'}"></span>${cf} 【${esc(cn)}-${esc(city)}】
      <span class="head-count">（${pts.length}）</span>
    </div>`;
    if (!coll) for (const p of pts) html += pointRowHtml(p, state.myLoc, icons[lifeCat(p)], true);
  }
  if (!list.length) html += `<div style="padding:16px;font-size:12px;color:#999;text-align:center">无匹配条目</div>`;
  return html;
}

// 动线列表：按 国家-城市 分组（rg: 折叠键）
function routeListHtml() {
  const list = state.city === '全部' ? routes : routes.filter(r => r.city === state.city);
  if (!list.length) return `<div style="padding:20px 16px;font-size:12px;color:#999">该城市暂无动线</div>`;
  const byCity = new Map();
  for (const r of list) {
    if (!byCity.has(r.city)) byCity.set(r.city, []);
    byCity.get(r.city).push(r);
  }
  let html = '';
  for (const city of sortCities([...byCity.keys()])) {
    const rs = byCity.get(city);
    const cn = countryOf(city);
    const cf = (COUNTRY_STYLE[cn] || COUNTRY_STYLE['其他']).flag;
    const col = meta.cityColors[city] || '#546E7A';
    const key = 'rg:' + city;
    const coll = state.collapsed.has(key);
    html += `
    <div class="city-head" data-toggle="${esc(key)}">
      <span class="head-arrow">${coll ? '▶' : '▼'}</span>
      <span class="head-dot" style="background:${col}"></span>${cf} 【${esc(cn)}-${esc(city)}】
      <span class="head-count">（${rs.length} 条）</span>
    </div>`;
    if (!coll) {
      for (const r of rs) {
        const color = meta.cityColors[r.city] || '#546E7A';
        html += `
    <div class="route-card" data-route="${esc(r.id)}" style="border-color:${color}33;border-left-color:${color}">
      <div class="rc-title"><span style="color:${color}">${esc(r.day)}</span> · ${esc(r.name)}</div>
      <div class="rc-summary">${esc(r.summary)}</div>
      <div class="rc-meta">${esc(r.city)} · ${esc(r.duration)} · ${routePoints(r).length} 个落点</div>
    </div>`;
      }
    }
  }
  return html;
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
      </div><button class="route-play" data-play>${window.__playTimer__ ? '⏸ 停止播放' : '▶ 播放动线（镜头跟随）'}</button>`;
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
      const m = L.marker(xy(p.lat, p.lon), { icon: numberIcon(color, n, state.selected === p.id) });
      m.bindPopup(popupHtml(p), { closeButton: true, autoPan: false });
      m.on('click', () => { state.selected = p.id; refreshMarkers(); renderSidebar(); });
      m.addTo(routesGroup);
      markerById.set(p.id, m);
      if (state.selected === p.id) m.openPopup();
      pts.push(xy(p.lat, p.lon));
      bounds.push(xy(p.lat, p.lon));
    }
    if (!route.branch && pts.length > 1) {
      L.polyline(pts, { color, weight: 3, opacity: 0.75, dashArray: '8 6' }).addTo(routesGroup);
    }
  } else if (state.tab === 'points' || state.tab === 'life') {
    for (const p of visiblePoints()) {
      const color = meta.cityColors[p.city] || '#546E7A';
      const icon = categoryIcon(p, state.checked.has(p.id), state.selected === p.id) ||
        dotIcon(color, state.checked.has(p.id), state.selected === p.id, isHighlighted(p));
      const m = L.marker(xy(p.lat, p.lon), { icon });
      m.bindPopup(popupHtml(p), { closeButton: true, autoPan: false });
      m.on('click', () => { state.selected = p.id; refreshMarkers(); renderSidebar(); });
      clusterGroup.addLayer(m);
      markerById.set(p.id, m);
      if (state.selected === p.id) clusterGroup.zoomToShowLayer(m, () => m.openPopup());
      bounds.push(xy(p.lat, p.lon));
    }
  }

  // 视图钥匙变化时才 fitBounds（筛选/切换页签/选动线），点选/高亮/打卡不移动地图
  const key = state.tab + '|' + state.city + '|' + (route ? route.id : '');
  if (bounds.length && !suppressFit && key !== lastFitKey) {
    map.fitBounds(L.latLngBounds(bounds).pad(0.15));
    lastFitKey = key;
  }
  suppressFit = false;
  drawMyLoc(); // GCJ 补偿翻转后蓝点随点位一起重画
}

// 自绘「我的位置」：state.myLoc 存 WGS 原始值，绘制时过 xy() 做 GCJ 补偿
// 切换底图/区域时随 refreshMarkers 重画，保证蓝点始终贴地
function drawMyLoc() {
  (window.__myLocLayers__ || []).forEach((l) => map.removeLayer(l));
  window.__myLocLayers__ = [];
  if (!state.myLoc || !map) return;
  const c = xy(state.myLoc.lat, state.myLoc.lng);
  const layers = [];
  if (state.myAcc) {
    layers.push(L.circle(c, {
      radius: state.myAcc, color: '#2A7AE2', weight: 1, opacity: 0.5,
      fillColor: '#2A7AE2', fillOpacity: 0.12, interactive: false,
    }));
  }
  layers.push(L.circleMarker(c, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#2A7AE2', fillOpacity: 1 })
    .bindPopup(`你在这里${state.myAcc ? `（误差 ±${Math.round(state.myAcc)} 米）` : ''}`));
  layers.forEach((l) => l.addTo(map));
  window.__myLocLayers__ = layers;
}

// 飞到点位并弹窗（手机端自动收起侧栏，让地图露出来）
function flyToPoint(p) {
  suppressFit = true;
  state.selected = p.id;
  closeSidebarMobile();
  refreshMarkers();
  renderSidebar();
  map.flyTo(xy(p.lat, p.lon), 14, { duration: 0.8 });
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
  document.getElementById('sidebar-toggle').textContent = '▶ 展开';
}

// ===== 统计 / 图例 / 城市胶囊 =====
function renderChrome() {
  const done = geoPoints().filter(p => state.checked.has(p.id)).length;
  document.getElementById('sb-stats').textContent =
    `${geoPoints().length} 点位 · ${routes.length} 条动线 · 已打卡 ${done} · 待核 ${pendingPoints().length}`;

  document.getElementById('legend').innerHTML =
    sortCities(meta.cities.filter(c => geoPoints().some(p => p.city === c)))
      .map(c => {
        const n = geoPoints().filter(p => p.city === c).length;
        return `<div><span class="lg-dot" style="background:${meta.cityColors[c]}"></span>${esc(c)}（${n}）</div>`;
      }).join('') +
    `<div class="lg-note">灰色 = 已打卡 · 数字 = 动线顺序 · ⭐ = 高亮</div>`;

  const pills = ['全部', ...sortCities(meta.cities)];
  document.getElementById('city-pills').innerHTML = pills.map(c => {
    const color = c === '全部' ? '#111' : (meta.cityColors[c] || '#546E7A');
    const active = state.city === c;
    return `<button data-city="${esc(c)}" class="${active ? 'active' : ''}" style="border:1.5px solid ${color};background:${active ? color : 'transparent'};color:${active ? '#fff' : color}">${esc(c)}</button>`;
  }).join('');

  const cp = document.getElementById('city-pills');
  cp.classList.toggle('expanded', !!state.citiesExpanded);
  const ct = document.getElementById('cities-toggle');
  if (ct) {
    ct.style.display = pills.length > 5 ? 'block' : 'none';
    ct.textContent = state.citiesExpanded ? '▴ 收起城市' : '▾ 展开全部城市';
  }

  document.getElementById('tab-points').classList.toggle('active', state.tab === 'points');
  document.getElementById('tab-routes').classList.toggle('active', state.tab === 'routes');
  document.getElementById('tab-life').classList.toggle('active', state.tab === 'life');
}

// ===== 地图初始化 =====
async function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([56.5, 37.6], 5);
  window.__map__ = map; // 调试/自动化测试入口
  L.control.attribution({ prefix: false, position: 'bottomright' })
    .addAttribution('© OpenStreetMap contributors · Esri · 天地图 · 高德 · 腾讯')
    .addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const esriTopo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Source: Esri, USGS, NOAA, Garmin, OpenStreetMap contributors', maxZoom: 19,
  });
  const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Source: Esri, HERE, Garmin, OpenStreetMap contributors', maxZoom: 19,
  });
  const osm = L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors, tiles courtesy of OpenStreetMap.de', maxZoom: 19,
  });
  osm.addTo(map);
  window.__worldBase__ = osm;
  // 供 layers.js 的图层控件引用
  window.__osmDeLayer__ = osm;
  window.__esriStreetLayer__ = esriStreet;
  window.__esriTopoLayer__ = esriTopo;

  // OSM 瓦片偶发加载失败：连续出错自动切换 Esri 备用图层
  let osmErrors = 0;
  osm.on('tileerror', () => {
    if (++osmErrors >= 6 && map.hasLayer(osm)) {
      map.removeLayer(osm);
      esriStreet.addTo(map);
      window.__worldBase__ = esriStreet;
      mapToast('OSM 瓦片加载失败，已切换 Esri 备用图层（右上角可切回）');
    }
  });

  // 点位聚合层（红色数字气泡，街区级散开）
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 35,
    disableClusteringAtZoom: 12,
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

  // 数据驱动覆盖层（水上巴士航线等，来自 data/overlays.json）
  drawOverlays(L, map);

  // 定位到我（自绘控件：leaflet.locatecontrol 不支持坐标变换，GCJ 底图上蓝点会偏 ~500m，故弃用）
  const locateCtl = L.control({ position: 'bottomright' });
  locateCtl.onAdd = () => {
    const btn = L.DomUtil.create('a', 'leaflet-bar locate-btn');
    btn.href = '#';
    btn.title = '定位到我的位置';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', '定位到我的位置');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5"/></svg>';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      map.locate({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    });
    return btn;
  };
  locateCtl.addTo(map);

  // 全屏（原生失败自动降级伪全屏）
  new SafeFullScreen({ position: 'bottomright', title: '全屏显示', titleCancel: '退出全屏' }).addTo(map);

  // 图层方案（世界/中国）、刷新控件、城市快跳、区域遮罩
  initLayers({ L, map, toast: mapToast, refreshMarkers, meta, geoPoints });

  // 打卡点搜索（本地点位库，中/俄/英；不再走 Nominatim 地址搜索）
  // 须在 initLayers 之后注册：保持在左上角控件列末尾（线上顺序：图层/快跳/刷新/方案/搜索）
  map.addControl(
    (window.__geoControl__ = new GeoSearchControl({
      provider: {
        search: (e) => {
          if (e && e.data && e.data.x != null) return Promise.resolve([e.data]);
          const q = ((e && e.query) || '').trim();
          return Promise.resolve(
            matchPoints(q).slice(0, 6).map(({ p }) => {
              const [y, x] = xy(p.lat, p.lon);
              return { label: `${p.name}${p.name_en ? ` · ${p.name_en}` : ''}｜${p.cluster} · ${p.type}`, x, y };
            }),
          );
        },
      },
      style: 'button',
      position: 'topleft',
      showMarker: true,
      showPopup: true,
      autoClose: true,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: false,
      searchLabel: window.innerWidth < 768 ? '搜索打卡点（中/俄/英）' : '搜索打卡点（中/俄/英，如 红场 / Red Square）',
      notFoundMessage: '没有匹配的打卡点',
    })),
  );

  // 搜索框输入自动提交（防抖 200ms）+ 结果项点击直接落点
  (() => {
    const ctl = window.__geoControl__;
    if (ctl && ctl.searchElement && ctl.searchElement.input) {
      const input = ctl.searchElement.input;
      let timer;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (input.value.trim()) ctl.searchElement.onSubmit({ preventDefault() {} });
        }, 200);
      });
      document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-key]');
        if (!item) return;
        const c = window.__geoControl__;
        if (!c || !c.searchElement) return;
        const r = c.searchElement.results
          ? c.searchElement.results[[...item.parentElement.children].indexOf(item)]
          : null;
        if (r) {
          e.stopPropagation();
          e.preventDefault();
          c.searchElement.input.value = r.label;
          c.showResult(r, { query: r.label });
        }
      }, true);
    }
  })();

  // 定位成功：记住位置（WGS 原始值），自绘标记过 xy() 补偿，侧栏显示"距我 X"并可按距离排序
  map.on('locationfound', (e) => {
    const first = !state.myLoc;
    state.myLoc = e.latlng;
    state.myAcc = e.accuracy;
    drawMyLoc();
    map.flyTo(xy(e.latlng.lat, e.latlng.lng), Math.max(map.getZoom(), 15), { duration: 0.8 });
    renderSidebar();
    mapToast(first ? '定位成功：清单已显示各点位距离，可按距离排序' : '已更新到我的位置');
  });
  map.on('locationerror', () => mapToast('定位失败：请检查浏览器定位权限'));
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
    toggleBtn.textContent = closed ? '▶ 展开' : '◀';
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
    renderSidebar(); refreshMarkers(); renderChrome();
  });
  document.getElementById('tab-routes').addEventListener('click', () => {
    if (state.tab === 'routes') return;
    state.tab = 'routes'; state.selected = null;
    renderSidebar(); refreshMarkers(); renderChrome();
  });
  document.getElementById('tab-life').addEventListener('click', () => {
    if (state.tab === 'life') return;
    state.tab = 'life'; state.routeId = null; state.selected = null;
    renderSidebar(); refreshMarkers(); renderChrome();
  });
  document.getElementById('city-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-city]');
    if (!btn) return;
    state.city = btn.dataset.city;
    state.routeId = null; state.selected = null;
    refreshMarkers(); renderSidebar(); renderChrome();
  });
  const citiesToggle = document.getElementById('cities-toggle');
  if (citiesToggle) {
    citiesToggle.addEventListener('click', () => {
      state.citiesExpanded = !state.citiesExpanded;
      renderChrome();
    });
  }

  // 侧栏内容：事件委托
  const body = sbBody();
  // 搜索框：150ms 防抖；中文输入法合成期间不触发（compositionend 兜底）
  (() => {
    const run = () => {
      clearTimeout(window.__sbQTimer__);
      window.__sbQTimer__ = setTimeout(() => {
        const el = body.querySelector('.sb-search');
        if (!el) return;
        state.query = el.value;
        const pos = el.selectionStart;
        renderSidebar();
        const input = body.querySelector('.sb-search');
        if (input) {
          input.focus();
          input.setSelectionRange(pos, pos);
        }
      }, 150);
    };
    body.addEventListener('input', (e) => {
      if (e.target.classList.contains('sb-search')) {
        state.query = e.target.value;
        if (!e.isComposing) run();
      }
    });
    body.addEventListener('compositionend', (e) => {
      if (e.target.classList.contains('sb-search')) {
        state.query = e.target.value;
        run();
      }
    });
  })();

  body.addEventListener('change', (e) => {
    const id = e.target.dataset?.check;
    if (!id) return;
    const o = loadCheckins();
    toggleCheckin(o, id);
    state.checked = new Set(Object.keys(o));
    refreshMarkers(); renderSidebar(); renderChrome();
  });

  body.addEventListener('click', (e) => {
    // 动线播放
    if (e.target.closest('[data-play]')) {
      e.stopPropagation();
      e.preventDefault();
      playRoute();
      return;
    }
    // 标签筛选 chips——须放在 input/button 提前返回之前（chips 是 button）
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) {
      const t = tagBtn.dataset.tag;
      if (state.tagFilter.has(t)) state.tagFilter.delete(t);
      else state.tagFilter.add(t);
      refreshMarkers(); renderSidebar();
      return;
    }
    // 标签展开/收起
    if (e.target.closest('[data-tags-toggle]')) {
      state.tagsExpanded = !state.tagsExpanded;
      refreshMarkers(); renderSidebar();
      return;
    }
    // 排序切换（按距离）——须放在 input/button 提前返回之前
    if (e.target.closest('[data-sort]')) {
      state.sortBy = state.sortBy === 'distance' ? 'default' : 'distance';
      renderSidebar();
      return;
    }
    // 复选框等控件：不触发飞向点位（避免 change 前侧栏重渲染导致打卡丢失）
    if (e.target.closest('input,button,a') && !e.target.closest('.star-btn,.route-back')) return;
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
    // 国家/点位群标题：折叠切换；城市标题：默认折叠，点开后进 opened
    const head = e.target.closest('[data-toggle]');
    if (head) {
      const key = head.dataset.toggle;
      if (key.indexOf('city:') === 0) {
        if (state.opened.has(key)) state.opened.delete(key);
        else state.opened.add(key);
      } else {
        if (state.collapsed.has(key)) state.collapsed.delete(key);
        else state.collapsed.add(key);
      }
      renderSidebar();
      return;
    }
    // 动线卡片 / 返回（先停播放）
    const card = e.target.closest('.route-card[data-route]');
    if (card) {
      stopPlay();
      state.routeId = card.dataset.route;
      state.selected = null;
      refreshMarkers(); renderSidebar();
      return;
    }
    if (e.target.closest('.route-back')) {
      stopPlay();
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

  // 打卡 v2：{ id: { n, last, note } }，兼容旧版 id 数组（modules/checkin.js 内部迁移）
  state.checked = new Set(Object.keys(loadCheckins()));

  let overlays = [];
  [points, routes, meta, overlays] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/routes.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
    fetch('./data/overlays.json').then(r => r.json()),
    fetch('./data/china-boundary.json').then(r => r.json()).then(d => (window.__chinaBoundary__ = d)),
    fetch('./data/ratings.json').then(r => r.json()).catch(() => ({ items: {} })).then(d => (window.__ratings__ = d)),
  ]);
  window.__overlaysData__ = overlays || [];
  pointByName = new Map(points.map(p => [p.name, p]));
  pointById = new Map(points.map(p => [p.id, p]));

  await initMap();
  initPlayer({ map, state, markerById, routePoints, currentRoute, renderSidebar });

  bindEvents();
  refreshMarkers();
  renderSidebar();
  renderChrome();
}

main().catch(err => {
  console.error(err);
  document.getElementById('sb-stats').textContent = '⚠️ 加载失败:' + (err && err.message);
});
registerSW();
renderIcpFooter();
