#!/usr/bin/env node
// API 契约质量门（N2）：api/index.php 无运行期测试环境（PHP+SQLite+nginx），
// 用静态契约守护「每个写端点必须过 session、管理端点必须 needAdmin、登录必须限流、
// 上传必须 MIME 白名单、AI 代理必须 SSRF 检查」——这些是安全底线，回归即红。
// 用法: node tools/test-api-contract.mjs
import { readFileSync } from 'node:fs';

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
const WRITE_ENDPOINTS = ['submit', 'my', 'photo', 'plan', 'ai_settings', 'ai_test'];
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
for (const name of ['accounts', 'pending', 'approve', 'reject']) {
  const s = find(name);
  if (!s) { fail(`缺少管理端点 ${name}`); continue; }
  assert(ADMIN_RE.test(s.body), `${name} 必须 needAdmin`);
}

// 3) 登录必须限流（防爆破）
{
  const s = find('login');
  assert(s && s.body.includes('rate_limit('), 'login 必须 rate_limit');
}

// 4) 内容投稿（含照片上传）必须 finfo 真实 MIME 探测 + 白名单；photo 端点本身是管理员的文件服务
{
  const s = find('submit');
  assert(s && s.body.includes('FILEINFO_MIME_TYPE'), 'submit 用 finfo 探测真实 MIME');
  assert(s && /image\/(jpeg|png|webp)/.test(s.body), 'submit 照片 MIME 白名单 jpeg/png/webp');
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

// 7) AI Key：加密失败必须关闭（P1-3），ai_test 复用已存 Key 必须锁定 endpoint（P1-9）
{
  assert(php.includes('function ai_key_seal(string $plain): ?string'), 'ai_key_seal 允许返回 null（加密失败）');
  assert(php.includes('ALLOW_PLAINTEXT_AI_KEY'), '明文兼容必须是显式开关');
  const set = find('ai_settings');
  assert(set && set.body.includes('ai_key_seal('), 'ai_settings 保存时调用 ai_key_seal');
  assert(set && set.body.includes('if ($sealed === null) out('), 'ai_settings 加密失败必须拒绝保存');
  assert(set && set.body.includes("'key_storage'"), 'ai_settings 回传加密状态');
  assert(set && !set.body.includes("'key' =>"), 'ai_settings 不回传 key 明文');
  const t = find('ai_test');
  assert(t && t.body.includes('savedEndpoint'), 'ai_test 读取已存 endpoint');
  assert(t && t.body.includes("rtrim($endpoint, '/') !== $savedEndpoint"), 'ai_test 复用已存 Key 必须匹配 endpoint');
  assert(t && t.body.includes("model LIKE 'test:%'"), 'ai_test 有每日次数上限');
}

// 8) plan 端点：routes 上下文必须有上限（P1-4，不依赖客户端自觉）
{
  const s = find('plan');
  assert(s && s.body.includes('array_slice($rts, 0, 10)'), 'routes 最多 10 条');
  assert(s && s.body.includes("array_slice(array_values(array_filter((array)($r['steps'] ?? []), 'is_array')), 0, 30)"), '每条 route 最多 30 步');
  assert(s && s.body.includes("mb_substr((string)($st['note'] ?? ''), 0, 120)"), '步骤 note 限长');
}

if (bad) { console.error(`\n${bad} 处 API 契约被破坏`); process.exit(1); }
console.log('\nAPI 契约质量门通过');
