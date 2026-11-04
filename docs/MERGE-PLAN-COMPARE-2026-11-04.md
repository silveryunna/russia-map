# 分叉合并方案对比（2026-11-04）

> 补前文 [`MERGE-PLAN-2026-11-04.md`](MERGE-PLAN-2026-11-04.md)（方案 A 详案）。
> 附加实测：`git merge-tree` 冲突面、modify/delete 与 add/add 扫描、产物分歧规模、rebase 冲突点计数。

---

## 0. 结论速查（三方案）

| 方案 | 主线 | 机制 | 冲突处理 | 历史 | 推荐度 |
|---|---|---|---|---|---|
| **A** | 本地 | merge（`git merge origin/main`） | 1 次（14 文件） | 保留分叉 | 可行，但主线方向反 |
| **B1** | origin | 反向 merge（`checkout -b release origin/main` 后 `merge HEAD`） | 1 次（14 文件） | 保留分叉 | **兼顾优选** |
| **B2** | origin | rebase（`git rebase origin/main`） | ≈10–20 次（见 2.2） | 线性、抹平分叉 | 不推荐（成本高） |
| **C** | origin | = B1 + 治理记录 + 产物重跑 | 1 次 | 保留分叉 | **最终推荐** |

**核心事实**：merge 是交换律，A 与 B1 的最终代码树**完全相同**，差异只在「谁做第一父（主线呈现）」与「merge commit 的 message 怎么写」。rebase（B2）则改写 37 个提交 hash 且冲突成本高。

---

## 1. 方案 A：本地为主线（merge）—— 已见前文，此处不复述

一句话：在本地 `HEAD` 上 `git merge origin/main`，第一父 = 本地 37 提交链。push 为 fast-forward（无需 force）。

---

## 2. 方案 B：origin 为主线

### 2.1 B1 · 反向 merge（低成本、保分叉）

```bash
git fetch
git checkout -b release origin/main        # 关键：以 origin 为基开分支，才能让第一父是 origin
git merge HEAD                              # 并入本地 37 提交（--no-commit --no-ff 便于审）
# 解 14 个 content 冲突 + 5 auto-merge + telemetry 裁决（同前文 §4/§5）
npm test && npm run build
node tools/publish.mjs                      # 重跑 publish，收敛产物（见 §5 盲区 1）
git add -A && git commit --no-edit
git push -u origin release
# 若要 cover 掉 main：git push origin release:main（仍为 fast-forward）
```

**易错点**：若直接在当前本地分支 `git merge origin/main`，第一父永远是本地，达不到「origin 是主线」。必须 `checkout -b release origin/main`。

### 2.2 B2 · rebase（线性历史，但成本高）

```bash
git rebase origin/main
# 37 个提交逐个重放，hash 全变；冲突逐个解
```

实测 rebase 冲突点计数（本地 37 提交触碰冲突文件的提交数）：

| 触碰文件 | 本地提交数 | rebase 需在该处停住 |
|---|---|---|
| `api/index.php` | 6 | 是（与 origin 的 AI 治理/删号改动重叠） |
| `src/pages/*` | 22 | 部分（多数前端区与 origin 不重叠，少量要解） |
| `tools/test-api-contract.mjs` | 5 | 是（两边都改了断言区） |
| `sw.js` | 2 | 是（与 origin 离线预缓存重叠） |

估算：rebase 至少 8–15 个提交会触发手动冲突，成本远高于 merge 的 1 次。且 37 个提交 hash 全变——若这些 hash 曾出现在外部（issue 链接、交接记录），将失效。

---

## 3. 方案 C：兼顾方案（= B1 强化，最终推荐）

目标四元兼顾：主线方向正确（origin 权威）+ 冲突成本低（不 rebase）+ 历史诚实（保留分叉）+ 产物干净（重跑 publish）。

具体 = B1 的三步，外加两点治理动作：

1. **合并 commit message 显式记录分叉**，不假装没分叉：
   ```
   merge(origin): 汇入本地线 37 提交（P1-6/A-16/G0）到 origin 主线
   两线曾并行：本地 37↑ / origin 16↓，merge-base 0e4f5d1。
   本 commit 以 origin/main 为第一父（主线），本地为第二父。
   ```
