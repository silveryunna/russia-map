import '../shared/base.css';
import './admin.css';
import '../shared/leaflet-default-icon.js';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

// ===== 管理后台（仅站长使用，不公开链接）=====
// 编辑内容 → 标记变更 → 底部导出变更文件 → 发给 Kimi 完成发布
// 内容文件与线上一一对应：data/points.json、data/site.json、
// content/notes/*.md + index.json、photos/index.json

const app = document.getElementById('admin-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===== 状态 =====
const S = {
  tab: 'points',
  points: [],                       // 工作副本
  pointsDirty: false,
  ptQuery: '',
  editIdx: -1,                      // 当前编辑的点位下标
  site: null,
  siteDirty: false,
  notesIndex: [],
  notesDirty: false,
  noteFile: null,                   // 当前编辑的笔记 file
  noteDraft: null,                  // { meta:{}, body }
  photos: [],
  photosDirty: false,
  photoIdx: -1,
  loaded: false,
};

// ===== 数据加载 =====
async function loadAll() {
  const [points, site, notesIndex, photos] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/site.json').then(r => r.json()),
    fetch('./content/notes/index.json').then(r => r.json()),
    fetch('./photos/index.json').then(r => r.json()),
  ]);
  S.points = points;
  S.site = site;
  S.notesIndex = notesIndex;
  S.photos = photos;
  S.loaded = true;
}

// ===== 变更追踪与导出 =====
function dirtyFiles() {
  const files = [];
  if (S.pointsDirty) files.push({ path: 'data/points.json', gen: genPointsJson });
  if (S.siteDirty) files.push({ path: 'data/site.json', gen: genSiteJson });
  if (S.notesDirty || noteDraftsDirty()) {
    for (const f of S.notesIndex) {
      const d = noteDrafts.get(f.file);
      if (d?.dirty) files.push({ path: `content/notes/${f.file}`, gen: () => genNoteMd(f.file) });
    }
    if (S.notesDirty) files.push({ path: 'content/notes/index.json', gen: genNotesIndexJson });
  }
  if (S.photosDirty) files.push({ path: 'photos/index.json', gen: genPhotosJson });
  return files;
}

