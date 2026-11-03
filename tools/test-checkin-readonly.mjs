#!/usr/bin/env node
// 打卡模块只读门：src/modules/checkin.js 只允许导出读 API。
// 背景：打卡事实源已迁到 IndexedDB（travel-trips.visits），travel-checkin-v2 只是派生缓存。
// 旧写函数（toggleCheckin / updateCheckin / saveCheckins）实测零调用，但留着就等于
// "第二可写事实源"随时可复活——HANDOFF 至今仍称打卡只写 localStorage，照着接一次就中招。
import * as mod from '../src/modules/checkin.js';

const WRITE_API = ['toggleCheckin', 'updateCheckin', 'saveCheckins'];
const READ_API = ['loadCheckins', 'hasCheckin', 'totalVisits', 'CHECKIN_KEY', 'LEGACY_CHECKIN_KEY'];

const resurrected = WRITE_API.filter((k) => k in mod);
const lost = READ_API.filter((k) => !(k in mod));

if (resurrected.length) {
  console.error(`❌ checkin.js 又导出了写函数：${resurrected.join(', ')}`);
  console.error('   写入必须走 src/pages/visits/repository.js（IndexedDB 是唯一事实源）');
  process.exit(1);
}
if (lost.length) {
  console.error(`❌ checkin.js 缺少只读导出：${lost.join(', ')}`);
  process.exit(1);
}

console.log(`打卡模块只读门通过（导出 ${Object.keys(mod).length} 个，无写函数）`);
