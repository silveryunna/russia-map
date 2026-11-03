# 远程开发接入指南（NAS · VPS · 隧道）

> 面向需要在**非家庭内网**环境下参与本项目开发的协作者。
> 读完即可在任何网络下完成：改代码 → 提交 → 部署 → 操作 NAS。
> 最后更新：2026-10-27

## 1. 架构总览

```
你的电脑（任意网络）
   │
   ├─ HTTPS 443 ──────────────► VPS (124.221.104.242)
   │                              ├─ nginx → 网站本体 /www/wwwroot/julyyunna.art
   │                              └─ frps（回环 127.0.0.1:60022 / :18765，公网不可见）
   │                                     ▲
   │                                  frp 隧道（TLS，token 认证）
   │                                     ▲
   └─ SSH 跳板 ─► VPS ─► frp 回环 ──►  NAS (群晖 DS220+, 内网 192.168.1.5)
                                         ├─ DSM 5000/5001（管理界面）
                                         ├─ sshd 22（宿主机终端）
                                         ├─ synology-mcp 8765（MCP 桥，供 AI 助手操作 NAS）
                                         └─ kimi-dev 容器 2222（隔离开发环境，挂载 /volume1/dev）
```

**安全模型**：公网唯一入口是 VPS 的 22/443。NAS 的 SSH 与 MCP 经 frp 只绑定在 VPS 回环（`proxyBindAddr = "127.0.0.1"`），外网端口扫描不可见；使用它们必须先后持有 **VPS 私钥 + NAS 私钥** 两把钥匙。

## 2. 前置条件（找管理员获取）

| 物品 | 说明 | 存放 |
|---|---|---|
| `julyyunna_thispc_ed25519` | VPS root 登录私钥 | `~/.ssh/`，权威备份在 NAS 密钥归档包 |
| `nas_ed25519` | NAS `mcp-bot` 账号私钥 | 同上 |
| GitHub 推送 Token | push 到 main（main 即部署源，服务器 cron 拉取） | Windows 凭据管理器 |

红线：**私钥、frp token、各类 API Key 永不写入仓库、文档、聊天记录**。

## 3. 能力速查表

| 需求 | 内网 | 外网 |
|---|---|---|
| DSM 管理界面 | `http://192.168.1.5:5000` | `https://nas.julyyunna.art` |
| SSH 进 NAS 宿主机 | `ssh -i ~/.ssh/nas_ed25519 mcp-bot@192.168.1.5` | `bash ~/bin/nas-remote.sh ssh`（见 §4） |
| scp/rsync 传文件到 NAS | 直接对 192.168.1.5 | 加同款跳板 ProxyCommand |
| AI 助手操作 NAS（MCP） | mcp.json 直连 `http://192.168.1.5:8765/mcp` | §5 转发 + 改 mcp.json |
| 网站部署 | 见 AGENTS.md「部署」节（push 即上线），与是否在内网无关 | 同左 |

## 4. 一键脚本 `~/bin/nas-remote.sh`

```bash
bash ~/bin/nas-remote.sh on      # 建立 MCP 转发（本地 8765 → VPS 回环 → NAS）
bash ~/bin/nas-remote.sh ssh     # 经 VPS 跳板 SSH 进 NAS 宿主机
bash ~/bin/nas-remote.sh status  # 检查转发与隧道健康
bash ~/bin/nas-remote.sh off     # 关闭转发
```

手动等价命令（脚本不在手边时）：

```bash
# SSH 进 NAS（外网）
ssh -i ~/.ssh/nas_ed25519 \
  -o "ProxyCommand ssh -i ~/.ssh/julyyunna_thispc_ed25519 -W %h:%p root@124.221.104.242" \
  -p 60022 mcp-bot@127.0.0.1

# MCP 转发（外网，保持前台运行）
ssh -N -L 8765:127.0.0.1:18765 -i ~/.ssh/julyyunna_thispc_ed25519 root@124.221.104.242
```

scp 传文件到 NAS（外网）：

```bash
scp -i ~/.ssh/nas_ed25519 \
  -o "ProxyCommand ssh -i ~/.ssh/julyyunna_thispc_ed25519 -W %h:%p root@124.221.104.242" \
  -P 60022 ./file mcp-bot@127.0.0.1:/volume1/dev/
```

## 5. MCP 桥（AI 助手操作 NAS）

- 内网：`~/.kimi-code/mcp.json` 保持 `http://192.168.1.5:8765/mcp`
- 外网：先 `nas-remote.sh on`，再把 url 改为 `http://127.0.0.1:8765/mcp`，重载 Kimi Code 会话
- MCP 工具的路径用 **FileStation 共享目录风格**：`/dev/compose`，不是宿主机路径 `/volume1/dev/compose`（写错会报 Synology API error 408 = 路径不存在）

## 6. 服务端配置位置（排障用）

| 组件 | 位置 | 重启方式 |
|---|---|---|
| frps | VPS `/etc/frp/frps.toml` | `systemctl restart frps` |
| frpc | NAS `/volume1/dev/compose/frp/frpc.toml` | Container Manager → 项目 frp → 重启 |
| MCP 桥容器 | compose 定义在 `/volume1/dev/compose/docker-compose.yml` | 见 §7 任务计划 |
| nginx 站点 | VPS 宝塔面板 / `/www/server/panel/vhost/nginx/` | 宝塔或 `nginx -s reload` |

隧道 proxies（frpc.toml）：`dsm`(http→5000, nas.julyyunna.art)、`ssh`(tcp 22→VPS:60022)、`mcp`(tcp 8765→VPS:18765)。

## 7. 常见故障

