#!/usr/bin/env php
<?php
declare(strict_types=1);
// SQLite 在线快照备份：VACUUM INTO 生成一致性副本（含已提交的 WAL），避免 cp 撕裂。
// 用法（服务器上执行，路径全部由参数/环境变量提供，不写死）：
//   php deploy/backup-db.php --db=/path/app.db --dir=/path/backups [--keep=14]
//   或 TRAVEL_DB_PATH=/path/app.db TRAVEL_BACKUP_DIR=/path/backups php deploy/backup-db.php
// 文件名：<库名>-YYYYMMDD-HHmmss.sqlite，保留最近 --keep 份（默认 14），更旧的滚动删除。
// 成功：stdout 一行摘要，退出 0；任何失败：stderr 错误，退出 1（可直接挂 cron 告警）。

function fail(string $msg): void
{
    fwrite(STDERR, "❌ {$msg}\n");
    exit(1);
}

/** 读取 --name=value 形式的参数；没有则返回 null。 */
function cli_arg(array $argv, string $name): ?string
{
    $prefix = "--{$name}=";
    foreach ($argv as $a) {
        if (str_starts_with($a, $prefix)) return substr($a, strlen($prefix));
    }
    return null;
}

/** 把路径安全拼成 SQLite 字符串字面量（单引号转义），避免拼接注入。 */
function sql_literal(string $s): string
{
    return "'" . str_replace("'", "''", $s) . "'";
}

$dbPath = (string)(cli_arg($argv, 'db') ?? getenv('TRAVEL_DB_PATH') ?: '');
$dir = (string)(cli_arg($argv, 'dir') ?? getenv('TRAVEL_BACKUP_DIR') ?: '');
$keep = (int)(cli_arg($argv, 'keep') ?? getenv('TRAVEL_BACKUP_KEEP') ?: 14);

if ($dbPath === '' || $dir === '') {
    fail('缺少参数：--db / --dir（或 TRAVEL_DB_PATH / TRAVEL_BACKUP_DIR）');
}
if ($keep < 1) fail('--keep 必须 ≥ 1');
if (!is_file($dbPath)) fail("数据库不存在：{$dbPath}");
if (!is_readable($dbPath)) fail("数据库不可读：{$dbPath}");
if (!is_dir($dir)) {
    if (!@mkdir($dir, 0750, true) && !is_dir($dir)) fail("无法创建备份目录：{$dir}");
}

$baseName = pathinfo($dbPath, PATHINFO_FILENAME);
$dest = rtrim($dir, "/\\") . DIRECTORY_SEPARATOR . $baseName . '-' . date('Ymd-His') . '.sqlite';
$n = 1;
while (file_exists($dest)) { // 同一秒内重复执行：追加序号，绝不覆盖已有快照
    $dest = rtrim($dir, "/\\") . DIRECTORY_SEPARATOR . $baseName . '-' . date('Ymd-His') . "-{$n}.sqlite";
    $n++;
}

try {
    $src = new PDO('sqlite:' . $dbPath);
    $src->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $src->exec('PRAGMA busy_timeout=5000');
    $src->exec('VACUUM INTO ' . sql_literal($dest));
} catch (Throwable $e) {
    @unlink($dest);
    fail('备份失败：' . $e->getMessage());
}

// 校验：能打开、完整性 ok、至少有一张可读表（避免"生成了 0 字节文件也算成功"）
try {
    $chk = new PDO('sqlite:' . $dest);
    $chk->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $chk->exec('PRAGMA busy_timeout=5000');
    $ic = (string)$chk->query('PRAGMA integrity_check')->fetchColumn();
    if ($ic !== 'ok') fail("完整性校验失败：{$ic}");
    $tables = (int)$chk->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchColumn();
    if ($tables < 1) fail('快照内没有可读表');
} catch (Throwable $e) {
    @unlink($dest);
    fail('快照校验失败：' . $e->getMessage());
}

// 滚动保留：按文件名（YYYYMMDD-HHmmss）倒序，删掉第 keep 份之后的
$prefix = $baseName . '-';
$files = [];
foreach (glob(rtrim($dir, "/\\") . DIRECTORY_SEPARATOR . $prefix . '*.sqlite') ?: [] as $f) {
    if (preg_match('/^' . preg_quote($prefix, '/') . '\d{8}-\d{6}(-\d+)?\.sqlite$/', basename($f))) $files[] = $f;
}
usort($files, fn($a, $b) => strcmp(basename($b), basename($a)));
$pruned = 0;
foreach (array_slice($files, $keep) as $old) {
    if (!@unlink($old)) fail("无法删除旧快照：{$old}");
    $pruned++;
}

$size = filesize($dest);
printf(
    "✅ 备份完成 %s（%d 表，%.1f KB，保留 %d 份，清理 %d 份）\n",
    $dest,
    $tables,
    $size / 1024,
    min(count($files), $keep),
    $pruned
);
exit(0);
