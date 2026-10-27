# 牛马打工人的旅行笔记

个人旅行记录网站：**互动地图打卡 · 每日动线 · 旅行笔记 · 相册 · AI 日程计划**。

线上地址：<https://julyyunna.art>（PWA，可"添加到主屏幕"离线使用）

## 这是什么

一个以地图为中心的旅行手账。目前收录 **626 个打卡点位**（俄罗斯主线 + 国内三亚/哈尔滨/伊宁等）、28 条每日动线，支持：

- 🗺️ **地图页**（`map.html`）：Leaflet 地图，点位/动线/城市筛选，已打卡置灰，动线顺序播放；境外用 OSM/Esri 底图，境内用天地图
- ✅ **打卡清单**（`list.html`）：按城市分组的打卡进度
- 📝 **旅行笔记**（`notes.html`）：Markdown 笔记
- 📷 **相册**（`album.html`）：旅行照片（内容筹备中）
- 🤖 **日程计划**（`plan.html`）：接入腾讯云 TokenHub 的 AI 行程生成，朋友也可限时使用
- 👥 **朋友投稿 / 协作管理**（`friend.html` / `account.html`）：朋友可提交点位与笔记，管理员审核

## 技术栈

- 前端：原生 ES Module + Leaflet，PWA（Service Worker 离线缓存），无框架
- 后端：`api/` 一个 PHP + SQLite 小 API（投稿、审核、AI 代理、用量台账）
- 数据：`data/*.json` 是唯一事实来源，"数据即代码"——每次改动必须过校验器
- 部署：腾讯云静态托管（nginx）+ GitHub 备份与 CI

## 仓库结构速览

```
index/map/list/notes/album/plan/friend/account/admin .html   九个页面
assets/            前端 JS/CSS（部分为压缩产物，迭代须知见 MAINTENANCE.md）
data/              points/routes/ratings 等 JSON 数据（626 点位）
api/               PHP+SQLite 后端
tools/             check-data / mutation-test / deploy-check / site-monitor 等
docs 三件套：      README(本文件) → 给人看；AGENTS.md / MAINTENANCE.md → 给 AI 助手看
REMOTE-DEV.md      NAS/隧道远程开发接入指南
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

本地预览：任意静态服务器，如 `npx serve .` 或 `python -m http.server`。

**必读红线**（摘自 AGENTS.md）：

- 坐标一律 WGS84；国内图商 GCJ-02 必须转换
- 改 `assets/*.js` 必须同提交 bump `map.html ?v=` 与 `sw.js VERSION`（CI 强制）
- 密钥绝不入库（天地图 Key 用 `assets/tdt-key.example.js` 模板生成本地 `tdt-key.js`）
- 打开 PR / 提交前跑一遍 `node tools/mutation-test.mjs`（CI 也会跑）

## 文档地图

| 文档 | 读者 | 内容 |
|---|---|---|
| `README.md`（本文） | 人类 | 项目介绍与上手 |
| `AGENTS.md` | AI 助手 | 硬性规则与数据契约 |
| `MAINTENANCE.md` | AI 助手/维护者 | 完整维护知识与踩坑记录 |
| `REMOTE-DEV.md` | 远程开发者 | NAS · frp 隧道 · SSH 跳板接入 |

## 许可

个人项目，内容（文字/照片/数据）版权归站长所有；代码仅供学习参考。
