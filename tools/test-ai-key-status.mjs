#!/usr/bin/env node
// AI Key 加密状态文案（P1-3）：服务端只回状态位，页面据此提示「加密 / 明文 / 未保存 / 无法解密」。
// 用法: node tools/test-ai-key-status.mjs
import { aiKeyStatusText } from '../src/shared/ai-key-status.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

assert(aiKeyStatusText(null) === 'Key 状态：未保存', '空配置 → 未保存');
assert(aiKeyStatusText({ has_key: false }) === 'Key 状态：未保存', '无 key → 未保存');

const plain = aiKeyStatusText({ has_key: true, key_storage: 'plaintext' });
assert(plain.includes('明文保存'), '明文 → 明确警告');
assert(plain.includes('AI_KEY_FILE'), '明文提示指明检查项');

const enc = aiKeyStatusText({ has_key: true, key_storage: 'encrypted', key_readable: true });
assert(enc === 'Key 状态：已加密保存', '已加密且可读 → 正常文案');

const unreadable = aiKeyStatusText({ has_key: true, key_storage: 'encrypted', key_readable: false });
assert(unreadable.includes('无法解密') && unreadable.includes('重新填写'), '密文不可读 → 提示重填');

const legacy = aiKeyStatusText({ has_key: true, key_storage: 'unknown', key_readable: true });
assert(legacy === 'Key 状态：已保存', '未知状态 → 保守文案（不谎称加密）');

const noStorage = aiKeyStatusText({ has_key: true });
assert(noStorage === 'Key 状态：已保存', '旧服务端无 key_storage 字段 → 兼容');

if (bad) { console.error(`\nAI Key 状态文案检查失败：${bad} 项`); process.exit(1); }
console.log('\nAI Key 状态文案检查通过');
