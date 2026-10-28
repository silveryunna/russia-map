// 计划本地存储：容错读取、损坏备份、schemaVersion 入口。
// 旧版是裸数组；新版写成 {schemaVersion, updatedAt, plans}，读取两种都兼容。

export const PLANS_KEY = 'travel-plans-v1';
export const PLANS_SCHEMA_VERSION = 1;
const SLOTS = ['morning', 'afternoon', 'evening'];

function asStringList(v) {
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [];
}

export function migratePlan(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
  if (!Array.isArray(p.days)) return null;
  const days = p.days
    .filter(d => d && typeof d === 'object' && d.slots && typeof d.slots === 'object')
    .map((d, i) => ({
      day: Number.isFinite(d.day) ? d.day : i + 1,
      slots: Object.fromEntries(SLOTS.map(s => [s, asStringList(d.slots[s])])),
      tip: typeof d.tip === 'string' ? d.tip : '',
    }));
  if (!days.length) return null;
  return {
    ...p,
    schemaVersion: Number.isFinite(p.schemaVersion) ? p.schemaVersion : PLANS_SCHEMA_VERSION,
    source: p.source === 'ai' ? 'ai' : 'rule',
    days,
  };
}

export function loadPlans(storage, now = Date.now()) {
  const raw = storage.getItem(PLANS_KEY);
  if (!raw) return { plans: [], recovered: false, backupKey: null, error: '' };

  let list;
  try {
    const data = JSON.parse(raw);
    list = Array.isArray(data) ? data : (data && Array.isArray(data.plans) ? data.plans : null);
    if (!list) throw new Error('数据结构不是计划数组');
  } catch (err) {
    const backupKey = `${PLANS_KEY}.bak-${now}`;
    try { storage.setItem(backupKey, raw); } catch { /* 备份失败也不阻断启动 */ }
    try { storage.removeItem(PLANS_KEY); } catch { /* 同上 */ }
    return { plans: [], recovered: true, backupKey, error: err.message };
  }

  const plans = list.map(migratePlan).filter(Boolean);
  return { plans, recovered: false, backupKey: null, error: '' };
}

export function savePlans(storage, plans) {
  const payload = {
    schemaVersion: PLANS_SCHEMA_VERSION,
    updatedAt: Date.now(),
    plans,
  };
  storage.setItem(PLANS_KEY, JSON.stringify(payload));
  return payload;
}
