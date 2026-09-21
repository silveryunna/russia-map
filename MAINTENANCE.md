# 俄罗斯打卡地图 · 维护手册

> 本文档梳理 2025-09 批次（会话：地铁巡礼/文学巡礼专项）的全部改动、数据结构与维护要点，供后续维护者快速接手。
> 最近更新：2025-09-22 · 对应提交 `c864492`

---

## 1. 项目现状

- **架构**：多页面 PWA（Vite 构建），数据与视图分离
- **点位数据**：`data/points.json`（**382 个点位**）
- **动线数据**：`data/routes.json`（**21 条动线**）
- **部署**：GitHub Pages（`silveryunna.github.io/russia-map`）+ 腾讯云服务器（`124.221.104.242`）
- **源码**：本仓库仅含构建产物；源码在另一处维护。改数据直接编辑 `data/*.json`，**无需重新构建**；改 UI 逻辑需改 `assets/*.js` 构建产物（会被下次构建覆盖，需同步改源码）

### 页面结构

| 页面 | 入口 | 说明 |
|---|---|---|
| 首页 | `index.html` | 落地页（`main-*.js`） |
| 地图 | `map.html` | 主地图（`map-D2GUsbT3.js`） |
| 清单 | `list.html` | |
| 相册 | `album.html` | |
| 笔记 | `notes.html` | Markdown 内容在 `content/notes/` |
| **管理后台** | `admin.html` | 点位录入助手（localStorage + 导出 JSON，见 §6） |

---

## 2. 本次变更总览（按提交序）

| 提交 | 内容 |
|---|---|
| `5f9127f` | 老架构：地图层 CartoDB 替换高德（排查中间态） |
| `4e066bc` | 老架构：新增 Yandex 实验图层（后因偏移过大移除） |
| `831bbf4`/`050bfe7` | 老架构：回滚排查（白屏事故，见 §7.1） |
| `121c571` | 老架构：CartoDB 单独替换验证 |
| `872dc10` | 老架构：Yandex 层重加（`$e` 插值 bug 修复） |
| `d5de437` | **地图层定稿**：中文概览=Esri World Topo Map；English=Esri World Street Map；OSM 保留；Yandex/CartoDB 移除 |
| `cc035c0` | 圣彼得堡 3 个城市登高点（斯莫尔尼/市政厅塔楼/弗拉基米尔教堂） |
| `cdb3004` | ZIL 文化宫坐标修正（Vostochnaya 4k1） |
| `36c0f2a` | 火车站图标函数改名 `me`→`__stationIconFn__`（§7.2） |
| `acfe382` | 两个火车站坐标校正为 Yandex railway_station 锚点 |
| `859e6d5` | **全量 336 点位新增 `name_en` 英文字段**（§4） |
| `6798399` | popup 显示英文名 + 一键复制按钮（§5.2） |
| `f7dc4be` | 18 个地铁站英文名修正为精确站名（§4.2） |
| `f8c8ee6` | 地铁站/水上巴士独立图标 + `#地铁站`/`#水上巴士` 标签（§5.1） |
| `73c157b` | 莫斯科地铁巡礼 +17 站（p337-353）+ 动线 m-metro |
| `8992b65` | 文学巡礼 +14 点位（p354-368）+ 4 条动线 m-lit1/m-lit2/s-lit1/s-lit2 |
| `c864492` | 圣彼得堡地铁巡礼 +10 站 + 5 CityWalk（p368-382）+ 动线 s-metro/s-walk |

### 当前点位统计

- 总数 **382**（id 从 p001 到 p382，连续无断号）
- 城市分布：莫斯科约 210 / 圣彼得堡约 60 / 其他城市约 50 / 近郊 5
- 专题点位群：⑨ 莫斯科地铁巡礼（26 站）、㉗ 圣彼得堡地铁巡礼（11 站）、④ 文学故居群、⑥ 文学纪念地组合、城市登高点、独立点位等 40+ 群
- 动线 21 条：m-d1~d4（莫斯科日线）、m-sub、m-metro、m-lit1/m-lit2、s-d1~d4、s-vyborg、s-lit1/s-lit2、s-metro、s-walk、o-*（周边游）

---

## 3. 数据结构

### 3.1 points.json 点位

```json
{
  "id": "p335",              // 递增，当前最大 p382
  "name": "列宁格勒火车站（Ленинградский вокзал）",
  "name_en": "Leningradsky Railway Station",   // 可为空字符串
  "city": "莫斯科",           // 值域：莫斯科/圣彼得堡/莫斯科州·近郊/其他城市（见 data/meta.json）
  "cluster": "独立点位",       // 分组名，决定侧边栏分组
  "type": "火车站",           // 决定图标分流（见 §5.1）
  "highlight": "…",           // 卡片主文案（一行亮点）
  "note": "…",               // 实用信息（票价/开放时间/地址）
  "lat": 55.776451,
  "lon": 37.655221,
  "confidence": 100,          // 坐标置信度，95~100
  "tags": ["地铁站"]          // 可选；出现在标签筛选器
}
```

