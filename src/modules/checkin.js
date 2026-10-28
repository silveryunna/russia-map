// 打卡状态 v2：{ id: { n: 打卡次数, last: 'YYYY-MM-DD', note: '一句话感想(可空)' } }
// 兼容迁移：旧版 travel-checkin-v1（id 数组）首次读取时自动升级
export const CHECKIN_KEY = 'travel-checkin-v2';
const LEGACY_KEY = 'travel-checkin-v1';

export function loadCheckins() {
  try {
    const raw = localStorage.getItem(CHECKIN_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && !Array.isArray(o)) return o;
    }
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const arr = JSON.parse(legacyRaw) || [];
      const o = {};
      for (const id of arr) if (id) o[id] = { n: 1, last: '' };
      saveCheckins(o);
      return o;
    }
  } catch (e) { /* 损坏则从零开始 */ }
  return {};
}

export function saveCheckins(o) {
  localStorage.setItem(CHECKIN_KEY, JSON.stringify(o));
}

export function hasCheckin(o, id) { return !!o[id]; }

// 勾选打卡（默认今天第 1 次）；取消勾选则删除记录
export function toggleCheckin(o, id) {
  if (o[id]) { delete o[id]; }
  else { o[id] = { n: 1, last: new Date().toISOString().slice(0, 10) }; }
  saveCheckins(o);
  return !!o[id];
}

// 更新某点位的打卡详情（日期/次数/感想），供笔记页编辑器用
export function updateCheckin(o, id, info) {
  if (!o[id]) o[id] = { n: 1, last: '' };
  if (info.n !== undefined) o[id].n = Math.max(1, Math.min(99, +info.n || 1));
  if (info.last !== undefined) o[id].last = /^\d{4}-\d{2}-\d{2}$/.test(info.last) ? info.last : '';
  if (info.note !== undefined) o[id].note = String(info.note).slice(0, 100);
  saveCheckins(o);
}

// 累计打卡次数（仪表盘用）
export function totalVisits(o) {
  return Object.values(o).reduce((s, v) => s + (v && v.n ? +v.n : 1), 0);
}
