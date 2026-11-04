#!/usr/bin/env node
// 莫斯科样板数据门槛（ROADMAP 附录 C）：动线覆盖的点位必须能支撑排程
//   • 硬性：id/name/name_en/name_local、受控 type、坐标+置信度、停留时长+依据、开放日历（或显式 unknown）、
//           票价/预约（或显式 unknown）、来源条目（collectedAt + url/note）、城市时区已知
//   • 软性：已知开放日历/票价的比例（只报告，不阻断）——unknown 允许，但必须显式写出来，不许留空
// 用法: node tools/check-sample-data.mjs [数据目录，默认 ./data] [城市，默认 莫斯科]
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TYPE_VOCAB } from './type-vocab.mjs';
import { CITY_TIME_ZONES } from '../src/pages/trip/migrate.js';
import { createRegionIndex, visiblePoints, isPointVisible, regionStats } from '../src/shared/regions.js';
import { boundaryBounds } from '../src/pages/map/boundaries.js';

const dir = resolve(process.argv[2] || './data');
const city = process.argv[3] || '莫斯科';
const read = (f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));

const points = read('points.json');
const routes = read('routes.json');
const byId = new Map(points.map((p) => [p.id, p]));

let fail = 0;
const err = (m) => { console.error('❌ ' + m); fail++; };
const ok = (m) => console.log('✅ ' + m);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = new Set(['official', 'curated', 'estimate', 'measured', 'user']);

const cityRoutes = routes.filter((r) => r.city === city);
if (!cityRoutes.length) { err(`${city} 没有任何动线，样板集为空`); }
const scope = [...new Set(cityRoutes.flatMap((r) => r.steps.map((s) => s.pointId)).filter(Boolean))];

// --- 时区：排程的硬前提 ---
if (!CITY_TIME_ZONES[city]) err(`${city} 未在 migrate.js 的 CITY_TIME_ZONES 里登记时区，无法排程`);
else ok(`${city} 时区 ${CITY_TIME_ZONES[city]} 已登记`);

// --- 逐点位契约 ---
let calendarKnown = 0;
let ticketKnown = 0;
for (const id of scope) {
  const p = byId.get(id);
  if (!p) { err(`动线引用的点位 ${id} 不存在`); continue; }
  const where = `${p.id}（${p.name || '?'}）`;
  for (const f of ['name', 'name_en', 'name_local']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) err(`${where} 缺 ${f}`);
  }
  if (!TYPE_VOCAB.includes(p.type)) err(`${where} type 不在受控词表：${p.type}`);
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number') err(`${where} 缺坐标（WGS84）`);
  if (![75, 100].includes(p.confidence)) err(`${where} confidence 必须是 75/100，实际 ${p.confidence}`);

  if (!Number.isInteger(p.estimatedDuration) || p.estimatedDuration <= 0 || p.estimatedDuration > 720) {
    err(`${where} estimatedDuration 必须是 1–720 的整数分钟，实际 ${p.estimatedDuration}`);
  }
  if (!['estimate', 'measured'].includes(p.durationBasis)) err(`${where} durationBasis 必须是 estimate/measured`);

  if (p.openCalendar === 'unknown') { /* 显式未知：允许，排程按宽边界处理 */ }
  else if (p.openCalendar && typeof p.openCalendar === 'object') {
    const c = p.openCalendar;
    if (c.alwaysOpen === true) calendarKnown += 1;
    else if (!c.days || !c.open || !c.close) err(`${where} openCalendar 需要 days/open/close 或 alwaysOpen: true`);
    else calendarKnown += 1;
  } else err(`${where} 缺 openCalendar（没有就写 "unknown"，不许留空）`);

  if (typeof p.ticket !== 'string' || !p.ticket.trim()) err(`${where} 缺 ticket（没有就写 "unknown"）`);
  else if (p.ticket !== 'unknown') ticketKnown += 1;

  if (!Array.isArray(p.sources) || !p.sources.length) err(`${where} 缺 sources`);
  else {
    for (const s of p.sources) {
      if (!s || !SOURCE_TYPES.has(s.type)) err(`${where} sources.type 非法：${s && s.type}`);
      if (!DATE.test(s?.collectedAt || '')) err(`${where} sources.collectedAt 需 YYYY-MM-DD`);
      if (!s?.url && !s?.note) err(`${where} sources 条目需要 url 或 note`);
      if (s?.url && !/^https?:\/\//i.test(s.url)) err(`${where} sources.url 必须是 http(s)`);
    }
    if (p.durationBasis === 'measured' && !p.sources.some((s) => s.type === 'measured')) {
      err(`${where} durationBasis=measured 但没有 measured 来源`);
    }
  }
}

