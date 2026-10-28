#!/usr/bin/env node
// 部署前体检：防止"未提交改动被 scp 覆盖"与"落后远端被旧版本回滚"（双机并发防护之一）
// 用法: node tools/deploy-check.mjs [要部署的子路径，如 data/ assets/]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd, args, opt = {}) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opt }).trim(); }
  catch (e) { return null; }
};
let bad = 0;
const die = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

// 1) 待部署路径不得有未提交改动（否则服务器内容与 git 历史分叉）
const scope = process.argv[2] || 'data/';
const dirty = run('git', ['status', '--porcelain', '--', scope]);
if (dirty) die(`${scope} 有未提交改动，先 commit：\n${dirty}`);
else ok(`${scope} 工作区干净`);

// 2) 尽力同步远端并比较（无代理时 fetch 失败仅警告）
const fetched = run('git', ['fetch', 'origin', 'main'], { timeout: 30000 });
if (fetched === null) {
  console.warn('⚠️ 无法 fetch origin/main（无代理？），跳过远端同步检查');
} else {
  const behind = +(run('git', ['rev-list', '--count', 'HEAD..origin/main']) ?? 0);
  const ahead = +(run('git', ['rev-list', '--count', 'origin/main..HEAD']) ?? 0);
  if (behind > 0) die(`本地落后 origin/main ${behind} 个提交——先 git pull --rebase，否则你的部署会回滚另一台机器的提交`);
  else ok('本地不落后远端');
  if (ahead > 0) console.warn(`⚠️ 本地领先 origin/main ${ahead} 个提交：先 push 再部署（服务器只认 origin/main，不 push 的提交永不上线）`);
}

// 3) 数据可解析（防手改半截 JSON 直接上服务器）
try {
  const pts = JSON.parse(readFileSync('data/points.json', 'utf8'));
  ok(`points.json 可解析（${pts.length} 点）`);
} catch (e) { die('points.json 解析失败：' + e.message); }

if (bad) { console.error(`\n${bad} 个问题，禁止部署`); process.exit(1); }
ok('可以部署');
