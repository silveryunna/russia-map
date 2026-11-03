# 凭证清单与轮换表

> 本文件**只记录"哪把钥匙、放在哪、何时到期"，绝不记录值**。
> 值只存在两处：服务器环境变量 / NAS 密钥归档包。任何人不得把明文贴进仓库、文档、Issue 或聊天。
>
> 背景：2026-11-03 审计确认有 6 把地图/模型相关 Key 曾在聊天记录中出现，需全部轮换。
> 相关：`docs/AI-KEY-ENV.md`（模型 Key 的加密存储与 `enc:v1:` 机制）、`docs/HANDOFF.md`。

## 1. 轮换状态总表

| # | 凭证 | 用途 | 存放位置 | 最近轮换 | 下次到期 | 状态 |
|---|---|---|---|---|---|---|
| 1 | 天地图 tk | 中国底图（`/tdt/` 反代） | 服务器 env `TDT_KEY`；本机 `assets/tdt-key.js`（已 gitignore） | 待填 | 待填 | ☐ 待轮换 / ☐ 已轮换 |
| 2 | 高德开放平台 Key | 中国 POI/地理编码（构建期脚本） | 本机 `.env` / 系统环境变量 | 待填 | 待填 | ☐ 待轮换 / ☐ 已轮换 |
| 3 | Yandex Maps Key | 俄罗斯地理编码/静态图 | 本机 `.env` / 服务器 env | 待填 | 待填 | ☐ 待轮换 / ☐ 已轮换 |
| 4 | 问道（Ctrip）token | `data/ratings.json` 评分采集 | 本机 `.env` | 待填 | 待填 | ☐ 待轮换 / ☐ 已轮换 |
| 5 | 模型 API Key（OpenAI 兼容） | 站内 AI 行程生成 | 服务器 env `AI_KEY` / `AI_AT_REST_KEY` | 待填 | 待填 | ☐ 待轮换 / ☐ 已轮换 |
| 6 | GitHub Token（push/deploy） | `tools/publish.mjs` push | 本机凭证助手 | 待填 | 待填 | ☐ 待轮换 / ☐ 已轮换 |

## 2. 轮换操作清单

每把 Key 的流程一致：

1. 在对应控制台新建一把 Key（**不要**直接删除旧的，先并行验证）。
2. 更新服务器 env / 本机 `.env` / `assets/tdt-key.js`（本机文件仅本地，不入库）。
3. 回归：地图首页与 `/tdt/` 瓦片、`tools/geocode-*.mjs` 单点试跑、站内 AI 生成一次行程。
4. 全部通过后再吊销旧 Key，并在上表填「最近轮换 + 下次到期」。
5. 若轮换的是模型主 Key：已存用户 Key 用 `enc:v1:` 加密，主 Key 变更会使它们全部失效（见 `docs/AI-KEY-ENV.md`），需提前公告并保留旧主 Key 一个过渡周期。

## 3. 仓库纪律

- `assets/tdt-key.js` 在 `.gitignore` 内；前端生产走 `/tdt/` 反代，不持有 Key。
- 文档里出现 Key 一律打码为 `前缀…`（如 `7b44…`），禁止出现完整值。
- 提交前自查：`git grep -nE "(tk=|api_key=|Bearer |sk-)" -- docs assets src api tools` 应无完整 Key 命中。
