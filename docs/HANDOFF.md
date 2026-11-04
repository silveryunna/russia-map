# HANDOFF（已冻结，2026-11-04）

> **本文档冻结。** 旧版 HANDOFF 以"末尾追加"方式维护，同一文件里并存多套互相矛盾的事实，且未被推翻的旧说法无任何标记（见 `docs/AUDIT-2026-11-03.md` §7）。
> 现行做法以 [`AGENTS.md`](../AGENTS.md) + [`docs/DEV-PLAN-2026-11-03.md`](DEV-PLAN-2026-11-03.md) 为准；本文只保留勘误表，不再追加新内容。

## 已被推翻的说法（逐条标注，勿再照做）

| # | 旧说法 | 现行做法（证据） | 标注日期 |
|---|---|---|---|
| H1 | 打卡状态只写 localStorage，键 `travel-checkin-v2` | 已迁 IndexedDB；`travel-checkin-v2` 降为只读投影；`checkin.js` 已收敛为只读（`tools/test-checkin-readonly.mjs` 守护） | 2026-11-03 |
| H2 | 腾讯云靠 scp 直传，服务器 cron 自动 pull 已失效 | **判错。** 服务器实测 `crontab -l` 为 `*/2 * * * * /root/update-russia-map.sh`，scp 热修会被 `reset --hard` 覆盖 | 2026-11-03 |
| H3 | 改代码要手改 `assets/*.js`、`?v=` +1、`sw.js VERSION` +1 | 产物禁手改；`?v=` 仪式废除；VERSION 构建期注入 git short sha | 2026-11-03 |
| H4 | 底图只用 OSM 系 | 2026-11-02 站长裁决纳入天地图 `/tdt/` 反代，SW 白名单含 `/tdt/`（`sw-policy-test` 守护） | 2026-11-03 |
| H5 | 不做任何服务端交互的新增 | 已有 `ai_settings / ai_policy / ai_usage`、实况层发布管道与 UGC 投稿审核回路；新边界见 `AGENTS.md` | 2026-11-03 |
| H6 | 626+ 点位 / SW `tn-v38` | 以 `npm test` 的 `check-data` / 构建注入为准，文档不写死数字 | 2026-11-03 |
| H7 | `travel-notes` 是源码工程，"UI 修改多直接改构建产物" | 2026-10-28 方案 M 已单仓合并，旧副本已废弃勿构建 | 2026-11-03 |

## 仍然有效的基线

- 根目录 HTML 与 `assets/` 是构建产物，禁止手改；改源码后走 `npm run publish`。
- `tools/` 必须在 webroot 外，服务器 nginx 已封禁 `/tools/`。
- 坐标统一 WGS84，GCJ-02 必须转换（`coords-test` 在 CI）。
- 凭证集中于 NAS 密钥归档包，清单见 `docs/CREDENTIALS.md`。
