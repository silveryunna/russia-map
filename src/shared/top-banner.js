// 页面顶部横幅栈：降级 / 存储压力 / 备份提醒共用一条固定区域。
// 多条横幅纵向排列，body 顶部内边距跟着总高度走，避免遮住导航。
// 颜色一律走 tokens.css 的 CSS 变量（设计门 L1JS 不允许在 JS 里写颜色字面量）。

const HOST_ID = 'app-banners';
const bars = new Map();
let resizeBound = false;

const TONE_BG = {
  warn: 'var(--warning-ink)',
  danger: 'var(--danger)',
  info: 'var(--info)',
  success: 'var(--success)',
};

function host() {
  let el = document.getElementById(HOST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = HOST_ID;
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;display:flex;flex-direction:column;';
    document.body.prepend(el);
    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener('resize', syncPadding);
    }
  }
  return el;
}

function syncPadding() {
  const el = document.getElementById(HOST_ID);
  if (!el) return;
  const height = el.childElementCount ? el.offsetHeight : 0;
  document.body.style.paddingTop = height ? `${height}px` : '';
}

/**
 * 显示（或替换）一条顶部横幅。
 * @param {object} options
 * @param {string} options.id 同 id 会替换旧横幅
 * @param {string} options.message 纯文本，不解析 HTML
 * @param {'warn'|'danger'|'info'|'success'} [options.tone]
 * @param {string} [options.actionLabel] 右侧动作按钮文案
 * @param {() => Promise<void>|void} [options.onAction]
 * @param {boolean} [options.dismissible]
 */
export function showTopBanner({
  id, message, tone = 'warn', actionLabel = '', onAction = null, dismissible = false,
} = {}) {
  if (typeof document === 'undefined' || !id) return null;
  hideTopBanner(id, { keepPadding: true });
  const el = host();
  const bar = document.createElement('div');
  bar.dataset.bannerId = id;
  bar.className = `app-banner app-banner-${tone}`;
  bar.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  bar.style.cssText = [
    'display:flex', 'flex-wrap:wrap', 'align-items:center', 'justify-content:center', 'gap:var(--sp-2)',
    'padding:var(--sp-2) var(--sp-3)', 'font-size:13px', 'line-height:1.4',
    'text-align:center', 'color:var(--surface)', `background:${TONE_BG[tone] || TONE_BG.warn}`,
  ].join(';');

  const text = document.createElement('span');
  text.textContent = message;
  text.style.cssText = 'flex:1 1 auto;min-width:0;max-width:900px;';
  bar.appendChild(text);

  if (actionLabel && typeof onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.style.cssText = [
      'flex:none', 'min-height:44px', 'border:0', 'border-radius:var(--r-xs)',
      'padding:var(--sp-1) var(--sp-3)', 'background:var(--surface)',
      `color:${TONE_BG[tone] || TONE_BG.warn}`, 'font:inherit', 'font-weight:600', 'cursor:pointer',
    ].join(';');
    btn.addEventListener('click', async () => {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '处理中…';
      try { await onAction(); } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = label;
        }
      }
    });
    bar.appendChild(btn);
  }

  if (dismissible) {
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭提示');
    close.style.cssText = [
      'flex:none', 'min-width:44px', 'min-height:44px', 'border:0', 'background:transparent',
      'color:inherit', 'font-size:20px', 'line-height:1', 'cursor:pointer',
    ].join(';');
    close.addEventListener('click', () => hideTopBanner(id));
    bar.appendChild(close);
  }

  el.appendChild(bar);
  bars.set(id, bar);
  syncPadding();
  return bar;
}

/** 关闭指定横幅；不存在时静默。 */
export function hideTopBanner(id, { keepPadding = false } = {}) {
  if (typeof document === 'undefined') return;
  const bar = bars.get(id);
  if (bar) {
    bar.remove();
    bars.delete(id);
  }
  if (!keepPadding) syncPadding();
}
