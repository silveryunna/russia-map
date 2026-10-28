import '../shared/base.css';
import './notes.css';
import { marked } from 'marked';
import { renderIcpFooter } from '../shared/icp-footer.js';

// ===== 旅行笔记页：Markdown 博客，内容在 content/notes/（个人直接改文件即可更新）=====

const app = document.getElementById('notes-app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

marked.setOptions({ gfm: true, breaks: true });

// 解析 --- front matter ---
function parseMd(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w一-龥]+):\s*(.*)$/);
      if (kv) meta[kv[1].trim()] = kv[2].trim();
    }
  }
  return { meta, html: marked.parse(body) };
}

let index = [];      // index.json：[{ file, title, date, summary }]
let current = null;  // 当前打开的文章 file

function renderList() {
  if (!index.length) {
    app.innerHTML = `
      <div class="notes-empty">
        <p>📝 还没有笔记</p>
        <p class="ne-tip">在 <code>content/notes/</code> 目录下新建 <code>.md</code> 文件，<br>并在 <code>index.json</code> 中登记即可发布。</p>
      </div>`;
    return;
  }
  app.innerHTML = `
    <div class="notes-list">
      ${index.map(n => `
        <a class="note-card" data-file="${esc(n.file)}">
          <div class="nc-title">${esc(n.title || n.file)}</div>
          ${n.summary ? `<div class="nc-summary">${esc(n.summary)}</div>` : ''}
          ${n.date ? `<div class="nc-date">📅 ${esc(n.date)}</div>` : ''}
        </a>`).join('')}
    </div>`;
}

async function renderArticle(file) {
  const item = index.find(n => n.file === file);
  app.innerHTML = '<div class="notes-empty">加载中…</div>';
  try {
    const raw = await fetch(`./content/notes/${encodeURIComponent(file)}`).then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    });
    const { meta, html } = parseMd(raw);
    const title = meta.title || item?.title || file;
    const date = meta.date || item?.date || '';
    app.innerHTML = `
      <article class="note-article">
        <a class="na-back" data-back>← 返回笔记列表</a>
        <h1 class="na-title">${esc(title)}</h1>
        ${date ? `<div class="na-date">📅 ${esc(date)}</div>` : ''}
        <div class="na-body">${html}</div>
      </article>`;
    document.title = `${title} · 牛马打工人的旅行笔记`;
  } catch {
    app.innerHTML = `
      <div class="notes-empty">
        <p>⚠️ 文章加载失败</p>
        <p class="ne-tip"><a data-back style="color:var(--accent);cursor:pointer">← 返回笔记列表</a></p>
      </div>`;
  }
}

app.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) {
    current = null;
    document.title = '旅行笔记 · 牛马打工人的旅行笔记';
    renderList();
    return;
  }
  const card = e.target.closest('.note-card[data-file]');
  if (card) {
    current = card.dataset.file;
    renderArticle(current);
  }
});

async function main() {
  index = await fetch('./content/notes/index.json').then(r => r.json());
  // 按日期倒序
  index.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  renderList();
}

main().catch(err => {
  console.error(err);
  app.textContent = '⚠️ 加载失败，请刷新重试';
});
import { registerSW } from '../shared/sw-register.js';
registerSW();
renderIcpFooter();
