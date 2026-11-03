// 撤销提示条（取消打卡后 5 分钟内可一键恢复）
// 用内联样式而不是新增 CSS 文件：只有三行外观，且必须盖在地图/抽屉之上，避免各页面 CSS 顺序影响。

let activeBar = null;

export function hideUndoToast() {
  if (activeBar) { activeBar.remove(); activeBar = null; }
}

/**
 * @param {string} message 提示文案
 * @param {() => Promise<any>|any} onUndo 点「撤销」时执行
 * @param {{ ms?: number }} options 停留时长（默认 6 秒；撤销窗口本身由 repository 控制）
 */
export function showUndoToast(message, onUndo, { ms = 6000 } = {}) {
  hideUndoToast();
  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(16px + env(safe-area-inset-bottom, 0px))',
    'transform:translateX(-50%)', 'z-index:2000', 'display:flex', 'gap:12px', 'align-items:center',
    'max-width:calc(100vw - 32px)', 'padding:10px 8px 10px 16px', 'border-radius:999px',
    'background:rgba(24,24,24,.94)', 'color:#fff', 'font-size:14px', 'line-height:1.4',
    'box-shadow:0 8px 24px rgba(0,0,0,.28)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '撤销';
  btn.style.cssText = 'border:0;background:transparent;color:#ffd166;font:inherit;font-weight:600;padding:6px 8px;cursor:pointer;white-space:nowrap';
  btn.onclick = async () => {
    hideUndoToast();
    try { await onUndo(); } catch { /* 撤销失败不阻塞页面 */ }
  };

  bar.append(text, btn);
  document.body.appendChild(bar);
  activeBar = bar;
  setTimeout(() => { if (activeBar === bar) hideUndoToast(); }, ms);
  return { hide: hideUndoToast };
}
