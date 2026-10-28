import '../shared/base.css';
import './album.css';
import { renderIcpFooter } from '../shared/icp-footer.js';

// ===== 旅行相册页：照片放 photos/ 目录，在 index.json 登记即可 =====
// index.json 格式：[{ "src": "xxx.jpg", "title": "…", "date": "2026-09-01", "place": "莫斯科" }]

const app = document.getElementById('album-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let photos = [];
let viewerIdx = -1;

function render() {
  if (!photos.length) {
    app.innerHTML = `
      <div class="album-empty">
        <p>📷 相册还是空的</p>
        <p class="ae-tip">把照片放到 <code>photos/</code> 目录，<br>并在 <code>photos/index.json</code> 中登记即可展示。</p>
      </div>`;
    return;
  }
  app.innerHTML = `
    <div class="album-grid">
      ${photos.map((p, i) => `
        <figure class="photo-card" data-idx="${i}">
          <img src="./photos/${encodeURIComponent(p.src)}" alt="${esc(p.title || p.src)}" loading="lazy" onerror="this.closest('figure').classList.add('ph-broken')">
          <figcaption>
            ${p.title ? `<div class="pc-title">${esc(p.title)}</div>` : ''}
            <div class="pc-sub">${[p.place, p.date].filter(Boolean).map(esc).join(' · ')}</div>
          </figcaption>
        </figure>`).join('')}
    </div>
    ${viewerIdx >= 0 ? viewerHtml() : ''}`;
}

function viewerHtml() {
  const p = photos[viewerIdx];
  return `
    <div class="viewer" data-viewer>
      <button class="vw-close" data-close>✕</button>
      <button class="vw-prev" data-prev ${viewerIdx === 0 ? 'disabled' : ''}>‹</button>
      <img class="vw-img" src="./photos/${encodeURIComponent(p.src)}" alt="${esc(p.title || '')}" onerror="this.style.display='none'">
      <button class="vw-next" data-next ${viewerIdx === photos.length - 1 ? 'disabled' : ''}>›</button>
      <div class="vw-cap">${esc(p.title || '')}${p.place || p.date ? `<span>${[p.place, p.date].filter(Boolean).map(esc).join(' · ')}</span>` : ''}</div>
      <div class="vw-count">${viewerIdx + 1} / ${photos.length}</div>
    </div>`;
}

function openViewer(i) {
  viewerIdx = i;
  render();
  document.body.style.overflow = 'hidden';
}
function closeViewer() {
  viewerIdx = -1;
  render();
  document.body.style.overflow = '';
}
function step(d) {
  const n = viewerIdx + d;
  if (n < 0 || n >= photos.length) return;
  openViewer(n);
}

app.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closeViewer();
  if (e.target.closest('[data-prev]')) return step(-1);
  if (e.target.closest('[data-next]')) return step(1);
  if (e.target.closest('[data-viewer]')) return closeViewer(); // 点背景关闭
  const card = e.target.closest('.photo-card[data-idx]');
  if (card) openViewer(Number(card.dataset.idx));
});

document.addEventListener('keydown', (e) => {
  if (viewerIdx < 0) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

async function main() {
  photos = await fetch('./photos/index.json').then(r => r.json());
  // 按日期倒序（无日期的排最后）
  photos.sort((a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')));
  render();
}

main().catch(err => {
  console.error(err);
  app.textContent = '⚠️ 加载失败，请刷新重试';
});
import { registerSW } from '../shared/sw-register.js';
registerSW();
renderIcpFooter();