**文件格式**：UTF-8 + **CRLF 行尾**。编辑时务必保留 CRLF，否则 diff 会全文件标红。

### 3.2 routes.json 动线

```json
{
  "id": "m-metro", "city": "莫斯科", "day": "专题",
  "name": "…", "summary": "…", "transport": "…", "duration": "…", "tip": "…",
  "steps": [
    { "point": "点位name（必须精确匹配points.json的name）", "label": "步骤标题", "note": "说明" }
  ]
}
```

⚠️ `steps[].point` 按 name 精确索引渲染；写错则该步骤静默跳过（不报错）。新增动线后务必逐 step 核对 name。

---

## 4. name_en 英文字段（检索用）

### 4.1 生成方法论（2025-09-22 批）

1. **有俄文原名**（name/highlight/note 含西里尔字母，224 个）：提取俄文 → Yandex Geocoder 正查 → 取英文
2. **已有拉丁字母**（27 个）：直接提取（如 `Zhibek Zholy`）
3. **纯中文**（85 个）：Yandex **坐标反查**（geocode=`经度,纬度`）取街道/门牌英文名
4. **著名景点**（~16 个）：人工映射标准英文名（Red Square / Winter Palace…）

### 4.2 地铁站精确名的坑（重要）

Yandex Geocoder 的 `kind=metro` 结果有 bug：`name` 字段返回"Russian Federation"，**站名在 `text` 字段**：

```jsonc
// 错误路径：GeoObject.name → "Russian Federation"
// 正确路径：GeoObject.metaDataProperty.GeocoderMetaData.text
//  → "Russian Federation, Moscow, Zamoskvoretskaya Line, Mayakovskaya metro station"
// 取 text 逗号分隔末段，去 "metro station" 后缀，拼 "Mayakovskaya Metro Station"
```

地铁站统一命名格式：`"<TransliteratedName> Metro Station"`（与既有 p061 `Prospekt Mira Metro Station` 一致）。注意基辅站 Yandex 拼写为 **Kiyevskaya**（非莫斯科官方的 Kievskaya），跟随 Yandex 便于检索。

---

## 5. 图标系统（map-D2GUsbT3.js）

### 5.1 分流逻辑（点位渲染处唯一调用点）

```
type==="火车站"        → __stationIconFn__   🚉 深灰方块
tags 含 "地铁站"        → __metroIconFn__     红底白字 M 方块
tags 含 "水上巴士"       → __boatIconFn__      蓝底 🚤 方块
其他                   → ge()                彩色圆点（按城市色）
```

**新增图标类型方法**：
1. `data/points.json` 目标点位加对应 `tags` 值（标签筛选器自动生成）
2. `assets/map-D2GUsbT3.js` 中 `function ge(` 前插入 `__xxxIconFn__(e,t)` 函数（e=已打卡置灰，t=选中放大）
3. 分流分支处插入 `:(t.tags||[]).includes("标签")?__xxxIconFn__(M.checked.has(t.id),M.selected===t.id)`

### 5.2 popup 英文名 + 复制

- 模板函数 `j(e)`（popup HTML 生成）中，`${k(e.name)}</div>` 后插入 name_en 行 + 复制按钮
- 复制函数：`window.__copyEn__`（全局挂载，供内联 onclick 调用）
- 兼容 https（`navigator.clipboard`）与 http IP 访问（降级 `execCommand`）

---

## 6. 管理后台（admin.html）

- 纯前端：录入 → localStorage → **导出 JSON** → 人工合并进 `data/points.json` → push
- 支持地图点选坐标、MD 预览
- 后台表单目前**没有 name_en 输入框**，新点位会缺该字段——合并时手工补，或后续在源码加字段

### 新点位入库流程

```
admin 后台录入 → 导出 JSON → 分配 id（当前最大 p382，从 p383 起）
→ 补 name_en（Yandex 反查/正查，§4）→ 补 confidence/tags
→ 追加到 points.json（保持 CRLF）→ 校验 JSON（见 §8）
→ commit → push → GitHub Pages 1-2 分钟自动部署
```

---

## 7. 踩坑记录（必读）

### 7.1 老架构白屏事故（已随架构升级消失，引以为戒）

