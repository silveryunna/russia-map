#!/usr/bin/env node
// 一键发布：体检 → check-data → vite build → assemble → 产物同步回仓库根 → commit → push
// 服务器 webroot 是 git 工作区（root crontab 每 2 分钟 git reset --hard origin/main），
// 所以"发布"= 把构建产物提交进 main；push 后 ≤2 分钟自动上线，无需 scp。
//
// 用法：
//   node tools/publish.mjs [-m "commit 信息"] [--dry-run] [--wait]
//     --dry-run  构建+同步但不动 git（用来预览产物差异）
//     --wait     push 后通过 ssh 轮询服务器 HEAD，直到追平（最多 ~4 分钟）
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const WAIT = args.includes('--wait');
const mIdx = args.indexOf('-m');
const MSG = mIdx >= 0 ? args[mIdx + 1] : null;

// 发布时同步回仓库根的文件集合：9 个入口 HTML + sw.js + assets/ 产物
const HTML_FILES = ['index.html', 'map.html', 'list.html', 'album.html', 'notes.html', 'plan.html', 'friend.html', 'account.html', 'admin.html'];
const ASSETS_KEEP = new Set(['tdt-key.js', 'tdt-key.example.js']); // 豁免：非构建产物，不入 git/不上线

const run = (cmd, cmdArgs, opt = {}) =>
  (execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opt }) || '').trim();
const step = (n, s) => console.log(`\n[${n}] ${s}`);

// git 走代理：沿用会话约定的 clash 端口；env 里有 HTTP_PROXY 时优先用
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const git = (gitArgs, opt = {}) => run('git', ['-c', `http.proxy=${proxy}`, ...gitArgs], opt);

// ── 1) 体检：工作区干净 + 不落后远端（防覆盖并行会话的提交） ──
step(1, '体检');
const dirty = run('git', ['status', '--porcelain']);
if (dirty) {
  console.error('❌ 工作区有未提交改动，先 commit 或 stash 再发布：\n' + dirty);
  process.exit(1);
}
try {
  git(['fetch', 'origin', 'main'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const behind = +run('git', ['rev-list', '--count', 'HEAD..origin/main']);
  if (behind > 0) {
    console.error(`❌ 本地落后 origin/main ${behind} 个提交，先 git pull --rebase`);
    process.exit(1);
  }
  console.log('✅ 工作区干净，且不落后 origin/main');
} catch {
  console.warn('⚠️ fetch origin 失败（代理未开？），跳过远端同步检查');
}

// ── 2) 数据校验 ──
step(2, 'check-data');
run('node', ['tools/check-data.mjs', './data'], { stdio: 'inherit' });

// ── 3) 构建 + 组装（assemble 内注入 sw.js VERSION = git short sha） ──
step(3, 'vite build + assemble');
run('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
run('node', ['tools/assemble.mjs'], { stdio: 'inherit' });

// ── 4) 产物同步回仓库根（site-out → /） ──
step(4, '同步 site-out → 仓库根');
for (const f of [...HTML_FILES, 'sw.js']) copyFileSync(join(ROOT, 'site-out', f), join(ROOT, f));
// assets/：清掉旧哈希产物（豁免 tdt-key*），再拷新产物
const assetsDir = join(ROOT, 'assets');
for (const f of readdirSync(assetsDir)) {
  if (!ASSETS_KEEP.has(f)) rmSync(join(assetsDir, f));
}
for (const f of readdirSync(join(ROOT, 'site-out', 'assets'))) {
  if (!ASSETS_KEEP.has(f)) copyFileSync(join(ROOT, 'site-out', 'assets', f), join(assetsDir, f));
}
console.log('✅ 9 个 HTML + sw.js + assets/ 已同步');

// ── 5) ESM 严格解析自检（白屏事故防线，CI 也会再查一遍） ──
step(5, 'ESM 严格解析');
execSync(
  `node --experimental-vm-modules tools/check-esm.mjs`,
  { cwd: ROOT, stdio: 'inherit' },
);

const changed = run('git', ['status', '--porcelain']);
if (!changed) {
  console.log('\n产物与仓库一致，无变化，无需发布');
  process.exit(0);
}
console.log('\n产物变更：\n' + changed);

if (DRY) {
  console.log('\n--dry-run：不动 git，结束');
  process.exit(0);
}

// ── 6) commit + push ──
step(6, 'commit + push');
git(['add', '-A', '--', ...HTML_FILES, 'sw.js', 'assets']);
const sha = run('git', ['rev-parse', '--short', 'HEAD']);
git(['commit', '-m', MSG || `publish: 构建产物同步（基于 ${sha}）`]);
git(['push', 'origin', 'main'], { stdio: 'inherit' });
const newSha = run('git', ['rev-parse', '--short', 'HEAD']);
console.log(`✅ 已推送 ${newSha}，服务器 cron 每 2 分钟拉取，稍后自动上线`);

// ── 7) 可选：等服务器追平 ──
if (WAIT) {
  step(7, '等服务器追平（最多 ~4 分钟）');
  const key = process.env.HOME + '/.ssh/julyyunna_ed25519';
  const deadline = Date.now() + 4 * 60 * 1000;
  let synced = false;
  while (Date.now() < deadline) {
    try {
      const remote = execFileSync('ssh', [
        '-i', key, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=8',
        'root@124.221.104.242', 'cd /www/wwwroot/julyyunna.art && git rev-parse --short HEAD',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      if (remote === newSha) { synced = true; break; }
    } catch { /* ssh 失败重试 */ }
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log(synced ? `✅ 服务器已追平 ${newSha}，线上即是此版本` : '⚠️ 4 分钟内未追平，请手动检查服务器 cron');
}
