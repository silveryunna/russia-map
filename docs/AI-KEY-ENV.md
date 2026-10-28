# AI 密钥静态加密 · 主密钥来源与环境变量配置

> 适用对象：维护 `api/index.php` 或运维服务器的人。最后实测：2026-10-29（PHP 8.3.36 / libsodium 1.0.19 / OpenCloudOS 9）。
> 本文只描述路径、权限与行为，**不包含任何密钥内容**。

## 1. 一句话结论

主密钥（`ai-at-rest.key`）默认放在 `config.php` 同目录（webroot 之外）。**生产环境实际生效的就是这个默认路径**：php-fpm 池 `clear_env=yes` 且未配 `env[]`，`AI_KEY_FILE` 环境变量对站内请求无效，只有 CLI/cron 能读到。要改位置，正确做法是 `config.php` 的 `ai_key_file` 或池里的 `env[AI_KEY_FILE]`，不要依赖 shell `export`。

## 2. 主密钥来源与优先级

解析逻辑在 `api/index.php`：`ai_key_master()`（第 123 行）与 `AI_AT_REST_KEY_FILE` 常量（第 13 行）。

| 优先级 | 来源 | 写法 | 生效范围 |
|---|---|---|---|
| 1 | 环境变量 `AI_KEY_FILE` | `env[AI_KEY_FILE] = /path`（php-fpm 池）或 CLI 前缀 | FPM（仅 env[] 形式）/ CLI |
| 2 | `config.php` 的 `ai_key_file` | `'ai_key_file' => '/path'` | 全环境 |
| 3 | 默认值 | `dirname(config.php)/ai-at-rest.key` | 全环境 |

细节：

- 用的是 `getenv(...) ?: 常量`，**不是 `??`**。`AI_KEY_FILE` 为空串等于没设，会回退下一级；而 `config.php` 里写空串会被 `??` 当成"已设置"，得到空路径 → 加密静默关闭。
- 代码注释明确写着"不依赖 php-fpm 的 env[]"——因为池配置改动、`clear_env` 都会让覆盖悄悄失效，而失效的表现是**明文落库**，不报错。

## 3. 密钥文件格式与解析分支

`ai_key_master()` 依次尝试（先 `trim`）：

| 文件内容 | 处理 | 注意事项 |
|---|---|---|
| 64 位十六进制（可带 `\n`/`\r\n`） | `hex2bin` 直接用 | 推荐格式；当前生产 key 即此格式 |
| 合法 base64 且解出 32 字节 | 直接当密钥 | `base64_decode(..., true)` 严格模式 |
| 其它任意非空文本 | `sha256(文本)` 派生 | 口令模式，方便但熵取决于口令 |
| 空文件 / 只有空白 | 视为未配置 → **明文落库** | 不会报错 |
| 文件不存在 / 不可读 / 无 sodium | 视为未配置 → **明文落库** | 同上 |

实测（2026-10-29，用真实 `ai_key_seal/ai_key_open` 与生产密文对照）：

| 覆盖值 | 主密钥载入 | 新存 key | 能否解生产密文 |
|---|---|---|---|
| 不设（默认） | 是 | `enc:v1:` | 是 |
| 另一把合法 64hex | 是 | `enc:v1:` | 否（解出空串） |
| 路径不存在 / 空文件 / 纯空白 | 否 | **明文** | 否 |
| 任意口令文本 | 是（sha256 派生） | `enc:v1:` | 否 |
| base64(32B) | 是 | `enc:v1:` | 否 |
| 生产 key + CRLF | 是 | `enc:v1:` | **是**（trim 容忍换行） |
| 生产 key + UTF-8 BOM | 是（走口令派生） | `enc:v1:` | **否**（BOM 不被 trim，等于换了一把钥匙） |
| `AI_KEY_FILE=""` | 是（回退默认） | `enc:v1:` | 是 |

> 唯一"看着成功、实际坏了"的组合是 BOM：加密照常工作，但历史密文全部解不开。拷贝/编辑 key 文件时不要用会加 BOM 的编辑器。

## 4. FPM 环境变量投递（为什么 export 没用）

php-fpm 的池默认 `clear_env = yes`：worker 只拿到池里 `env[NAME]` 白名单的变量，启动 php-fpm 的那个 shell/systemd 的 `export` 全部丢弃。

实测（临时 fpm 实例 + 自写 FastCGI 客户端，探针打印 `getenv`）：

| 池配置 | worker 内 `getenv('AI_KEY_FILE')` | shell `export FOO=bar` 是否可见 |
|---|---|---|
| `clear_env = yes` + `env[AI_KEY_FILE] = …` | 可见 | 否 |
| `clear_env = yes` + 无 `env[]` | 否 | 否 |
| `clear_env = no` + 无 `env[]` | 否 | 是 |
| `clear_env = no` + `env[AI_KEY_FILE] = …` | 可见 | 是 |

生产现状（2026-10-29）：`/etc/php-fpm.d/www.conf` 里 `clear_env` 与所有 `env[...]` 都是注释状态（默认 yes、无白名单），因此站内请求永远走默认路径。

## 5. 配置方案

