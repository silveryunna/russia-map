# 第三方依赖与参考仓库

> 目的：把"我们参考了什么、抄没抄、许可证是否相容"写清楚，避免商业化时踩到许可证红线。
> 维护规则：新增依赖、新增参考仓库、新增数据源时同步更新本文件。

## 1. 架构参考仓库（未复制代码）

2026-10-31 为撰写 `docs/PLATFORM-STRATEGY-2026-11.md` 浅克隆并走读了以下仓库。
**只读结构、借鉴架构思路，未复制任何源码进本仓库。**

| 仓库 | Commit | 许可证 | 我们取用的 | 红线 |
|---|---|---|---|---|
| [liketrek/TREK](https://github.com/liketrek/TREK) | `dc36c21` | **AGPL-3.0** | 实体清单当检查表、addon 式功能开关、迁移前快照 | 复制代码会传染 AGPL（含网络服务），**只读不抄** |
| [shouzhuoshouzhuo/FloatTrip](https://github.com/shouzhuoshouzhou/FloatTrip) | `8c8972f` | **无 LICENSE** | "LLM 只做语义、排程必须确定性"、权威候选池、质量门抛错 | 无许可证 = 保留所有权利，**一行都不能抄** |
| [do-tongxue/Travel-Plan-Page](https://github.com/do-tongxue/Travel-Plan-Page) | `ed869d2` | MIT | 事实/行程分离、source-facts 字段设计、去重矩阵文档 | 保留版权声明即可复用 |
| [Prism-Shadow/travel-agent](https://github.com/Prism-Shadow/travel-agent) | `dd0ac16` | Apache-2.0 | ADR 决策记录习惯、"止步于支付"的边界、trip-as-folder | 保留 NOTICE 与专利授权 |
| [TokenHungryMash/personalized-travel-guide-skill](https://github.com/TokenHungryMash/personalized-travel-guide-skill) | `66e5442` | MIT | 结构化 intake 问卷、8 模块手册 IA、"模板≠证据"纪律 | 保留版权声明 |
| [dengmeiluan/ticket-monitoring](https://github.com/dengmeiluan/ticket-monitoring) | `5cff7f5` | Apache-2.0 | 告警去重与节流、健康自诊断、历史版本 | 保留 NOTICE |

> 结论：本仓库最终采用的许可证（代码 MIT）与上述任何许可证都不冲突，因为我们没有复制 AGPL / 无许可证仓库的代码。

## 2. 运行时依赖

| 包 | 用途 | 许可证 |
|---|---|---|
| `leaflet` | 地图引擎 | BSD-2-Clause |
| `leaflet-geosearch` | 地点搜索控件 | 见 npm 包声明 |
| `leaflet.fullscreen` | 全屏控件 | 见 npm 包声明 |
| `leaflet.locatecontrol` | 定位控件 | 见 npm 包声明 |
| `leaflet.markercluster` | 点位聚合 | 见 npm 包声明 |
| `marked` | Markdown 渲染 | MIT |
| `vite`（dev） | 构建 | MIT |

许可证以各包 `package.json` / `LICENSE` 为准；升级依赖时若许可证变化，需回到本表更新。

## 3. 数据与底图来源

| 来源 | 用途 | 约束 |
|---|---|---|
| OpenStreetMap / OSM-DE | 境外底图 | ODbL：需署名，衍生数据库需同许可 |
| Esri World Imagery | 境外卫星底图 | 遵守 Esri 服务条款 |
| 天地图 | 境内底图 | Key 为服务端类型，只存在服务器 nginx `/tdt/` 反代，前端不持有 |
| 2GIS Routing API | `data/transit-matrix.json` 路线样本 | 仅存时长/距离等派生数值，不落原始响应、不转售；配额受限 |
| 携程 / 问道 API | `data/ratings.json` 第三方评分 | 按接口条款使用，标注来源 |
| 场馆官网 / 官方预约页 | 开放时间、票价等事实 | 记录 `source.url` 与 `collectedAt`；不做整站镜像 |
| 用户投稿 | 点位补充、笔记、照片 | 投稿需勾选"我有权使用"；建立下架流程 |

## 4. 合规红线（对应 §12.2）

1. 不复制 AGPL 代码；不从无许可证仓库复制代码。
2. 不转售第三方原始数据；只分发我们核验过的派生事实，并标注来源与核验日期。
3. 不采集连续定位轨迹；不做设备指纹；埋点可在设置中关闭。
4. 收到侵权/许可证通知时，24 小时内先下架再沟通。
