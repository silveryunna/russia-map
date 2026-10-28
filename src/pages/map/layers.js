// 图层方案：非中国（OSM/Esri）与中国（天地图/高德/腾讯/OSM）双区域自动/手动切换
// - 中国区域判定用国界多边形（china-boundary.json，point-in-polygon），兜底矩形 bbox
// - 高德/腾讯为 GCJ 坐标系：激活时 window.__amapActive__=true，所有点位经 coords.xy() 偏移
// - 视野锚定：GCJ 补偿翻转时平移视野中心，地面原地不动、只换「皮肤」，消除跳变观感
// - 图层选择与区域模式持久化到 localStorage（nm-layer-v1）
// - 天地图走 /tdt/ 反向代理（key 在服务器侧，前端不持 key）
// 附带：🔄 刷新控件（SW 有更新时亮红点）、🏙️ 城市快跳、中国以外区域灰化遮罩
import { xy, wgs2gcj, gcj2wgs } from './coords.js';
import { rebuildOverlays } from './overlays.js';

let ctx = null; // { L, map, toast, refreshMarkers, meta, geoPoints }

const REGION_CONF = [
  { id: 'world', label: '非中国（OSM/Esri）' },
  { id: 'cn', label: '中国（天地图/高德/腾讯/OSM）', bbox: [73.5, 3.8, 135.1, 53.6] },
];

let activeReg = 'world';
let regionMode = 'auto';

// ===== 图层选择持久化（nm-layer-v1） =====
function saveSel() {
  try {
    localStorage.setItem('nm-layer-v1', JSON.stringify({ cn: window.__cnSel__, world: window.__worldSelName__, mode: regionMode }));
  } catch { /* 隐私模式等场景忽略 */ }
}
function loadSel() {
  try { return JSON.parse(localStorage.getItem('nm-layer-v1') || '{}'); } catch { return {}; }
}

// ===== 视野锚定 =====
// GCJ 底图上数字坐标 N 处显示的是 gcj2wgs(N) 的地面。补偿翻转时平移视野中心，
// 让地面原地不动、只换底图「皮肤」，消除切换时整图跳 ~500m 的观感
function anchorView(toGcj) {
  const wasGcj = !!window.__amapActive__;
  window.__amapActive__ = toGcj;
  if (wasGcj === toGcj) return;
  const c = ctx.map.getCenter();
  const [lat, lon] = toGcj ? wgs2gcj(c.lat, c.lng) : gcj2wgs(c.lat, c.lng);
  ctx.map.setView([lat, lon], ctx.map.getZoom(), { animate: false });
}

// 点是否在中国国界内：优先国界多边形（ray casting，GeoJSON 坐标为 [lon,lat]），兜底矩形 bbox
// 解决矩形 bbox 把阿拉木图（76.9E）误判为中国的盲区
function pointInChina(lat, lng) {
  const b = window.__chinaBoundary__;
  if (!b || !b.features || !b.features.length) {
    const bb = (REGION_CONF.find((r) => r.bbox) || {}).bbox;
    return bb ? lng >= bb[0] && lng <= bb[2] && lat >= bb[1] && lat <= bb[3] : false;
  }
  let inside = false;
  for (const f of b.features) {
    const g = f.geometry || {};
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0]; // 简化边界只测外环
      let j = ring.length - 1;
      for (let i = 0; i < ring.length; i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        j = i;
      }
    }
  }
  return inside;
}

// 切换底图/区域时清掉 geosearch 的结果标记（它不过 xy()，残留会落在错误位置）
function clearGeoMarkers() {
  const g = window.__geoControl__;
  if (g && g.markers) g.markers.clearLayers();
}

function cnLayers(reg) {
  const { L } = ctx;
  if (reg === 'amap') {
    return [L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { subdomains: '1234', maxZoom: 19 })];
  }
  if (reg === 'tx') {
    return [L.tileLayer('https://rt{s}.map.gtimg.com/realtimerender?z={z}&x={x}&y={y}&type=vector&style=0', { subdomains: '0123', maxZoom: 18, tms: true })];
  }
  if (reg === 'osm') {
    return [L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', { maxZoom: 19 })];
  }
  return [
    L.tileLayer('/tdt/DataServer?T=vec_w&x={x}&y={y}&l={z}', { subdomains: '0123', maxZoom: 19 }),
    L.tileLayer('/tdt/DataServer?T=cva_w&x={x}&y={y}&l={z}', { subdomains: '0123', maxZoom: 19 }),
  ];
}

