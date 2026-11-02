// 降级横幅：IndexedDB 不可用、写入只会落在内存时，页面顶部常驻一条警示。
// 「静默降级 = 用户不知道自己在丢数据」的修复（审计 B2-1）；Today/计划页已有等价提示，
// 这里给地图/打卡清单页统一入口。样式内联，避免为一条警示去改各页 CSS。
export function showDegradedBanner(message) {
  if (typeof document === 'undefined' || document.getElementById('degraded-banner')) return;
  const el = document.createElement('div');
  el.id = 'degraded-banner';
  el.setAttribute('role', 'alert');
  el.textContent = `⚠️ ${message}`;
  el.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:100000',
    'background:#8a4b00', 'color:#fff', 'padding:8px 12px', 'font-size:13px',
    'text-align:center', 'line-height:1.4',
  ].join(';');
  document.body.prepend(el);
  document.body.style.paddingTop = `${el.offsetHeight || 32}px`;
}
