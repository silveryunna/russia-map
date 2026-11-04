// 浏览器存储健康：持久化申请、配额估算、QuotaExceeded 识别与广播。
// 只做纯逻辑 + 可注入 navigator，便于在 Node 里单测；本文件不碰 DOM。
// 契约由 tools/test-storage-health.mjs 守护。

/** 全局事件名：IndexedDB 写入遇到配额错误时由 store 层广播，页面据此出常驻横幅。 */
export const STORAGE_QUOTA_EVENT = 'travel-storage-quota';

/** 判断一个异常是不是「存储空间已满」。浏览器实现的名字/错误码并不统一。 */
export function isQuotaExceededError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const code = Number(err.code);
  const message = String(err.message || err);
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (code === 22 || code === 1014) return true; // Chrome/Edge 旧码 22；Firefox 1014
  return /quota/i.test(message) && /(exceed|reached|full|exhaust)/i.test(message);
}

/**
 * 纯函数：按已用比例与剩余空间给出压力等级。
 * @param {{usage:number, quota:number}|null} estimate
 * @returns {'critical'|'warn'|null}
 */
export function storagePressure(estimate) {
  const usage = Number(estimate && estimate.usage);
  const quota = Number(estimate && estimate.quota);
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
  const free = Math.max(0, quota - usage);
  const ratio = usage / quota;
  if (ratio >= 0.9 || free < 20 * 1024 * 1024) return 'critical';
  if (ratio >= 0.75 || free < 100 * 1024 * 1024) return 'warn';
  return null;
}

/** 人类可读的体积；用于横幅文案，不参与计算。 */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '未知';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * 把配额错误广播给页面。只在目标环境支持事件时发送，失败不影响原始错误继续抛出。
 * @returns {boolean} 是否是配额错误
 */
export function notifyQuotaExceeded(err, target = globalThis) {
  if (!isQuotaExceededError(err)) return false;
  try {
    if (typeof target.dispatchEvent === 'function' && typeof target.CustomEvent === 'function') {
      target.dispatchEvent(new target.CustomEvent(STORAGE_QUOTA_EVENT, {
        detail: { message: String((err && err.message) || '') },
      }));
    }
  } catch { /* 通知失败不影响写入错误本身 */ }
  return true;
}

/**
 * 申请持久化存储。已授权时不重复调用 persist()。
 * Safari 等环境没有 persist()，返回 supported:false；调用方不要把它当成错误。
 */
export async function requestPersistence(nav = globalThis.navigator) {
  const storage = nav && nav.storage;
  if (!storage || typeof storage.persist !== 'function') {
    return { supported: false, persisted: false, granted: false };
  }
  try {
    const already = typeof storage.persisted === 'function' ? await storage.persisted() : false;
    if (already) return { supported: true, persisted: true, granted: true };
    const granted = await storage.persist();
    return { supported: true, persisted: !!granted, granted: !!granted };
  } catch {
    return { supported: true, persisted: false, granted: false };
  }
}

/** 读取浏览器给出的用量/配额；不可用时返回 null（不要猜数字）。 */
export async function readStorageEstimate(nav = globalThis.navigator) {
  const storage = nav && nav.storage;
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const e = await storage.estimate();
    const usage = Number(e && e.usage);
    const quota = Number(e && e.quota);
    if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
    return { usage, quota, ratio: usage / quota };
  } catch {
    return null;
  }
}
