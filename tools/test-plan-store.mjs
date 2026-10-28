#!/usr/bin/env node
// 计划本地存储质量门（CI 强制）：损坏数据不得白屏，旧格式必须能读，写入必须是带版本的信封
// 用法: node tools/test-plan-store.mjs
import { loadPlans, savePlans, migratePlan, PLANS_KEY, PLANS_SCHEMA_VERSION } from '../src/pages/plan/store.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map),
  };
}

const validPlan = {
  id: 'p1', name: '莫斯科3日游草案', city: '莫斯科', date: '2026-11-01', source: 'rule',
  days: [{ day: 1, slots: { morning: ['红场'], afternoon: [], evening: [] }, tip: '' }],
};

// 1) 空存储
{
  const r = loadPlans(memStorage());
  if (!r.plans.length && !r.recovered) ok('空存储 → 空列表且不报警');
  else fail(`空存储返回 ${JSON.stringify(r)}`);
}

// 2) 旧版裸数组（兼容）
{
  const r = loadPlans(memStorage({ [PLANS_KEY]: JSON.stringify([validPlan]) }));
  if (r.plans.length === 1 && r.plans[0].id === 'p1' && !r.recovered) ok('旧版裸数组可读，自动补 schemaVersion');
  else fail(`旧版裸数组读取失败：${JSON.stringify(r)}`);
  if (r.plans[0].schemaVersion === PLANS_SCHEMA_VERSION) ok(`旧计划补上 schemaVersion=${PLANS_SCHEMA_VERSION}`);
  else fail(`schemaVersion 未补齐：${r.plans[0].schemaVersion}`);
}

// 3) 新版信封
{
  const env = JSON.stringify({ schemaVersion: 1, updatedAt: 1, plans: [validPlan] });
  const r = loadPlans(memStorage({ [PLANS_KEY]: env }));
  if (r.plans.length === 1 && !r.recovered) ok('新版信封可读');
  else fail(`新版信封读取失败：${JSON.stringify(r)}`);
}

// 4) 损坏 JSON → 备份原文 + 清空 + recovered
{
  const raw = '[{"id":"p1", 崩了';
  const st = memStorage({ [PLANS_KEY]: raw });
  const r = loadPlans(st, 1700000000000);
  const dump = st.dump();
  if (r.recovered && r.plans.length === 0 && !dump[PLANS_KEY]) ok('损坏 JSON → 空列表 + 原键已清除');
  else fail(`损坏 JSON 处理不符：${JSON.stringify(r)} / ${JSON.stringify(dump)}`);
  if (dump[r.backupKey] === raw) ok(`损坏原文已备份到 ${r.backupKey}`);
  else fail(`备份缺失或内容不符（backupKey=${r.backupKey}）`);
}

// 5) 结构不符（对象但无 plans 数组）同样走备份
{
  const raw = JSON.stringify({ foo: 1 });
  const st = memStorage({ [PLANS_KEY]: raw });
  const r = loadPlans(st, 1);
  if (r.recovered && st.dump()[r.backupKey] === raw) ok('结构不符 → 备份并重建空列表');
  else fail(`结构不符未走恢复流程：${JSON.stringify(r)}`);
}

// 6) 坏条目被丢弃、好条目保留
{
  const list = [validPlan, { id: '' }, { id: 'p2', days: 'x' }, null, { id: 'p3', days: [] }];
  const r = loadPlans(memStorage({ [PLANS_KEY]: JSON.stringify(list) }));
  if (r.plans.length === 1 && r.plans[0].id === 'p1' && !r.recovered) ok('坏条目被跳过，好条目保留');
  else fail(`坏条目处理不符：${JSON.stringify(r.plans.map(p => p.id))}`);
}

// 7) 槽位被规范化为字符串数组
{
  const p = migratePlan({ id: 'p9', source: 'ai', days: [{ day: 1, slots: { morning: ['a', null, 3], afternoon: 'oops' } }] });
  const s = p && p.days[0].slots;
  if (s && Array.isArray(s.morning) && s.morning.length === 1 && Array.isArray(s.afternoon) && !s.evening.length) ok('槽位规范化：非字符串剔除、缺失槽位补空数组');
  else fail(`槽位未规范化：${JSON.stringify(s)}`);
}

// 8) 写入格式是带版本的信封
{
  const st = memStorage();
  savePlans(st, [validPlan]);
  const saved = JSON.parse(st.dump()[PLANS_KEY]);
  if (saved.schemaVersion === PLANS_SCHEMA_VERSION && Array.isArray(saved.plans) && saved.plans.length === 1) ok('写入为 {schemaVersion, updatedAt, plans} 信封');
  else fail(`写入格式不符：${JSON.stringify(saved)}`);
  if (typeof saved.updatedAt === 'number') ok('updatedAt 已写入');
  else fail('updatedAt 缺失');
}

// 9) 写入失败时抛出（由调用方 toast + 保留内存态），不静默吞
{
  const st = memStorage();
  st.setItem = () => { throw new Error('QuotaExceededError'); };
  let threw = false;
  try { savePlans(st, [validPlan]); } catch { threw = true; }
  if (threw) ok('写入失败向上抛出，调用方才能提示用户');
  else fail('写入失败被静默吞掉');
}

if (bad) { console.error(`\n${bad} 项存储测试失败`); process.exit(1); }
console.log('\n计划存储质量门通过');
