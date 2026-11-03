#!/usr/bin/env node
// P1-6 changeset 应用/回滚工具（纯文件操作，不直连数据库、不依赖 PHP）
//
// 流程：管理页 ?a=changesets&status=ready 导出 JSON → 本工具应用到 data/points.json
//       → 台账（ledger）记录 run_id、操作人、前后值 → 可选回写数据库状态（--api + --token）
//
// 用法:
//   node tools/apply-changesets.mjs --input ready.json --by "ops" [--data data/points.json] [--ledger <path>] [--dry-run]
//   node tools/apply-changesets.mjs --rollback <run_id|last> --by "ops" [--data ...] [--ledger ...]
//   node tools/apply-changesets.mjs --list
//
// 退出码：0 成功 / 1 参数或文件错误 / 2 存在冲突（未静默覆盖）
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name, def = '') => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const has = (name) => args.includes('--' + name);
const die = (msg) => { console.error('❌ ' + msg); process.exit(1); };
const emit = (r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.conflicts && r.conflicts.length ? 2 : 0); };

const dataPath = resolve(flag('data', 'data/points.json'));
const ledgerPath = resolve(flag('ledger', 'tools/.cache/changeset-ledger.json'));
const by = flag('by', 'unknown');

// 与 api/index.php fact_value_error() 同口径的字段格式校验（避免工具放行接口拒绝的值）
const FIELD_LABEL = { hours: '营业时间', ticket: '门票', rating: '评分', note: '其他' };
function valueError(path, v) {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 200) return '新值需为 1-200 字的字符串';
  if (path === 'hours') {
    const m = v.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) return '营业时间需 HH:MM-HH:MM（如 09:00-18:00）';
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return '时间超出 00:00-23:59';
    if (h2 * 60 + m2 <= h1 * 60 + m1) return '结束时间必须晚于开始时间';
    return null;
  }
  if (path === 'ticket') {
    if (!/^(免费|￥?\d{1,5}(\.\d{1,2})?元?(?:\/人)?)$/u.test(v)) return '门票填「免费」或金额（如 100元 / ￥50）';
    return null;
  }
  if (path === 'rating') {
    if (!/^[0-5](\.[0-9])?$/.test(v)) return '评分需 0-5 的数字（可带一位小数）';
    return null;
  }
  return null;
}

function readJson(file, label) {
  if (!existsSync(file)) die(`${label}不存在：${file}`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`${label}不是合法 JSON：${e.message}`); }
}
function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp-' + randomBytes(4).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, file);
}

const data = readJson(dataPath, '数据文件');
if (!Array.isArray(data)) die('数据文件顶层必须是数组（points.json）');
const pointIndex = new Map(data.map((p) => [String(p.id), p]));

const ledger = existsSync(ledgerPath) ? readJson(ledgerPath, '台账') : { version: 1, runs: [] };
if (!Array.isArray(ledger.runs)) ledger.runs = [];

// 仍生效（未回滚）的 changeset id：重复执行据此跳过，保证幂等
const activeIds = new Set();
for (const run of ledger.runs) for (const e of run.entries || []) if (!e.rolled_back) activeIds.add(String(e.changeset_id));

function newRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `run-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${randomBytes(3).toString('hex')}`;
}
async function syncDb(status, runId, ids) {
  const api = flag('api', '');
  const token = flag('token', '');
  if (!api || !token) return { skipped: true };
  try {
    const r = await fetch(`${api}?a=changesets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ run_id: runId, status, ids, by }),
    });
    const j = await r.json();
    if (!r.ok || j.error) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, changed: j.changed };
  } catch (e) { return { ok: false, error: e.message }; }
}

if (has('list')) {
  emit({ ok: true, ledger: ledgerPath, runs: ledger.runs.map((r) => ({
    run_id: r.run_id, by: r.by, started_at: r.started_at,
    entries: (r.entries || []).length, rolled_back_at: r.rolled_back_at || null, conflicts: r.rollback_conflicts || null,
  })) });
}

/* ---------- 回滚：按「一次入库操作」（run_id）粒度，逆序写回 before ---------- */
const rollback = flag('rollback', '');
if (rollback) {
  const run = rollback === 'last' ? ledger.runs[ledger.runs.length - 1] : ledger.runs.find((r) => r.run_id === rollback);
  if (!run) die(`找不到 run：${rollback}`);
  if (run.rolled_back_at) die(`run ${run.run_id} 已经回滚过（${run.rolled_back_at}）`);
  const conflicts = []; const restored = [];
  for (const e of [...(run.entries || [])].reverse()) {
    if (e.rolled_back) continue;
    const p = pointIndex.get(String(e.point_id));
    if (!p) { conflicts.push({ changeset_id: e.changeset_id, point_id: e.point_id, why: '点位已不存在' }); continue; }
    const current = p[e.json_path];
    const cur = current === undefined || current === null ? null : String(current);
    if (cur !== String(e.after)) {
      // 被后续变更覆盖：给出提示并跳过，绝不静默覆盖
      conflicts.push({ changeset_id: e.changeset_id, point_id: e.point_id, json_path: e.json_path, why: '当前值已被后续变更覆盖', expected: String(e.after), current: cur });
      continue;
    }
    if (e.before === null) delete p[e.json_path];
    else p[e.json_path] = e.before;
    e.rolled_back = { at: new Date().toISOString(), by };
    restored.push({ changeset_id: e.changeset_id, point_id: e.point_id, json_path: e.json_path, before: e.before, after: e.after });
  }
  const now = new Date().toISOString();
  if (!has('dry-run')) {
    writeJsonAtomic(dataPath, data);
    if (conflicts.length) { run.rollback_conflicts = conflicts; run.partial_rollback_at = now; run.partial_rollback_by = by; }
    else { run.rolled_back_at = now; run.rolled_back_by = by; }
    writeJsonAtomic(ledgerPath, ledger);
  }
  const sync = has('dry-run') ? { skipped: true } : await syncDb('rolled_back', run.run_id, restored.map((x) => x.changeset_id));
  emit({ ok: !conflicts.length, action: 'rollback', run_id: run.run_id, restored, conflicts, dry_run: has('dry-run'), sync });
}

/* ---------- 应用：校验 → 写文件（原子替换）→ 记台账 ---------- */
const inputPath = resolve(flag('input', ''));
if (!inputPath || !existsSync(inputPath)) die('缺少 --input（管理页导出的 changesets JSON）或 --rollback/--list');
const input = readJson(inputPath, 'changeset 文件');
const items = Array.isArray(input) ? input : (input.items || []);
if (!Array.isArray(items) || !items.length) die('changeset 文件里没有 items');

const runId = flag('run-id', newRunId());
const dryRun = has('dry-run');
const applied = []; const skipped = []; const conflicts = [];

for (const it of items) {
  const id = String(it.id ?? '');
  if (!id) { conflicts.push({ why: '缺少 changeset id' }); continue; }
  if (activeIds.has(id)) { skipped.push({ id: +id, why: '已应用（幂等跳过）' }); continue; }
  if (it.status && it.status !== 'ready') { skipped.push({ id: +id, why: `状态为 ${it.status}` }); continue; }
  const p = pointIndex.get(String(it.point_id));
  if (!p) { conflicts.push({ id: +id, why: '点位不存在', point_id: it.point_id }); continue; }
  if (!FIELD_LABEL[it.json_path]) { conflicts.push({ id: +id, why: `字段非法：${it.json_path}` }); continue; }
  const bad = valueError(it.json_path, String(it.new_value ?? ''));
  if (bad) { conflicts.push({ id: +id, why: bad }); continue; }
  const current = p[it.json_path];
  const cur = current === undefined || current === null ? null : String(current);
  // 审核时记录的 before 与当前值不一致 → 数据已被别人改过，停下来人工确认
  if (it.before_value !== undefined && it.before_value !== null && cur !== String(it.before_value)) {
    conflicts.push({ id: +id, why: 'before 与当前值不一致（数据已被改动）', expected: String(it.before_value), current: cur });
    continue;
  }
  p[it.json_path] = String(it.new_value);
  applied.push({
    changeset_id: +id, submission_id: it.submission_id ?? null, point_id: String(it.point_id),
    json_path: it.json_path, before: cur, after: String(it.new_value), applied_at: new Date().toISOString(),
  });
  activeIds.add(id);
}

if (!dryRun && applied.length) {
  writeJsonAtomic(dataPath, data);
  ledger.runs.push({ run_id: runId, by, started_at: new Date().toISOString(), entries: applied });
  writeJsonAtomic(ledgerPath, ledger);
}
const sync = dryRun || !applied.length ? { skipped: true } : await syncDb('applied', runId, applied.map((x) => x.changeset_id));
emit({ ok: !conflicts.length, action: 'apply', run_id: runId, applied, skipped, conflicts, dry_run: dryRun, ledger: ledgerPath, sync });
