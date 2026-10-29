#!/usr/bin/env node
// 动线 → placeId：给 data/routes.json 每个引用点位的步骤补 pointId（稳定 id）。
// point 名称保留为展示快照；改名时以 pointId 为准，名称不一致由 check-data 报错提醒同步。
// 解析规则：名称精确匹配；0 个或 >1 个候选直接中止，不猜、不写盘。
// 用法：
//   node tools/migrate-routes-pointid.mjs [数据目录，默认 ./data]          写盘
//   node tools/migrate-routes-pointid.mjs --check                          只检查（缺 pointId 或失效则 exit 1）
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const dir = resolve(args.find((a) => !a.startsWith('--')) || './data');

const routesPath = resolve(dir, 'routes.json');
const points = JSON.parse(readFileSync(resolve(dir, 'points.json'), 'utf8'));
const routes = JSON.parse(readFileSync(routesPath, 'utf8'));

const idByName = new Map();
for (const p of points) {
  if (!p || typeof p.name !== 'string' || !p.name) continue;
  idByName.set(p.name, idByName.has(p.name) ? null : p.id); // null = 重名，视为歧义
}

const errors = [];
let steps = 0;
let linked = 0;
let changed = 0;

const next = routes.map((r) => {
  if (!Array.isArray(r.steps)) return r;
  const outSteps = r.steps.map((s, si) => {
    if (!s || typeof s !== 'object' || !s.point) return s; // 纯串场步骤（只有 label），不参与点位索引
    steps += 1;
    const where = `动线「${r.name || r.id || '?'}」第 ${si + 1} 步「${s.point}」`;
    const id = idByName.get(s.point);
    if (!id) {
      errors.push(idByName.has(s.point)
        ? `${where} 名称对应多个点位，无法确定 placeId`
        : `${where} 找不到同名点位（points.json 里没有）`);
      return s;
    }
    if (s.pointId === id) { linked += 1; return s; }
    if (s.pointId && s.pointId !== id) {
      errors.push(`${where} 已有 pointId=${s.pointId} 与名称解析结果 ${id} 不一致`);
      return s;
    }
    changed += 1;
    const { pointId: _drop, ...rest } = s;
    return { point: rest.point, pointId: id, ...rest };
  });
  return { ...r, steps: outSteps };
});

if (errors.length) {
  for (const e of errors) console.error('❌ ' + e);
  console.error(`\n共 ${errors.length} 处问题，未写入任何文件（先修 data/points.json 或 routes.json 的名称）`);
  process.exit(1);
}

if (CHECK) {
  const missing = steps - linked;
  if (missing > 0) {
    console.error(`❌ 还有 ${missing}/${steps} 个动线步骤缺 pointId（跑 node tools/migrate-routes-pointid.mjs）`);
    process.exit(1);
  }
  console.log(`✅ 动线 ${routes.length} 条、${steps} 个点位步骤全部带 pointId`);
  process.exit(0);
}

if (!changed) {
  console.log(`✅ 无需迁移：${steps} 个点位步骤已全部带 pointId`);
  process.exit(0);
}

writeFileSync(routesPath, JSON.stringify(next, null, 1) + '\n');
console.log(`✅ 已为 ${changed} 个动线步骤补 pointId（共 ${routes.length} 条动线、${steps} 个点位步骤）`);
