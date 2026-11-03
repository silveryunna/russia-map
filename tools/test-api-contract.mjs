#!/usr/bin/env node
// API 契约质量门（N2）：api/index.php 无运行期测试环境（PHP+SQLite+nginx），
// 用静态契约守护「每个写端点必须过 session、管理端点必须 needAdmin、登录必须限流、
// 上传必须 MIME 白名单、AI 代理必须 SSRF 检查」——这些是安全底线，回归即红。
// 用法: node tools/test-api-contract.mjs
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const php = readFileSync('api/index.php', 'utf8');

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// 按 `case 'x':` / `case 'a': case 'b':` 切分端点块（到下一个 case 或文件尾）
const sections = [];
const caseRe = /case '([a-z_]+)':(?: case '([a-z_]+)':)?/g;
let m;
const marks = [];
while ((m = caseRe.exec(php))) {
  marks.push({ start: m.index, names: [m[1], m[2]].filter(Boolean) });
}
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].start : php.length;
  sections.push({ names: marks[i].names, body: php.slice(marks[i].start, end) });
}
const find = (name) => sections.find(s => s.names.includes(name));

// 1) 所有写端点必须过 session_ok；logout 是幂等删除（按 bearer token 定位），单独断言
const WRITE_ENDPOINTS = ['submit', 'my', 'photo', 'plan', 'ai_settings', 'ai_test', 'report'];
for (const name of WRITE_ENDPOINTS) {
  const s = find(name);
  if (!s) { fail(`缺少端点 ${name}`); continue; }
  assert(s.body.includes('session_ok('), `${name} 必须校验 session`);
}
{
  const s = find('logout');
  assert(s && s.body.includes('bearer()'), 'logout 按 bearer token 幂等删除（无需 session_ok）');
}

// 2) 管理端点必须 needAdmin（session_ok 第三参 true；bearer() 含括号，不能用 [^)]* 匹配）
const ADMIN_RE = /session_ok\([\s\S]*?,\s*true\)/;
for (const name of ['accounts', 'pending', 'review', 'reports', 'changesets', 'report_handle']) {
  const s = find(name);
  if (!s) { fail(`缺少管理端点 ${name}`); continue; }
  assert(ADMIN_RE.test(s.body), `${name} 必须 needAdmin`);
}

// 3) 登录必须限流（防爆破）
{
  const s = find('login');
  assert(s && s.body.includes('rate_limit('), 'login 必须 rate_limit');
}

// 4) 内容投稿（含照片/纠错证据上传）必须 finfo 真实 MIME 探测 + 白名单；photo 端点本身是管理员的文件服务
{
  const s = find('submit');
  assert(s && s.body.includes('save_image_data_url('), 'submit 的图片与证据走统一落盘函数');
  assert(php.includes('function save_image_data_url(') && php.includes('FILEINFO_MIME_TYPE'), '落盘函数用 finfo 探测真实 MIME');
  assert(/image\/(jpeg|png|webp)/.test(php), '照片 MIME 白名单 jpeg/png/webp');
  const p = find('photo');
  assert(p && ADMIN_RE.test(p.body), 'photo（文件服务）必须 needAdmin');
}

// 5) AI 代理必须 SSRF 检查
{
  assert(php.includes('function ssrf_check('), '定义 ssrf_check');
  assert(php.includes('ssrf_check(') && php.indexOf('ssrf_check(', php.indexOf('function ssrf_check(') + 10) > 0, 'ssrf_check 必须被实际调用');
  const s = find('ai_test');
  assert(!s || s.body.includes('session_ok('), 'ai_test 若在端点列表内也必须过 session');
}

