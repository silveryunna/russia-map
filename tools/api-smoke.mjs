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

  // 清理：拒绝幂等测试留下的投稿
  await post('reject', { id: p1.j.id }, admin);

  // 删除测试账号 + 清理投稿
  const dr = await fetch(`${BASE}?a=accounts&user=${uname}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
  ok('删除测试账号', dr.status === 200, 'status=' + dr.status);

  console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('EXC', e.message); process.exit(1); });
