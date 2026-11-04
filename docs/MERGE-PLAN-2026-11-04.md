# 分叉合并方案（2026-11-04）

> 依据：`git merge-tree --write-tree` 实测模拟 + 两侧 `git diff`/`git numstat` 逐文件核对
> 范围：本地 `HEAD a31b0b6`（37 独有提交）⇄ `origin/main 765096b`（16 独有提交），merge-base `0e4f5d1`
> 状态：**本方案是执行计划，尚未执行**；执行前须由站主裁决 telemetry 去留与主干方向。

---

## 0. 一句话结论

以**本地为主线**，单次 `git merge origin/main`（不 rebase），14 个内容冲突手工合并、5 个自动合并、telemetry 裁决继续删除；合并后 `npm test` + `npm run build` 全绿为验收门槛。

---

## 1. 分叉基线（A 级实测）

| 指标 | 数值 |
|---|---|
| merge-base | `0e4f5d1` |
| 本地 / origin 独有提交 | 37 / 16 |
| 本地独有文件 / origin 独有文件 | 82 / 83 |
| 共同改动文件 | 19 |
| **内容冲突（需手工）** | **14** |
| 自动合并（无需手工） | 5 |
| telemetry 类（裁解决定） | 2（`telemetry.js` / `test-telemetry.mjs`） |

---

## 2. 总策略

1. **主干 = 本地**。理由：本地含上线阻塞项 P1-6 / A-16（fact 投稿、审核状态机、changeset、举报闭环），且体量更大（37 vs 16）。
2. **单次 merge，不 rebase**。37 个提交逐个 rebase 到 16 个新提交之上，冲突要按提交重复解，成本高、易遗漏；单次 merge 只解 14 处，产生一个 merge commit。
3. **telemetry 裁决：继续删除**（延续 `T0-3 选 B` + 质量门冻结 12 周）。merge 会把 origin 保留的 `telemetry.js`（blob 未变）带回来，需显式 `git rm`。
4. **数据层隐患显式处理**：本地已拆「其他城市」垃圾桶（`77adf75`），origin 的 `test` 脚本仍引用 `其他城市`，合并后该行必须删，否则 `check-city-duration` 落空。

---

## 3. 执行步骤（命令级）

```bash
# 0. 安全备份（出问题可整体回滚）
git branch backup/premerge-$(date +%Y%m%d-%H%M)

# 1. 启动合并，不自动提交
git merge origin/main --no-commit --no-ff

# 2. 逐个解决 14 个冲突（见 §4 表），5 个 auto-merge 勿动

# 3. telemetry 裁决（继续删除）
git rm src/shared/telemetry.js tools/test-telemetry.mjs
#   并从 package.json 的 test 脚本中删除 "node tools/test-telemetry.mjs &&"
#   从 test 脚本中删除 "check-city-duration ... 其他城市 &&"

# 4. 验收（全绿才继续）
npm test
npm run build
node tools/check-ci-parity.mjs      # 门数口径合并后需一致

# 5. 提交合并
git add -A
git commit --no-edit   # 或写 "merge(origin): 汇入 origin 16 提交（CI安全/离线/存储/城市色/动线棘轮）"

# 6. push 前人工 review diff，确认无信息丢失再 push
git push
```

---

## 4. 逐文件合并策略表

### 4.1 自动合并（5 个，git 已能净合并，勿手工改）

| 文件 | 说明 |
|---|---|
| `.github/workflows/check.yml` | origin +14（Markdown 测试挪到 npm ci 后） |
| `MAINTENANCE.md` | 两边小改，无重叠 |
| `src/pages/plan.js` | 本地 +225（板块/分享/两栏）、origin +13，区域不重叠 |
| `src/pages/today.js` | 本地 +40、origin +12，不重叠 |
| `src/pages/trip/store.js` | 本地 +34、origin +15，不重叠 |

### 4.2 重灾区：必须逐段手工合并（2 个）

| 文件 | 本地改动（+627/−60） | origin 改动（+147/−21） | 动作 |
|---|---|---|---|
| **`api/index.php`** | type=fact 投稿；review 状态机（approve/reject/needs_more）；changesets 表+端点；report/reports/report_handle 举报闭环；ban 端点；login banned 拦截；schema 增列（target_field/new_value/source_url、submission_logs/changesets/report_*、accounts.banned） | 删号清理关联数据（`3f146df`）；登录双阈值限流；AI 排程上下文补字段；AI Key 加密失败关闭（`7501f88`）；ai_test 凭据外带防护；routes 上限 | 两端功能正交，**全保留**。冲突集中在 `submit` 端点与 schema 定义块。做法：以本地版为底，把 origin 的删号/AI 治理/限流新端点与函数逐段搬入；schema 两侧 ALTER 合并到同一 schema 块；顶部端点注释列表做并集 |
| **`tools/test-api-contract.mjs`** | P1-6+A-16 全部静态断言（fact 校验/隐藏板块/状态机/changeset/举报去重限流）+ 工具实跑节 | 删号清理/双阈值/AI 治理断言 | **并集**。两边断言都要；注意 `WRITE_ENDPOINTS` 与 admin 端点列表合并（本地加 report，origin 加其它），避免断言互相覆盖 |

