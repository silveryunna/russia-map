// 备份提醒的纯函数口径（页面横幅与计划页共用）。
// 数据只存在浏览器 IndexedDB 里，超过 BACKUP_WARN_DAYS 天没导出就必须提醒。
// 契约由 tools/test-plan-io.mjs / tools/test-storage-health.mjs 守护。

export const BACKUP_WARN_DAYS = 7;
export const BACKUP_META_KEY = 'backup:lastExportAt';

/**
 * 纯函数：该不该提醒备份。
 * @returns {null | { level: 'never'|'stale', days: number|null }}
 *   never = 从未导出过；stale = 超过 BACKUP_WARN_DAYS 天未导出；否则 null。
 */
export function backupReminder(lastExport, today) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(lastExport || '')) return { level: 'never', days: null };
  const days = Math.floor((Date.parse(today) - Date.parse(lastExport)) / 86400000);
  if (!Number.isFinite(days) || days <= BACKUP_WARN_DAYS) return null;
  return { level: 'stale', days };
}
