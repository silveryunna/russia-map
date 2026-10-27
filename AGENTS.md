# AGENTS.md · 俄罗斯打卡地图（牛马打工人的旅行笔记）

AI 助手在本仓库工作前必读。完整维护知识见 `MAINTENANCE.md`（踩坑记录 §7 必看）；远程开发/NAS/隧道接入见 `REMOTE-DEV.md`；交接背景见 `D:\KIMI\MAP\HANDOFF.md`。

## 项目

静态旅行站（Leaflet 地图 PWA + PHP/SQLite 小 API）。本仓库是唯一事实来源（main 分支），同时是部署源：GitHub Pages + 腾讯云双节点。

## 每次改数据的固定动作

1. 改 `data/*.json` → `node tools/check-data.mjs ./data`（必须通过）
2. `git add -A && git commit`
3. 部署（见下）

## 部署（单主站，2026-10-26 起）

- 腾讯云（唯一线上节点，scp 直传）：`scp -i ~/.ssh/julyyunna_ed25519 <file> root@124.221.104.242:/www/wwwroot/julyyunna.art/<path>`，传后 `chown www:www`
- GitHub：只作 git 备份 + CI/监控载体，**Pages 备节点已放弃维护**（push 仍会触发 Pages 自动构建，但坏了不用修）
- 改 `assets/*.js` 必须同步：`map.html` 的 `?v=` +1、`sw.js` 的 `VERSION` +1
- 改打包产物后用 ESM 严格解析验证（`node --check` 对含 import 的文件不可靠）：
  `node --experimental-vm-modules -e "new (require('vm').SourceTextModule)(require('fs').readFileSync('assets/xxx.js','utf8'))"`

## CI / 监控（GitHub Actions）

- `check.yml`（push 触发）：check-data + 变异测试（21 变异须全捕获）+ assets ESM 严格解析 + 版本同步检查（改 assets/*.js 必须同提交改 map.html 与 sw.js）+ Playwright 冒烟（桌面/手机截图 artifact）
- `monitor.yml`（每 6 小时）：探测腾讯云主站/API/NAS/TLS 证书（剩 <14 天告警），故障自动开 issue、恢复自动关闭；仓库 60 天无活动 GitHub 会停定时任务，手动跑一次即可恢复
- 探针脚本 `tools/site-monitor.mjs` 可本地直接跑（Pages 检查需网络可达 GitHub）

## 硬约束

- 坐标一律 **WGS84**：腾讯/飞猪返回的 GCJ-02 必须经 `tools/recalibrate-sanya.mjs` 的 `gcj2wgs()` 转换；腾讯 Key 从环境变量 `QQ_LBS_KEY` 读
- 底图只用 OSM 系（高德无俄罗斯数据）；遮罩边界只改 `tools/build_boundary.py` 生成，勿手改 JSON
- 打卡数据只写 localStorage（`travel-checkin-v2`）
- 密钥绝不写进仓库/聊天记录；权威备份在 NAS 密钥归档包
- 服务器 `/tools/` 已被 nginx 封禁（404），属安全策略，勿解除
- 两台电脑都会打开本仓库：同一时刻只一个会话改数据，改完 commit+部署再换边
- 部署/提交前必跑：`node tools/deploy-check.mjs data/`（防未提交覆盖、防落后远端）；每台机器一次 `git config core.hooksPath .githooks` 启用提交前校验

## 数据结构速查

- `data/points.json` 点位：id/name/city/cluster/type/highlight/note/lat/lon/confidence(100精确/75待核)/tags；无坐标用 `pending: true`
- `data/routes.json` 动线：steps[].point 按 name 精确索引，写错静默跳过
- `data/ratings.json` 评分：多来源 `{items:{id:{ratings:[...]}}}`；携程来源=问道API环境变量 `WENDAO_API_KEY`（每日30次/令牌）；交通类点位不显示评分