function showRegionLoading() {
  let d = window.__regionLoading__;
  if (!d) {
    d = document.createElement('div');
    d.id = 'region-loading';
    d.innerHTML = '<span class="rl-spin"></span>地图切换中…';
    document.body.appendChild(d);
    window.__regionLoading__ = d;
  }
  d.classList.add('show');
  setTimeout(() => d.classList.remove('show'), 3000);
}

function rebuildLayersCtl(reg) {
  const { L, map, refreshMarkers } = ctx;
  if (window.__layersCtl__) {
    map.removeControl(window.__layersCtl__);
    window.__layersCtl__ = null;
  }
  const entries = reg === 'cn'
    ? {
        '天地图': L.layerGroup(cnLayers('tdt')),
        '高德': L.layerGroup(cnLayers('amap')),
        '腾讯': L.layerGroup(cnLayers('tx')),
        'OSM': L.layerGroup(cnLayers('osm')),
      }
    : {
        '当地原文 (OSM)': window.__osmDeLayer__,
        'English（推荐）': window.__esriStreetLayer__,
        '中文概览（仅大区域）': window.__esriTopoLayer__,
      };
  window.__baseEntries__ = entries;
  const selName = reg === 'cn' ? window.__cnSel__ || '高德' : window.__worldSelName__ || '当地原文 (OSM)';
  window.__layersCtl__ = L.control.layers(entries, {}, { position: 'topleft' }).addTo(map);
  // 图层控件挪到左上角最前（在搜索按钮之前）
  const corner = map.getContainer().querySelector('.leaflet-top.leaflet-left');
  if (corner) corner.insertBefore(window.__layersCtl__.getContainer(), corner.firstChild);
  window.__layersCtl__.__reg = reg;
  // 监听底图选择：高德/腾讯需要 GCJ 偏移，切后重建点位与覆盖层
  const cc = window.__layersCtl__.getContainer();
  cc.addEventListener('click', () => {
    setTimeout(() => {
      const inp = cc.querySelector('.leaflet-control-layers-base input:checked');
      if (!inp) return;
      // Leaflet 图层控件的 label 文本带前导空格（<span> 高德</span>），必须 trim——
      // 否则 ' 高德' !== '高德'，GCJ 标志永不置位，手动切换后点位偏 ~500m（历史 bug）
      const nm = ((inp.parentElement.querySelector('span') || {}).textContent || '').trim();
      if (!nm) return;
      const rg = window.__layersCtl__.__reg;
      const cur = rg === 'cn' ? window.__cnSel__ || '高德' : window.__worldSelName__ || '当地原文 (OSM)';
      if (nm === cur) return;
      showRegionLoading();
      anchorView(rg === 'cn' && (nm === '高德' || nm === '腾讯'));
      if (rg === 'cn') {
        window.__cnSel__ = nm;
      } else {
        window.__worldSelName__ = nm;
        window.__worldBase__ = window.__baseEntries__[nm];
      }
      saveSel();
      clearGeoMarkers();
      refreshMarkers();
      rebuildOverlays(ctx.L, ctx.map);
      renderMask();
    }, 60);
  });
  const selLayer = entries[selName];
  if (selLayer) {
    selLayer.addTo(map);
    if (reg === 'world') window.__worldBase__ = selLayer;
  }
}

function setRegion(reg) {
  if (reg === activeReg) return;
  showRegionLoading();
  const olds = window.__baseEntries__ ? Object.values(window.__baseEntries__) : [];
  olds.forEach((ly) => {
    if (ly instanceof ctx.L.LayerGroup) ly.eachLayer((x) => ctx.map.removeLayer(x));
    else ctx.map.removeLayer(ly);
  });
  activeReg = reg;
  // 保留用户上次的图层选择（不再重置为默认），GCJ 标志以实际选中的底图为准
  const sel = reg === 'cn' ? window.__cnSel__ || '高德' : window.__worldSelName__ || '当地原文 (OSM)';
  const gcj = reg === 'cn' && (sel === '高德' || sel === '腾讯');
  anchorView(gcj);
  rebuildLayersCtl(reg);
  clearGeoMarkers();
  ctx.refreshMarkers();
  rebuildOverlays(ctx.L, ctx.map);
  renderMask();
  saveSel();
  ctx.toast(reg === 'world'
    ? '已切换到非中国图层'
    : `已切换到中国图层（${sel}${gcj ? '，点位已按 GCJ-02 补偿' : ''}）`);
}

