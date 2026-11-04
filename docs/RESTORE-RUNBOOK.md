# 数据库快照恢复演练（Runbook）

> 适用对象：`api/index.php` 使用的 SQLite 库（路径来自服务器 `config.php` 的 `db_path`，本文用 `$DB_PATH` 占位）。
> 备份目录用 `$BACKUP_DIR` 占位（由部署环境变量 `TRAVEL_BACKUP_DIR` 指定，不要写死进仓库）。
> 目标：任何人照做即可完成一次「停写 → 快照 → 恢复 → 校验 → 起服务 → 只读验证」，并记录耗时。

## 0. 适用与前置

- 数据库运行在 **WAL** 模式（`api/index.php` 连接初始化已设置 `journal_mode=WAL`、`busy_timeout=5000`、`synchronous=NORMAL`、`foreign_keys=ON`）。
- 备份脚本：`deploy/backup-db.php`，用 SQLite 在线快照 `VACUUM INTO`，不做 `cp`。
- 需要准备：SSH 登录、`$DB_PATH`、`$BACKUP_DIR`、可用的最新快照、一条**只读**接口（如 `GET /api/index.php?a=me`，带一个测试账号 token）。
- 演练请优先在预发/低峰期做；正式库操作前必须先完成第 2 步的快照。

## 1. 停写（停服务）

任选其一，目标是**没有任何进程再写库**：

```bash
# 方案 A（推荐）：停 PHP-FPM（API 是唯一写方）
sudo systemctl stop php-fpm        # 按实际服务名调整，如 php8.2-fpm

# 方案 B：只摘掉写入口（保留静态站可读）
# 在 nginx 上对 /api/ 返回 503 维护页，或临时 chmod 500 的 API 目录
```

停写后确认没有连接仍在写：`ls -l $DB_PATH-wal`，等待其大小稳定（WAL 在最后一个连接关闭时会 checkpoint）。

## 2. 取快照

```bash
sudo -u www-data env TRAVEL_DB_PATH="$DB_PATH" TRAVEL_BACKUP_DIR="$BACKUP_DIR" \
  php deploy/backup-db.php --keep=14
```

- 输出一行 `✅ 备份完成 <路径>（N 表，X KB，保留 M 份，清理 K 份）`，退出码 0 即成功。
- 失败会打 `❌` 到 stderr 并以非 0 退出，可直接接 cron 告警。
- 脚本内部已做 `PRAGMA integrity_check` 与「至少一张表可读」校验。
- **WAL 注意**：`VACUUM INTO` 会包含已提交的 WAL 内容；若仍担心，可在停写后再取快照（本步骤已停写）。

## 3. 恢复到新库

不要直接覆盖线上文件，先恢复到新文件并校验：

```bash
SNAP="$BACKUP_DIR/<库名>-<YYYYMMDD-HHmmss>.sqlite"   # 第 2 步产出的文件名
sudo systemctl stop php-fpm                          # 再次确认已停写（幂等）
sudo cp "$SNAP" "$DB_PATH.restore-$(date +%Y%m%d-%H%M%S)"
sudo mv "$DB_PATH" "$DB_PATH.pre-restore-$(date +%Y%m%d-%H%M%S)"   # 保留现场，供回滚
sudo mv "$DB_PATH.restore-<时间戳>" "$DB_PATH"
sudo rm -f "$DB_PATH-wal" "$DB_PATH-shm"             # 旧 WAL/SHM 不能跟新库混用
sudo chown www-data:www-data "$DB_PATH"
sudo chmod 640 "$DB_PATH"
```

> 若恢复目标是**另一台机器/新库**：直接把快照放到目标 `$DB_PATH`，同样删除同名 `-wal`/`-shm` 残留。

## 4. 校验表数量与行数

```bash
php -r '$p=new PDO("sqlite:".getenv("TRAVEL_DB_PATH"));$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
echo "integrity=",$p->query("PRAGMA integrity_check")->fetchColumn(),"\n";
foreach(["accounts","sessions","submissions","ai_calls","ai_settings","ai_policy","ai_alerts","ai_ip_hits","fails"] as $t){
  try{$n=$p->query("SELECT COUNT(*) FROM $t")->fetchColumn();echo "$t=$n\n";}catch(Throwable $e){echo "$t=缺表\n";}
}' 
```