### 4.3 前端「本地大改 + origin 小改」：本地为主，搬 origin 增量（6 个）

| 文件 | 本地 | origin | 动作 |
|---|---|---|---|
| `src/pages/account.js` | +228/-23：举报管理 tab、changesets tab、ban/unban、pending 筛选 | +5：删号入口 | 本地为主，搬 origin 的删号入口 ~5 行 |
| `src/pages/friend.js` | +103/-14：fact 纠错投稿、举报入口 | +5 | 本地为主，搬 origin 增量 |
| `src/pages/list.js` | +109/-15：板块显隐、分享按钮、移除合并横幅 | +3/-1 | 本地为主 |
| `src/pages/map.js` | +237/-69：板块切换显隐、白屏修复、fitBounds | +3/-1 | 本地为主 |
| `src/pages/admin.js` | +3/-2 | +5/-4 | 两边都小，对位手工合并 |

### 4.4 前端/工具「origin 大改」：origin 为主，搬回本地增量（4 个）

| 文件 | 本地 | origin | 动作 |
|---|---|---|---|
| `src/pages/notes2.js` | +5/-2 | +17/-9：Markdown 安全渲染（`9ec648e` 转义 HTML 与危险链接，**安全项必保**） | origin 为主，保留本地 +5 |
| `src/pages/plan/generate.js` | +10/-4 | +93/-18：AI 方案落库前可行性复核（`5e443c5`）+ 幂等 | origin 为主，搬本地 +10 |
| `src/pages/plan/io.js` | +2/-1 | +22/-7：AI 生成重试上限 | origin 为主 |
| `sw.js` | +17/-4 | +101/-15：离线预缓存+保留上一代缓存+全页更新提示（`7eaa506`） | origin 为主，搬本地 +17 |

### 4.5 工具测试「两边都加断言」：并集（1 个）

| 文件 | 动作 |
|---|---|
| `tools/sw-policy-test.mjs` | 本地 +21 / origin +73，两边断言全保留 |

### 4.6 文档（1 个）

| 文件 | 动作 |
|---|---|
| `AGENTS.md` | 本地 +2/-2 / origin +10/-5（城市色纪律等），取并集 |

---

## 5. 数据层与脚本隐患（合并后必查）

1. **「其他城市」拆分歧**：本地 `77adf75` 已拆；origin 的 `test` 仍含 `check-city-duration ... 其他城市`。合并后必须删该行，否则 `npm test` 在 data 里找不到该城市而失败。
2. **telemetry 连带**：删 `telemetry.js` 时同步删 `package.json` 里的 `test-telemetry.mjs` 引用，否则 test 脚本报「找不到测试文件」。
3. **门数口径**：合并后 `check-ci-parity`（会派生门数）与 `audit-snapshot`（qualityGates）必须对齐；origin 新增了 `test-storage-health / test-ai-key-status / check-route-contract / test-markdown / gen-sitemap --check` 5 门，本地新增了 P1-6/A-16 相关断言，两边门都要进 test 脚本。
4. **`check-route-contract.mjs` 依赖基线**：origin 新增 `tools/fixtures/route-contract-baseline.json`（+262），确认该 fixture 与本地 data 兼容，否则门会红。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `api/index.php` 手工合并漏字段（submit/AI 治理交叉） | 合并前先 `git diff 0e4f5d1 HEAD -- api/index.php` 与 `... origin/main -- api/index.php` 各看一遍；合并后跑 `test-api-contract.mjs` 静态断言兜底 |
| 合并像"捡芝麻丢西瓜"（丢一边功能） | 验收时按 §7 功能清单逐项核对两边功能都在 |
| `npm test` 因门数/数据分歧而红 | 先处理 §5 的 4 项再跑 test；红了只修门，不开新功能 |
| OneDrive 同步再毁 `.git` | 执行前确认 `git rev-parse HEAD` 正常、无 `*-主机名.*` 副本（承接 T0-0） |

---

## 7. 验收清单

- [ ] `npm test` 全绿（含合并后门数口径一致）
- [ ] `npm run build` 通过
- [ ] `git status` 干净
- [ ] `git log --graph -5` 呈现 merge commit，两条线汇合
- [ ] 本地功能仍在：fact 纠错投稿、举报入口、板块切换、分享按钮
- [ ] origin 功能仍在：Markdown 安全渲染、删号清理、离线预缓存、城市色、动线契约棘轮
- [ ] `telemetry.js` 已删，`package.json` 无 `test-telemetry` 引用
- [ ] push 前人工 review 完整 `git diff origin/main...HEAD`，确认无信息丢失

---

## 附：telemetry 去留的备选

若站主裁决「保留埋点骨架」（推翻 T0-3），则跳过 §3 第 3 步，反向操作：保留 `telemetry.js`，从 `package.json` 恢复 `test-telemetry.mjs`。默认本方案按「继续删除」执行。