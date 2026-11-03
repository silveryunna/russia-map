// 存储持久化与配额（浏览器 API，Node 下安全降级：只返回 null / 未支持）
// 目的：IndexedDB 默认是"可被清理"的存储；不申请持久化，用户清理浏览器数据/系统回收空间
// 就可能整库丢失。申请结果与配额水位只用来提示，不阻塞任何功能。

const PERSIST_KEY = 'rm.storage.persist';

export const QUOTA_WARN_RATIO = 0.8; // 用量超过 80% 就提示导出备份

function safeLS() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** 申请持久化存储；已申请过则直接返回。结果写入 localStorage 以便下次免请求。 */
export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return { supported: false, granted: false };
  }
  try {
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (already) {
      safeLS()?.setItem(PERSIST_KEY, 'granted');
      return { supported: true, granted: true };
    }
    const granted = await navigator.storage.persist();
    safeLS()?.setItem(PERSIST_KEY, granted ? 'granted' : 'denied');
    return { supported: true, granted };
  } catch {
    return { supported: true, granted: false };
  }
}

/** 当前用量/配额；不支持或拿不到时返回 null。 */
export async function storageUsage() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usage, quota, ratio: usage / quota };
  } catch {
    return null;
  }
}

/**
 * 纯函数：把存储状态翻译成一句提示（没有风险返回 null）。
 * @param {{ persist?: {supported:boolean, granted:boolean}, usage?: {ratio:number}|null }} health
 */
export function storageWarning(health = {}) {
  const { persist, usage } = health;
  if (usage && usage.ratio >= QUOTA_WARN_RATIO) {
    const pct = Math.round(usage.ratio * 100);
    return `本机可用空间已用掉 ${pct}%，浏览器可能在空间不足时清理离线数据，请尽快导出备份并清理旧照片`;
  }
  if (persist && persist.supported && !persist.granted) {
    return '浏览器未授予"持久化存储"：清理浏览数据或系统空间不足时，行程与打卡可能被清除，请定期导出备份';
  }
  return null;
}

/** 一次拿到状态并给建议（页面初始化调用一次即可）。 */
export async function checkStorageHealth() {
  const [persist, usage] = await Promise.all([requestPersistentStorage(), storageUsage()]);
  return { persist, usage, warning: storageWarning({ persist, usage }) };
}

/**
 * 纯函数：按设备给一条"本地数据可能被清理"的说明（无风险返回 null）。
 * 一起因不同：iOS 是"长期不访问被系统回收站点数据"，安卓多为用户主动清理浏览数据。
 * @param {string} ua navigator.userAgent
 */
export function deviceNotice(ua = '') {
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'iPhone/iPad：超过 7 天未打开，系统可能清理本站离线数据（行程与打卡）。建议「添加到主屏幕」，并定期导出备份';
  }
  if (/Android/i.test(ua)) {
    return '安卓：在浏览器里清理浏览数据（或设为关闭时清除）会删除本机行程，请定期导出备份';
  }
  return null;
}