判定标准：

- `integrity=ok`；
- 业务表（`accounts` / `submissions` / `ai_calls`）都存在且行数 > 0（空库除 `accounts` 外可为 0，需人工判断）；
- 与备份前记录的基准值对比，行数**只允许等于快照时点**，不允许比快照更多（更多说明恢复到了错误文件）。

## 5. 起服务

```bash
sudo systemctl start php-fpm
curl -sS -o /dev/null -w '%{http_code}\n' https://<站点域名>/api/index.php?a=ai_policy
```

期望返回 `200`（`ai_policy` 为公开只读端点，不需要 token）。

## 6. 只读验证

```bash
# 公开只读端点
curl -sS "https://<站点域名>/api/index.php?a=ai_policy" | head -c 400

# 登录后只读端点（用测试账号 token，勿在终端历史里留真实 token：用环境变量）
curl -sS -H "Authorization: Bearer $TEST_TOKEN" "https://<站点域名>/api/index.php?a=me"
```

- 返回 JSON 且字段正常（无 500 / 无 `database is locked`）即通过；
- 再打开一次前台地图/计划页，确认读接口可用；
- **不要**在演练中触发写操作（登录、投稿、AI 生成），否则会把「恢复成功」与「写入成功」混在一起。

## 7. 确认没丢最近数据

快照只保证到**快照生成时点**的数据。恢复后按下面顺序判断：

1. 记录快照时间 `SNAP_T`（文件名里的 `YYYYMMDD-HHmmss`，服务器本地时区）。
2. 查询各表最新记录时间，时间戳字段统一是 unix 秒：

```bash
php -r '$p=new PDO("sqlite:".getenv("TRAVEL_DB_PATH"));
foreach(["submissions","ai_calls","sessions"] as $t){
  $v=$p->query("SELECT MAX(created) FROM $t")->fetchColumn();
  echo "$t ", $v ? date("Y-m-d H:i:s", (int)$v) : "空", "\n";
}'
```

3. 判定：
   - `MAX(created)` **≤** `SNAP_T`：符合预期（快照之后的数据本就不在备份里，靠第 1 步停写避免新增）；
   - `MAX(created)` 明显**早于**停写时间几小时/几天：说明快照取旧了或库一直没写入，需核对是否拿错文件；
   - 若停写与取快照之间仍有写入（例如只摘了 API 但 cron 还在写），把两者时间差内的记录数记为「已知丢失窗口」，在记录表里写明。
4. 核对 `accounts` 行数与你操作前的基准一致（账号丢失会直接导致全站登录异常）。

## 8. 回滚路径

恢复失败或校验不通过时，按相反顺序回滚，**不要**在失败的库上继续写：

```bash
sudo systemctl stop php-fpm
sudo rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
sudo mv "$DB_PATH.pre-restore-<时间戳>" "$DB_PATH"   # 第 3 步保留的现场
sudo chown www-data:www-data "$DB_PATH" && sudo chmod 640 "$DB_PATH"
sudo systemctl start php-fpm
```

回滚后再执行第 4、6 步；若原库本身已损坏，则改用更早的快照重复第 3 步，并在记录表注明。

## 9. 演练记录

| 日期 | 快照名 | 结果（通过/失败） | 停写→恢复耗时 | 执行人 | 备注（丢失窗口/回滚原因） |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

## 10. 已知限制

- 本机（开发环境）没有 PHP 运行时，以上命令**未在本地实跑**；脚本与文档只通过静态质量门校验，首次上线请在预发环境按本文完整演练并补记录表。
- 快照是整库副本，体积随库增长；保留 14 份需预留足够磁盘（建议 ≥ 单库大小 × 20）。
- `VACUUM INTO` 会重写文件，不能跨文件系统保留权限/属主；恢复后必须按第 3 步修正属主与权限。
- 备份脚本运行期间会短暂持有读锁；与停写配合可避免任何写入丢失。
