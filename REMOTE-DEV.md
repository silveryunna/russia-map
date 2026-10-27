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
| GitHub 推送 Token | Pages 部署用 | Windows 凭据管理器 |

红线：**私钥、frp token、各类 API Key 永不写入仓库、文档、聊天记录**。

## 3. 能力速查表

| 需求 | 内网 | 外网 |
|---|---|---|
| DSM 管理界面 | `http://192.168.1.5:5000` | `https://nas.julyyunna.art` |
| SSH 进 NAS 宿主机 | `ssh -i ~/.ssh/nas_ed25519 mcp-bot@192.168.1.5` | `bash ~/bin/nas-remote.sh ssh`（见 §4） |
| scp/rsync 传文件到 NAS | 直接对 192.168.1.5 | 加同款跳板 ProxyCommand |
| AI 助手操作 NAS（MCP） | mcp.json 直连 `http://192.168.1.5:8765/mcp` | §5 转发 + 改 mcp.json |
| 网站部署 | 见 AGENTS.md「部署双节点」，与是否在內网无关 | 同左 |

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

## 8. 开发工作流（不变，内外网一致）

1. 改代码 → `node tools/check-data.mjs ./data` + `node tools/deploy-check.mjs data/`
2. commit（启用 `.githooks`：`git config core.hooksPath .githooks`）
3. 部署：腾讯云 scp 直传 + GitHub Pages push（push 需代理 `127.0.0.1:7897`）
4. 改了 `assets/*.js` 必同步 bump：`map.html ?v=` 与 `sw.js VERSION`

NAS 侧职责：密钥归档、照片管线（immich/photo-*）、实验容器。网站代码的**唯一事实来源是 GitHub main 分支**，不要把 NAS 当代码仓库用。