// --- 逐条动线：步骤可解析 + 排程总量 ---
for (const r of cityRoutes) {
  let stepN = 0;
  let unresolved = 0;
  let minutes = 0;
  for (const s of r.steps || []) {
    if (!s.point) continue;
    stepN += 1;
    const p = (s.pointId && byId.get(s.pointId)) || null;
    if (!p) { unresolved += 1; continue; }
    minutes += Number.isInteger(p.estimatedDuration) ? p.estimatedDuration : 0;
  }
  if (unresolved) err(`动线「${r.name}」有 ${unresolved}/${stepN} 步无法按 pointId 解析`);
  const h = (minutes / 60).toFixed(1);
  console.log(`   · ${r.day || ''} ${r.name}：${stepN} 步，点位停留合计 ${h} 小时`);
}

// --- 覆盖率（软门槛，只报告）---
const n = scope.length || 1;
const pct = (k) => Math.round((k / n) * 100);
console.log(`\n覆盖：点位 ${scope.length} 个 / 动线 ${cityRoutes.length} 条`);
console.log(`   开放日历已知 ${calendarKnown}/${scope.length}（${pct(calendarKnown)}%），其余显式 unknown`);
console.log(`   票价/预约已知 ${ticketKnown}/${scope.length}（${pct(ticketKnown)}%），其余显式 unknown`);

