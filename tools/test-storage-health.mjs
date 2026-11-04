#!/usr/bin/env node
// 浏览器存储健康与备份提醒口径（P0 数据安全）
// 覆盖：QuotaExceeded 识别、配额压力分级、体积格式化、持久化申请、估算读取、事件广播。
// 用法: node tools/test-storage-health.mjs
import {
  STORAGE_QUOTA_EVENT, formatBytes, isQuotaExceededError, notifyQuotaExceeded,
  readStorageEstimate, requestPersistence, storagePressure,
} from '../src/shared/storage-health.js';
import { BACKUP_WARN_DAYS, backupReminder } from '../src/shared/backup-reminder.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// 1) QuotaExceededError：浏览器实现不统一，名字/错误码/消息都要认
{
  assert(isQuotaExceededError({ name: 'QuotaExceededError' }), '按 name=QuotaExceededError 识别');
  assert(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), '按 Firefox name 识别');
  assert(isQuotaExceededError({ code: 22 }), '按 Chrome 旧码 22 识别');
  assert(isQuotaExceededError({ code: 1014 }), '按 Firefox 码 1014 识别');
  assert(isQuotaExceededError(new Error('The quota has been exceeded')), '按英文消息识别');
  assert(!isQuotaExceededError(new Error('network down')), '普通错误不误判');
  assert(!isQuotaExceededError(null), 'null 不误判');
}

// 2) 配额压力：比例与剩余空间双阈值
{
  assert(storagePressure(null) === null, '无估算 → 不报警');
  assert(storagePressure({ usage: 0, quota: 0 }) === null, 'quota=0 → 不报警');
  assert(storagePressure({ usage: 0, quota: 1024 ** 3 }) === null, '1GB 全空 → 不报警');
  assert(storagePressure({ usage: 0.8 * 1024 ** 3, quota: 1024 ** 3 }) === 'warn', '已用 80% → warn');
  assert(storagePressure({ usage: 0.95 * 1024 ** 3, quota: 1024 ** 3 }) === 'critical', '已用 95% → critical');
  assert(storagePressure({ usage: 0, quota: 30 * 1024 ** 2 }) === 'warn', '总配额仅 30MB → warn');
  assert(storagePressure({ usage: 0, quota: 10 * 1024 ** 2 }) === 'critical', '总配额仅 10MB → critical');
  assert(storagePressure({ usage: 1024 ** 3 - 10 * 1024 ** 2, quota: 1024 ** 3 }) === 'critical', '剩余不足 20MB → critical');
}

// 3) 体积格式化（只用于文案）
{
  assert(formatBytes(0) === '0 B', '0 B');
  assert(formatBytes(1024) === '1.0 KB', '1.0 KB');
  assert(formatBytes(1.5 * 1024 ** 2) === '1.5 MB', '1.5 MB');
  assert(formatBytes(10 * 1024 ** 2) === '10 MB', '10 MB 不保留小数');
  assert(formatBytes(-1) === '未知', '负数 → 未知');
}

// 4) 持久化申请：已授权不重复调用；不支持时不报错
{
  let called = 0;
  const already = await requestPersistence({
    storage: { persisted: async () => true, persist: async () => { called++; return true; } },
  });
  assert(already.persisted === true && called === 0, '已持久化 → 不重复调用 persist()');

  const granted = await requestPersistence({
    storage: { persisted: async () => false, persist: async () => { called++; return true; } },
  });
  assert(granted.persisted === true && called === 1, '未持久化 → 调用 persist() 并记录授权');

  const denied = await requestPersistence({
    storage: { persisted: async () => false, persist: async () => false },
  });
  assert(denied.supported === true && denied.persisted === false, '拒绝授权 → persisted=false');

  const unsupported = await requestPersistence({});
  assert(unsupported.supported === false && unsupported.persisted === false, 'Safari/无 storage → supported=false');

  const broken = await requestPersistence({
    storage: { persisted: async () => { throw new Error('security'); }, persist: async () => true },
  });
  assert(broken.supported === true && broken.persisted === false, 'persist() 抛错 → 静默降级');
}

// 5) 配额估算：不可用/异常返回 null，不制造假数字
{
  const est = await readStorageEstimate({ storage: { estimate: async () => ({ usage: 10, quota: 100 }) } });
  assert(est.usage === 10 && est.quota === 100 && est.ratio === 0.1, '正常读取 usage/quota/ratio');
  assert(await readStorageEstimate({}) === null, '无 storage.estimate → null');
  assert(await readStorageEstimate({ storage: { estimate: async () => ({ usage: 1, quota: 0 }) } }) === null, 'quota=0 → null');
  assert(await readStorageEstimate({ storage: { estimate: async () => { throw new Error('x'); } } }) === null, 'estimate 抛错 → null');
}

// 6) 配额错误广播：只在目标环境支持事件时发送，且不改变返回值
{
  const events = [];
  const target = {
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    dispatchEvent(e) { events.push(e); return true; },
  };
  const sent = notifyQuotaExceeded({ name: 'QuotaExceededError', message: 'full' }, target);
  assert(sent === true && events.length === 1 && events[0].type === STORAGE_QUOTA_EVENT, '配额错误 → 广播全局事件');
  const ignored = notifyQuotaExceeded(new Error('other'), target);
  assert(ignored === false && events.length === 1, '非配额错误 → 不广播');
  assert(notifyQuotaExceeded({ name: 'QuotaExceededError' }, {}) === true, '目标无事件 API → 仍返回 true 且不抛错');
}

// 7) 备份提醒：与计划页原口径完全一致
{
  assert(BACKUP_WARN_DAYS === 7, '提醒阈值 7 天');
  assert(backupReminder('', '2026-11-03')?.level === 'never', '空记录 → never');
  assert(backupReminder(null, '2026-11-03')?.level === 'never', 'null → never');
  assert(backupReminder('not-a-date', '2026-11-03')?.level === 'never', '非法日期 → never');
  assert(backupReminder('2026-11-03', '2026-11-03') === null, '当天备份不提醒');
  assert(backupReminder('2026-10-27', '2026-11-03') === null, '正好 7 天不提醒');
  const stale = backupReminder('2026-10-26', '2026-11-03');
  assert(stale?.level === 'stale' && stale.days === 8, '第 8 天 → stale');
  assert(backupReminder('2026-11-10', '2026-11-03') === null, '未来日期不提醒');
}

if (bad) { console.error(`\n存储健康检查失败：${bad} 项`); process.exit(1); }
console.log('\n存储健康检查通过');
