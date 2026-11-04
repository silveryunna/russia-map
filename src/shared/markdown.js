// Markdown 渲染的安全口径（审计 P2-8）：marked 默认允许原始 HTML 与任意链接协议，
// 笔记正文一旦来自投稿/外部编辑就会变成 innerHTML 注入点。这里统一：
// - 原始 HTML token 一律转义成文本（不执行、不保留标签）
// - 链接只放行 http(s)/mailto/相对路径，javascript:/data:/vbscript: 等一概降级为纯文本
// - 图片额外放行 data:image（base64），相对路径原样保留（相册/笔记图）
// 纯函数，契约由 tools/test-markdown.mjs 守护。
import { Marked } from 'marked';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** 只允许明确安全的 URL；不安全的返回空串，由调用方降级为文本。 */
export function safeMarkdownUrl(raw, { image = false } = {}) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/[\u0000-\u001f\u007f]/.test(value)) return '';
  if (value.startsWith('//')) return ''; // 协议相对地址：可能指向任意主机，按外链处理更保守
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (/^https?:/i.test(value)) return value;
    if (!image && /^mailto:/i.test(value)) return value;
    if (image && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
    return '';
  }
  return value; // 相对路径 / 锚点
}

const md = new Marked({ gfm: true, breaks: true });

md.use({
  renderer: {
    // 原始 HTML（含 <script>、<img onerror>、内联事件）不解析，按文本显示
    html(token) {
      return escapeHtml(token.text ?? token.raw ?? '');
    },
    link(token) {
      const inner = this.parser.parseInline(token.tokens);
      const href = safeMarkdownUrl(token.href);
      if (!href) return inner;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      // rel 必带：外部链接拿到 window.opener 是另一条注入链
      return `<a href="${escapeHtml(href)}"${title} rel="noopener noreferrer">${inner}</a>`;
    },
    image(token) {
      const src = safeMarkdownUrl(token.href, { image: true });
      const alt = escapeHtml(token.text || '');
      if (!src) return alt;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${alt}"${title} loading="lazy" decoding="async">`;
    },
  },
});

/** 渲染 Markdown 为安全的 HTML 字符串（调用方仍应把它当 HTML 插入，但内容已收口）。 */
export function renderMarkdown(source) {
  return md.parse(String(source ?? ''));
}