### A. 默认路径（推荐，现状）

```bash
# 文件：/www/wwwroot/julyyunna-art-data/ai-at-rest.key（webroot 之外）
chown root:apache /www/wwwroot/julyyunna-art-data/ai-at-rest.key
chmod 640        /www/wwwroot/julyyunna-art-data/ai-at-rest.key
# 目录本身需可被 apache 穿越（当前 apache:apache 750）
```

必须 `640 root:apache`：php-fpm worker 以 `apache:apache` 运行，靠**组读**拿到文件；照 SSH 私钥习惯设成 `600` 会让 FPM 读不到 → 加密静默关闭。

### B. 池内环境变量（仅在需要多环境共用代码时）

```ini
; /etc/php-fpm.d/www.conf 的 [www] 段
env[AI_KEY_FILE] = /path/to/ai-at-rest.key
```

```bash
nginx -t && systemctl reload php-fpm
```

改池配置前先备份（`cp www.conf www.conf.bak-$(date +%Y%m%d)`），`reload` 后按 §6 验证；`env[]` 写错路径不会报错，只会明文落库。

### C. 不推荐

- shell `export AI_KEY_FILE=…`：对 FPM 无效（§4），只对 CLI 生效，容易误判"已生效"。
- 把 key 放进 webroot 或仓库：直接违规。

## 6. 验证（不泄露密钥）

1) **代码层自检（CLI，只输出布尔值）**

```php
<?php
declare(strict_types=1);
function kh_probe(): void {
  $sealed = ai_key_seal('PROBE');
  fwrite(STDERR, 'PROBE ' . json_encode([
    'master_loaded' => ai_key_master() !== null,
    'sealed_as_enc' => strncmp($sealed, 'enc:v1:', 7) === 0,
    'roundtrip_ok'  => ai_key_open($sealed) === 'PROBE',
  ]) . PHP_EOL);
}
register_shutdown_function('kh_probe');
require '/www/wwwroot/julyyunna.art/api/index.php'; // 会打出 404 JSON，重定向即可
```

```bash
php /tmp/kh.php >/dev/null            # 默认路径
AI_KEY_FILE=/tmp/other.key php /tmp/kh.php >/dev/null   # 覆盖后的表现
```

预期：`master_loaded`/`sealed_as_enc`/`roundtrip_ok` 全为 `true`；任一为 `false` 说明主密钥没被读到（此时新 key 会明文落库）。

2) **端到端（站内真实路径）**：在「我的 AI 接入」保存一次 Key，再查库里是否带 `enc:v1:` 前缀（只输出状态，不输出内容）：

```bash
php -r '$d=new PDO("sqlite:/www/wwwroot/julyyunna-art-data/friends.db");
foreach($d->query("select username, substr(api_key,1,7) p from ai_settings",PDO::FETCH_ASSOC) as $r)
  echo $r["username"],":",($r["p"]==="enc:v1:"?"enc":"PLAINTEXT"),"\n";'
```

3) **权限事实**：

```bash
stat -c '%U:%G %a %n' /www/wwwroot/julyyunna-art-data/ai-at-rest.key
su -s /bin/sh apache -c 'test -r /www/wwwroot/julyyunna-art-data/ai-at-rest.key && echo readable'
```

## 7. 失败时的具体表现

- 主密钥缺失/空/不可读：`ai_key_seal()` 原样返回 → **新保存的自定义 Key 明文落库**；旧 `enc:v1:` 仍按原逻辑尝试解密（同样解不开）。
- 主密钥换了（含 BOM 事故）：`ai_key_open()` 返回空串 → `?a=plan` / `ai_test` 继续发请求但**不带 `Authorization`**，表现为上游 401/调用失败；不会崩、不会回退明文。
- 轮换主密钥 = 已存 `enc:v1:` 全部作废，用户必须重新填写 Key。除非确认泄露，不要轮换。

## 8. 恢复与归档

- 权威备份：NAS `/volume1/dev/key-archive/密钥归档-待转移NAS/08-AI密钥静态加密/ai-at-rest.key`（600），清单与恢复步骤见该目录 `README.md`。
- 恢复：拷回默认路径 → `chown root:apache`、`chmod 640` → `sha256sum` 与归档清单指纹核对。代码每请求现读，无需重启 php-fpm。
- 拉取时注意：`scp` 在 NAS 上对中文路径/SFTP 不兼容，用 `ssh 'cat >'` 流式写入再 `mv`（见 `REMOTE-DEV.md` / 归档 README）。

## 9. 相关代码位置

| 位置 | 内容 |
|---|---|
| `api/index.php:13` | `AI_AT_REST_KEY_FILE` 常量（默认路径） |
| `api/index.php:120` | `ai_key_master()`（优先级与格式解析） |
| `api/index.php:132` / `:138` | `ai_key_seal()` / `ai_key_open()` |
| `api/index.php:373` / `:571` / `:575` | 解密调用点（解不开返回空串，请求不带 Authorization） |
| `api/index.php:489` | 保存时加密（无主密钥则明文） |
| `AGENTS.md`「硬约束」段 | 运维红线（key 不入库、归档位置） |
