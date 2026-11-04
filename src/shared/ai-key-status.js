// AI Key 加密状态文案：服务端只回状态位（key_storage/key_readable），不回 key 本身。
// account / friend 两处 AI 设置共用；纯函数，契约由 tools/test-ai-key-status.mjs 守护。
//
// 服务端状态（api/index.php 的 ai_settings GET）：
//   key_storage: 'missing' | 'encrypted' | 'plaintext'
//   key_readable: true | false | null（无 key 时为 null）
export function aiKeyStatusText(cfg) {
  const c = cfg || {};
  if (!c.has_key) return 'Key 状态：未保存';
  if (c.key_storage === 'plaintext') {
    return '⚠️ Key 状态：明文保存（服务器未启用加密，请管理员检查 AI_KEY_FILE）';
  }
  if (c.key_storage === 'encrypted' && c.key_readable === false) {
    return '⚠️ Key 状态：已加密，但服务器主密钥缺失/已轮换，无法解密；请重新填写';
  }
  if (c.key_storage === 'encrypted') return 'Key 状态：已加密保存';
  return 'Key 状态：已保存';
}