// 6) 输出统一走 out()（json_encode + http_response_code）
{
  assert(php.includes('function out('), '定义统一 out()');
  assert((php.match(/[^a-zA-Z_]out\(/g) || []).length >= 5, '端点统一用 out() 响应');
}

// 7) AI 治理（P1-7）：IP 维度限流、可信代理解析、熔断告警去重、幂等计费、公开配额结构
{
  // 429 必须带 Retry-After（客户端/代理据此决定何时重试）
  assert(php.includes("header('Retry-After: '"), '限流 429 统一带 Retry-After');
  assert(sections.length > 0 && find('plan') && find('plan').body.includes('out_retry('), 'plan 端点用 out_retry 返回 429');

  // 取 IP：默认只信 REMOTE_ADDR；仅当直连来源命中 trusted_proxies 才解析 XFF
  assert(php.includes('function client_ip('), '定义 client_ip()');
  assert(php.includes("$GLOBALS['CONF']['trusted_proxies'] ?? []"), '可信代理列表来自配置，默认空数组');
  const trustIdx = php.indexOf("['trusted_proxies']");
  const xffIdx = php.indexOf('HTTP_X_FORWARDED_FOR');
  assert(trustIdx > 0 && xffIdx > trustIdx, 'XFF 解析位于可信代理判断之后（伪造头默认不生效）');
  assert(/if \(!\$trusted \|\| !ip_in_list\(\$remote, \$trusted\)\) return \$remote;/.test(php), '非可信直连来源直接返回 REMOTE_ADDR');
  assert(/foreach \(array_reverse\(array_map\('trim', explode\(',', \$xff\)\)\) as \$hop\)/.test(php), 'XFF 从右往左取第一个不可信地址');

  // IP 维度限流：滑动窗口命中表 + 与账号日额度并存
  assert(php.includes('function ip_rate_status(') && php.includes('function ip_rate_record('), '定义 IP 滑动窗口计数');
  assert(/CREATE TABLE IF NOT EXISTS ai_ip_hits/.test(php) && /idx_ai_ip_hits/.test(php), 'IP 命中表与索引');
  const plan = find('plan');
  assert(plan && plan.body.includes('ip_rate_status('), 'plan 必须做 IP 维度限流');
  assert(plan && plan.body.includes('ip_rate_record('), '真正发起生成才记一次 IP 命中（重放/被拒不占额度）');
  assert(plan && plan.body.includes('$ips[\'remaining\'] <= 0'), 'IP 超限直接 429');
  // 参数在策略里，不散落代码
  assert(/function ai_policy\(/.test(php) && /'ip_rate_max' =>/.test(php) && /'ip_rate_window' =>/.test(php), 'IP 限流参数写入 ai_policy 配置');
  assert(/'ip_rate_max' => max\(1, \(int\)\(\$rows\['ip_rate_max'\] \?\? 10\)\)/.test(php), 'IP 限流默认 10 次');
  assert(/'ip_rate_window' => max\(60, \(int\)\(\$rows\['ip_rate_window'\] \?\? 600\)\)/.test(php), 'IP 窗口默认 600 秒');

  // 告警：60% / 80%，同周期同阈值只告一次，结构化日志 + 管理页可见
  assert(/CREATE TABLE IF NOT EXISTS ai_alerts/.test(php), '告警表');
  assert(/UNIQUE\(period, threshold\)/.test(php), '告警按「周期+阈值」唯一（去重）');
  assert(/INSERT OR IGNORE INTO ai_alerts/.test(php), '告警写入用 INSERT OR IGNORE');
  assert(/foreach \(\[60, 80\] as \$th\)/.test(php), '阈值 60% / 80%');
  assert(/\[ai_alert\]/.test(php) && /json_encode\(\[[\s\S]*?'period' => \$period/.test(php), '告警写结构化 JSON 日志');
  const usage = find('ai_usage');
  assert(usage && usage.body.includes("'alerts'"), 'ai_usage 返回告警历史（管理页告警条）');
  assert(usage && usage.body.includes('ok IN (0,1)'), '用量明细排除待定/幂等占位行');

  // 幂等计费：同 idem 只成功计费一次，重放返回已存结果
  assert(/CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_calls_idem ON ai_calls\(idem\)/.test(php), 'ai_calls 的 idem 唯一索引');
  assert(plan && plan.body.includes('duplicate') && /\(int\)\$prev\['ok'\] === 2/.test(plan.body), '同 idem 并发生成直接拒绝，避免重复计费');
  assert(plan && plan.body.includes('ai_calls WHERE idem=?') && plan.body.includes('result=?'), '成功结果落库供重放');

  // 公开配额结构：未登录也能拿到 IP 维度剩余次数
  const policy = find('ai_policy');
  assert(policy && policy.body.includes('session_peek('), 'ai_policy GET 不强制登录（匿名可读配额）');
  assert(policy && policy.body.includes("'anonymous' =>") && policy.body.includes("'ip_limit' =>"), '配额接口返回 anonymous / ip_limit 结构');
  assert(policy && policy.body.includes("'remaining_today' =>"), '配额接口返回 remaining_today');
  assert(policy && policy.body.includes('if (!$isAdmin)'), '策略写入仍要求管理员');
}

// 8) 数据库可靠性（P1-8）：WAL/连接 PRAGMA、在线快照备份、恢复演练文档
{
  // 连接初始化：WAL + 三条连接级 PRAGMA，失败要降级并留日志，不能白页
  assert(php.includes("$db->exec('PRAGMA busy_timeout=5000')"), '连接设置 busy_timeout=5000');
  assert(php.includes("$db->exec('PRAGMA synchronous=NORMAL')"), 'WAL 下 synchronous=NORMAL');
  assert(php.includes("$db->exec('PRAGMA foreign_keys=ON')"), '开启 foreign_keys');
  assert(/PRAGMA journal_mode=WAL/.test(php) && /if \(\$mode !== 'wal'\) error_log/.test(php), 'WAL 不可用时记录降级日志');
  assert(/catch \(PDOException \$e\)[\s\S]{0,160}回退默认 journal/.test(php), 'WAL 抛错时回退默认模式');
  assert(/连接级 PRAGMA/.test(php) && /journal_mode 持久化/.test(php), '注明哪些 PRAGMA 每次连接都要设');

  const scriptUrl = new URL('../deploy/backup-db.php', import.meta.url);
  assert(existsSync(scriptUrl), '备份脚本存在（deploy/backup-db.php）');
  const bak = readFileSync(scriptUrl, 'utf8');
  assert(/\bVACUUM INTO\b/.test(bak) && !/shell_exec|exec\(\s*['"]cp/.test(bak), '用 VACUUM INTO 在线快照，不做 cp');
  assert(/PRAGMA integrity_check/.test(bak), '备份后跑 integrity_check');
  assert(/if \(\$tables < 1\) fail|if \(\(int\)\$tables < 1\)|tables < 1/.test(bak), '校验快照内至少有一张可读表');
  assert(/--keep=/.test(bak) && /TRAVEL_BACKUP_KEEP/.test(bak), '保留份数参数化（--keep / TRAVEL_BACKUP_KEEP）');
  assert(/\?\? getenv\('TRAVEL_BACKUP_KEEP'\) \?: 14|getenv\('TRAVEL_BACKUP_KEEP'\) \?: 14/.test(bak), '默认保留 14 份');
  assert(/array_slice\(\$files, \$keep\)/.test(bak), '按保留份数滚动删除旧快照');
  assert(/exit\(1\)/.test(bak), '失败路径 exit(1)（非零退出）');
  assert(/cli_arg\(\$argv, 'db'\)/.test(bak) && /TRAVEL_DB_PATH/.test(bak), '数据库路径来自参数/配置，不写死');
  assert(!/\/www\/wwwroot|C:\\\\|D:\\\\/.test(bak), '备份脚本无真实路径');

  const docUrl = new URL('../docs/RESTORE-RUNBOOK.md', import.meta.url);
  assert(existsSync(docUrl), '恢复演练文档存在（docs/RESTORE-RUNBOOK.md）');
  const doc = readFileSync(docUrl, 'utf8');
  for (const h of ['## 1. 停写', '## 2. 取快照', '## 3. 恢复到新库', '## 4. 校验表数量与行数', '## 5. 起服务', '## 6. 只读验证', '## 7. 确认没丢最近数据', '## 8. 回滚路径', '## 9. 演练记录']) {
    assert(doc.includes(h), `演练文档包含章节：${h}`);
  }
  assert(doc.includes('| 日期 | 快照名 | 结果'), '演练记录表格存在且留空待填');

  // 实跑失败路径：无参数必须非零退出并给出可读错误（有 PHP 才跑，本机无 PHP 会明确跳过）
  const probe = spawnSync('php', ['-v'], { encoding: 'utf8' });
  if (probe.error && probe.error.code === 'ENOENT') {
    console.log('⚠️ 未检测到 PHP 运行时，跳过备份脚本实跑（静态断言已覆盖参数与退出码）');
  } else {
    const r = spawnSync('php', [fileURLToPath(scriptUrl)], { encoding: 'utf8' });
    assert(r.status !== 0, '无参数调用备份脚本返回非零退出码');
    assert(/缺少参数/.test(String(r.stderr)), '失败时 stderr 输出可读错误');
  }
}

// 9) P1-6 内容维护回路 + A-16 举报闭环（投稿类型 → 审核入库 → 回滚 → 举报处理）
{
  // 投稿类型扩展：在既有投稿机制上加 fact，不新建系统
  const sub = find('submit');
  assert(php.includes('const FACT_FIELDS') && php.includes('const FACT_JSON_PATH'), '定义纠错字段白名单与 JSON 路径映射');
  assert(sub && /in_array\(\$type, \['photo', 'note', 'checkin', 'fact'\]/.test(sub.body), 'submit 支持 photo/note/checkin/fact');
  assert(sub && sub.body.includes('target_field,new_value,source_url'), '投稿入库记录目标字段/新值/来源');
  assert(sub && /if \(!isset\(\$idx\[\$point\]\)\) out\(\['error' => '点位不存在或已下线'\]/.test(sub.body), 'fact 投稿要求点位存在');
  assert(sub && sub.body.includes('该点位所在板块已隐藏'), '隐藏板块禁止投稿（403）');
  assert(php.includes('function fact_value_error('), '定义字段值格式校验');
  for (const msg of ['营业时间需 HH:MM-HH:MM', '门票填「免费」或金额', '评分需 0-5 的数字']) {
    assert(php.includes(msg), `值格式校验覆盖：${msg}`);
  }
  assert(sub && sub.body.includes('来源链接与证据截图至少填一项'), '来源链接与证据至少一项');
  assert(sub && sub.body.includes('save_image_data_url($evidence)'), '证据截图落盘复用照片 MIME 校验');

  // 状态机 + 审核留痕 + approved fact 只生成 changeset
  const rev = find('review');
  assert(rev && /'approve' => 'approved'/.test(rev.body) && /'reject' => 'rejected'/.test(rev.body) && /'needs_more' => 'needs_more'/.test(rev.body), '状态机 pending/needs_more → approved/rejected/needs_more');
  assert(rev && rev.body.includes('INSERT INTO submission_logs') && rev.body.includes('actor,reason,created'), '每次状态变更记录操作人/时间/理由');
  assert(rev && rev.body.includes('AND status IN ("pending","needs_more")'), '审核带状态守卫，防重复/并发越级');
  assert(rev && rev.body.includes('INSERT INTO changesets') && rev.body.includes('ON CONFLICT(submission_id)'), '批准的 fact 生成 changeset（不直接改 data/）');
  assert(rev && rev.body.includes('before_value') && rev.body.includes("array_key_exists($path, $p)"), 'changeset 记录 before 值');
  assert(/if \(\$to === 'approved' && \$row\['type'\] === 'fact'\)/.test(rev.body), '只有 approved 的 fact 才生成变更');
  const cset = find('changesets');
  assert(cset && cset.body.includes('rolled_back') && cset.body.includes('changeset_logs'), 'changeset 支持 applied/rolled_back 与审计日志');
  assert(cset && cset.body.includes('applied_by'), '回写应用操作人');

  // 举报闭环：表结构、去重、限流、24h 时限、处理/封禁日志
  assert(/CREATE TABLE IF NOT EXISTS reports/.test(php) && /UNIQUE\(reporter, target_type, target_id\)/.test(php), '举报表按「举报人+对象」唯一去重');
  assert(/CREATE TABLE IF NOT EXISTS report_logs/.test(php), '举报处理/封禁日志表');
  assert(/CREATE TABLE IF NOT EXISTS report_hits/.test(php), '举报 IP 命中表（限流）');
  const rep = find('report');
  assert(rep && rep.body.includes("'duplicate' => true"), '重复举报返回已存在记录（去重）');
  assert(rep && rep.body.includes('report_rate_status(') && rep.body.includes('out_retry('), '举报走 IP 频率限制（429 + Retry-After）');
  assert(rep && rep.body.includes('report_rate_record('), '仅新举报才记命中');
  assert(rep && rep.body.includes('REPORT_REASONS') && rep.body.includes("选择「其他」时请填写说明"), '原因分类 + 其他必填说明');
  assert(rep && rep.body.includes('举报对象不存在'), '举报前校验对象存在');
  const reps = find('reports');
  assert(reps && reps.body.includes('86400') && reps.body.includes("'overdue'"), '管理端 24h 超时标记');
  assert(reps && reps.body.includes('report_logs'), '管理端可查处理与封禁日志');
  const rh = find('report_handle');
  for (const a of ["'remove'", "'dismiss'", "'ban'"]) assert(rh && rh.body.includes(a), `举报处理动作：${a}`);
  assert(rh && rh.body.includes('UPDATE accounts SET banned=1') && rh.body.includes('DELETE FROM sessions'), '封禁投稿者同时清会话');
  assert(rh && rh.body.includes('INSERT INTO report_logs'), '处理动作写日志');
  const ban = find('ban');
  assert(ban && ban.body.includes('unban'), '账号支持解除封禁（日志可查）');
  const login = find('login');
  assert(login && login.body.includes('账号已被封禁'), '封禁账号无法登录');

  // 管理页入口与投稿卡片举报入口（前端静态断言）
  const acc = readFileSync(new URL('../src/pages/account.js', import.meta.url), 'utf8');
  const fr = readFileSync(new URL('../src/pages/friend.js', import.meta.url), 'utf8');
  const rp = readFileSync(new URL('../src/shared/report.js', import.meta.url), 'utf8');
  for (const k of ['data-tab="reports"', 'data-tab="changesets"', 'data-ok=', 'data-more=', 'data-no=', 'id="ad-export"', 'report_handle', '#ad-rst', 'data-h=']) {
    assert(acc.includes(k), `管理页入口存在：${k}`);
  }
  for (const k of ["['fact', '🛠 纠错']", "type: 'fact'", 'openReportDialog', 'data-report=', "'needs_more'"]) {
    assert(fr.includes(k), `投稿页入口存在：${k}`);
  }
  assert(rp.includes('export const REPORT_REASONS') && rp.includes('duplicate'), '举报弹窗含原因分类与重复提示');
}


// 9.1) apply 工具实跑（临时目录，不碰真实 data/）：幂等、非法值、回滚、冲突不覆盖
{
  const dir = mkdtempSync(join(tmpdir(), 'p16-'));
  try {
    const data = join(dir, 'points.json');
    const ledger = join(dir, 'ledger.json');
    writeFileSync(data, JSON.stringify([{ id: 'p001', name: '红场', city: '莫斯科', ticket: '免费', hours: '09:00-18:00', note: 'x' }], null, 2) + '\n');
    const tool = fileURLToPath(new URL('./apply-changesets.mjs', import.meta.url));
    const run = (...a) => spawnSync(process.execPath, [tool, ...a, '--data', data, '--ledger', ledger, '--by', 'gate'], { encoding: 'utf8' });
    const read = () => JSON.parse(readFileSync(data, 'utf8'));
    const base = { id: 1, submission_id: 9, point_id: 'p001', json_path: 'ticket', new_value: '100元', before_value: '免费', status: 'ready' };
    const input = (items) => {
      const f = join(dir, `in-${Math.random().toString(16).slice(2)}.json`);
      writeFileSync(f, JSON.stringify({ version: 1, items }));
      return f;
    };

    const a1 = JSON.parse(run('--input', input([base])).stdout || '{}');
    assert(a1.applied && a1.applied.length === 1, '工具应用一条 changeset');
    assert(read()[0].ticket === '100元', '应用后数据文件写入新值');
    const a2 = JSON.parse(run('--input', input([base])).stdout || '{}');
    assert(a2.applied && a2.applied.length === 0 && a2.skipped[0].why.includes('幂等'), '重复执行幂等（不重复写入）');

    const rb = JSON.parse(run('--rollback', a1.run_id).stdout || '{}');
    assert(rb.restored && rb.restored.length === 1 && read()[0].ticket === '免费', '按一次入库（run_id）回滚写回 before');
    assert(JSON.parse(run('--list').stdout || '{}').runs.find(x => x.run_id === a1.run_id).rolled_back_at, '台账记录回滚时间');

    const b1 = JSON.parse(run('--input', input([{ ...base, id: 2, new_value: '200元' }])).stdout || '{}');
    const cur = read(); cur[0].ticket = '300元';
    writeFileSync(data, JSON.stringify(cur, null, 2) + '\n');
    const r = spawnSync(process.execPath, [tool, '--rollback', b1.run_id, '--data', data, '--ledger', ledger], { encoding: 'utf8' });
    assert(r.status === 2, '已被后续变更覆盖时回滚返回非零（冲突）');
    const rj = JSON.parse(r.stdout || '{}');
    assert(rj.conflicts && rj.conflicts.length === 1 && rj.conflicts[0].current === '300元', '回滚冲突给出当前值提示');
    assert(read()[0].ticket === '300元', '冲突时不静默覆盖');

    const bad = spawnSync(process.execPath, [tool, '--input', input([{ ...base, id: 3, json_path: 'hours', new_value: '25:00-26:00', before_value: null }]), '--data', data, '--ledger', ledger], { encoding: 'utf8' });
    assert(bad.status === 2 && JSON.parse(bad.stdout || '{}').conflicts.length === 1, '非法时间格式被工具拒绝');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (bad) { console.error(`\n${bad} 处 API 契约被破坏`); process.exit(1); }
console.log('\nAPI 契约质量门通过');
