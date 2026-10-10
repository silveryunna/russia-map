<?php
// 协作投稿 API —— 密钥/配置在 webroot 外（julyyunna-art-data/config.php）
// 端点：?a=login|logout|me|submit|my|photo|pending|approve|reject|accounts
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
    $b = body();
    $type = (string)($b['type'] ?? '');
    if (!in_array($type, ['photo', 'note', 'checkin'], true)) out(['error' => '类型非法'], 400);
    $title = mb_substr((string)($b['title'] ?? ''), 0, 120);
    $text = mb_substr((string)($b['body'] ?? ''), 0, 5000);
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
    $db->prepare('INSERT INTO submissions(username,type,title,body,point_id,file,created) VALUES(?,?,?,?,?,?,?)')
      ->execute([$s['who'], $type, $title, $text, $point ?: null, $file, time()]);
    out(['ok' => true, 'id' => (int)$db->lastInsertId()]);
  }
  case 'my': {
    $s = session_ok($db, bearer());
    $rows = $db->prepare('SELECT id,type,title,point_id,status,created FROM submissions WHERE username=? ORDER BY id DESC LIMIT 50');
    $rows->execute([$s['who']]);
    out(['items' => $rows->fetchAll(PDO::FETCH_ASSOC)]);
  }
  case 'photo': {
    session_ok($db, bearer());
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
  default:
    out(['error' => 'unknown action'], 404);
}
