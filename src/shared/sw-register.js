// 全站 Service Worker 注册（各页面入口引入）
// 新版本 SW 激活后：设置 __swUpdatePending__ 并派发 sw-update 事件（地图页亮红点，用户点 🔄 刷新）
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // 开发环境不注册，避免干扰调试

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'sw-activated') return;
    // 不自动刷新（避免打断浏览）：派发 sw-update 事件，地图页亮 🔄 红点，其余页面忽略
    window.__swUpdatePending__ = true;
    window.dispatchEvent(new Event('sw-update'));
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => reg.update())
      .catch(() => {});
  });
}

