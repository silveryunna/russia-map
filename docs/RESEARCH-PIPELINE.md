# 资料补全流水线（开发后台 / NAS）

目标：把「哪里缺事实」变成队列，把「网上看到的线索」变成有来源的候选，再由人或官方来源核验后进入 `data/`。
**研究产物不进仓库、不进 webroot、不进 CI；Agent-Reach 只做发现，不做事实判定。**

## 1. 目录

所有研究数据放在仓库和 webroot 之外（本机或 NAS 共享目录）：

```text
~/travel-research/
  queue-莫斯科.json        # 缺口队列（tools/research-queue.mjs）
  candidates-莫斯科.json   # 候选事实（Agent/人工产出）
  reports/                 # 状态报告（tools/research-report.mjs）
  evidence/                # 页面快照/截图/哈希（仅本地，不入库）
```

仓库根就是线上 webroot，提交进去的调研笔记、截图、抓取原文都会公开；只允许已核验的事实与来源 URL 进入 `data/`。

## 2. 命令

```bash
# 1) 从数据缺口生成队列（默认写到 ~/travel-research/，禁止写进仓库）
node tools/research-queue.mjs --city 莫斯科 --fields openCalendar,ticket --limit 10

# 2) 校验候选事实（格式、日期、来源等级、冲突说明）
node tools/research-validate.mjs ~/travel-research/candidates-莫斯科.json --data ./data

# 3) 查看进度/过期复核
node tools/research-report.mjs ~/travel-research/candidates-莫斯科.json \
  --queue ~/travel-research/queue-莫斯科.json \
  --out ~/travel-research/reports/2026-10-31.md
```

## 3. 候选事实格式

```json
[
  {
    "pointId": "p002",
    "field": "openCalendar",
    "value": { "days": "Mo-Su", "open": "10:00", "close": "17:00", "lastEntry": "16:30" },
    "status": "verified",
    "sourceType": "official",
    "sourceUrl": "https://example-official-site/...",
    "sourceLabel": "官网开放时间页",
    "collectedAt": "2026-10-31",
    "reviewAfter": "2027-04-30",
    "evidencePath": "evidence/p002-hours-2026-10-31.html",
    "note": "节假日以官网公告为准"
  }
]
```

字段：`openCalendar | ticket | name_local | duration | sources`。状态：`pending | verified | estimated | conflict | unknown`。

硬规则（`tools/research-validate.mjs` 强制）：

- `verified` 只能来自 `official` 来源；UGC/视频只能标 `estimated` 或 `conflict`；
- 非 `unknown` 必须有 `https://` 来源链接；`conflict` 必须有 `note`；
- `collectedAt/reviewAfter` 为 `YYYY-MM-DD`，且 `reviewAfter >= collectedAt`；
- 同一 `pointId+field` 只能有一条候选；
- 过期未复核的候选会被 `research-report` 标出，不能继续当已验证事实。

## 4. 工作流

```text
数据缺口（队列）
   ↓  Agent-Reach / WebSearch / 官方站  → 只产出候选 JSON
候选校验（research-validate）
   ↓
人工/官方核验（sources + collectedAt + reviewAfter）
   ↓
生成 data 补丁（只改已核验字段；unknown 保持 unknown）
   ↓
check-data / check-sample-data / check-city-duration / npm test
   ↓
提交 + 发布（人工确认，绝不自动 push）
```

- 队列按「动线覆盖次数」排序，优先补真实行程用得到的点位；试点默认只取 10 条。
- 官方来源优先：博物馆/剧院官网、官方票务、市政/交通官网；2GIS/Yandex/官方 App 次之；社媒只能当线索。
- 同一字段多来源冲突时保留 `conflict` 候选和证据，不静默覆盖；`unknown` 是合法终态。

## 5. Agent-Reach 的边界

Agent-Reach（https://github.com/Panniantong/Agent-Reach）适合读取小红书、B站、YouTube 字幕、V2EX 等通用搜索覆盖差的平台，但它：

- 是给 Agent 用的 CLI，不是可嵌入站点的库；需要 Python/浏览器/登录会话；
- 会复制本机浏览器登录，NAS 上需要专用浏览器 profile 和小号；
- 平台改版/反爬会导致不稳定；不应成为 CI 或发布的硬依赖；
- 输出是线索，不是核实事实；`verified` 必须回到官方来源。

建议只在**开发机或 NAS 的隔离容器**里运行；不暴露浏览器端口到公网，不挂载生产数据，不把登录态/密钥写进仓库。

## 6. NAS 部署建议

- 单独 Docker 容器：专用非 root 用户、无入站端口、只读挂载项目 `data/`，输出挂载到 webroot 外的研究卷；
- 浏览器 profile 与登录态放在研究卷，定期备份；用一次性/小号账号；
- 用 cron/队列触发一次性任务，不常驻浏览器；任务日志与失败告警单独保留；
- 不把 NAS 的研究目录映射到线上站点目录；任何 `data/` 变更仍走仓库审查与质量门。

## 7. 试点验收（建议）

- 范围：莫斯科样板 10 个点位 × `openCalendar/ticket`；
- 成功标准：官方核验率 ≥80%，每条有来源与复核日期；人工 review ≤30 分钟/周；研究失败不影响发布；
- 未达标则回到 WebSearch/WebFetch，不引入常驻依赖；
- 后续再把同一队列机制扩展到票价、预约规则和城市交通矩阵。

### 2026-10-31 试点结果

- 10 个点位 × 2 字段 = 20 条候选：`verified 6`、`estimated 1`、`unknown 13`；
- 写入 data：开放日历 4 个（克里姆林宫/古姆/历史博物馆/普希金博物馆）、票价 2 个（历史博物馆/普希金博物馆）；样板覆盖从 0/42 提升到日历 4/42、票价 2/42；
- 未达 80% 官方核验目标，**不扩展全量**。主要阻塞：
  - 真实博物馆常按星期/日期细分营业时间（如普希金周四至周六至 21:00、历史博物馆周四至周六至 21:00、圣瓦西里每月第一个周三闭馆），现有 `openCalendar` 只能存一条周规则，无法精确表达；
  - 部分官方票务页是动态脚本（克里姆林宫、圣瓦西里），本机网络也无法访问 mosmetro.ru / bolshoi.ru；
  - 开放空间（红场/阿尔巴特）缺少可引用的官方 24h 声明，保持 unknown。
- 下一步优先级：先扩展 `openCalendar`（按星期/日期例外）或明确"保守边界"语义，再继续核验；Agent-Reach 本轮未参与，用 WebSearch/WebFetch 完成。
