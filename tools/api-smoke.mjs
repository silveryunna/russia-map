// 腾讯云节点 API 全链路测试（中文 payload 走 node 避免 GBK 问题）
const BASE = 'https://julyyunna.art/api/index.php';
let admin = '', friend = '', fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!cond) fail++; };

async function post(action, body, token) {
  const r = await fetch(`${BASE}?a=${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function get(action, token) {
  const r = await fetch(`${BASE}?a=${action}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

(async () => {
  // 页面 200
  for (const p of ['friend.html', 'account.html', 'assets/friend-v1.js', 'assets/friend-v1.css']) {
    const r = await fetch(`https://julyyunna.art/${p}`);
    ok(`GET ${p} = ${r.status}`, r.status === 200);
  }

  // 管理员登录（密码从环境变量读）
  let r = await post('login', { user: 'admin', pass: process.env.ADMIN_PASS });
  ok('admin 登录', r.status === 200 && !!r.j.token, r.j.error || '');
  admin = r.j.token;
  ok('admin is_admin=true', r.j.admin === true);

  // 建测试账号
  const uname = 'test' + Date.now().toString(36);
  const upass = 'test1234';
  r = await post('accounts', { user: uname, pass: upass, display: '链路测试' }, admin);
  ok('创建账号', r.status === 200 && r.j.ok, r.j.error || '');

  // 朋友登录
  r = await post('login', { user: uname, pass: upass });
  ok('朋友登录', r.status === 200 && !!r.j.token, r.j.error || '');
  friend = r.j.token;

  // 提交中文笔记
  r = await post('submit', { type: 'note', title: '链路测试笔记', body: '这是全链路自动测试的正文内容。', pointId: '' }, friend);
  ok('投稿中文笔记', r.status === 200 && r.j.ok, r.j.error || '');
  const subId = r.j.id;

  // 我的投稿
  r = await get('my', friend);
  ok('my 含新投稿', (r.j.items || []).some(i => i.id === subId));

  // 管理员 pending 队列可见
  r = await get('pending', admin);
  const found = (r.j.items || []).find(i => i.id === subId);
  ok('pending 可见中文标题', !!found && found.title === '链路测试笔记', JSON.stringify((r.j.items || []).map(i => i.id)));

  // 采纳
  r = await post('approve', { id: subId }, admin);
  ok('采纳投稿', r.status === 200 && r.j.ok, r.j.error || '');

  // 非管理员不能看 pending
  r = await get('pending', friend);
  ok('朋友访问 pending 被拒', r.status !== 200);

  // 幂等键：同 idem 重复提交只入库一次
  const idem = 'smoke-' + Date.now().toString(36);
  const p1 = await post('submit', { type: 'note', title: '幂等测试', body: '只应入库一次', idem }, friend);
  const p2 = await post('submit', { type: 'note', title: '幂等测试', body: '只应入库一次', idem }, friend);
  ok('幂等：两次同 idem 返回同一 id', p1.j.id === p2.j.id, `${p1.j.id} vs ${p2.j.id}`);
  ok('幂等：第二次标记 duplicate', p2.j.duplicate === true, JSON.stringify(p2.j));
  const pendIds = (await get('pending', admin)).j.items.map(i => i.id);
  ok('幂等：队列只多 1 条', pendIds.filter(id => id === p1.j.id).length === 1);

  // 脚本注入拦截
  const bad = await post('submit', { type: 'note', title: '注入', body: '<script>alert(1)</script>' }, friend);
  ok('含 <script> 被拒', bad.status === 400, `status=${bad.status} ${bad.j.error || ''}`);
  const bad2 = await post('submit', { type: 'note', title: '注入2', body: '正常文本 <img src=x onerror=alert(1)>' }, friend);
  ok('含 onerror= 被拒', bad2.status === 400, `status=${bad2.status}`);

  /* ---------- AI 日程生成端点（零费用用例：不调真实 LLM） ---------- */
  r = await post('plan', { params: { city: '莫斯科', days: 1 } });
  ok('plan 无 token 401', r.status === 401, `status=${r.status}`);
  r = await post('plan', { params: { days: 1 } }, friend);
  ok('plan 缺 city 400', r.status === 400, `status=${r.status} ${r.j.error || ''}`);

  // ai_settings 读写往返 + key 不回明文
  r = await post('ai_settings', { endpoint: 'https://example.com/v1/chat/completions', model: 'test-model', key: 'sk-smoke-test' }, friend);
  ok('ai_settings 保存自定义接入', r.status === 200 && r.j.ok, r.j.error || '');
  r = await get('ai_settings', friend);
  ok('ai_settings 读回 endpoint', r.j.endpoint === 'https://example.com/v1/chat/completions' && r.j.has_key === true, JSON.stringify(r.j));
  ok('ai_settings 不回 key 明文', !('api_key' in r.j) && !JSON.stringify(r.j).includes('sk-smoke-test'));
  r = await post('ai_settings', { endpoint: '' }, friend);
  r = await get('ai_settings', friend);
  ok('ai_settings 清除自定义接入', r.j.endpoint === '' && r.j.has_key === false, JSON.stringify(r.j));

  // SSRF 拦截：http 协议 + 内网地址
  r = await post('ai_settings', { endpoint: 'http://127.0.0.1:7000/x' }, friend);
  ok('SSRF http+回环被拒', r.status === 400, `status=${r.status} ${r.j.error || ''}`);
  r = await post('ai_settings', { endpoint: 'https://192.168.1.5/' }, friend);
  ok('SSRF 内网 IP 被拒', r.status === 400, `status=${r.status} ${r.j.error || ''}`);

  // ai_policy：朋友只读 + 无完整策略字段；admin 可写（写回原值，幂等）
  r = await get('ai_policy', friend);
  ok('朋友读 ai_policy', r.status === 200 && Array.isArray(r.j.models) && !('policy' in r.j), JSON.stringify(r.j).slice(0, 120));
  r = await post('ai_policy', { friend_quota: 99 }, friend);
  ok('朋友写 ai_policy 被拒', r.status === 401, `status=${r.status}`);
  const before = (await get('ai_policy', admin)).j.policy || {};
  r = await post('ai_policy', { friend_quota: before.friend_quota ?? 3, admin_quota: before.admin_quota ?? 30, custom_quota: before.custom_quota ?? 20, month_token_cap: before.month_token_cap ?? 2000000, site_enabled: before.site_enabled ?? 1, models_friend: before.models_friend || ['deepseek-v4-pro'], models_admin: before.models_admin || ['deepseek-v4-pro'] }, admin);
  ok('admin 写 ai_policy（原值回写）', r.status === 200 && r.j.ok, r.j.error || '');

  // ai_usage：admin 可见台账，朋友被拒
  r = await get('ai_usage', admin);
  ok('admin 读 ai_usage', r.status === 200 && Array.isArray(r.j.items), `status=${r.status}`);
  ok('ai_usage 含可视化字段', Array.isArray(r.j.daily) && Array.isArray(r.j.by_model) && Array.isArray(r.j.by_user) && Array.isArray(r.j.month_by_model), Object.keys(r.j).join(','));
  r = await get('ai_usage', friend);
  ok('朋友读 ai_usage 被拒', r.status !== 200, `status=${r.status}`);

  // ai_test：无 token 401；内网 endpoint SSRF 拦截（不触发真实调用）
  r = await post('ai_test', {});
  ok('ai_test 无 token 401', r.status === 401, `status=${r.status}`);
  r = await post('ai_test', { endpoint: 'http://192.168.1.5:5000/' }, friend);
  ok('ai_test 内网 endpoint 被拒', r.status === 400, `status=${r.status} ${r.j.error || ''}`);

  // 清理：拒绝幂等测试留下的投稿
  await post('reject', { id: p1.j.id }, admin);

  // 删除测试账号 + 清理投稿
  const dr = await fetch(`${BASE}?a=accounts&user=${uname}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
  ok('删除测试账号', dr.status === 200, 'status=' + dr.status);

  console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('EXC', e.message); process.exit(1); });
