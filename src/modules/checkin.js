// 打卡状态 v2：{ id: { n: 打卡次数, last: 'YYYY-MM-DD', note: '一句话感想(可空)' } }
//
// 只读模块。事实源是 IndexedDB（src/pages/visits/repository.js 的 travel-trips.visits），
// 这里的 localStorage 副本只供旧 UI 读取与一次性迁移，**禁止在此新增任何写 API**——
// 否则会复活"第二可写事实源"（见 docs/AUDIT-2026-11-03.md §7 H1）。
// 守卫：tools/test-checkin-readonly.mjs
//
// 兼容迁移：旧版 travel-checkin-v1（id 数组）首次读取时自动升级
export const CHECKIN_KEY = 'travel-checkin-v2';
export const LEGACY_CHECKIN_KEY = 'travel-checkin-v1';
const LEGACY_KEY = LEGACY_CHECKIN_KEY;

// 仅迁移路径使用，不导出
function writeCache(o) {
  localStorage.setItem(CHECKIN_KEY, JSON.stringify(o));
}

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
      writeCache(o);
      return o;
    }
  } catch (e) { /* 损坏则从零开始 */ }
  return {};
}

export function hasCheckin(o, id) { return !!o[id]; }

// 只读统计（笔记页用）：累计打卡次数
export function totalVisits(o) {
  return Object.values(o).reduce((s, v) => s + (v && v.n ? +v.n : 1), 0);
}