| 现象 | 排查 |
|---|---|
| `nas.julyyunna.art` 打不开 | VPS 上 `systemctl status frps`；NAS 上 Container Manager 看 frp 项目是否绿灯 |
| MCP "Not connected" | 先 ping NAS/ curl 8765 端口；容器大概率停了 → Container Manager 启动 `synology-mcp` |
| MCP 报 421 / Invalid Host header | 容器环境变量 `MCP_HTTP_ALLOWED_HOSTS` 未包含你用的 Host（含端口）。改 compose 后**必须重建容器**：DSM 任务计划里有现成的 root 任务 `fix-mcp-env`（stop/rm/up -d --no-deps synology-mcp），改完脚本跑一遍即可 |
| MCP 报 408 | 99% 是路径写成了 `/volume1/...`，改成 `/dev/...` 共享目录风格 |
| 跳板 SSH 卡住 | 先 `ssh root@124.221.104.242` 单独验 VPS 可达；再 `ssh root@VPS 'ss -tlnp \| grep 60022'` 确认回环监听在 |
| Windows 上 known_hosts 中文路径报错 | 无害；或每条 ssh 加 `-o UserKnownHostsFile=/dev/null` |

## 8. 开发工作流（多机 / 多人协作，内外网一致）

**唯一事实来源是 GitHub `main`；腾讯云 webroot 与 NAS 都只是它的消费者，不是第二份仓库。**

### 8.1 每台机器的一次性准备

```bash
git clone https://github.com/silveryunna/russia-map.git D:/dev/russia-map
cd D:/dev/russia-map
git config core.hooksPath .githooks      # 数据校验 + 冲突标记拦截
git config user.name  "你的名字"
git config user.email "你的 GitHub 邮箱"
node tools/check-data.mjs ./data         # 验活
```

**三条硬性约定**

1. **代码目录必须放在非云同步盘。** 2026-11-03 事故：OneDrive 在 `git pull` 期间把 `.git/refs/heads/main` 改名成 `main-DESKTOP-8K3SG2M`，`HEAD` 失效、`git log` 报"当前分支没有任何提交"、5 个根 HTML 与 `plan.css` 被移走，只剩冲突副本；靠 `git update-ref refs/heads/main <sha>` + `git reset --hard` 才救回。**OneDrive / iCloud / 坚果云里只放 `site-out/`、截图、设计稿这些导出物。**
2. **开工先 `fetch`，收工必 `push`。** 未推送的提交在另一台机器上等于不存在。
3. **只在 `main` 上开发，永不 force push。**

### 8.2 日常循环

```bash
git fetch --prune && git status -sb        # 开工，先看有没有落后

# 改数据（data/*.json）→ 直接上线
node tools/check-data.mjs ./data && node tools/deploy-check.mjs data/
git add -A && git commit -m "data: ..." && git push

# 改源码（src/、tools/、sw.js 模板）→ 构建发布
npm run publish -- --wait
```

`--wait` 会等线上 `git rev-parse HEAD` 追平（cron ≤2 分钟）。根目录 HTML 与 `assets/` 是产物，不要手改；`sw.js` VERSION 由构建注入 git sha。

### 8.3 多人 / 双机并行

- **同一时刻只让一个会话改 `data/`**：JSON 几乎必然冲突，且产物与数据强耦合
- 拉取用 `git pull --rebase`，保持线性历史
- `.githooks/pre-commit` 会跑 `check-data`，并拒绝任何含合并冲突标记的提交，不要绕过
- 长期协作者加 GitHub Collaborator；临时帮忙走 fork + PR
- 建议对 `main` 开 branch protection（禁 force push、要求线性历史）

### 8.4 GitHub 不通时

1. 本机代理：`git config http.https://github.com.proxy http://127.0.0.1:7897`
2. SSH over 443：`git remote set-url origin ssh://git@ssh.github.com:443/silveryunna/russia-map.git`
3. 走 §4 的 frp 隧道，在一台常开的机器上操作

### 8.5 备份镜像（只读，禁止签出）

GitHub 之外保留一份国内可快速恢复的裸仓：

| 位置 | 路径 | 说明 |
|---|---|---|
| VPS | `/root/russia-map.git`（bare） | 由 `git push backup main` 更新 |
| NAS | `/volume1/dev/backup/russia-map.git`（bare） | DSM 任务计划定期从 VPS 镜像 `git fetch --prune` |

```bash
# 本机（~/.ssh/config 里已有 russia-vps 别名，指向该私钥）
git remote add backup russia-vps:/root/russia-map.git
git push origin main && git push backup main
```

NAS 上执行一次（DSM SSH 或「控制面板 → 任务计划」以 root 运行）：

```bash
# 首次：建镜像。NAS 能直连 GitHub 用第一种
mkdir -p /volume1/dev/backup && cd /volume1/dev/backup
git clone --mirror https://github.com/silveryunna/russia-map.git russia-map.git

# GitHub 不通时，改从 VPS 镜像拉（需 NAS 上有能登 VPS 的私钥）
# GIT_SSH_COMMAND="ssh -i /volume1/dev/keys/vps_ed25519" \
#   git clone --mirror root@124.221.104.242:/root/russia-map.git

# 每日更新（写进 DSM 任务计划，root，每天 03:00）
cd /volume1/dev/backup/russia-map.git && git remote update --prune
```

**镜像仓只接收，绝不在上面签出或开发**：webroot 由 cron 每 2 分钟 `reset --hard origin/main`，服务器上的任何手改都会被覆盖（见 `AGENTS.md` §部署）。

NAS 侧职责不变：密钥归档、照片管线（immich/photo-*）、实验容器。
