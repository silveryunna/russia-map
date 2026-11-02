#!/usr/bin/env node
// 审计快照（N3）：外部审计/复核报告里的一切数字由本脚本一键产出，
// 人工只写判断。输出的 JSON 可以直接贴进审计报告的「量化现状」表。
// 用法: node tools/audit-snapshot.mjs            # 打印 JSON
//       node tools/audit-snapshot.mjs --markdown  # 打印 markdown 片段
import { readFileSync, readdirSync, statSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const j = (p) => JSON.parse(read(p));

const points = j('data/points.json');
const routes = j('data/routes.json');
const matrix = j('data/transit-matrix.json');
const factsManifest = j('data/facts/manifest.json');

let factsTotal = 0;
let factsVerified = 0;
let factsOfficialPoints = new Set();
let factsExpired = 0;
const today = new Date().toISOString().slice(0, 10);
for (const f of factsManifest.files) {
  const doc = j(`data/facts/${f}`);
  for (const fact of doc.facts || []) {
    factsTotal++;
    if (fact.status === 'verified') {
      factsVerified++;
      if (fact.sourceType === 'official') factsOfficialPoints.add(fact.pointId);
    }
    if (fact.reviewAfter && /^\d{4}-\d{2}-\d{2}$/.test(fact.reviewAfter) && fact.reviewAfter < today) factsExpired++;
  }
}

const pts = Array.isArray(points) ? points : points.points;
const pending = pts.filter(p => p.pending).length;
const matrixEntries = Array.isArray(matrix.entries) ? matrix.entries.length : 0;

const testScript = j('package.json').scripts.test;
const gates = String(testScript).split('&&').length;
const mutations = (read('tools/mutation-test.mjs').match(/M\.push\(/g) || []).length;
const testFiles = readdirSync('tools').filter(f => /^(test-|coords-test|sw-policy-test|check-doc-facts)/.test(f) && f.endsWith('.mjs')).length;

let srcLoc = 0;
for (const f of readdirSync('src', { recursive: true })) {
  if (String(f).endsWith('.js')) srcLoc += read(`src/${f}`).split('\n').length;
}
let assetBytes = 0;
for (const f of readdirSync('assets').filter(f => f.endsWith('.js'))) assetBytes += statSync(`assets/${f}`).size;

const snapshot = {
  generatedAt: today,
  head: (() => { try { return read('.git/HEAD').split('/').pop().trim(); } catch { return ''; } })(),
  points: pts.length,
  pointsPending: pending,
  routes: routes.length,
  facts: { total: factsTotal, verified: factsVerified, officialPoints: factsOfficialPoints.size, expired: factsExpired },
  transitMatrix: {
    entries: matrixEntries,
    walking: matrix.entries.filter(e => e.mode === 'walking').length,
    car: matrix.entries.filter(e => e.mode === 'car').length,
  },
  qualityGates: gates,
  mutationTests: mutations,
  testFiles,
  srcLocJs: srcLoc,
  assetBytesJs: assetBytes,
};

if (process.argv.includes('--markdown')) {
  const f = snapshot.facts;
  console.log(`| 维度 | 实测值 |`);
  console.log(`|---|---|`);
  console.log(`| 点位 | ${snapshot.points}（pending ${snapshot.pointsPending}） |`);
  console.log(`| 动线 | ${snapshot.routes} 条 |`);
  console.log(`| 事实账本 | ${f.total} 条 / verified ${f.verified} / official 覆盖 ${f.officialPoints} 点位 / 已过期 ${f.expired} |`);
  console.log(`| 交通矩阵 | ${snapshot.transitMatrix.entries} 段（walking ${snapshot.transitMatrix.walking} / car ${snapshot.transitMatrix.car}） |`);
  console.log(`| 质量门 | npm test ${snapshot.qualityGates} 道 · 变异 ${snapshot.mutationTests} · test-* ${snapshot.testFiles} 个 |`);
  console.log(`| 规模 | src JS ${snapshot.srcLocJs} 行 · assets JS ${(snapshot.assetBytesJs / 1024).toFixed(1)} KB |`);
} else {
  console.log(JSON.stringify(snapshot, null, 2));
}
