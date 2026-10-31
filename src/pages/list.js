import '../shared/base.css';
import './list.css';
import { renderIcpFooter } from '../shared/icp-footer.js';
import { openVisitRepository } from './visits/repository.js';

// ===== 打卡清单页：与地图/笔记共享同一个 Visit repository =====

const app = document.getElementById('list-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let points = [], meta = { cityColors: {}, cities: [] };
let visitRepo = null;
const state = {
  query: '',
  collapsed: new Set(),
  tagFilter: new Set(),   // 标签筛选（多选 = 并集）
  checked: new Set(),
};

const geoPoints = () => points.filter(p => !p.pending);
const pendingPoints = () => points.filter(p => p.pending);

// 标签筛选：未选时全部通过；多选 = 并集（命中任一即通过）
function matchTags(p) {
  return !state.tagFilter.size || (p.tags && p.tags.some(t => state.tagFilter.has(t)));
}

function groupedByCity() {
  const q = state.query.trim().toLowerCase();
  let list = geoPoints().filter(matchTags);
  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) || p.cluster.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q) || (p.highlight || '').toLowerCase().includes(q) ||
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

function filteredPending() {
  const q = state.query.trim().toLowerCase();
  let list = pendingPoints().filter(matchTags);
  if (!q) return list;
  return list.filter(p =>
    p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) ||
    (p.highlight || '').toLowerCase().includes(q) || p.city.toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.toLowerCase().includes(q)));
}

function render() {
  const done = geoPoints().filter(p => state.checked.has(p.id)).length;
  const pct = geoPoints().length ? Math.round(done / geoPoints().length * 100) : 0;
  let html = `
    <div class="list-summary">
      共 ${geoPoints().length} 个点位 · 已打卡 <b>${done}</b> 个 · 完成度 ${pct}%
      <span class="ls-bar"><span class="ls-fill" style="width:${pct}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${esc(state.query)}">`;

  // 标签筛选 chips：全量点位按频次取前 12，多选 = 并集
  const freq = new Map();
  for (const p of geoPoints()) for (const t of p.tags || []) freq.set(t, (freq.get(t) || 0) + 1);
  if (freq.size) {
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    html += `<div class="l-tags">${top.map(([t, n]) =>
      `<button class="tag-chip${state.tagFilter.has(t) ? ' active' : ''}" data-tag="${esc(t)}" title="筛选标签（可叠加）">#${esc(t)} ${n}</button>`).join('')}</div>`;
  }

  for (const { city, clusters } of groupedByCity()) {
    const color = meta.cityColors[city] || '#546E7A';
    const key = 'city:' + city;
    const isCollapsed = state.collapsed.has(key);
    const count = clusters.reduce((n, c) => n + c.points.length, 0);
    const cityDone = clusters.reduce((n, c) => n + c.points.filter(p => state.checked.has(p.id)).length, 0);
    html += `
      <div class="l-city" data-toggle="${esc(key)}">
        <span class="head-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <span class="head-dot" style="background:${color}"></span>${esc(city)}
        <span class="head-count">（${cityDone}/${count}）</span>
      </div>`;
    if (isCollapsed) continue;
    for (const { cluster, points: pts } of clusters) {
      const ckey = city + '||' + cluster;
      const cCollapsed = state.collapsed.has(ckey);
      const cDone = pts.filter(p => state.checked.has(p.id)).length;
      html += `
        <div class="l-cluster" data-toggle="${esc(ckey)}">
          <span class="head-arrow">${cCollapsed ? '▶' : '▼'}</span>${esc(cluster)}
          <span class="head-count">（${cDone}/${pts.length}）</span>
        </div>`;
      if (cCollapsed) continue;
      html += pts.map(p => {
        const doneP = state.checked.has(p.id);
        return `
        <label class="l-point${doneP ? ' done' : ''}">
          <input type="checkbox" data-check="${esc(p.id)}" ${doneP ? 'checked' : ''}>
          <span class="lp-main">
            <span class="lp-name">${esc(p.name)}</span>
            <span class="lp-sub">${p.confidence != null && p.confidence < 100 ? '⚠ ' : ''}${esc(p.type)} · ${esc(p.highlight || '')}${(p.tags && p.tags.length) ? ' · ' + p.tags.map(t => '#' + esc(t)).join(' ') : ''}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`;
      }).join('');
    }
  }

  const pend = filteredPending();
  if (pend.length) {
    const isCollapsed = state.collapsed.has('__pending');
    html += `
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${isCollapsed ? '▶' : '▼'}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${pend.length}）</span>
      </div>`;
    if (!isCollapsed) {
      html += pend.map(p => `
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${esc(p.name)}</span>
            <span class="lp-sub">${esc(p.city)} · ${esc(p.type)}${p.highlight ? ' · ' + esc(p.highlight) : ''}</span>
          </span>
        </div>`).join('');
    }
  }

  app.innerHTML = html;
}

app.addEventListener('input', (e) => {
  if (!e.target.classList.contains('list-search')) return;
  state.query = e.target.value;
  const pos = e.target.selectionStart;
  render();
  const input = app.querySelector('.list-search');
  input.focus();
  input.setSelectionRange(pos, pos);
});

app.addEventListener('change', async (e) => {
  const id = e.target.dataset?.check;
  if (!id || !visitRepo) return;
  await visitRepo.toggle(id);
  state.checked = new Set(Object.keys(visitRepo.getCheckins()));
  render();
});

app.addEventListener('click', (e) => {
  // 标签筛选 chips——须放在 input 提前返回之前（chips 是 button）
  const tagBtn = e.target.closest('[data-tag]');
  if (tagBtn) {
    const t = tagBtn.dataset.tag;
    if (state.tagFilter.has(t)) state.tagFilter.delete(t);
    else state.tagFilter.add(t);
    render();
    return;
  }
  if (e.target.closest('input,a')) return;
  const head = e.target.closest('[data-toggle]');
  if (!head) return;
  const key = head.dataset.toggle;
  if (state.collapsed.has(key)) state.collapsed.delete(key);
  else state.collapsed.add(key);
  render();
});

async function main() {
  [visitRepo, points, meta] = await Promise.all([
    openVisitRepository({
      onChange: (checkins) => {
        state.checked = new Set(Object.keys(checkins));
        if (points.length) render();
      },
    }),
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
  ]);
  state.checked = new Set(Object.keys(visitRepo.getCheckins()));
  render();
}

main().catch(err => {
  console.error(err);
  app.textContent = '⚠️ 加载失败，请刷新重试';
});
import { registerSW } from '../shared/sw-register.js';
registerSW();
renderIcpFooter();