function autoRegion() {
  if (regionMode !== 'auto') return;
  const c = ctx.map.getCenter();
  // GCJ 底图激活时视野数字在 GCJ 空间，先换回 WGS 再判定，避免国界附近误判
  const [lat, lng] = window.__amapActive__ ? gcj2wgs(c.lat, c.lng) : [c.lat, c.lng];
  setRegion(pointInChina(lat, lng) ? 'cn' : 'world');
}

// 中国以外区域灰化遮罩（world 模式灰化中国，cn 模式灰化中国以外）
function renderMask() {
  const { L, map } = ctx;
  if (window.__maskLayer__) {
    map.removeLayer(window.__maskLayer__);
    window.__maskLayer__ = null;
  }
  if (!window.__chinaBoundary__) return;
  const isCn = activeReg === 'cn';
  const world = [[[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]]];
  const rings = [];
  for (const f of window.__chinaBoundary__.features || []) {
    if (f.geometry.type === 'Polygon') f.geometry.coordinates.forEach((r) => rings.push(r));
    else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach((p) => p.forEach((r) => rings.push(r)));
  }
  let coords = isCn ? [world[0], ...rings] : rings;
  coords = coords.map((ring) =>
    ring.map((pt) => {
      const [lat, lon] = xy(pt[1], pt[0]);
      return [lon, lat];
    }));
  window.__maskLayer__ = L.geoJSON(
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords }, properties: {} },
    {
      pane: 'region-mask-pane',
      style: { color: 'transparent', weight: 0, opacity: 0, fillColor: '#efeeea', fillOpacity: 0.9, fillRule: 'nonzero' },
      interactive: false,
    },
  ).addTo(map);
}

// 🔄 刷新控件：SW 检测到新版本时亮红点，点击重载
function addRefreshControl() {
  const { L, map } = ctx;
  const ctl = L.control({ position: 'topleft' });
  ctl.onAdd = () => {
    const box = L.DomUtil.create('div', 'refresh-ctl');
    const btn = document.createElement('button');
    btn.textContent = '🔄';
    btn.className = 'region-ico';
    btn.title = '刷新页面（有更新时图标带红点，点击载入新版）';
    btn.onclick = () => location.reload();
    const badge = document.createElement('span');
    badge.className = 'refresh-badge';
    box.appendChild(btn);
    box.appendChild(badge);
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  ctl.addTo(map);
  window.__showRefreshBadge__ = () => {
    const e = document.querySelector('.refresh-badge');
    if (e) e.classList.add('show');
  };
  window.addEventListener('sw-update', window.__showRefreshBadge__);
  try {
    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener('updatefound', () => {
        const t = reg.installing;
        if (t) {
          t.addEventListener('statechange', () => {
            if (t.state === 'installed' && navigator.serviceWorker.controller) window.__showRefreshBadge__();
          });
        }
      });
      if (reg.waiting && navigator.serviceWorker.controller) window.__showRefreshBadge__();
    });
  } catch (e) { /* 无 SW 环境（如 dev）忽略 */ }
}