- 直接改打包后单文件 `index-Hm9RS00E.js` 时，Perl `s///` 替换字符串中的 **`$e` 被 Perl 当变量插值为空**，生成 `y=.tileLayer(...)` 语法错误 → 整站白屏
- **教训**：改打包产物时，新函数/变量名用 `__xxxFn__` 双下划线格式；脚本用 `q~...~` 定界避免插值；改后必须验证文件头尾完整 + 括号平衡
- 该文件已在新架构中删除，此坑不再存在，但同样原则适用于现在的 `assets/map-*.js`

### 7.2 函数名冲突（真实发生）

打包 JS 中插入了 `function me(...)`，与文件内已有的 `me=function(e,t,n){...}`（geocoder 模块）重复声明 → `SyntaxError: Identifier 'me' has already been declared` → 全站白屏。修复：改名 `__stationIconFn__`。
**教训：打包产物里绝不能用短函数名，一律 `__双下划线唯一名__`。**

### 7.3 Yandex Geocoder 坐标顺序

反查用 `geocode=经度,纬度`（**lon,lat**，非 lat,lon）。搞反会返回伊朗地名（真实踩过）。

### 7.4 rebase 冲突处理（2025-09-22）

远程 main 被并行会话重构（数据抽离）导致本地 `git push` 被拒。正确处理：
1. `git pull --rebase origin main`
2. 冲突显示 `deleted by us: assets/index-Hm9RS00E.js` → 该文件远程已删、本地有改 → `git rm -f` 接受删除，**把有价值的改动重放到新架构**（本次即把火车站点位改为写入 points.json）
3. `git rebase --continue`
4. 远程 main 有 CI 校验（`.github/workflows/check.yml` + `tools/check-data.mjs`），push 前确保 JSON 合法

### 7.5 文本插入类脚本注意事项

- points.json 结尾当前为 `  }\r\n]`（无尾空行）；历史上曾被脚本写出空行，锚点匹配前先 `tail -c` 看实际字节
- Perl 子程序 `my ($x) = @_` 是**拷贝**，内部修改不影响外部变量；要么返回新值，要么内联处理
- 对象定位用 `rindex($s, "  {", $idpos)` + `index($s, "\r\n  }", $idpos)`，但判断"字段已存在"时要精确到值（`"type": "地铁站"` 会误判含此值的检查），用 `"tags":\s*\[[^\]]*"标签"` 模式

---

## 8. 常用校验命令（Git Bash）

```bash
# JSON 合法性 + 计数
perl -MJSON::PP -e 'open(my $f,"<:raw","data/points.json");my $d=JSON::PP::decode_json(do{local $/;<$f>});print scalar(@$d),"\n"'

# 动线 step 与点位 name 匹配检查
perl -MJSON::PP -e '
open(my $a,"<:raw","data/points.json");my $p=JSON::PP::decode_json(do{local $/;<$a>});
open(my $b,"<:raw","data/routes.json");my $r=JSON::PP::decode_json(do{local $/;<$b>);
my %n=map{$_->{name}=>1}@$p;
for my $rt (@$r){for my $st (@{$rt->{steps}}){print "MISSING [$rt->{id}] $st->{point}\n" if $st->{point} && !$n{$st->{point}}}}'

# 最大 id 查询（新点位从下一个开始）
perl -ne '$m=$1 if /"id":\s*"p(\d+)"/ && $1>$m; END{print "p$m\n"}' data/points.json

# 文件结尾字节检查（锚点前必做）
tail -c 25 data/points.json | od -c
```

> 环境无 node/python，perl 是唯一脚本工具（JSON::PP 为核心模块可直接用）。

---

## 9. 已知遗留事项

1. **地图层曾评估未采用**：Yandex Tiles（EPSG:3395 投影偏移大，打卡场景不可用）；CartoDB（现需 API key 有水印）。若未来要接 Yandex 正版图，需源码层引入 `leaflet-plugins` 的 `L.yandex()` + Yandex JS API，打包产物改不了。
2. **~10 个非地铁点位的 name_en 是街道级地址**（如阿尔巴特等），非精确 POI 名，但可在 Yandex 定位；后续可按 §4.2 方法优化。
3. **p104 主题列车**的英文名是蹲守站名（Ploshchad Alexandra Nevskogo），非列车本身，属合理取舍。
4. **老动线 m-d2** 有一个无 point 的纯说明步骤（渲染自动跳过），系历史遗留，非 bug。
5. **server 同步**：腾讯云服务器 `git pull` 偶发网络失败（Failure receiving data），已给过代理/手动覆盖方案；服务器侧与 GitHub Pages 内容可能不同步，以 GitHub Pages 为准。
6. admin 后台无 name_en 字段（见 §6）。

---

*维护者：如遇数据问题，先跑 §8 校验命令定位，再对照 §7 踩坑记录排查。*