2. **合并后立即 `node tools/publish.mjs` 重跑产物**：本地侧 0 产物改动、origin 侧产物是「旧源码」构建的（见 §5 盲区 1），只有重跑 publish 才能让产物包含本地线的 fact 投稿/举报/板块功能。

为什么 C 优于 A：A 把 local 当主线，会让历史图把「未 fetch 就开发」的教训淡化；C 以 origin 为主线，历史图如实呈现「origin 一路前进，本地线并进来」，契合「同一时刻一个会话改、origin 是权威发布源」的治理观。

---

## 4. 三方案差异总表

| 维度 | A（本地 merge） | B1（origin 反 merge） | B2（origin rebase） |
|---|---|---|---|
| 最终代码树 | ✅ 相同 | ✅ 相同 | ✅ 相同（冲突解一致时） |
| 第一父（主线呈现） | 本地 37 提交 | origin 16 提交 | origin 16 提交 |
| 历史形状 | 1 merge commit | 1 merge commit | 线性无 merge commit |
| 冲突处理次数 | 1 次 | 1 次 | 8–15 次 |
| 本地 37 提交 hash | 不变 | 不变 | 全变 |
| 分叉痕迹 | 保留 | 保留 | 抹平 |
| push | fast-forward | fast-forward | fast-forward |
| 需切独立分支 | 否 | 是 | 否 |
| 治理语义 | 本地当主线（有掩盖并行之嫌） | origin 当主线（正确） | origin 当主线（但抹平平行事实） |

---

## 5. 盲区清单（本轮新增实测）

### 共同盲区（A/B1/B2 都要处理）

1. **产物分歧（最关键）**：本地侧 `assets/*` 新增/改动 = **0**（本地从未 publish）；origin 侧新增 12 个产物 + 删 12 个旧产物 + 改 10 个根 HTML（`10b8e72`/`3b0fb72` 两次 publish）。合并后根 HTML + assets 是 **origin 旧源码**构建的，**缺本地线的 fact 投稿/举报/板块功能**。→ 任何方案合并后都必须重跑 `publish`，产物不手工合并、也不信任 git 合并结果。
2. **telemetry 静默合并**：`telemetry.js`/`test-telemetry.mjs` 是 delete/keep（本地删、origin 保留原 blob），git 无冲突地**静默保留 origin 版**——文件会"复活"。需显式 `git rm`（或按站主裁决保留）。
3. **「其他城市」数据拆分歧**：本地 `77adf75` 已拆，origin 的 `test` 仍引用 `check-city-duration ... 其他城市`，合并后该行落空、`npm test` 必红。
4. **门数口径三套**：合并后 `check-ci-parity`（41）/ `audit-snapshot`（47）/ `package.json`（49 node 命令）需对齐，origin 新增 5 门（storage-health/ai-key-status/route-contract/markdown/gen-sitemap）。

### A 特有

5. 本地当主线的历史图，会弱化「开工前没 fetch、双线并行」的 M1 教训——治理上不如 C 诚实。

### B1/C 特有

6. 必须 `checkout -b release origin/main` 才正确；漏这一步直接在当前分支 merge，第一父依然本地，方案退化成 A。

### B2 特有

7. 改写 37 提交 hash：外部引用的 commit id 全部失效。
8. rebase 中断时工作区处「半成品」状态，需 `git rebase --abort` 兜底；冲突点 8–15 个，遗漏一处就带入坏状态。

---

## 6. 推荐与裁决点

**推荐方案 C（origin 为主线 + 反向 merge + 治理记录 + 产物重跑）**：一份解决全部分歧、冲突成本最低（1 次）、历史诚实、主线方向正确。

仍需站主裁决两点：
1. **telemetry 去留**（默认「继续删除」，T0-3 选 B）；若保留，方案 C 第 3 步反向。
2. **执行时机**：确认执行合并的窗口内 origin 不会再有人 push（否则要重 fetch）。

执行前守住两条底线：先 `git branch backup/premerge-$(date)`，且**未跑通 `npm test` 前不 commit、不 push**。