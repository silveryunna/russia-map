// 全站 Service Worker 注册（各页面入口引入）
// 新版本 SW 激活后：提示并自动刷新一次（用 sessionStorage 防止刷新循环）
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // 开发环境不注册，避免干扰调试

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'sw-activated') return;
    // 不自动刷新（避免打断浏览），弹出提示条由用户点击刷新
    showUpdateToast(e.data.version);
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => reg.update())
      .catch(() => {});
  });
}

function showUpdateToast(version) {
  if (document.querySelector('.sw-update-toast')) return;
  const el = document.createElement('div');
  el.className = 'sw-update-toast';
  el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
    'z-index:99999;background:rgba(33,33,33,.94);color:#fff;padding:10px 18px;' +
    'border-radius:24px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);' +
    'display:flex;gap:12px;align-items:center;max-width:90vw;';
  el.innerHTML = `<span>发现新版本</span>`;
  const btn = document.createElement('button');
  btn.textContent = '刷新';
  btn.style.cssText = 'border:none;background:#B71C1C;color:#fff;border-radius:14px;' +
    'padding:4px 14px;font-size:13px;cursor:pointer;flex:none;';
  btn.addEventListener('click', () => location.reload());
  el.appendChild(btn);
  document.body.appendChild(el);
}
