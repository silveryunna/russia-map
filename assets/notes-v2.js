// 旅行笔记 v2：足迹仪表盘 + 打卡清单 + 笔记（共享 travel-checkin-v1 打卡状态）
import './base-BJw1lW7I.js';
import { t as marked } from './marked.esm-HaWzKJJ6.js';

marked.setOptions({ gfm: true, breaks: true });

const $app = document.getElementById('notes-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CHECKIN_KEY = 'travel-checkin-v1';
const COUNTRY = c => ({ '莫斯科': '俄罗斯', '莫斯科州/近郊': '俄罗斯', '圣彼得堡': '俄罗斯', '叶卡捷琳堡': '俄罗斯', '阿拉木图': '哈萨克斯坦', '哈尔滨': '中国', '伊宁': '中国', '三亚': '中国' }[c] || '其他');
const COUNTRY_ORDER = { '中国': 0, '俄罗斯': 1, '哈萨克斯坦': 2, '其他': 3 };
const FLAG = { '中国': '🇨🇳', '俄罗斯': '🇷🇺', '哈萨克斯坦': '🇰🇿', '其他': '🌍' };

let points = [], meta = { cities: [], cityColors: {} }, notes = [];
let checked = new Set(JSON.parse(localStorage.getItem(CHECKIN_KEY) || '[]'));
let collapsed = new Set();
let query = '';
let openNote = null;

const nonPending = () => points.filter(p => !p.pending);

function saveChecked() {
  localStorage.setItem(CHECKIN_KEY, JSON.stringify([...checked]));
}

/* ---------- 足迹仪表盘 ---------- */
function ringSVG(ratio) {
  const r = 34, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 84 84" class="ring">
    <circle cx="42" cy="42" r="${r}" class="ring-bg"/>
    <circle cx="42" cy="42" r="${r}" class="ring-fg" stroke-dasharray="${(ratio * c).toFixed(1)} ${c.toFixed(1)}"/>
    <text x="42" y="40" class="ring-num">${Math.round(ratio * 100)}%</text>
    <text x="42" y="54" class="ring-lbl">完成度</text>
  </svg>`;
}

function dashboardHTML() {
  const all = nonPending();
  const done = all.filter(p => checked.has(p.id));
  const pend = points.length - all.length;
  const byCountry = {};
  for (const p of all) {
    const cn = COUNTRY(p.city);
    byCountry[cn] = byCountry[cn] || { total: 0, done: 0 };
    byCountry[cn].total++;
    if (checked.has(p.id)) byCountry[cn].done++;
  }
  const countries = Object.keys(byCountry).sort((a, b) => COUNTRY_ORDER[a] - COUNTRY_ORDER[b]);
  return `<section class="dash card">
    <div class="dash-top">
      ${ringSVG(all.length ? done.length / all.length : 0)}
      <div class="dash-nums">
        <div class="dn-row"><b>${all.length}</b><span>点位</span></div>
        <div class="dn-row"><b class="dn-done">${done.length}</b><span>已打卡</span></div>
        <div class="dn-row"><b>${pend}</b><span>待核</span></div>
      </div>
    </div>
    <div class="dash-countries">
      ${countries.map(cn => `<span class="cc-chip">${FLAG[cn]} ${esc(cn)} <b>${byCountry[cn].done}</b>/${byCountry[cn].total}</span>`).join('')}
    </div>
    <div class="dash-cities">
      ${[...meta.cities].sort((a, b) => {
        const ra = COUNTRY_ORDER[COUNTRY(a)], rb = COUNTRY_ORDER[COUNTRY(b)];
        return ra !== rb ? ra - rb : meta.cities.indexOf(a) - meta.cities.indexOf(b);
      }).filter(city => all.some(p => p.city === city)).map(city => {
        const list = all.filter(p => p.city === city);
        const d = list.filter(p => checked.has(p.id)).length;
        const col = meta.cityColors[city] || '#546E7A';
        return `<div class="dc-row">
          <span class="dc-name">${esc(city)}</span>
          <span class="dc-bar"><i style="width:${list.length ? Math.round(d / list.length * 100) : 0}%;background:${col}"></i></span>
          <span class="dc-num">${d}/${list.length}</span>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

/* ---------- 打卡清单 ---------- */
function checklistHTML() {
  const all = nonPending().filter(p => !query || p.name.toLowerCase().includes(query) || (p.name_en || '').toLowerCase().includes(query) || p.type.includes(query));
  const byCity = new Map();
  for (const p of all) {
    if (!byCity.has(p.city)) byCity.set(p.city, []);
    byCity.get(p.city).push(p);
  }
  const cities = [...byCity.keys()].sort((a, b) => {
    const ra = COUNTRY_ORDER[COUNTRY(a)], rb = COUNTRY_ORDER[COUNTRY(b)];
    return ra !== rb ? ra - rb : meta.cities.indexOf(a) - meta.cities.indexOf(b);
  });
  let html = `<section class="card">
    <div class="card-head"><h2>📍 打卡清单</h2>
      <input id="cl-search" class="cl-search" type="text" placeholder="筛选点位…" value="${esc(query)}">
    </div>`;
  if (!all.length) html += `<div class="empty">无匹配点位</div>`;
  for (const city of cities) {
    const list = byCity.get(city);
    const d = list.filter(p => checked.has(p.id)).length;
    const col = meta.cityColors[city] || '#546E7A';
    const key = city, isCol = collapsed.has(key);
    html += `<div class="cl-city" data-toggle="${esc(key)}">
      <span class="cl-arrow">${isCol ? '▶' : '▼'}</span>
      <span class="cl-dot" style="background:${col}"></span>
      <span class="cl-name">${esc(COUNTRY(city))} · ${esc(city)}</span>
      <span class="cl-count">${d}/${list.length}</span>
    </div>`;
    if (!isCol) for (const p of list) {
      const ck = checked.has(p.id);
      html += `<label class="cl-row${ck ? ' done' : ''}">
        <input type="checkbox" data-check="${esc(p.id)}" ${ck ? 'checked' : ''} style="accent-color:${col}">
        <span class="cl-pname">${esc(p.name)}</span>
        <span class="cl-ptype">${esc(p.type)}</span>
      </label>`;
    }
  }
  return html + `</section>`;
}

/* ---------- 笔记 ---------- */
function parseMd(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let meta = {}, body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w一-龥]+):\s*(.*)$/);
      if (kv) meta[kv[1].trim()] = kv[2].trim();
    }
  }
  return { meta, html: marked.parse(body) };
}

function notesHTML() {
  let html = `<section class="card">
    <div class="card-head"><h2>📝 旅行笔记</h2><span class="nh-count">${notes.length} 篇</span></div>`;
  if (!notes.length) html += `<div class="empty">还没有笔记</div>`;
  for (const n of notes) {
    const isOpen = openNote === n.file;
    html += `<article class="note${isOpen ? ' open' : ''}" data-note="${esc(n.file)}">
      <div class="note-head">
        <span class="note-title">${esc(n.title)}</span>
        <span class="note-date">${esc(n.date || '')}</span>
      </div>
      ${n.summary ? `<div class="note-summary">${esc(n.summary)}</div>` : ''}
      ${isOpen ? `<div class="note-body"></div>` : ''}
    </article>`;
  }
  return html + `</section>`;
}

/* ---------- 渲染 ---------- */
function render() {
  $app.innerHTML = dashboardHTML() + checklistHTML() + notesHTML();
  const s = document.getElementById('cl-search');
  if (s) {
    s.addEventListener('input', () => {
      query = s.value.trim().toLowerCase();
      const pos = s.selectionStart;
      render();
      const s2 = document.getElementById('cl-search');
      if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); }
    });
  }
  if (openNote) {
    const body = $app.querySelector('.note.open .note-body');
    if (body && !body.dataset.loaded) {
      body.dataset.loaded = '1';
      fetch(`./content/notes/${encodeURIComponent(openNote)}.md`).then(r => r.text()).then(raw => {
        const { meta, html } = parseMd(raw);
        body.innerHTML = `<div class="md">${html}</div><div class="note-meta">${esc(meta.location || '')}</div>`;
      });
    }
  }
}

$app.addEventListener('click', e => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const k = t.dataset.toggle;
    collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k);
    render();
    return;
  }
  const row = e.target.closest('[data-note]');
  if (row && !e.target.closest('a')) {
    openNote = openNote === row.dataset.note ? null : row.dataset.note;
    render();
    if (openNote) row = null, document.querySelector(`[data-note="${CSS.escape(openNote)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
});
$app.addEventListener('change', e => {
  const cb = e.target.closest('input[data-check]');
  if (!cb) return;
  const id = cb.dataset.check;
  checked.has(id) ? checked.delete(id) : checked.add(id);
  saveChecked();
  render();
});

(async () => {
  const [pts, mt, idx] = await Promise.all([
    fetch('./data/points.json').then(r => r.json()),
    fetch('./data/meta.json').then(r => r.json()),
    fetch('./content/notes/index.json').then(r => r.ok ? r.json() : []),
  ]);
  points = pts; meta = mt; notes = idx;
  render();
})().catch(err => {
  $app.innerHTML = `<div class="empty">⚠️ 加载失败：${esc(err.message)}</div>`;
});