// --- 板块归属与开关（regions.json 数据层契约）---
{
  const regionPath = resolve(dir, 'regions.json');
  if (!existsSync(regionPath)) err('缺 data/regions.json：板块开关无法生效');
  else {
    const doc = read('regions.json');
    const ids = new Set();
    for (const r of doc.regions || []) {
      if (!r.id || !r.name || !r.country) err(`板块缺 id/name/country：${JSON.stringify(r)}`);
      if (!Array.isArray(r.center) || r.center.length !== 2 || !r.center.every(Number.isFinite)) err(`板块 ${r.id} 的 center 必须是 [lat, lon]`);
      if (!Number.isFinite(r.defaultZoom)) err(`板块 ${r.id} 缺 defaultZoom`);
      if (typeof r.enabled !== 'boolean') err(`板块 ${r.id} 的 enabled 必须是布尔值`);
      if (!r.basemap) err(`板块 ${r.id} 缺 basemap 引用`);
      if (!r.bounds && !r.boundaryFile) err(`板块 ${r.id} 缺 bounds 或 boundaryFile`);
      if (typeof r.reviewNo !== 'string') err(`板块 ${r.id} 的 reviewNo 必须是字符串（可为空）`);
      if (ids.has(r.id)) err(`板块 id 重复：${r.id}`);
      ids.add(r.id);
    }
    if (!ids.has(doc.fallback)) err(`fallback 板块「${doc.fallback}」不在 regions 列表内`);

    const badRef = points.filter((p) => p.region && !ids.has(p.region));
    if (badRef.length) err(`${badRef.length} 个点位的 region 引用不存在：${badRef.slice(0, 3).map((p) => `${p.id}:${p.region}`).join('、')}`);

    const index = createRegionIndex(doc);
    const visible = visiblePoints(points, index);
    for (const id of (doc.regions || []).filter((r) => r.enabled === false).map((r) => r.id)) {
      const total = points.filter((p) => (p.region || doc.fallback) === id).length;
      const leaked = visible.filter((p) => (p.region || doc.fallback) === id).length;
      if (total === 0) err(`关闭板块 ${id} 没有任何点位：开关无法验证`);
      if (leaked) err(`关闭板块 ${id} 仍有 ${leaked} 个点位出现在筛选结果`);
    }
    // 兼容性：无 region 字段的旧数据必须继续可见；配置缺失时降级为全量可见
    const legacyHidden = points.filter((p) => !p.region && !isPointVisible(p, index));
    if (legacyHidden.length) err(`无 region 的旧数据被隐藏了 ${legacyHidden.length} 个`);
    if (!visiblePoints(points, createRegionIndex(null)).length) err('regions.json 缺失时应降级为全量可见');

    // 归属修正后：fallback 不再有点位，板块计数必须与点位总数自洽
    const orphan = points.filter((p) => !p.region);
    if (orphan.length) err(`仍有 ${orphan.length} 个点位未归属板块：${orphan.slice(0, 3).map((p) => p.id).join('、')}`);
    if (!ids.has('ge')) err('缺 ge（格鲁吉亚）板块');
    const p050 = points.find((p) => p.id === 'p050');
    if (!p050 || p050.region !== 'ge') err('p050（第比利斯）必须归属 ge');
    const sum = (doc.regions || []).reduce((k, r) => k + points.filter((p) => p.region === r.id).length, 0);
    if (sum !== points.length) err(`板块归属计数之和 ${sum} ≠ 点位总数 ${points.length}`);
    const enabledCount = points.filter((p) => index.isEnabled(p.region)).length;
    if (visible.length !== enabledCount) err('可见点位数量与启用板块计数不一致');

    ok(`板块开关生效：${points.length} → ${visible.length} 个可见点位（关闭：${(doc.regions || []).filter((r) => r.enabled === false).map((r) => r.id).join('/') || '无'}）；归属 ${(doc.regions || []).map((r) => `${r.id}=${points.filter((p) => p.region === r.id).length}`).join(' ')}`);

    // 可见性判定本身：关闭板块不可见、启用板块可见
    const cnPt = points.find((p) => p.region === 'cn');
    const ruPt = points.find((p) => p.region === 'ru');
    if (cnPt && isPointVisible(cnPt, index)) err(`${cnPt.id} 属关闭板块 cn，不应通过可见性判断`);
    if (ruPt && !isPointVisible(ruPt, index)) err(`${ruPt.id} 属启用板块 ru，应通过可见性判断`);

    // 消费方贯通：候选点位必须走 shared/regions.js；既有行程条目保留并标注
    const srcOf = (f) => readFileSync(resolve(dir, '..', 'src', f), 'utf8');
    const planSrc = srcOf('pages/plan.js');
    if (!/cache\.visiblePts/.test(planSrc)) err('计划页选点/换点未使用可见点位（cache.visiblePts）');
    if (!/isPointVisible/.test(planSrc) || !/所在板块已隐藏/.test(planSrc)) err('计划页未标注隐藏板块的既有条目');
    if (!/cache\.visiblePts/.test(srcOf('pages/plan/generate.js'))) err('行程生成未使用可见点位（cache.visiblePts）');
    if (!/isPointVisible/.test(srcOf('pages/today.js'))) err('今日执行未接入板块可见性提示');
    if (!/visiblePoints/.test(srcOf('pages/friend.js'))) err('好友页点库未按板块过滤');

    // 板块级统计口径：regionStats 之和必须等于可见点位总数，覆盖率按已打卡数换算
    const stats = regionStats(visible, index, (id) => id === visible[0]?.id);
    const statSum = stats.reduce((n, s) => n + s.total, 0);
    if (statSum !== visible.length) err(`板块统计点位数之和 ${statSum} ≠ 可见点位 ${visible.length}`);
    if (stats.length && stats[0].checked !== 1) err('板块统计已打卡数未按回调计算');
    if (stats.length && stats[0].coverage !== Math.round(100 / stats[0].total)) err('板块覆盖率换算错误');

    // 信息架构：首页/列表共用 regionStats，地图与列表有板块层，地图板块切换能带动视野
    if (!/regionStats/.test(srcOf('pages/home.js')) || !/regionStats/.test(srcOf('pages/list.js'))) err('首页/列表未共用 regionStats 口径');
    if (!/l-region-stats/.test(srcOf('pages/list.js'))) err('列表页缺少板块统计/筛选层');
    if (!/region-head/.test(srcOf('pages/map.js')) || !/data-focus-region/.test(srcOf('pages/map.js'))) err('地图侧栏缺少板块层或板块定位');
    if (!/flyTo/.test(srcOf('pages/map.js'))) err('地图板块切换未带动中心/缩放');

    // P1-2：板块视野校准（center/defaultZoom 与 points 包围盒自洽）
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const fitZoom = (b) => {
      const dLon = (b[2] - b[0]) / 360;
      const dY = (merc(b[3]) - merc(b[1])) / (2 * Math.PI);
      const zx = dLon > 0 ? Math.log2(560 / (256 * dLon)) : Infinity;
      const zy = dY > 0 ? Math.log2(520 / (256 * dY)) : Infinity;
      return Math.min(zx, zy);
    };
    const zoomSummary = [];
    for (const r of doc.regions || []) {
      const rs = points.filter((p) => p.region === r.id && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (!rs.length) continue;
      const minLat = Math.min(...rs.map((p) => p.lat));
      const maxLat = Math.max(...rs.map((p) => p.lat));
      const minLon = Math.min(...rs.map((p) => p.lon));
      const maxLon = Math.max(...rs.map((p) => p.lon));
      const cLat = (minLat + maxLat) / 2;
      const cLon = (minLon + maxLon) / 2;
      const [lat, lon] = r.center;
      if (lat < minLat - 0.005 || lat > maxLat + 0.005 || lon < minLon - 0.005 || lon > maxLon + 0.005) {
        err(`板块 ${r.id} 的 center 不在点位包围盒内：${r.center}`);
      }
      if (Math.abs(lat - cLat) > 0.05 || Math.abs(lon - cLon) > 0.05) {
        err(`板块 ${r.id} 的 center 未对齐点位包围盒中心（应为 ${cLat.toFixed(3)},${cLon.toFixed(3)}）`);
      }
      if (r.defaultZoom < 3 || r.defaultZoom > 12) err(`板块 ${r.id} 的 defaultZoom=${r.defaultZoom} 超出 3–12`);
      const fit = fitZoom([minLon, minLat, maxLon, maxLat]);
      if (!(r.defaultZoom <= fit + 1e-9)) {
        err(`板块 ${r.id} 的 zoom=${r.defaultZoom} 大于适配值 ${fit.toFixed(2)}，会裁掉边缘点位`);
      }
      // kz 有 82.5E 的多斯特克单点：过低 zoom 会把单点压进阿拉木图大集群
      if (r.id === 'kz' && r.defaultZoom < 7) err('kz 的 zoom 过低：整境视野会丢掉单点');
      const b = r.bounds && r.bounds.bbox;
      if (!Array.isArray(b) || b.length !== 4) err(`板块 ${r.id} 缺 bounds.bbox，边界无法降级`);
      else if (b[0] > minLon + 0.002 || b[1] > minLat + 0.002 || b[2] < maxLon - 0.002 || b[3] < maxLat - 0.002) {
        err(`板块 ${r.id} 的 bounds.bbox 未覆盖全部点位`);
      }
      zoomSummary.push(`${r.id} z${r.defaultZoom}`);
    }
    ok(`板块视野校准：${zoomSummary.join(' / ')}（center 对齐点位包围盒，zoom 不大于 560×520 适配值）`);

    // P1-2：边界降级与「最后一次点击为准」；cn 启用路径固定 WGS84、无 GCJ 偏移
    const bSrc = srcOf('pages/map/boundaries.js');
    if (!/boundaryFile/.test(bSrc) || !/bounds\.bbox/.test(bSrc)) err('边界模块缺 boundaryFile/bbox 降级链');
    if (!/catch/.test(bSrc)) err('边界加载失败未捕获，会阻塞地图与点位');
    if (!/my !== seq/.test(bSrc)) err('边界切换未按最后一次点击为准（存在竞态）');
    if (!/clearRegionBoundary/.test(bSrc)) err('边界模块缺清除入口');
    const geRegion = (doc.regions || []).find((r) => r.id === 'ge');
    const geBox = boundaryBounds(geRegion);
    if (!geBox) err('ge 无 boundaryFile 时应降级为 bbox 矩形');
    else if (geBox[2] - geBox[0] < 0.02 || geBox[3] - geBox[1] < 0.02) err('单点板块的降级矩形退化');
    if (boundaryBounds({ id: 'x' })) err('无 bbox/boundaryFile 时应返回 null（不画边界）');
    if (!/initBoundaries/.test(srcOf('pages/map.js'))) err('地图未初始化板块边界层');
    if (!/\.catch\(\(\) => null\)/.test(srcOf('pages/map.js'))) err('china-boundary.json 加载失败会阻塞启动');

    const lSrc = srcOf('pages/map/layers.js');
    if (!/syncRegionBasemap/.test(lSrc)) err('缺板块级底图策略 syncRegionBasemap');
    if (!lSrc.includes("base: CN_WGS_LAYER, gcj: false")) err('中国板块启用路径未固定「天地图 + 无 GCJ」');
    if (!lSrc.includes('inCn ? { base: CN_WGS_LAYER, gcj: false')) err('自动进入中国板块仍会自动切 GCJ/偏移');
    const mapSrc = srcOf('pages/map.js');
    if (!/syncRegionBasemap/.test(mapSrc)) err('板块切换未应用板块级底图策略');
    if (!/regionGroups/.test(mapSrc) || !/markerGroupFor/.test(mapSrc)) err('地图未按板块拆分点位图层');

    // 切换不丢筛选/选中/打卡/弹窗：chip 分支只显隐与换边界，不重建标记、不重置状态
    const chipStart = mapSrc.indexOf("closest('[data-region]')");
    const chipEnd = mapSrc.indexOf('// 标签筛选 chips——须放在');
    const chipBlock = mapSrc.slice(chipStart, chipEnd > chipStart ? chipEnd : chipStart + 900);
    if (!/syncRegionVisibility/.test(chipBlock)) err('板块切换未走图层显隐');
    if (/refreshMarkers/.test(chipBlock)) err('板块切换仍在重建标记（会丢选中/弹窗）');
    for (const k of ['state.checked =', 'state.city =', 'state.query =', 'state.selected =']) {
      if (chipBlock.includes(k)) err(`板块切换重置了状态：${k.trim()}`);
    }
    if (!/reopenSelectedPopup/.test(chipBlock)) err('板块切换未恢复已选点位弹窗');
    if (!/clearRegionBoundary/.test(chipBlock)) err('切回「全部」未清除板块边界');


    // 城市名清理：「其他城市」桶已拆，所有城市必须有排程时区，城市配置与点位一致
    const { CITY_TIME_ZONES } = await import('../src/pages/trip/migrate.js');
    if (points.some((p) => p.city === '其他城市')) err('仍有城市为「其他城市」，垃圾桶未清理干净');
    const cityList = [...new Set(points.map((p) => p.city))];
    if (cityList.some((c) => !CITY_TIME_ZONES[c])) err(`城市缺时区登记：${cityList.filter((c) => !CITY_TIME_ZONES[c]).join('、')}`);
    const metaCities = new Set(JSON.parse(readFileSync(resolve(dir, 'meta.json'), 'utf8')).cities || []);
    if (cityList.some((c) => !metaCities.has(c))) err(`meta.cities 缺点位城市：${cityList.filter((c) => !metaCities.has(c)).join('、')}`);

    // 原「其他城市」的 4 条动线已拆到真实城市，动线与点位不得错配
    const routesDoc = JSON.parse(readFileSync(resolve(dir, 'routes.json'), 'utf8'));
    const routes = Array.isArray(routesDoc) ? routesDoc : (routesDoc.routes || []);
    const byId = new Map(points.map((p) => [p.id, p]));
    for (const rid of ['o-rzhev', 'o-novgorod', 'o-murmansk', 'o-tbilisi']) {
      const r = routes.find((x) => x.id === rid);
      if (!r) { err(`缺动线 ${rid}`); continue; }
      const stepId = (r.steps || [])[0] && (r.steps[0].pointId || r.steps[0].id || r.steps[0]);
      const city = byId.get(stepId) && byId.get(stepId).city;
      if (city !== r.city) err(`动线 ${rid} 城市 ${r.city} 与首步点位 ${stepId} 城市 ${city} 错配`);
    }
  }
}

if (fail) { console.error(`\n${fail} 处不满足样板数据契约`); process.exit(1); }
ok(`${city}样板数据契约通过（${scope.length} 个点位 / ${cityRoutes.length} 条动线）`);
