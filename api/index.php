<?php
// 协作投稿 API —— 密钥/配置在 webroot 外（julyyunna-art-data/config.php）
// 端点：?a=login|logout|me|submit|my|photo|pending|approve|reject|accounts
//       |plan|ai_settings|ai_policy|ai_usage|ai_test
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$CONF = require '/www/wwwroot/julyyunna-art-data/config.php';
$db = new PDO('sqlite:' . $CONF['db_path']);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS accounts(
  username TEXT PRIMARY KEY, pass_hash TEXT NOT NULL, display TEXT, created INTEGER)');
$db->exec('CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, who TEXT NOT NULL, is_admin INTEGER DEFAULT 0, exp INTEGER NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS submissions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
  type TEXT NOT NULL, title TEXT, body TEXT, point_id TEXT, file TEXT,
  status TEXT DEFAULT "pending", created INTEGER)');
$db->exec('CREATE TABLE IF NOT EXISTS fails(
  k TEXT PRIMARY KEY, n INTEGER, until INTEGER)');
// AI 日程生成：个人自定义接入 / 全局策略 / 调用台账
$db->exec('CREATE TABLE IF NOT EXISTS ai_settings(
  username TEXT PRIMARY KEY, endpoint TEXT, api_key TEXT, model TEXT, updated INTEGER)');
$db->exec('CREATE TABLE IF NOT EXISTS ai_policy(k TEXT PRIMARY KEY, v TEXT)');
$db->exec('CREATE TABLE IF NOT EXISTS ai_calls(
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, channel TEXT NOT NULL,
  model TEXT, prompt_tokens INTEGER DEFAULT 0, completion_tokens INTEGER DEFAULT 0,
  ok INTEGER DEFAULT 1, created INTEGER)');
// 幂等键列（旧库自动补列；同一次提交重试只入库一次）
try { $db->exec('ALTER TABLE submissions ADD COLUMN idem TEXT'); } catch (PDOException $e) { /* 已存在 */ }
$db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_idem ON submissions(idem)');

// 渲染侧（弹窗/笔记）会拼 HTML，入口拦掉脚本注入
function unsafe_html(string $s): bool {
  return (bool)preg_match('/<\s*script|<\s*iframe|<\s*object|<\s*embed|javascript\s*:|on[a-z]+\s*=/i', $s);
}

