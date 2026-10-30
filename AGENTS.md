# AGENTS.md · 俄罗斯打卡地图（牛马打工人的旅行笔记）

AI 助手在本仓库工作前必读。完整维护知识见 `MAINTENANCE.md`（踩坑记录 §7 必看）；远程开发/NAS/隧道接入见 `REMOTE-DEV.md`；资料补全流水线见 `docs/RESEARCH-PIPELINE.md`；交接背景见 `D:\KIMI\MAP\HANDOFF.md`。

## 项目

静态旅行站（Leaflet 地图 PWA + PHP/SQLite 小 API）。本仓库是唯一事实来源（main 分支），同时是部署源：GitHub Pages + 腾讯云双节点。

## 本地开发 / 质量门

- `npm run dev`：Vite（root=`src/`）。`vite.config.js` 的 `devRepoAssets` 插件把仓库根 `data/ content/ photos/` 与白名单根文件映射到站点根，`/api/*` 默认返回 JSON 错误（页面降级规则引擎）；要连真后端用 `DEV_API=http://127.0.0.1:8080 npm run dev`
- `npm test`：规则引擎 + 计划存储 + Trip 契约/迁移/编辑/存储 + 可行性引擎 + 时间轴视图 + 可执行修复 + 软目标 + Plan B + 顺序求解 + 打车费率表 + 资料补全管线 + 样板/城市排程数据契约 + SW 缓存策略 + 坐标变换 + 文档事实（CI 同样跑）
- 资料补全（开发后台/NAS）：`tools/research-queue.mjs` 从 data 缺口生成队列，`research-validate.mjs` 校验候选事实（verified 必须 official，UGC 只能线索），`research-report.mjs` 出状态/过期报告。研究产物只能写仓库与 webroot 之外；Agent-Reach 只做发现，不自动改数据、不进 CI。流程与安全边界见 `docs/RESEARCH-PIPELINE.md`
- `node tools/check-sample-data.mjs ./data`：莫斯科样板数据门槛（动线覆盖的 38 个点位的排程字段、坐标置信度、城市时区；`unknown` 允许但必须显式）。CI 跑，改样板城市点位必跑
- `node tools/check-city-duration.mjs ./data <城市>`：非 pending 点位必须有坐标、停留时长与依据；CI 对 三亚/哈尔滨/伊宁/圣彼得堡/叶卡捷琳堡/阿拉木图/莫斯科州/其他城市 全量跑，改这些城市点位必跑（莫斯科全量仍有非样板点未补，样板门槛见上一条）
- `node tools/check-route-feasibility.mjs ./data`：真实动线可行性验收（逐条按一天重排，报告收工时间/未知日历/冲突与修复建议；数据完整性错误才退出 1，最后入场/关门/重叠/超时只报告为动线设计问题）。CI 跑，改莫斯科动线或点位时长后看这里
- 计划模块：`src/pages/plan/engine.js`（纯函数，勿引入 DOM/storage）、`src/pages/plan/store.js`（`travel-plans-v1` 信封 + 损坏备份）。固定日期生成按天检查 `openCalendar`：闭馆点位当天不排、顺延到后续开放日，最终仍排不上的写进 `note`；核心 D1–D4 保持原顺序，专题/延伸线在其后做前看一步的平衡选择（今天排满不能把明天排空，最后一天按原顺序优先）；补充点位用 `evaluateDay()` 预演（含开馆等待/通行/收工线），排不下就顺延或跳过并写进 `note`；缺 `estimatedDuration`/坐标的点位不进入生成；无日期行程不按星期过滤。改规则逻辑必须同步 `tools/test-plan-engine.mjs`
- 可行性引擎（ROADMAP P2）：`src/pages/plan/feasibility.js` 纯函数 `evaluateDay()`/`suggestFixes()`，硬约束含闭馆、最后入场、预订重叠、跨日、重复点位、缺时长/坐标、超收工线；未知开放日历保留宽边界但必定报 `hours-unknown`，**绝不当成"全天开放"**；没有点位的 `meal`/`break` 条目按"就地时间块"排程（不计交通/日历，不切断前后站通行），其他无点位条目仍报未绑定；交通只能是明确标注的估算（步行 ≤1.2km，否则地铁 10 分钟开销 + 30km/h）；跨午夜的时间一律用 `formatMinutesCrossDay()` 显示为「HH:MM（次日）」，不要用 `formatMinutes()` 直接展示可能超过 24:00 的值。改约束或估算必须同步 `tools/test-feasibility.mjs`
- 时间轴视图：`src/pages/plan/timeline.js` 是纯几何模型（轨道范围/小时刻度/色块/交通与等待/重叠/跨午夜），不碰 DOM；页面只负责渲染与拖动落库。改布局算法必须同步 `tools/test-timeline-view.mjs`
- 可执行修复：`src/pages/plan/repair.js` 的 `planAutoTrim()` 只删「可删 + 未锁定 + 非固定」条目且按停留从长到短；页面「自动减负」「收工延到」「解锁」「删重复」「移到预订后 / 下一天」「打车优先」都走普通编辑函数与撤销栈。改策略必须同步 `tools/test-repair.mjs`
- Plan B 与交通预算：`src/pages/plan/alternatives.js` 只从同城、未用、非 pending 点里选，同类型/同簇/同兴趣优先再按距离；`replaceItemPlace` 替换后恢复点位默认停留。`TripDay.transportMode=transit|taxi`，打车按 5 分钟固定开销 + 30km/h 估算；费用来自 `src/pages/plan/fare-table.js`（按城市的币种/起步/每公里/最低/取整/scoreUnit，覆盖 8 城，未配置城市返回 null 即不计费不显示），估算不是报价；求解器按城市 `scoreUnit` 折算费用，未配置不计分。改规则同步 `tools/test-alternatives.mjs` / `test-feasibility.mjs` / `test-solver.mjs` / `test-fare-table.mjs`
- 软目标：`src/pages/plan/soft.js` 的 `evaluateSoft()` 只输出事实（折返次数、地铁/打车段数、连续活动、留白、正午摄影点、兴趣命中），不合成评分；兴趣来自 `Trip.origin.interests`（生成时从表单写入，复制保留）。改口径必须同步 `tools/test-soft.mjs`
- 顺序求解：`src/pages/plan/solver.js` 的 `optimizeDayOrder()` 是确定性插入式局部搜索，只动「非固定、无绝对预订、无锁定」的 visit；时段序（上午→下午→晚上）权重高于折返/通行（1 次倒置≈10 分钟超时），打车费用按城市费率的 scoreUnit 折算，硬错误数不得增加；结果用 `reorderDay` 落库。改权重/邻域必须同步 `tools/test-solver.mjs`
- Trip v2 模块（ROADMAP P1/P2）：`src/pages/trip/schema.js`（实体工厂 + `validateTrip`，纯函数）、`src/pages/trip/migrate.js`（旧计划→Trip、打卡→Visit；名称→placeId，歧义进队列，零丢失）、`src/pages/trip/edit.js`（加点位/排序/跨天移动/增删天/改期策略/复制/当天钟点窗口/必去标记，纯函数且结果必须过 `validateTrip`）、`src/pages/trip/store.js`（IndexedDB/内存驱动、revision 递增、JSON 导入合并、迁移一次性 + 原始数据备份）。Day 新增 `startTime/endTime`（HH:MM，默认 09:00–21:00；校验要求 endTime > startTime，旧数据缺字段按默认兼容，`normalizeTrip` 会补齐）与 `transportMode`（transit/taxi，默认 transit）；Item 的 `mustVisit` 默认 true，显式 false 才可被自动减负删除；`pinnedStart`（HH:MM，空串=未锁定）是编辑器的软锚点，带日期的预订 `startLocal` 优先，其次才是 `pinnedStart`，最后是时间型 `startLocal`（被晚到只提示、不阻断；flexibility=fixed 才算硬冲突）；`estimatedDuration` 只允许 1–720 的整数或 null（null 时用点位默认值），`setItemDuration` 覆盖、`insertItemAt` 定点插入、`replaceItemPlace` 做 Plan B 替换（清空停留覆盖）。改契约或迁移规则必须同步 `tools/test-trip-schema.mjs` / `test-trip-migrate.mjs` / `test-trip-edit.mjs` / `test-trip-store.mjs`
- 行程页 `plan.html`（`src/pages/plan.js`）已是 Trip v2 编辑器：启动时把旧 `travel-plans-v1` 与 `travel-checkin-v2` 一次性迁入 IndexedDB（`travel-trips`），生成结果经 `migratePlansV1` 转成 Trip；编辑即时落库、内存撤销 30 步。旧 localStorage 数据只读保留，不再写入。每天卡片顶部显示可行性行（预计起止、停留、通行分钟与首个硬冲突），与 CI 用同一个 `evaluateDay()`；顶部可切换「列表 / 时间轴」，时间轴拖动色块锁定时刻、双击解锁、点块打开锁时/必去/删除面板，未排程条目单列展示；条目面板可就地 ±15 分钟改停留（可恢复点位默认）、一键插入 60 分钟午餐或 20 分钟休息预留（午餐就近 12:30 试排；type=meal/break、可删）；每天可行性行下有「可执行修复」按钮（自动减负 / 收工延到 / 解锁 / 删重复 / 移到预订后 / 移到下一天 / 打车优先），全部走撤销栈；下方软目标行显示折返、换乘、兴趣命中、正午摄影、连续活动与留白，并提供「✨ 优化顺序」（确定性局部搜索，尊重时段/锁定/预订）；条目面板提供 Plan B 候选（同城同类型近邻）一键替换
- SW 瓦片缓存白名单只有 OSM/OSM-DE/Esri；高德、腾讯（GCJ-02）与天地图（同源反代）都不进运行时缓存——`tools/sw-policy-test.mjs` 守护，别为了"多缓存"放宽
- 自定义 AI Key 的静态加密：已启用。2026-10-29 服务器装 `php-sodium`（PHP 8.3.36 + libsodium 1.0.19），密钥文件固定为 `/www/wwwroot/julyyunna-art-data/ai-at-rest.key`（`root:apache 640`，webroot 外；`AI_KEY_FILE` 或 config.php 的 `ai_key_file` 可覆盖）。新保存的 key 以 `enc:v1:` 落库，旧明文读取仍兼容。**该密钥文件丢失 = 已存 Key 无法解密（只能让用户重填）**，必须并入 NAS 密钥归档包；`ai_settings` 在启用时为空表，因此无需迁移旧数据。主密钥来源优先级、`AI_KEY_FILE` 在 FPM 下的真实行为（`clear_env`/`env[]`）、格式陷阱与恢复步骤见 `docs/AI-KEY-ENV.md`

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