function download(path, content) {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = path.replace(/\//g, '__');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const genPointsJson = () => JSON.stringify(S.points, null, 2) + '\n';
const genSiteJson = () => JSON.stringify(S.site, null, 2) + '\n';
const genNotesIndexJson = () => JSON.stringify(S.notesIndex, null, 2) + '\n';
const genPhotosJson = () => JSON.stringify(S.photos, null, 2) + '\n';
function genNoteMd(file) {
  const d = noteDrafts.get(file);
  const fm = ['---'];
  if (d.meta.title) fm.push(`title: ${d.meta.title}`);
  if (d.meta.date) fm.push(`date: ${d.meta.date}`);
  if (d.meta.summary) fm.push(`summary: ${d.meta.summary}`);
  fm.push('---');
  return fm.join('\n') + '\n\n' + d.body.trim() + '\n';
}

// ===== 点位编辑器 =====
function pointsTabHtml() {
  const q = S.ptQuery.trim().toLowerCase();
  const list = S.points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !q || p.name.toLowerCase().includes(q) || (p.city || '').toLowerCase().includes(q) || (p.cluster || '').toLowerCase().includes(q));
  const cities = [...new Set(S.points.map(p => p.city))];
  const clusters = [...new Set(S.points.map(p => p.cluster))];

  let form = '<div class="ae-hint">从左侧选择一个点位，或点「新增点位」</div>';
  if (S.editIdx >= 0) {
    const p = S.points[S.editIdx];
    form = `
      <div class="ae-form">
        <label>名称 *<input id="pt-name" value="${esc(p.name)}"></label>
        <label>城市 *<input id="pt-city" list="dl-cities" value="${esc(p.city)}">
          <datalist id="dl-cities">${cities.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>点位群 *<input id="pt-cluster" list="dl-clusters" value="${esc(p.cluster)}">
          <datalist id="dl-clusters">${clusters.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>类别<input id="pt-type" value="${esc(p.type || '')}"></label>
        <label>亮点/简介<input id="pt-highlight" value="${esc(p.highlight || '')}"></label>
        <label>备注<input id="pt-note" value="${esc(p.note || '')}"></label>
        <div class="ae-row">
          <label>置信度
            <select id="pt-conf">
              <option value="100" ${(p.confidence ?? 100) === 100 ? 'selected' : ''}>✓ 已核实（100）</option>
              <option value="75" ${p.confidence === 75 ? 'selected' : ''}>⚠ 中置信（75）</option>
              <option value="0" ${p.confidence === 0 ? 'selected' : ''}>✗ 未通过（0）</option>
            </select></label>
          <label>标签<input id="pt-tags" value="${esc((p.tags || []).join(', '))}" placeholder="逗号分隔，如 免费, 周一闭馆">
            <span class="ae-tip">用于筛选 chips，逗号分隔多个</span></label>
        </div>
        <div class="ae-row">
          <label>纬度 lat<input id="pt-lat" type="number" step="any" value="${p.lat ?? ''}" placeholder="留空 = 待核"></label>
          <label>经度 lon<input id="pt-lon" type="number" step="any" value="${p.lon ?? ''}" placeholder="留空 = 待核"></label>
        </div>
        <label>地图取坐标
          <div id="pt-map"></div>
          <span class="ae-tip">点击地图设置坐标（可先拖动/缩放找到位置）</span></label>
        <label class="ae-check"><input id="pt-pending" type="checkbox" ${p.pending ? 'checked' : ''}> 待核实坐标（不上地图）</label>
        <div class="ae-btns">
          <button class="btn primary" data-act="pt-save">保存此点位</button>
          <button class="btn danger" data-act="pt-del">删除</button>
          <span class="ae-tip">坐标留空会自动记为待核</span>
        </div>
      </div>`;
  }

  return `
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <input class="ae-search" placeholder="搜索名称/城市/点位群…" value="${esc(S.ptQuery)}">
          <button class="btn" data-act="pt-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${list.map(({ p, i }) => `
            <div class="ae-item${i === S.editIdx ? ' active' : ''}" data-pt="${i}">
              <span class="ae-item-name">${esc(p.name)}</span>
              <span class="ae-item-sub">${esc(p.city)} · ${p.pending ? '⏳待核' : '📍' + p.lat?.toFixed(3)}${p.confidence === 75 ? ' · ⚠中置信' : p.confidence === 0 ? ' · ✗未通过' : ''}</span>
            </div>`).join('') || '<div class="ae-hint">无匹配点位</div>'}
        </div>
        <div class="ae-count">共 ${S.points.length} 个点位</div>
      </div>
      <div class="ae-right">${form}</div>
    </div>`;
}

function savePoint() {
  if (S.editIdx < 0) return;
  const val = id => document.getElementById(id)?.value.trim();
  const name = val('pt-name');
  if (!name) return alert('名称不能为空');
  const lat = parseFloat(val('pt-lat'));
  const lon = parseFloat(val('pt-lon'));
  const hasCoord = !isNaN(lat) && !isNaN(lon);
  const dup = S.points.findIndex((p, i) => p.name === name && i !== S.editIdx);
  if (dup >= 0 && !confirm(`已存在同名点位「${name}」（${S.points[dup].city}），确定保留重复？`)) return;
  S.points[S.editIdx] = {
    id: S.points[S.editIdx].id || nextPointId(),
    name,
    city: val('pt-city') || '其他城市',
    cluster: val('pt-cluster') || '未分组',
    type: val('pt-type'),
    highlight: val('pt-highlight'),
    note: val('pt-note'),
    confidence: Number(document.getElementById('pt-conf')?.value ?? 100),
    tags: (val('pt-tags') || '').split(/[,，]/).map(s => s.trim()).filter(Boolean),
    ...(hasCoord ? { lat, lon } : { lat: null, lon: null }),
    pending: !hasCoord || document.getElementById('pt-pending').checked,
  };
  S.pointsDirty = true;
  render();
}

// 生成下一个点位 id（p001 递增，跳过空缺）
function nextPointId() {
  const max = S.points.reduce((m, p) => {
    const n = parseInt(String(p.id || '').replace(/^p/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return 'p' + String(max + 1).padStart(3, '0');
}

// ===== 点位编辑小地图（点击取坐标）=====
let pickMap = null;
let pickMarker = null;
function ensurePickMap() {
  const el = document.getElementById('pt-map');
  if (!el) { pickMap?.remove(); pickMap = null; pickMarker = null; return; }
  const p = S.points[S.editIdx];
  if (pickMap) { pickMap.remove(); pickMap = null; }
  const hasCoord = p && p.lat != null && p.lon != null;
  pickMap = L.map(el, { scrollWheelZoom: false }).setView(
    hasCoord ? [p.lat, p.lon] : [55.75, 37.62], hasCoord ? 13 : 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(pickMap);
  if (hasCoord) pickMarker = L.marker([p.lat, p.lon]).addTo(pickMap);
  pickMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (pickMarker) pickMarker.setLatLng(e.latlng);
    else pickMarker = L.marker(e.latlng).addTo(pickMap);
    const latEl = document.getElementById('pt-lat');
    const lonEl = document.getElementById('pt-lon');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lonEl) lonEl.value = lng.toFixed(6);
  });
}

// ===== 笔记编辑器 =====
const noteDrafts = new Map(); // file -> { meta, body, dirty }
function noteDraftsDirty() { return [...noteDrafts.values()].some(d => d.dirty); }

function notesTabHtml() {
  let form = '<div class="ae-hint">从左侧选择笔记，或点「新建笔记」</div>';
  if (S.noteFile && S.noteDraft) {
    const d = S.noteDraft;
    form = `
      <div class="ae-form">
        <label>文件名<input id="nt-file" value="${esc(S.noteFile)}" ${S.noteFile === '__new__' ? '' : 'disabled'} placeholder="如 my-first-note.md"></label>
        <label>标题 *<input id="nt-title" value="${esc(d.meta.title || '')}"></label>
        <div class="ae-row">
          <label>日期<input id="nt-date" type="date" value="${esc(d.meta.date || '')}"></label>
        </div>
        <label>摘要<input id="nt-summary" value="${esc(d.meta.summary || '')}" placeholder="列表页显示的一句话"></label>
        <label>正文（Markdown）<textarea id="nt-body" rows="14">${esc(d.body)}</textarea></label>
        <label>预览<div id="nt-preview" class="nt-preview"></div></label>
        <div class="ae-btns">
          <button class="btn primary" data-act="nt-save">保存笔记</button>
          <button class="btn danger" data-act="nt-del">删除</button>
        </div>
      </div>`;
  }
  return `
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${S.notesIndex.length} 篇笔记</span>
          <button class="btn" data-act="nt-new">＋新建</button>
        </div>
        <div class="ae-list">
          ${S.notesIndex.map(n => `
            <div class="ae-item${n.file === S.noteFile ? ' active' : ''}" data-nt="${esc(n.file)}">
              <span class="ae-item-name">${esc(n.title || n.file)}</span>
              <span class="ae-item-sub">${esc(n.date || '')}${noteDrafts.get(n.file)?.dirty ? ' · ✏️未导出' : ''}</span>
            </div>`).join('') || '<div class="ae-hint">还没有笔记</div>'}
        </div>
      </div>
      <div class="ae-right">${form}</div>
    </div>`;
}

async function openNote(file) {
  if (file === '__new__') {
    S.noteFile = '__new__';
    S.noteDraft = { meta: { title: '', date: new Date().toISOString().slice(0, 10), summary: '' }, body: '', dirty: false };
    render();
    return;
  }
  const item = S.notesIndex.find(n => n.file === file);
  if (!item) return;
  if (!noteDrafts.has(file)) {
    const raw = await fetch(`./content/notes/${encodeURIComponent(file)}`).then(r => r.text());
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const meta = { title: item.title, date: item.date, summary: item.summary };
    noteDrafts.set(file, { meta, body: m ? raw.slice(m[0].length) : raw, dirty: false });
  }
  S.noteFile = file;
  S.noteDraft = noteDrafts.get(file);
  render();
}

function saveNote() {
  const val = id => document.getElementById(id)?.value.trim();
  const title = val('nt-title');
  const body = document.getElementById('nt-body')?.value ?? '';
  if (!title) return alert('标题不能为空');
  if (!body.trim()) return alert('正文不能为空');

  if (S.noteFile === '__new__') {
    let file = val('nt-file');
    if (!file) file = `${Date.now()}.md`;
    if (!file.endsWith('.md')) file += '.md';
    if (S.notesIndex.some(n => n.file === file)) return alert('文件名已存在');
    noteDrafts.set(file, { meta: { title, date: val('nt-date'), summary: val('nt-summary') }, body, dirty: true });
    S.notesIndex.unshift({ file, title, date: val('nt-date'), summary: val('nt-summary') });
    S.notesDirty = true;
    S.noteFile = file;
    S.noteDraft = noteDrafts.get(file);
  } else {
    const d = noteDrafts.get(S.noteFile);
    d.meta = { title, date: val('nt-date'), summary: val('nt-summary') };
    d.body = body;
    d.dirty = true;
    const item = S.notesIndex.find(n => n.file === S.noteFile);
    if (item) { item.title = title; item.date = val('nt-date'); item.summary = val('nt-summary'); }
    S.notesDirty = true;
  }
  render();
}

// ===== 相册编辑器 =====
function albumTabHtml() {
  let form = '<div class="ae-hint">从左侧选择条目，或点「新增条目」</div>';
  if (S.photoIdx >= 0) {
    const p = S.photos[S.photoIdx];
    form = `
      <div class="ae-form">
        <label>照片文件名 *<input id="ph-src" value="${esc(p.src)}" placeholder="如 2026-09-01-red-square.jpg">
          <span class="ae-tip">照片文件本体通过微信发给 Kimi，随推送一起上传</span></label>
        <label>标题<input id="ph-title" value="${esc(p.title || '')}"></label>
        <div class="ae-row">
          <label>日期<input id="ph-date" type="date" value="${esc(p.date || '')}"></label>
          <label>地点<input id="ph-place" value="${esc(p.place || '')}"></label>
        </div>
        <div class="ae-btns">
          <button class="btn primary" data-act="ph-save">保存条目</button>
          <button class="btn danger" data-act="ph-del">删除</button>
        </div>
      </div>`;
  }
  return `
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${S.photos.length} 张照片</span>
          <button class="btn" data-act="ph-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${S.photos.map((p, i) => `
            <div class="ae-item${i === S.photoIdx ? ' active' : ''}" data-ph="${i}">
              <span class="ae-item-name">${esc(p.title || p.src)}</span>
              <span class="ae-item-sub">${esc(p.src)}${p.date ? ' · ' + esc(p.date) : ''}</span>
            </div>`).join('') || '<div class="ae-hint">还没有照片</div>'}
        </div>
      </div>
      <div class="ae-right">${form}</div>
    </div>`;
}

function savePhoto() {
  if (S.photoIdx < 0) return;
  const val = id => document.getElementById(id)?.value.trim();
  const src = val('ph-src');
  if (!src) return alert('文件名不能为空');
  S.photos[S.photoIdx] = { src, title: val('ph-title'), date: val('ph-date'), place: val('ph-place') };
  S.photosDirty = true;
  render();
}

// ===== 网站信息编辑器 =====
function siteTabHtml() {
  return `
    <div class="ae-form" style="max-width:520px">
      <label>网站标题<input id="st-title" value="${esc(S.site.title || '')}"></label>
      <label>副标题<input id="st-sub" value="${esc(S.site.subtitle || '')}"></label>
      <label>图标 Emoji<input id="st-emoji" value="${esc(S.site.emoji || '')}" maxlength="4"></label>
      <label>备案号（ICP）<input id="st-icp" value="${esc(S.site.icp || '')}" placeholder="如 沪ICP备XXXXXXXX号，留空则不显示">
        <span class="ae-tip">显示在所有公开页面底部，自动链接到 beian.miit.gov.cn</span></label>
      <div class="ae-btns">
        <button class="btn primary" data-act="st-save">保存</button>
        <span class="ae-tip">保存后记得在底部导出 data/site.json</span>
      </div>
      <div class="ae-hint" style="margin-top:12px">注意：浏览器标签页标题、PWA 应用名等写死在页面里，改动后需要 Kimi 重新构建发布才生效。</div>
    </div>`;
}

// ===== 导出栏 =====
function exportBarHtml() {
  const files = dirtyFiles();
  if (!files.length) return '';
  return `
    <div class="export-bar">
      <div class="eb-title">📦 本次变更（${files.length} 个文件）— 下载后发给 Kimi 即完成发布：</div>
      <div class="eb-files">
        ${files.map((f, i) => `<button class="btn small" data-dl="${i}">⬇ ${esc(f.path)}</button>`).join('')}
        <button class="btn small primary" data-dl-all>⬇ 全部下载</button>
      </div>
    </div>`;
}

// ===== 渲染 =====
function render() {
  const tabs = [
    ['points', `📍 点位（${S.points.length}）`],
    ['notes', `📝 笔记（${S.notesIndex.length}）`],
    ['album', `📷 相册（${S.photos.length}）`],
    ['site', '⚙️ 网站信息'],
  ];
  app.innerHTML = `
    <div class="admin-tabs">
      ${tabs.map(([k, label]) => `<button class="at-tab${S.tab === k ? ' active' : ''}" data-tab="${k}">${label}</button>`).join('')}
    </div>
    ${S.tab === 'points' ? pointsTabHtml() : ''}
    ${S.tab === 'notes' ? notesTabHtml() : ''}
    ${S.tab === 'album' ? albumTabHtml() : ''}
    ${S.tab === 'site' ? siteTabHtml() : ''}
    ${exportBarHtml()}`;
  if (S.tab === 'points') ensurePickMap();
  if (S.tab === 'notes') updatePreview();
}

// 笔记 Markdown 实时预览
function updatePreview() {
  const ta = document.getElementById('nt-body');
  const pv = document.getElementById('nt-preview');
  if (ta && pv) pv.innerHTML = marked.parse(ta.value);
}

// ===== 事件 =====
app.addEventListener('input', (e) => {
  if (e.target.id === 'nt-body') { updatePreview(); return; }
  if (e.target.classList.contains('ae-search')) {
    S.ptQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = app.querySelector('.ae-search');
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});

app.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; render(); return; }

  const dl = e.target.closest('[data-dl]');
  if (dl) { const f = dirtyFiles()[Number(dl.dataset.dl)]; download(f.path, f.gen()); return; }
  if (e.target.closest('[data-dl-all]')) {
    for (const f of dirtyFiles()) download(f.path, f.gen());
    return;
  }

  // 点位
  const pt = e.target.closest('[data-pt]');
  if (pt) { S.editIdx = Number(pt.dataset.pt); render(); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'pt-new') { S.points.unshift({ name: '', city: '', cluster: '', type: '', highlight: '', note: '', lat: null, lon: null, pending: true }); S.editIdx = 0; render(); return; }
  if (act === 'pt-save') return savePoint();
  if (act === 'pt-del') {
    if (confirm(`确定删除「${S.points[S.editIdx].name}」？`)) { S.points.splice(S.editIdx, 1); S.pointsDirty = true; S.editIdx = -1; render(); }
    return;
  }

  // 笔记
  const nt = e.target.closest('[data-nt]');
  if (nt) return openNote(nt.dataset.nt);
  if (act === 'nt-new') return openNote('__new__');
  if (act === 'nt-save') return saveNote();
  if (act === 'nt-del') {
    if (confirm(`确定删除笔记「${S.noteFile}」？`)) {
      noteDrafts.delete(S.noteFile);
      S.notesIndex = S.notesIndex.filter(n => n.file !== S.noteFile);
      S.notesDirty = true; S.noteFile = null; S.noteDraft = null;
      render();
    }
    return;
  }

  // 相册
  const ph = e.target.closest('[data-ph]');
  if (ph) { S.photoIdx = Number(ph.dataset.ph); render(); return; }
  if (act === 'ph-new') { S.photos.unshift({ src: '', title: '', date: '', place: '' }); S.photoIdx = 0; render(); return; }
  if (act === 'ph-save') return savePhoto();
  if (act === 'ph-del') {
    if (confirm(`确定删除「${S.photos[S.photoIdx].src}」？`)) { S.photos.splice(S.photoIdx, 1); S.photosDirty = true; S.photoIdx = -1; render(); }
    return;
  }

  // 网站信息
  if (act === 'st-save') {
    const val = id => document.getElementById(id)?.value.trim();
    S.site = { emoji: val('st-emoji'), title: val('st-title'), subtitle: val('st-sub'), icp: val('st-icp') };
    S.siteDirty = true;
    render();
    return;
  }
});

// ===== 启动 =====
loadAll().then(render).catch(err => {
  console.error(err);
  app.textContent = '⚠️ 加载失败，请刷新重试';
});
