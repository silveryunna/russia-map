# AGENTS.md · 俄罗斯打卡地图（牛马打工人的旅行笔记）

AI 助手在本仓库工作前必读。完整维护知识见 `MAINTENANCE.md`（踩坑记录 §7 必看）；远程开发/NAS/隧道接入见 `REMOTE-DEV.md`；交接背景见 `D:\KIMI\MAP\HANDOFF.md`。

## 项目

静态旅行站（Leaflet 地图 PWA + PHP/SQLite 小 API）。本仓库是唯一事实来源（main 分支），同时是部署源：GitHub Pages + 腾讯云双节点。

## 每次改数据的固定动作

1. 改 `data/*.json` → `node tools/check-data.mjs ./data`（必须通过）
2. `git add -A && git commit`
3. 部署（见下）

## 部署（2026-10-28 P4 起：单仓构建发布）

- **源码唯一事实来源：`src/`（vite 构建入口）+ `data/`（数据）。根目录 9 个 HTML 与 `assets/` 是构建产物，禁止手改**（手改会在下一次 publish 时被覆盖）
- 改数据（`data/*.json`）：check-data → commit → push 即上线（服务器 cron ≤2 分钟拉取），无需构建
- 改源码（`src/`、`tools/`、`sw.js` 模板等）：`npm run publish`（= `tools/publish.mjs`：体检 → check-data → vite build → assemble → 产物回写仓库根 → commit → push；加 `--wait` 可等服务器追平）
- 腾讯云（唯一线上节点）：webroot 是 git 工作区，root crontab 每 2 分钟跑 `/root/update-russia-map.sh`（`git fetch` + `git reset --hard origin/main` + 关键资源 200 自检，失败自动回滚上一版并暂停）。**push 到 main 即自动上线，≤2 分钟生效**
- ⚠️ 因此**不要再用 scp 热修**：手改 webroot 里的文件会在 2 分钟内被 reset 覆盖。确需临时改线上文件，先 `crontab -e` 注释掉那一行，改完再恢复
- GitHub：既是 git 备份 + CI/监控载体，也是**实际部署源**；Pages 备节点已放弃维护（push 仍会触发 Pages 自动构建，但坏了不用修）
- 每次部署后必验：`git rev-parse HEAD` 与服务端 `cd /www/wwwroot/julyyunna.art && git rev-parse HEAD` 一致（≤2 分钟会追平）
- 天地图 Key 为**服务端类型**：只存在于服务器 nginx 配置 `/www/server/panel/vhost/nginx/julyyunna.art.conf` 的 `location ^~ /tdt/` 段（root 600），由 nginx 追加 `tk=` 后回代上游；**前端不持有、不下发任何 Key**。轮换 Key 只改服务器配置，`nginx -t` 后 `nginx -s reload`，无需动前端
- Key 轮换/commit 前确认：仓库任何文件中不得出现 tk 明文（含历史再引入）；`.gitignore` 仍保留 `assets/tdt-key.js` 以防误传
- sw.js 的 VERSION 由 assemble 构建期自动注入 git short sha（`tn-v<sha>`），不再手改；HTML 引用均为哈希文件名，**`?v=` 手工仪式已废除**
- 打包产物 ESM 严格解析由 publish 第 5 步自动执行（防白屏）；手动跑：`node --experimental-vm-modules tools/check-esm.mjs`

## CI / 监控（GitHub Actions）

- `check.yml`（push 触发）：check-data + 变异测试（21 变异须全捕获）+ assets ESM 严格解析 + 版本同步检查（改 assets/*.js 必须同提交改 map.html 与 sw.js）+ Playwright 冒烟（桌面/手机截图 artifact）
- `monitor.yml`（每 6 小时）：探测腾讯云主站/API/NAS/TLS 证书（剩 <14 天告警），故障自动开 issue、恢复自动关闭；仓库 60 天无活动 GitHub 会停定时任务，手动跑一次即可恢复
- 探针脚本 `tools/site-monitor.mjs` 可本地直接跑（Pages 检查需网络可达 GitHub）

## 硬约束

- 坐标一律 **WGS84**：腾讯/飞猪返回的 GCJ-02 必须经 `tools/recalibrate-sanya.mjs` 的 `gcj2wgs()` 转换；腾讯 Key 从环境变量 `QQ_LBS_KEY` 读
- 底图：境外用 OSM 系（高德无俄罗斯数据）；中国用天地图（WGS，走同源 `/tdt/` 反代）或 OSM。**高德/腾讯瓦片属 GCJ-02，前端未做坐标转换，切过去点位会整体偏移 500–700m**——看到点位「画到海里」先查底图，别改数据（详见 `MAINTENANCE.md` §7.9）；遮罩边界只改 `tools/build_boundary.py` 生成，勿手改 JSON
- 打卡数据只写 localStorage（`travel-checkin-v2`）
- 密钥绝不写进仓库/聊天记录；权威备份在 NAS 密钥归档包
- 服务器 `/tools/` 已被 nginx 封禁（404），属安全策略，勿解除
- 两台电脑都会打开本仓库：同一时刻只一个会话改数据，改完 commit+部署再换边
- 部署/提交前必跑：`node tools/deploy-check.mjs data/`（防未提交覆盖、防落后远端）；每台机器一次 `git config core.hooksPath .githooks` 启用提交前校验

## 数据结构速查

- `data/points.json` 点位：id/name/city/cluster/type/highlight/note/lat/lon/confidence(100精确/75待核)/tags；无坐标用 `pending: true`
- `data/routes.json` 动线：steps[].point 按 name 精确索引，写错静默跳过
- `data/ratings.json` 评分：多来源 `{items:{id:{ratings:[...]}}}`；携程来源=问道API环境变量 `WENDAO_API_KEY`（每日30次/令牌）；交通类点位不显示评分
- 第一方评分（私人米其林）：站长录入写 `data/michelin-manual.json`（`{id:{dims,overall,note,visited}}`），跑 fetch 脚本合并入 ratings.json；维度集按类型：餐饮 口味/性价比/等位/环境，酒店 位置/景观/服务/性价比，景点 出片/清净/可达/票价（全部正向，5=最好）
