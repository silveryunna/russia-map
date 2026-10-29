# 牛马打工人的旅行笔记

个人旅行记录网站：**互动地图打卡 · 每日动线 · 旅行笔记 · 相册 · AI 日程计划**。

线上地址：<https://julyyunna.art>（PWA，可"添加到主屏幕"离线使用）

## 这是什么

一个以地图为中心的旅行手账。目前收录 **626 个打卡点位**（俄罗斯主线 + 国内三亚/哈尔滨/伊宁等）、28 条每日动线，支持：

- 🗺️ **地图页**（`map.html`）：Leaflet 地图，点位/动线/城市筛选，已打卡置灰，动线顺序播放；境外用 OSM/Esri 底图，境内用天地图
- ✅ **打卡清单**（`list.html`）：按城市分组的打卡进度
- 📝 **旅行笔记**（`notes.html`）：Markdown 笔记
- 📷 **相册**（`album.html`）：旅行照片（内容筹备中）
- 🤖 **行程计划**（`plan.html`）：规则引擎离线生成 / AI 生成，生成后逐日编辑（加点位、排序、改期、撤销），数据存在本机 IndexedDB，可导出 JSON 备份与 Markdown
- 👥 **朋友投稿 / 协作管理**（`friend.html` / `account.html`）：朋友可提交点位与笔记，管理员审核

## 技术栈

- 前端：原生 ES Module + Leaflet，PWA（Service Worker 离线缓存），无框架
- 后端：`api/` 一个 PHP + SQLite 小 API（投稿、审核、AI 代理、用量台账）
- 数据：`data/*.json` 是唯一事实来源，"数据即代码"——每次改动必须过校验器
- 部署：腾讯云静态托管（nginx）+ GitHub 备份与 CI

## 仓库结构速览

```
index/map/list/notes/album/plan/friend/account/admin .html   九个页面（构建产物，源头在 src/）
src/               页面源码与共享模块（Vite 构建入口，改这里）
assets/            前端 JS/CSS（hash 命名的构建产物，禁止手改）
data/              points/routes/ratings 等 JSON 数据（626 点位）
api/               PHP+SQLite 后端
tools/             check-data / mutation-test / 各类单测 / deploy-check / site-monitor 等
docs 三件套：      README(本文件) → 给人看；AGENTS.md / MAINTENANCE.md → 给 AI 助手看
REMOTE-DEV.md      NAS/隧道远程开发接入指南
```

## 本地开发

```bash
npm ci
npm run dev        # Vite dev server（root=src/）
```

`vite.config.js` 里的 `devRepoAssets` 插件会把仓库根的 `data/`、`content/`、`photos/` 与白名单根文件映射到站点根，所以页面里的 `./data/points.json` 在开发态可用；`/api/*` 默认返回"开发态未接入 PHP 后端"的 JSON（页面会降级到规则引擎），要连真实后端就：

```bash
DEV_API=http://127.0.0.1:8080 npm run dev
```

本地 `npm run dev` 与 `python -m http.server` 都**看不到天地图底图**（`/tdt/` 是服务器上的 nginx 反代），属预期行为。

## 质量门

```bash
npm test           # 规则引擎 + 计划存储 + Trip 契约/迁移/存储 + SW 缓存策略 + 坐标变换 + 文档事实
node tools/check-data.mjs ./data
node tools/mutation-test.mjs     # 校验器变异测试（26 个变异须全捕获）
node tools/check-doc-facts.mjs   # README/AGENTS 里的数字是否与代码一致
```

## 参与开发（3 分钟上手）

```bash
git clone https://github.com/silveryunna/russia-map.git
cd russia-map
git config core.hooksPath .githooks        # 提交前校验（必做，一次即可）

# 改了数据后：
node tools/check-data.mjs ./data           # 必须全绿
node tools/deploy-check.mjs data/          # 提交/部署前防覆盖检查
```

本地预览：`npm run dev`（推荐），或任意静态服务器，如 `npx serve .`。

**必读红线**（摘自 AGENTS.md）：

- 坐标一律 WGS84；国内图商 GCJ-02 必须转换
- 根目录 HTML 与 `assets/` 是构建产物，禁止手改；改 `src/` 后 `npm run publish` 一键发布（产物回写 + commit + push）
- 密钥绝不入库：天地图 Key 为服务端类型，只写在服务器 nginx 的 `/www/server/panel/vhost/nginx/julyyunna.art.conf`（`/tdt/` 段），由 nginx 追加到上游请求；前端代码里不允许出现任何 Key 明文
- 注意：本地静态预览**看不到天地图底图**（`/tdt/` 是服务器上的 nginx 反代，本地没有），这是预期行为，不是 bug
- 打开 PR / 提交前跑一遍 `npm test` 与 `node tools/mutation-test.mjs`（CI 也会跑）

## 文档地图

| 文档 | 读者 | 内容 |
|---|---|---|
| `README.md`（本文） | 人类 | 项目介绍与上手 |
| `AGENTS.md` | AI 助手 | 硬性规则与数据契约 |
| `MAINTENANCE.md` | AI 助手/维护者 | 完整维护知识与踩坑记录 |
| `REMOTE-DEV.md` | 远程开发者 | NAS · frp 隧道 · SSH 跳板接入 |
| `docs/AI-KEY-ENV.md` | 维护者/运维 | AI Key 静态加密主密钥来源、`AI_KEY_FILE` 覆盖行为与恢复 |

## 许可

个人项目，内容（文字/照片/数据）版权归站长所有；代码仅供学习参考。