- `check.yml`（push 触发）：check-data + 样板数据契约 + 城市排程字段（三亚/哈尔滨/伊宁/圣彼得堡/叶卡捷琳堡/阿拉木图/莫斯科州/其他城市）+ 变异测试（35 变异须全捕获）+ 坐标变换 + 计划模块单测 + Trip v2 单测 + 可行性/时间轴/修复/软目标/Plan B/顺序求解/费率表/资料管线单测与真实动线验收 + SW 缓存策略 + 文档事实 + assets ESM 严格解析 + 版本同步检查（改 assets/*.js 必须同提交改 map.html 与 sw.js）+ Playwright 冒烟（地图桌面/手机 + 行程页生成/排序/撤销/时间轴拖拽/午餐/休息/交通切换/刷新恢复截图 artifact）
- `monitor.yml`（每 6 小时）：探测腾讯云主站/API/NAS/TLS 证书（剩 <14 天告警），故障自动开 issue、恢复自动关闭；仓库 60 天无活动 GitHub 会停定时任务，手动跑一次即可恢复
- 探针脚本 `tools/site-monitor.mjs` 可本地直接跑（Pages 检查需网络可达 GitHub）

## 硬约束

- 坐标一律 **WGS84**：腾讯/飞猪返回的 GCJ-02 必须经 `tools/recalibrate-sanya.mjs` 的 `gcj2wgs()` 转换；腾讯 Key 从环境变量 `QQ_LBS_KEY` 读
- 底图：境外用 OSM 系（高德无俄罗斯数据）；中国用天地图（WGS，走同源 `/tdt/` 反代）或 OSM。高德/腾讯瓦片属 GCJ-02，**前端已统一在 `src/pages/map/coords.js` 的 `xy()` 做 wgs2gcj 补偿**（算法以 coordtransform 为准，2026-10-28 修正过系数错位的历史 bug；`node tools/coords-test.mjs` 守护，CI 强制）。看到点位偏移先跑 coords-test + 查 `__amapActive__`，别改数据（详见 `MAINTENANCE.md` §7.9）；遮罩边界只改 `tools/build_boundary.py` 生成，勿手改 JSON
- 打卡数据只写 localStorage（`travel-checkin-v2`）
- 密钥绝不写进仓库/聊天记录；权威备份在 NAS 密钥归档包
- 服务器 `/tools/` 已被 nginx 封禁（404），属安全策略，勿解除
- 两台电脑都会打开本仓库：同一时刻只一个会话改数据，改完 commit+部署再换边；改 `src/` 必须经 `npm run publish` 把产物一起带上（CI 有 src/产物一致性检查，分叉会红）
- 部署/提交前必跑：`node tools/deploy-check.mjs data/`（防未提交覆盖、防落后远端）；每台机器一次 `git config core.hooksPath .githooks` 启用提交前校验

## 数据结构速查

- `data/points.json` 点位：id/name/city/cluster/type/highlight/note/lat/lon/confidence(100精确/75待核)/tags；无坐标用 `pending: true`。排程字段（样板城市强制）：`name_local` / `estimatedDuration`(分钟) / `durationBasis`(estimate|measured) / `openCalendar`（`"unknown"` 或对象：`days/open/close/lastEntry/closed`，可选 `weekly` 按星期覆盖、`exceptions` 支持 date/date-range/nth-weekday(1–5 或 last)）/ `ticket`（未知也写 `"unknown"`）/ `sources[{type,collectedAt,reviewAfter}]`
- `data/routes.json` 动线：steps[] 以 `pointId`（`pNNN`）索引点位，`point` 只是展示快照；缺 pointId / id 不存在 / 名称不一致由 check-data 报错。改名或加点后跑 `node tools/migrate-routes-pointid.mjs`（幂等，`--check` 只校验），解析顺序 pointId → 名称兜底
- `data/ratings.json` 评分：多来源 `{items:{id:{ratings:[...]}}}`；携程来源=问道API环境变量 `WENDAO_API_KEY`（每日30次/令牌）；交通类点位不显示评分
- 第一方评分（私人米其林）：站长录入写 `data/michelin-manual.json`（`{id:{dims,overall,note,visited}}`），跑 fetch 脚本合并入 ratings.json；维度集按类型：餐饮 口味/性价比/等位/环境，酒店 位置/景观/服务/性价比，景点 出片/清净/可达/票价（全部正向，5=最好）
