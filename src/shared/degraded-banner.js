// 降级横幅：IndexedDB 不可用、写入只会落在内存时，页面顶部常驻一条警示。
// 「静默降级 = 用户不知道自己在丢数据」的修复（审计 B2-1）；Today/计划页已有等价提示，
// 这里给地图/打卡清单/笔记页统一入口。样式走 tokens.css，不再内联颜色字面量。
import { showTopBanner } from './top-banner.js';

export function showDegradedBanner(message) {
  showTopBanner({
    id: 'degraded-banner',
    message: `⚠️ ${message}`,
    tone: 'danger',
  });
}
