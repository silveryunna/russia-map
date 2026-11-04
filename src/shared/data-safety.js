// 全站数据安全：申请持久化存储、监测配额、提醒并执行全量备份。
// 页面只需在 Trip store 就绪后调用 initDataSafety({ store })。
// 备份载荷与时间戳口径与计划页一致（meta backup:lastExportAt）。

import { BACKUP_META_KEY, backupReminder } from './backup-reminder.js';
import { download } from './download.js';
import {
  STORAGE_QUOTA_EVENT, formatBytes, readStorageEstimate, requestPersistence, storagePressure,
} from './storage-health.js';
import { showTopBanner } from './top-banner.js';

const pad = n => String(n).padStart(2, '0');

/** 本地日期（YYYY-MM-DD），不用 toISOString 以免时区把日期推前一天。 */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function inventory(store) {
  const [trips, visits] = await Promise.all([
    typeof store.listTrips === 'function' ? store.listTrips().catch(() => []) : [],
    typeof store.listVisits === 'function' ? store.listVisits().catch(() => []) : [],
  ]);
  return { trips: trips.length, visits: visits.length };
}

/** 导出全量备份并回写备份时间；供计划页与全站横幅共用。 */
export async function exportBackupToFile(store, { today = localDate() } = {}) {
  const payload = await store.exportAll();
  download(`trips-backup-${today}.json`, JSON.stringify(payload, null, 2));
  await store.setMeta(BACKUP_META_KEY, today).catch(() => {});
  return payload;
}

function backupAction(store, today) {
  return async () => {
    try {
      const payload = await exportBackupToFile(store, { today });
      const trips = Array.isArray(payload.trips) ? payload.trips.length : 0;
      const visits = Array.isArray(payload.visits) ? payload.visits.length : 0;
      showTopBanner({
        id: 'backup-reminder',
        tone: 'success',
        message: `✅ 备份已导出：${trips} 份行程、${visits} 条打卡。请保存到网盘或另一台设备。`,
        dismissible: true,
      });
    } catch (err) {
      showTopBanner({
        id: 'backup-reminder',
        tone: 'danger',
        message: `备份导出失败：${(err && err.message) || '浏览器存储不可用'}`,
        actionLabel: '重试',
        onAction: backupAction(store, today),
      });
    }
  };
}

/**
 * 页面启动时调用一次。
 * @param {object} options
 * @param {object|null} [options.store] Trip store（需有 listTrips/listVisits/getMeta/exportAll/setMeta）
 * @param {boolean} [options.showBackup] 计划页已有自己的备份横幅，传 false 只做持久化/配额监测
 * @param {string} [options.today]
 */
export async function initDataSafety({ store = null, showBackup = true, today = localDate() } = {}) {
  // 不 await：Firefox 可能弹权限框，不能阻塞首屏
  void requestPersistence();

  const estimate = await readStorageEstimate();
  const pressure = storagePressure(estimate);
  const inv = store ? await inventory(store) : { trips: 0, visits: 0 };
  const hasData = inv.trips > 0 || inv.visits > 0;

  let reminder = null;
  if (showBackup && store && hasData && typeof store.getMeta === 'function') {
    let last = '';
    try { last = String(await store.getMeta(BACKUP_META_KEY) || ''); } catch { last = ''; }
    reminder = backupReminder(last, today);
  }

  if (pressure) {
    const backupHint = reminder
      ? (reminder.level === 'never' ? ' 还没有导出过备份。' : ` 上次备份是 ${reminder.days} 天前。`)
      : '';
    showTopBanner({
      id: 'storage-pressure',
      tone: pressure === 'critical' ? 'danger' : 'warn',
      message: `⚠️ 浏览器存储${pressure === 'critical' ? '即将耗尽' : '偏紧'}：已用 ${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}。${backupHint}`,
      actionLabel: hasData ? '立即备份' : '',
      onAction: hasData ? backupAction(store, today) : null,
    });
  } else if (reminder) {
    const what = inv.trips && inv.visits
      ? `${inv.trips} 份行程、${inv.visits} 条打卡`
      : inv.trips ? `${inv.trips} 份行程` : `${inv.visits} 条打卡`;
    showTopBanner({
      id: 'backup-reminder',
      tone: 'warn',
      message: `💾 ${reminder.level === 'never' ? '还没有导出过备份' : `上次备份是 ${reminder.days} 天前`}——${what}只存在这台设备`,
      actionLabel: '立即备份',
      onAction: backupAction(store, today),
    });
  }

  // 写入时才发现的配额错误：store 层广播，这里升级为常驻警示
  if (store && typeof globalThis.addEventListener === 'function' && !initDataSafety.quotaBound) {
    initDataSafety.quotaBound = true;
    globalThis.addEventListener(STORAGE_QUOTA_EVENT, () => {
      showTopBanner({
        id: 'storage-quota',
        tone: 'danger',
        message: '⚠️ 浏览器存储已满，刚才的改动可能没有保存。请立即备份并清理浏览器空间。',
        actionLabel: hasData ? '立即备份' : '',
        onAction: hasData ? backupAction(store, today) : null,
      });
    });
  }

  return { estimate, pressure, trips: inv.trips, visits: inv.visits };
}