function out($d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function body(): array { $b = json_decode(file_get_contents('php://input') ?: '', true); return is_array($b) ? $b : []; }
function bearer(): string { return preg_replace('/^Bearer\s+/i', '', $_SERVER['HTTP_AUTHORIZATION'] ?? '') ?: ''; }

function session_ok(PDO $db, string $token, bool $needAdmin = false): array {
  if (!$token) out(['error' => '未登录'], 401);
  $s = $db->prepare('SELECT * FROM sessions WHERE token=? AND exp>?');
  $s->execute([$token, time()]);
  $row = $s->fetch(PDO::FETCH_ASSOC);
  if (!$row || ($needAdmin && !$row['is_admin'])) out(['error' => '未登录或权限不足'], 401);
  return $row;
}
function rate_limit(PDO $db, string $key, int $max = 5, int $lockSec = 900): void {
  $k = 'lf:' . $key;
  $r = $db->prepare('SELECT n,until FROM fails WHERE k=?');
  $r->execute([$k]);
  $row = $r->fetch(PDO::FETCH_ASSOC);
  if ($row && $row['until'] > time()) out(['error' => '尝试次数过多，请15分钟后再试'], 429);
  $GLOBALS['__rl'] = function (bool $ok) use ($db, $k, $row, $max, $lockSec) {
    if ($ok) { $db->prepare('DELETE FROM fails WHERE k=?')->execute([$k]); return; }
    $n = ($row['n'] ?? 0) + 1;
    $until = $n >= $max ? time() + $lockSec : 0;
    $db->prepare('INSERT INTO fails(k,n,until) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n, until=excluded.until')->execute([$k, $n, $until]);
  };
}

/* ---------- AI 日程生成辅助 ---------- */
function ai_policy(PDO $db): array {
  $rows = $db->query('SELECT k,v FROM ai_policy')->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
  $j = function (string $k, array $def) use ($rows): array {
    $v = json_decode((string)($rows[$k] ?? ''), true);
    return is_array($v) && $v ? $v : $def;
  };
  return [
    'friend_quota' => max(0, (int)($rows['friend_quota'] ?? 3)),
    'admin_quota' => max(0, (int)($rows['admin_quota'] ?? 30)),
    'custom_quota' => max(0, (int)($rows['custom_quota'] ?? 20)),
    'month_token_cap' => max(0, (int)($rows['month_token_cap'] ?? 2000000)),
    'site_enabled' => (int)($rows['site_enabled'] ?? 1),
    'models_friend' => $j('models_friend', ['deepseek-v4-pro']),
    'models_admin' => $j('models_admin', ['deepseek-v4-pro']),
  ];
}
// SSRF 防线：自定义 endpoint 会被服务器代发请求，必须挡住内网/回环地址（2026-10 审计项）
function ssrf_check(string $url): ?string {
  $parts = parse_url($url);
  if (!$parts || strtolower((string)($parts['scheme'] ?? '')) !== 'https') return '自定义接口仅支持 https:// 地址';
  $host = (string)($parts['host'] ?? '');
  if ($host === '') return '接口地址无效';
  $ip = gethostbyname($host);
  if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) return '接口域名无法解析';
  $long = ip2long($ip);
  if ($long === false) return '仅支持可解析为 IPv4 的接口地址';
  foreach ([['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as [$net, $bits]) {
    $m = -1 << (32 - $bits);
    if (($long & $m) === (ip2long($net) & $m)) return '接口地址指向内网/保留地址，已拦截';
  }
  return null;
}
function ai_http(string $url, string $key, array $payload): array {
  $ch = curl_init($url);
  $headers = ['Content-Type: application/json'];
  if ($key !== '') $headers[] = 'Authorization: Bearer ' . $key;
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_TIMEOUT => 60,
    CURLOPT_FOLLOWLOCATION => false, // 防重定向绕过 SSRF 校验
  ]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($raw === false) return ['error' => 'AI 网关连接失败：' . $err];
  return ['json' => json_decode((string)$raw, true), 'code' => $code];
}

$a = $_GET['a'] ?? '';
$ip = $_SERVER['REMOTE_ADDR'] ?? '?';

switch ($a) {
  case 'login': {
    $b = body();
    $u = trim((string)($b['user'] ?? '')); $p = (string)($b['pass'] ?? '');
    rate_limit($db, 'login:' . $ip . ':' . $u);
    if ($u === 'admin' && password_verify($p, $CONF['admin_pass_hash'])) {
      $t = bin2hex(random_bytes(32));
      $db->prepare('INSERT INTO sessions(token,who,is_admin,exp) VALUES(?,?,1,?)')->execute([$t, 'admin', time() + 86400 * 7]);
      ($GLOBALS['__rl'])(true);
      out(['token' => $t, 'admin' => true, 'name' => '管理员']);
    }
    $s = $db->prepare('SELECT * FROM accounts WHERE username=?');
    $s->execute([$u]);
    $acc = $s->fetch(PDO::FETCH_ASSOC);
    if ($acc && password_verify($p, $acc['pass_hash'])) {
      $t = bin2hex(random_bytes(32));
      $db->prepare('INSERT INTO sessions(token,who,is_admin,exp) VALUES(?,?,0,?)')->execute([$t, $u, time() + 86400 * 7]);
      ($GLOBALS['__rl'])(true);
      out(['token' => $t, 'admin' => false, 'name' => $acc['display'] ?: $u]);
    }
    ($GLOBALS['__rl'])(false);
    out(['error' => '账号或密码不正确'], 403);
  }
  case 'logout': {
    $db->prepare('DELETE FROM sessions WHERE token=?')->execute([bearer()]);
    out(['ok' => true]);
  }
  case 'me': {
    $s = session_ok($db, bearer());
    out(['name' => $s['who'], 'admin' => (bool)$s['is_admin']]);
  }
  case 'accounts': {
    $s = session_ok($db, bearer(), true);
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
      $rows = $db->query('SELECT username, display, created FROM accounts ORDER BY created DESC')->fetchAll(PDO::FETCH_ASSOC);
      $cnt = $db->query('SELECT username, COUNT(*) c FROM submissions GROUP BY username')->fetchAll(PDO::FETCH_KEY_PAIR);
      foreach ($rows as &$r) $r['submissions'] = (int)($cnt[$r['username']] ?? 0);
      out(['accounts' => $rows]);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
      $b = body();
      $u = preg_replace('/[^\w\x{4e00}-\x{9fa5}-]/u', '', (string)($b['user'] ?? ''));
      $p = (string)($b['pass'] ?? '');
      if (mb_strlen($u) < 2 || mb_strlen($u) > 20) out(['error' => '账号名 2-20 字'], 400);
      if (strlen($p) < 6) out(['error' => '密码至少 6 位'], 400);
      try {
        $db->prepare('INSERT INTO accounts(username,pass_hash,display,created) VALUES(?,?,?,?)')
          ->execute([$u, password_hash($p, PASSWORD_DEFAULT), (string)($b['display'] ?? ''), time()]);
      } catch (PDOException $e) {
        out(['error' => '账号已存在'], 409);
      }
      out(['ok' => true, 'user' => $u]);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
      $u = (string)($_GET['user'] ?? '');
      $db->prepare('DELETE FROM accounts WHERE username=?')->execute([$u]);
      $db->prepare('DELETE FROM sessions WHERE who=?')->execute([$u]);
      out(['ok' => true]);
    }
    out(['error' => 'method'], 405);
  }
  case 'submit': {
    $s = session_ok($db, bearer());
    // 日配额（2026-10 审计项）：防认证用户无限投稿耗尽磁盘
    $today = strtotime('today');
    $q = $db->prepare('SELECT COUNT(*) FROM submissions WHERE username=? AND created>=?');
    $q->execute([$s['who'], $today]);
    if ($q->fetchColumn() >= 50) out(['error' => '今日投稿已达上限（50 条），明天再来'], 429);
    $b = body();
    $type = (string)($b['type'] ?? '');
    if (!in_array($type, ['photo', 'note', 'checkin'], true)) out(['error' => '类型非法'], 400);
    if ($type === 'photo') {
      $qp = $db->prepare('SELECT COUNT(*) FROM submissions WHERE username=? AND created>=? AND type="photo"');
      $qp->execute([$s['who'], $today]);
      if ($qp->fetchColumn() >= 20) out(['error' => '今日照片投稿已达上限（20 张），明天再来'], 429);
    }
    // 幂等：同一 idem 已提交过则直接返回原记录，不重复入库
    $idem = preg_replace('/[^\w-]/', '', (string)($b['idem'] ?? ''));
    if ($idem) {
      $q = $db->prepare('SELECT id FROM submissions WHERE idem=?');
      $q->execute([$idem]);
      $dup = $q->fetchColumn();
      if ($dup) out(['ok' => true, 'id' => (int)$dup, 'duplicate' => true]);
    }
    $title = mb_substr((string)($b['title'] ?? ''), 0, 120);
    $text = mb_substr((string)($b['body'] ?? ''), 0, 5000);
    if (unsafe_html($title) || unsafe_html($text)) out(['error' => '内容含不允许的脚本代码'], 400);
    // 存储侧转义全部尖括号（2026-10 审计项）：markdown 语法不受影响，任何 HTML 注入在源头失活；
    // 选择源头转义而非给压缩产物加 DOMPurify——三份 bundle 手术风险大于收益
    $title = str_replace(['<', '>'], ['&lt;', '&gt;'], $title);
    $text = str_replace(['<', '>'], ['&lt;', '&gt;'], $text);
    $point = preg_replace('/[^p\d]/', '', (string)($b['pointId'] ?? ''));
    $file = null;
    if ($type === 'photo') {
      $data = (string)($b['dataUrl'] ?? '');
      if (!preg_match('#^data:image/(jpeg|png|webp);base64,#', $data, $m)) out(['error' => '仅支持 JPEG/PNG/WebP'], 400);
      $bin = base64_decode(substr($data, strlen($m[0])), true);
      if ($bin === false || strlen($bin) > 8 * 1024 * 1024) out(['error' => '图片需小于 8MB'], 400);
      $finfo = new finfo(FILEINFO_MIME_TYPE);
      $mime = $finfo->buffer($bin);
      if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) out(['error' => '图片类型校验失败'], 400);
      $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime];
      $file = $CONF['upload_dir'] . '/' . date('Ymd') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
      file_put_contents($file, $bin);
      chmod($file, 0640);
    }
    if ($type === 'checkin') {
      $title = '打卡';
      if (!$point) out(['error' => '缺少点位'], 400);
    }
    try {
      $db->prepare('INSERT INTO submissions(username,type,title,body,point_id,file,created,idem) VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$s['who'], $type, $title, $text, $point ?: null, $file, time(), $idem ?: null]);
    } catch (PDOException $e) {
      // 并发同 idem：返回已存在的那条
      if ($idem) {
        $q = $db->prepare('SELECT id FROM submissions WHERE idem=?');
        $q->execute([$idem]);
        $dup = $q->fetchColumn();
        if ($dup) out(['ok' => true, 'id' => (int)$dup, 'duplicate' => true]);
      }
      out(['error' => '提交失败，请重试'], 500);
    }
    out(['ok' => true, 'id' => (int)$db->lastInsertId()]);
  }
  case 'my': {
    $s = session_ok($db, bearer());
    $rows = $db->prepare('SELECT id,type,title,point_id,status,created FROM submissions WHERE username=? ORDER BY id DESC LIMIT 50');
    $rows->execute([$s['who']]);
    out(['items' => $rows->fetchAll(PDO::FETCH_ASSOC)]);
  }
  case 'photo': {
    // 仅管理员可取投稿照片（friend 页承诺"仅管理员可见"；id 自增可被任意登录用户遍历）
    session_ok($db, bearer(), true);
    $id = (int)($_GET['id'] ?? 0);
    $r = $db->prepare('SELECT file,type FROM submissions WHERE id=?');
    $r->execute([$id]);
    $row = $r->fetch(PDO::FETCH_ASSOC);
    if (!$row || !$row['file'] || !is_file($row['file'])) out(['error' => 'not found'], 404);
    header('Content-Type: ' . ($row['type'] === 'photo' ? mime_content_type($row['file']) : 'application/octet-stream'));
    header('Cache-Control: private, max-age=3600');
    readfile($row['file']);
    exit;
  }
  case 'pending': {
    session_ok($db, bearer(), true);
    $rows = $db->query('SELECT * FROM submissions WHERE status="pending" ORDER BY id DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) unset($r['file']);
    out(['items' => $rows]);
  }
  case 'approve': case 'reject': {
    session_ok($db, bearer(), true);
    $b = body();
    $id = (int)($b['id'] ?? 0);
    $st = $a === 'approve' ? 'approved' : 'rejected';
    $db->prepare('UPDATE submissions SET status=? WHERE id=?')->execute([$st, $id]);
    if ($st === 'rejected') {
      $r = $db->prepare('SELECT file FROM submissions WHERE id=?');
      $r->execute([$id]);
      $f = $r->fetchColumn();
      if ($f && is_file($f)) unlink($f);
    }
    out(['ok' => true]);
  }
  /* ---------- AI 日程生成 ---------- */
  case 'plan': {
    $s = session_ok($db, bearer());
    $who = $s['who']; $isAdmin = (bool)$s['is_admin'];
    $pol = ai_policy($db);
    // 防重入：10 秒内重复调用直接拒绝（pro 模型一次调用 30-60s，连点=连烧）
    $q = $db->prepare('SELECT MAX(created) FROM ai_calls WHERE username=?');
    $q->execute([$who]);
    if ((int)$q->fetchColumn() > time() - 10) out(['error' => '正在生成中，请稍候再试'], 429);

    $b = body();
    $params = (array)($b['params'] ?? []);
    $city = mb_substr(trim((string)($params['city'] ?? '')), 0, 30);
    $days = max(1, min(7, (int)($params['days'] ?? 3)));
    $date = mb_substr(preg_replace('/[^\d-]/', '', (string)($params['date'] ?? '')), 0, 10);
    $interests = array_slice(array_map(fn($x) => mb_substr((string)$x, 0, 10), (array)($params['interests'] ?? [])), 0, 8);
    if ($city === '') out(['error' => '缺少目的地'], 400);

    // 通道解析：个人自定义接入（ai_settings）优先，否则站内通道（站点 Key 只发往硬编码域名，绝不转发）
    $st = $db->prepare('SELECT * FROM ai_settings WHERE username=?');
    $st->execute([$who]);
    $cfg = $st->fetch(PDO::FETCH_ASSOC);
    $custom = $cfg && !empty($cfg['endpoint']);
    if ($custom) {
      if ($err = ssrf_check($cfg['endpoint'])) out(['error' => $err], 400);
      $url = $cfg['endpoint'];
      $key = (string)($cfg['api_key'] ?? '');
      $model = preg_replace('/[^\w.\/-]/', '', (string)($cfg['model'] ?? '')) ?: 'deepseek-v4-pro';
      $quota = $pol['custom_quota'];
      $channel = 'custom';
    } else {
      if (!$pol['site_enabled']) out(['error' => '站内 AI 通道已停用，可在"我的 AI 接入"配置自己的接口'], 503);
      if (empty($CONF['tokenhub_key'])) out(['error' => '站内 AI 未配置，请联系管理员'], 503);
      $allow = $isAdmin ? $pol['models_admin'] : $pol['models_friend'];
      $model = preg_replace('/[^\w.\/-]/', '', (string)($b['model'] ?? ''));
      if ($model === '' || !in_array($model, $allow, true)) $model = $allow[0] ?? 'deepseek-v4-pro';
      $url = 'https://tokenhub.tencentmaas.com/v1/chat/completions';
      $key = $CONF['tokenhub_key'];
      $quota = $isAdmin ? $pol['admin_quota'] : $pol['friend_quota'];
      $channel = 'site';
    }
    // 日配额（按成功调用计）
    $q = $db->prepare("SELECT COUNT(*) FROM ai_calls WHERE username=? AND created>=? AND ok=1 AND model NOT LIKE 'test:%'");
    $q->execute([$who, strtotime('today')]);
    $used = (int)$q->fetchColumn();
    if ($used >= $quota) out(['error' => "今日 AI 生成已达上限（{$quota} 次），明天再来"], 429);
    // 月 token 熔断：只算站内通道（烧站点账单的那条）
    if ($channel === 'site') {
      $q = $db->query("SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) FROM ai_calls WHERE channel='site' AND ok=1 AND model NOT LIKE 'test:%' AND created>=" . strtotime('first day of this month'));
      if ((int)$q->fetchColumn() >= $pol['month_token_cap']) out(['error' => '本月站内 AI 用量已达熔断阈值，请联系管理员'], 503);
    }

    // context 服务端二次裁剪：同城、白名单字段、封顶 150 个（前端也裁剪，这里不依赖前端自觉）
    $ctx = (array)($b['context'] ?? []);
    $pts = array_values(array_filter((array)($ctx['points'] ?? []), fn($p) => is_array($p) && ($p['city'] ?? '') === $city && empty($p['pending'])));
    $pts = array_slice($pts, 0, 150);
    $pts = array_map(fn($p) => array_intersect_key($p, array_flip(['name', 'type', 'cluster', 'highlight', 'tags'])), $pts);
    $rts = array_values(array_filter((array)($ctx['routes'] ?? []), fn($r) => is_array($r) && ($r['city'] ?? '') === $city));

    $sys = '你是旅行行程规划助手。根据用户给定的城市、天数、兴趣与候选点位，输出一份每日行程。'
      . '只输出一个 JSON 对象，不要输出任何其他文字、解释或代码围栏。格式：'
      . '{"name":"行程名称","days":[{"day":1,"slots":{"morning":["点位名"],"afternoon":["点位名"],"evening":["点位名"]},"tip":"当日提示"}]}。'
      . '规则：slots 中的点位名必须原样取自候选点位的 name 字段，禁止编造；每天 4-7 个点位；'
      . '同一 cluster（区域）的点位尽量安排在同一天；餐厅/咖啡/酒吧等餐饮类放在 evening；'
      . 'morning/afternoon/evening 每个时段 1-3 个点位；tip 用中文一句话。';
    $payload = [
      'model' => $model,
      'messages' => [
        ['role' => 'system', 'content' => $sys],
        ['role' => 'user', 'content' => json_encode(['city' => $city, 'date' => $date, 'days' => $days, 'interests' => $interests, 'points' => $pts, 'routes' => $rts], JSON_UNESCAPED_UNICODE)],
      ],
    ];

    $r = ai_http($url, $key, $payload);
    $pt = 0; $ct = 0; $ok = 0; $plan = null; $errMsg = '';
    if (isset($r['error'])) {
      $errMsg = $r['error'];
    } elseif ($r['code'] !== 200 || !is_array($r['json'])) {
      $errMsg = 'AI 网关返回异常（HTTP ' . $r['code'] . '）';
    } else {
      $j = $r['json'];
      $pt = (int)($j['usage']['prompt_tokens'] ?? 0);
      $ct = (int)($j['usage']['completion_tokens'] ?? 0);
      $content = trim((string)($j['choices'][0]['message']['content'] ?? ''));
      $content = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', $content);
      $plan = json_decode($content, true);
      if (!is_array($plan) || !isset($plan['days']) || !is_array($plan['days'])) { $errMsg = 'AI 返回格式无法解析'; $plan = null; }
    }
    if ($plan) {
      // 结构校验 + 幻觉过滤：不在点位库里的名字剔除（前端按 name 反查地图坐标，编造的点位会变死点）
      $nameSet = array_flip(array_filter(array_map(fn($p) => (string)($p['name'] ?? ''), $pts)));
      $valid = []; $dropped = [];
      foreach ($plan['days'] as $d) {
        if (!is_array($d) || !isset($d['slots']) || !is_array($d['slots'])) continue;
        $slots = [];
        foreach (['morning', 'afternoon', 'evening'] as $sk) {
          $keep = [];
          foreach ((array)($d['slots'][$sk] ?? []) as $n) {
            $n = (string)$n;
            if (isset($nameSet[$n])) $keep[] = $n; elseif ($n !== '') $dropped[] = $n;
          }
          $slots[$sk] = array_slice($keep, 0, 4);
        }
        $valid[] = ['day' => count($valid) + 1, 'slots' => $slots, 'tip' => mb_substr((string)($d['tip'] ?? ''), 0, 200)];
        if (count($valid) >= $days) break;
      }
      if (!$valid) { $errMsg = 'AI 返回无有效行程'; }
      else {
        $ok = 1;
        $plan = ['name' => mb_substr((string)($plan['name'] ?? "{$city}{$days}日游"), 0, 60), 'days' => $valid];
        if ($dropped) $plan['note'] = '已忽略 AI 建议的未知点位：' . implode('、', array_slice(array_unique($dropped), 0, 5));
      }
    }
    $db->prepare('INSERT INTO ai_calls(username,channel,model,prompt_tokens,completion_tokens,ok,created) VALUES(?,?,?,?,?,?,?)')
      ->execute([$who, $channel, $model, $pt, $ct, $ok, time()]);
    if (!$ok) out(['error' => $errMsg ?: 'AI 生成失败'], 502);
    out(['plan' => $plan, 'remaining' => max(0, $quota - $used - 1), 'model' => $model, 'channel' => $channel]);
  }
  case 'ai_settings': {
    $s = session_ok($db, bearer());
    $who = $s['who'];
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
      $st = $db->prepare('SELECT endpoint,model,api_key FROM ai_settings WHERE username=?');
      $st->execute([$who]);
      $row = $st->fetch(PDO::FETCH_ASSOC);
      // key 明文永不出接口（2026-10 审计项）：只回 has_key 布尔
      out(['endpoint' => $row['endpoint'] ?? '', 'model' => $row['model'] ?? '', 'has_key' => (bool)($row && $row['api_key'])]);
    }
    $b = body();
    $endpoint = mb_substr(trim((string)($b['endpoint'] ?? '')), 0, 200);
    $model = mb_substr(preg_replace('/[^\w.\/-]/', '', (string)($b['model'] ?? '')), 0, 60);
    if ($endpoint === '') { // 清空 endpoint = 删除自定义通道
      $db->prepare('DELETE FROM ai_settings WHERE username=?')->execute([$who]);
      out(['ok' => true]);
    }
    if ($err = ssrf_check($endpoint)) out(['error' => $err], 400);
    $key = mb_substr((string)($b['key'] ?? ''), 0, 200);
    if ($key === '') { // 留空 = 保留原 key
      $st = $db->prepare('SELECT api_key FROM ai_settings WHERE username=?');
      $st->execute([$who]);
      $key = (string)($st->fetchColumn() ?: '');
    }
    $db->prepare('INSERT INTO ai_settings(username,endpoint,api_key,model,updated) VALUES(?,?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET endpoint=excluded.endpoint, api_key=excluded.api_key, model=excluded.model, updated=excluded.updated')
      ->execute([$who, $endpoint, $key, $model, time()]);
    out(['ok' => true]);
  }
  case 'ai_policy': {
    $s = session_ok($db, bearer());
    $isAdmin = (bool)$s['is_admin'];
    $pol = ai_policy($db);
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
      $st = $db->prepare('SELECT endpoint FROM ai_settings WHERE username=?');
      $st->execute([$s['who']]);
      $hasCustom = (bool)$st->fetchColumn();
      $quota = $hasCustom ? $pol['custom_quota'] : ($isAdmin ? $pol['admin_quota'] : $pol['friend_quota']);
      $q = $db->prepare("SELECT COUNT(*) FROM ai_calls WHERE username=? AND created>=? AND ok=1 AND model NOT LIKE 'test:%'");
      $q->execute([$s['who'], strtotime('today')]);
      out([
        'quota' => $quota,
        'remaining_today' => max(0, $quota - (int)$q->fetchColumn()),
        'models' => $isAdmin ? $pol['models_admin'] : $pol['models_friend'],
        'has_custom' => $hasCustom,
        'site_enabled' => (bool)$pol['site_enabled'],
        // admin 额外拿到完整策略用于后台编辑（不含任何密钥）
        ...($isAdmin ? ['policy' => $pol] : []),
      ]);
    }
    if (!$isAdmin) out(['error' => '未登录或权限不足'], 401);
    $b = body();
    $set = function (string $k, string $v) use ($db) {
      $db->prepare('INSERT INTO ai_policy(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute([$k, $v]);
    };
    foreach (['friend_quota', 'admin_quota', 'custom_quota'] as $qk) {
      if (isset($b[$qk])) $set($qk, (string)max(0, min(100, (int)$b[$qk])));
    }
    if (isset($b['month_token_cap'])) $set('month_token_cap', (string)max(0, min(50000000, (int)$b['month_token_cap'])));
    if (isset($b['site_enabled'])) $set('site_enabled', $b['site_enabled'] ? '1' : '0');
    foreach (['models_friend', 'models_admin'] as $mk) {
      if (isset($b[$mk])) {
        $arr = array_values(array_filter(array_map(fn($x) => mb_substr(preg_replace('/[^\w.\/-]/', '', (string)$x), 0, 60), (array)$b[$mk])));
        if (!$arr) out(['error' => '模型范围不能为空'], 400);
        $set($mk, json_encode(array_slice($arr, 0, 20)));
      }
    }
    out(['ok' => true]);
  }
  case 'ai_usage': {
    session_ok($db, bearer(), true);
    $noTest = "model NOT LIKE 'test:%'";
    $daily = $db->prepare("SELECT date(created,'unixepoch','localtime') d, SUM(ok=1) calls, SUM(ok=0) fails, COALESCE(SUM(prompt_tokens+completion_tokens),0) tok FROM ai_calls WHERE created>=? AND $noTest GROUP BY d ORDER BY d");
    $daily->execute([strtotime('-13 days')]); // 含今天共 14 天
    $byModel = $db->query("SELECT model, COUNT(*) calls, SUM(prompt_tokens) pt, SUM(completion_tokens) ct FROM ai_calls WHERE ok=1 AND $noTest AND created>=" . strtotime('-30 days') . " GROUP BY model ORDER BY (SUM(prompt_tokens)+SUM(completion_tokens)) DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    $byUser = $db->query("SELECT username, channel, COUNT(*) calls, COALESCE(SUM(prompt_tokens+completion_tokens),0) tok FROM ai_calls WHERE ok=1 AND $noTest AND created>=" . strtotime('-30 days') . " GROUP BY username, channel ORDER BY tok DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    // 本月站内通道按模型拆（前端折算 ¥）
    $monthByModel = $db->query("SELECT model, SUM(prompt_tokens) pt, SUM(completion_tokens) ct FROM ai_calls WHERE channel='site' AND ok=1 AND $noTest AND created>=" . strtotime('first day of this month') . " GROUP BY model")->fetchAll(PDO::FETCH_ASSOC);
    $items = $db->query("SELECT username, channel, model, prompt_tokens pt, completion_tokens ct, ok, created FROM ai_calls ORDER BY id DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    $m = $db->query("SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) FROM ai_calls WHERE channel='site' AND ok=1 AND $noTest AND created>=" . strtotime('first day of this month'))->fetchColumn();
    out(['daily' => $daily->fetchAll(PDO::FETCH_ASSOC), 'by_model' => $byModel, 'by_user' => $byUser, 'month_by_model' => $monthByModel, 'items' => $items, 'month_site_tokens' => (int)$m]);
  }
  case 'ai_test': {
    $s = session_ok($db, bearer());
    $who = $s['who'];
    // 防重入（与 plan 共用 10s 窗口，测试也走真实模型、有微小费用）
    $q = $db->prepare('SELECT MAX(created) FROM ai_calls WHERE username=?');
    $q->execute([$who]);
    if ((int)$q->fetchColumn() > time() - 10) out(['error' => '操作太频繁，请稍候再试'], 429);
    $b = body();
    $endpoint = mb_substr(trim((string)($b['endpoint'] ?? '')), 0, 200);
    if ($endpoint === '') {
      if (empty($CONF['tokenhub_key'])) out(['error' => '站内 AI 未配置'], 503);
      $url = 'https://tokenhub.tencentmaas.com/v1/chat/completions';
      $key = $CONF['tokenhub_key'];
      $model = preg_replace('/[^\w.\/-]/', '', (string)($b['model'] ?? '')) ?: ($CONF['tokenhub_model'] ?? 'deepseek-v4-pro');
      $channel = 'site';
    } else {
      if ($err = ssrf_check($endpoint)) out(['error' => $err], 400);
      $url = $endpoint;
      $key = mb_substr((string)($b['key'] ?? ''), 0, 200);
      if ($key === '') { // 留空用已存的个人 key
        $st = $db->prepare('SELECT api_key FROM ai_settings WHERE username=?');
        $st->execute([$who]);
        $key = (string)($st->fetchColumn() ?: '');
      }
      $model = preg_replace('/[^\w.\/-]/', '', (string)($b['model'] ?? '')) ?: 'deepseek-v4-pro';
      $channel = 'custom';
    }
    $t0 = microtime(true);
    $r = ai_http($url, $key, ['model' => $model, 'messages' => [['role' => 'user', 'content' => '回复一个字：好']]]);
    $ms = (int)round((microtime(true) - $t0) * 1000);
    $pt = 0; $ct = 0; $ok = 0; $preview = ''; $errMsg = '';
    if (isset($r['error'])) $errMsg = $r['error'];
    elseif ($r['code'] !== 200 || !is_array($r['json'])) $errMsg = 'HTTP ' . $r['code'] . '（接口地址/Key/模型名可能有误）';
    else {
      $pt = (int)($r['json']['usage']['prompt_tokens'] ?? 0);
      $ct = (int)($r['json']['usage']['completion_tokens'] ?? 0);
      $preview = mb_substr(trim((string)($r['json']['choices'][0]['message']['content'] ?? '')), 0, 30);
      $ok = 1;
    }
    // 台账记录但 model 加 test: 前缀——不占配额、不进熔断、可视化里可区分
    $db->prepare('INSERT INTO ai_calls(username,channel,model,prompt_tokens,completion_tokens,ok,created) VALUES(?,?,?,?,?,?,?)')
      ->execute([$who, $channel, 'test:' . $model, $pt, $ct, $ok, time()]);
    if (!$ok) out(['ok' => false, 'error' => $errMsg, 'latency_ms' => $ms, 'model' => $model]);
    out(['ok' => true, 'latency_ms' => $ms, 'preview' => $preview, 'model' => $model]);
  }
  default:
    out(['error' => 'unknown action'], 404);
}
