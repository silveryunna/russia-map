// 键盘快捷键（全局共用）：输入框内不劫持按键；不占用浏览器原生快捷键（Ctrl+P/Ctrl+F 等）
export const SHORTCUTS = [
  { keys: ['/'], label: '聚焦搜索框' },
  { keys: ['r'], label: '切换板块（循环到下一个可见板块）' },
  { keys: ['j'], label: '下一个点位' },
  { keys: ['k'], label: '上一个点位' },
  { keys: ['b'], label: '打开 / 收起侧栏' },
  { keys: ['t'], label: '打开今日执行' },
  { keys: ['p'], label: '打开计划页' },
  { keys: ['?'], label: '显示本快捷键面板（Esc 关闭）' },
  { keys: ['Ctrl+P'], label: '打印当前行程单（浏览器原生，不拦截）' },
];

const HELP_ID = 'kbd-help';
let restoreFocus = null;

export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
}

function helpHtml() {
  // 图标按钮都带文字标签，避免 emoji-only 控件
  return `<div class="kbd-card" role="dialog" aria-modal="true" aria-labelledby="kbd-title">
    <h2 id="kbd-title">键盘快捷键</h2>
    <dl class="kbd-list">
      ${SHORTCUTS.map(s => `<dt><kbd>${s.keys.join(' / ')}</kbd></dt><dd>${s.label}</dd>`).join('')}
    </dl>
    <div class="kbd-actions"><button type="button" class="pl-btn" data-kbd-close>关闭</button></div>
  </div>`;
}

function ensureHelp() {
  let el = document.getElementById(HELP_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = HELP_ID;
  el.className = 'kbd-help';
  el.innerHTML = helpHtml();
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-kbd-close]')) closeHelp();
  });
  document.body.append(el);
  return el;
}

export function openHelp() {
  const el = ensureHelp();
  restoreFocus = document.activeElement;
  el.style.display = 'flex';
  el.setAttribute('aria-hidden', 'false');
  el.querySelector('[data-kbd-close]')?.focus();
}

export function closeHelp() {
  const el = document.getElementById(HELP_ID);
  if (!el || el.style.display === 'none') return false;
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
  restoreFocus = null;
  return true;
}

// actions: { search, region, prevPoint, nextPoint, sidebar, today, plan }，缺省的动作忽略
export function installShortcuts(actions = {}) {
  const KEY_ACTION = {
    '/': 'search', r: 'region', j: 'nextPoint', k: 'prevPoint',
    b: 'sidebar', t: 'today', p: 'plan', '?': 'help',
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { if (closeHelp()) e.preventDefault(); return; }
    // 带修饰键一律放行（保留 Ctrl+P 打印、Ctrl+F 查找等浏览器原生行为）
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.defaultPrevented || isTypingTarget(e.target)) return;
    const action = KEY_ACTION[e.key];
    if (!action) return;
    if (action === 'help') { openHelp(); e.preventDefault(); return; }
    const fn = actions[action];
    if (typeof fn === 'function') { fn(); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