// 🏙️ 城市快跳：列出有点位的城市，点击 flyToBounds；展开时隐藏搜索控件
function addCityJumpControl() {
  const { L, map, meta, geoPoints } = ctx;
  const ctl = L.control({ position: 'topleft' });
  ctl.onAdd = () => {
    const box = L.DomUtil.create('div', 'cityjump-ctl');
    const btn = document.createElement('button');
    btn.textContent = '🏙️';
    btn.className = 'region-ico';
    btn.title = '快速跳转城市';
    const panel = document.createElement('div');
    panel.className = 'cityjump-panel';
    const up = document.createElement('button');
    up.className = 'cj-arrow';
    up.textContent = '▲';
    const list = document.createElement('div');
    list.className = 'cj-list';
    const dn = document.createElement('button');
    dn.className = 'cj-arrow';
    dn.textContent = '▼';
    up.onclick = () => list.scrollBy({ top: -90, behavior: 'smooth' });
    dn.onclick = () => list.scrollBy({ top: 90, behavior: 'smooth' });
    const gc = () => (window.__geoControl__ ? window.__geoControl__.getContainer() : null);
    sortCities(meta.cities).forEach((city) => {
      const pts = geoPoints().filter((p) => p.city === city);
      if (!pts.length) return;
      const item = document.createElement('button');
      item.className = 'cj-item';
      item.innerHTML = `<span class="cj-dot" style="background:${meta.cityColors[city] || '#546E7A'}"></span>${city}<span class="cj-count">${pts.length}</span>`;
      item.onclick = () => {
        const ll = pts.map((p) => xy(p.lat, p.lon));
        map.flyToBounds(L.latLngBounds(ll).pad(0.15));
        panel.classList.remove('open');
        const el = gc();
        if (el) el.style.display = '';
      };
      list.appendChild(item);
    });
    btn.onclick = () => {
      const open = panel.classList.toggle('open');
      const t = gc();
      if (t) t.style.display = open ? 'none' : '';
    };
    panel.appendChild(up);
    panel.appendChild(list);
    panel.appendChild(dn);
    box.appendChild(btn);
    box.appendChild(panel);
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  ctl.addTo(map);
}

// 城市 → 国家分组与排序（中国 → 俄罗斯 → 哈萨克斯坦 → 其他）
export function countryOf(c) {
  return {
    '莫斯科': '俄罗斯',
    '莫斯科州/近郊': '俄罗斯',
    '圣彼得堡': '俄罗斯',
    '叶卡捷琳堡': '俄罗斯',
    '阿拉木图': '哈萨克斯坦',
    '哈尔滨': '中国',
    '伊宁': '中国',
    '三亚': '中国',
  }[c] || '其他';
}

export function sortCities(cities) {
  const rk = { 中国: 0, 俄罗斯: 1, 哈萨克斯坦: 2, 其他: 3 };
  const order = ctx ? ctx.meta.cities : [];
  return [...cities].sort((a, b) => rk[countryOf(a)] - rk[countryOf(b)] || order.indexOf(a) - order.indexOf(b));
}

export const COUNTRY_STYLE = {
  俄罗斯: { color: '#B71C1C', flag: '🇷🇺' },
  哈萨克斯坦: { color: '#00796B', flag: '🇰🇿' },
  中国: { color: '#E65100', flag: '🇨🇳' },
  其他: { color: '#546E7A', flag: '🌍' },
};

export function initLayers(deps) {
  ctx = deps;
  const saved = loadSel();
  window.__regionConf__ = REGION_CONF;
  window.__amapActive__ = false;
  window.__cnSel__ = (saved.cn || '').trim() || '高德';
  window.__worldSelName__ = (saved.world || '').trim() || '当地原文 (OSM)';
  regionMode = saved.mode === 'world' || saved.mode === 'cn' ? saved.mode : 'auto';

  const { L, map } = ctx;
  map.on('moveend', autoRegion);

  // 区域方案控件（🌐 自动/非中国/中国）
  const regCtl = L.control({ position: 'topleft' });
  regCtl.onAdd = () => {
    const d = L.DomUtil.create('div', 'region-ctl');
    const mk = (id, label) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = `region-btn${id === regionMode ? ' active' : ''}`;
      b.dataset.reg = id;
      b.onclick = () => {
        regionMode = id;
        [...d.querySelectorAll('.region-btn[data-reg]')].forEach((x) => x.classList.toggle('active', x.dataset.reg === id));
        if (id === 'auto') autoRegion();
        else setRegion(id);
        saveSel();
      };
      d.appendChild(b);
    };
    const ic = document.createElement('button');
    ic.textContent = '🌐';
    ic.className = 'region-ico';
    ic.title = '图层方案（中国/非中国）';
    ic.onclick = () => d.classList.toggle('open');
    d.appendChild(ic);
    mk('auto', '自动');
    REGION_CONF.forEach((rc) => mk(rc.id, rc.label.replace(/（.*/, '')));
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  regCtl.addTo(map);
  rebuildLayersCtl('world');
  if (regionMode === 'cn') setRegion('cn'); // 持久化恢复了手动锁定「中国」

  addRefreshControl();
  addCityJumpControl();

  map.createPane('region-mask-pane');
  map.getPane('region-mask-pane').style.zIndex = 350;
  renderMask();
}
