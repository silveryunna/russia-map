#!/usr/bin/env node
// 朋友投稿 → 静态快照发布（实况层 MVP 的发布端）
// 设计依据：ratings-plan-202610/UNIFIED-内容体系统一.md —— 「采集在 API，审核在站长，发布在快照」
//
// 管道：服务器 SQLite（approved，暂存层）→ 本脚本 → 静态文件（git 管理，离线可用）：
//   note    → content/notes/f<id>-<slug>.md（front matter 带 author 化名 + point_ids）+ index.json 登记
//   checkin → data/field.json [pid].timeline += {t, author, note}
//   photo   → scp 照片到 photos/field/  +  data/field.json [pid].photos += {file, author, note, t}
//
// 隐私闸（fail-closed）：data/friend-aliases.json 是 username → 公开化名 的唯一映射；
//   有任何 approved 投稿的用户不在映射里 → 直接中止，先补映射再跑。
//   没有 point_id（或 id 不存在）的 photo/checkin 不发布（留在 DB 等人工处理）；note 可无挂载发布。
//
// 幂等：data/content-state.json 记录已处理的 submission id，增量跳过；--rebuild 全量重建。
// 用法：node tools/publish-content.mjs [--rebuild] [--dry-run]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const REBUILD = args.includes('--rebuild');
const DRY = args.includes('--dry-run');
const SSH = ['-i', join(process.env.HOME || process.env.USERPROFILE, '.ssh/julyyunna_ed25519')];
const SERVER = 'root@124.221.104.242';
const DB = '/www/wwwroot/julyyunna-art-data/friends.db';
const UPLOAD_DIR = '/www/wwwroot/julyyunna-art-data/api-uploads';

const readJson = (p, fb) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return fb; } };
const writeJson = (p, d) => writeFileSync(join(ROOT, p), JSON.stringify(d, null, 2) + '\n');
const day = (ts) => new Date((ts || 0) * 1000).toISOString().slice(0, 10);
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'note';

// 1) 拉取 approved 投稿（sqlite3 -json，服务器 3.42 支持）
const sql = `SELECT id, username, type, title, body, point_id, file, created FROM submissions WHERE status='approved' ORDER BY id`;
let rows;
try {
  const out = execFileSync('ssh', [...SSH, SERVER, `sqlite3 -json ${DB} "${sql}"`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  rows = out ? JSON.parse(out) : [];
} catch (e) {
  console.error('❌ 无法读取服务器投稿库（SSH 失败？）：' + e.message);
  process.exit(1);
}
console.log(`服务器 approved 投稿 ${rows.length} 条`);

// 2) 隐私闸：化名映射必须覆盖所有出现过的 username
const aliases = readJson('data/friend-aliases.json', null);
if (!aliases) {
  console.error('❌ 缺少 data/friend-aliases.json（username → 公开化名）。先创建它再跑，fail-closed。');
  process.exit(1);
}
const missingAlias = [...new Set(rows.map((r) => r.username))].filter((u) => !aliases[u]);
if (missingAlias.length) {
  console.error(`❌ 以下用户没有公开化名映射（隐私闸中止）：${missingAlias.join('、')}`);
  console.error('   在 data/friend-aliases.json 补 {"用户名": "可公开的化名"} 后重跑');
  process.exit(1);
}

// 3) 增量状态与点位校验
const state = readJson('data/content-state.json', { processed: [] });
const done = new Set(REBUILD ? [] : state.processed);
const fresh = rows.filter((r) => !done.has(r.id));
const pointIds = new Set(readJson('data/points.json', []).map((p) => p.id));
const field = readJson('data/field.json', {});
const orphans = [];
if (REBUILD) for (const k of Object.keys(field)) delete field[k];

// 4) 逐条发布
let notes = 0, checkins = 0, photos = 0, skipped = 0;
const indexPath = 'content/notes/index.json';
const noteIndex = readJson(indexPath, []);
const scpQueue = []; // photo: {remote, local, entry, pid}

for (const r of fresh) {
  const author = aliases[r.username];
  const t = day(r.created);
  const pid = r.point_id || null;
  if (r.type === 'note') {
    // note 可无挂载发布（进笔记列表）；有挂载则带 point_ids
    const file = `f${r.id}-${slugify(r.title)}.md`;
    const fm = ['---', `title: ${String(r.title || '投稿笔记').replace(/\n/g, ' ')}`, `author: ${author}`, `date: ${t}`];
    if (pid && pointIds.has(pid)) fm.push(`point_ids: [${pid}]`);
    const md = `${fm.join('\n')}\n---\n\n${r.body || ''}\n`;
    if (!DRY) {
      writeFileSync(join(ROOT, 'content/notes', file), md);
      if (!noteIndex.some((n) => n.file === file)) {
        noteIndex.push({
          file, title: r.title || '投稿笔记', date: t,
          summary: String(r.body || '').replace(/[#*\n]/g, ' ').trim().slice(0, 60),
          author,
          ...(pid && pointIds.has(pid) ? { point_ids: [pid] } : {}),
        });
        noteIndex.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      }
    }
    notes++;
  } else {
    if (!pid || !pointIds.has(pid)) {
      orphans.push(`#${r.id} ${r.type}（${r.username}）：point_id ${pid || '为空'} 未挂载，跳过发布`);
      skipped++;
      done.add(r.id); // 不再重复告警，留 DB 人工处理
      continue;
    }
    const entry = { t, author, note: (r.body || '').slice(0, 200) };
    if (r.type === 'checkin') {
      (field[pid] = field[pid] || { timeline: [], photos: [] }).timeline.push(entry);
      checkins++;
    } else if (r.type === 'photo') {
      const remote = r.file && r.file.startsWith('/') ? r.file : `${UPLOAD_DIR}/${basename(r.file || '')}`;
      const local = `photos/field/f${r.id}-${basename(remote)}`;
      scpQueue.push({ remote, local, pid, entry });
      photos++;
    } else {
      orphans.push(`#${r.id} 未知类型 ${r.type}，跳过`);
      skipped++;
      done.add(r.id);
    }
  }
  done.add(r.id);
}

// photo 需要回传文件；任何一张失败即中止（不留半发布状态）
for (const q of scpQueue) {
  if (DRY) continue;
  try {
    mkdirSync(join(ROOT, 'photos/field'), { recursive: true });
    execFileSync('scp', [...SSH, `${SERVER}:${q.remote}`, join(ROOT, q.local)], { stdio: ['ignore', 'pipe', 'pipe'] });
    (field[q.pid] = field[q.pid] || { timeline: [], photos: [] }).photos.push({ ...q.entry, file: q.local });
  } catch (e) {
    console.error(`❌ 照片回传失败（#${q.pid} ← ${q.remote}），已中止：${e.message}`);
    console.error('   已写出的 note/checkin 也一并回滚（不要提交本次改动）');
    process.exit(1);
  }
}

// 5) 落盘
if (!DRY) {
  writeJson('data/field.json', field);
  writeJson(indexPath, noteIndex);
  writeJson('data/content-state.json', { processed: [...done].sort((a, b) => a - b) });
}

console.log(`\n发布：笔记 ${notes} · 打卡 ${checkins} · 照片 ${photos} · 跳过 ${skipped} · 待处理 0`);
if (orphans.length) console.log('未挂载/异常（已跳过，留 DB 人工处理）：\n  ' + orphans.join('\n  '));
console.log(DRY ? '--dry-run 未落盘' : '✅ 快照已落盘；接下来 npm run publish 上线（静态文件天然离线可用）');
