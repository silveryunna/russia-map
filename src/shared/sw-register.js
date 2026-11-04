// 全站 Service Worker 注册（所有页面入口引入）
// 新版本 SW 激活后：提示「有新版本，刷新生效」（统一顶部横幅），并保留 __swUpdatePending__ / sw-update 事件供地图页红点复用。
// 注意：只提示不自动刷新——正在编辑的行程/今日执行不能被 reload 打断。
import { showTopBanner } from './top-banner.js';

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // 开发环境不注册，避免干扰调试

  // 首次安装也会走 activate/claim，不能把「第一次装 SW」误报成「有新版本」
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('message', (e) => {
    const type = e.data && e.data.type;
    if (type === 'sw-activated') {
      // 不自动刷新（避免打断浏览）：派发 sw-update 事件，地图页亮 🔄 红点；其余页面靠横幅
      window.__swUpdatePending__ = true;
      window.dispatchEvent(new Event('sw-update'));
      if (!hadController) return;
      showTopBanner({
        id: 'sw-update',
        tone: 'info',
        message: '🔄 站点已更新，刷新后生效（正在编辑的内容不会被自动丢弃）',
        actionLabel: '刷新',
        onAction: () => { window.location.reload(); },
        dismissible: true,
      });
      return;
    }
    if (type === 'sw-quota') {
      // 离线缓存写不进去：不影响在线浏览，但要如实告诉用户「离线能力可能不完整」
      showTopBanner({
        id: 'sw-quota',
        tone: 'warn',
        message: '⚠️ 浏览器存储不足，离线缓存未能更新；请清理空间并导出备份。',
        dismissible: true,
      });
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => reg.update())
      .catch(() => {});
  });
}
