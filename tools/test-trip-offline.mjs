#!/usr/bin/env node
// M1 离线包质量门：GeoJSON / GPX / KML / 点位摘要 / 核验清单导出
// 用法: node tools/test-trip-offline.mjs
import { createDay, createItem, createTrip } from '../src/pages/trip/schema.js';
import { dayScheduleRows, pointDigest, tripChecklistMarkdown, tripToGeoJSON, tripToGPX, tripToKML } from '../src/pages/trip/offline.js';
import { verificationTasks } from '../src/pages/trip/execution.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);

const now = () => Date.parse('2026-07-10T07:00:00Z');
let seq = 0;
const idFn = p => `${p}_o${++seq}`;

const POINTS = {
  p1: { id: 'p1', name: '红场 & 剧场', lat: 55.7539, lon: 37.6208, estimatedDuration: 60, openCalendar: 'unknown', note: '夜间清场' },
  p2: { id: 'p2', name: '克里姆林宫', lat: 55.7520, lon: 37.6175, estimatedDuration: 120, openCalendar: { days: 'daily', open: '10:00', close: '18:00' } },
  pNoCoords: { id: 'pNoCoords', name: '待核点位', pending: true },
};

function makeTrip() {
  const day1 = createDay({
    id: 'd1', index: 1, date: '2026-07-10', city: '莫斯科', note: '周一闭馆多',
    items: [
      createItem({ id: 'i1', dayId: 'd1', type: 'visit', refId: 'p1', order: 0, estimatedDuration: 60, placeNameSnapshot: '红场 & 剧场' }),
      createItem({ id: 'i2', dayId: 'd1', type: 'visit', refId: 'p2', order: 1, estimatedDuration: 120, placeNameSnapshot: '克里姆林宫' }),
      createItem({ id: 'i3', dayId: 'd1', type: 'visit', refId: 'pNoCoords', order: 2, estimatedDuration: 30, placeNameSnapshot: '待核点位' }),
    ],
  });
  const day2 = createDay({
    id: 'd2', index: 2, date: '2026-07-11', city: '莫斯科',
    items: [
      createItem({ id: 'i4', dayId: 'd2', type: 'visit', refId: 'p2', order: 0, estimatedDuration: 90, placeNameSnapshot: '克里姆林宫' }),
      createItem({ id: 'i5', dayId: 'd2', type: 'visit', refId: 'p1', order: 1, estimatedDuration: 45, placeNameSnapshot: '红场 & 剧场' }),
    ],
  });
  return createTrip({
    id: 't1', title: '莫斯科 2 日', status: 'planned', dateMode: 'fixed',
    startDate: '2026-07-10', endDate: '2026-07-11', days: [day1, day2], notes: '紧急电话 112',
  }, idFn, now());
}

const trip = makeTrip();

// 1) 排程行：无坐标条目保留在清单但不进几何
{
  const schedule = dayScheduleRows(trip, POINTS);
  if (schedule.length === 2 && schedule[0].rows.length === 3) ok('dayScheduleRows 覆盖全部天与条目');
  else fail('dayScheduleRows 结构错误');
  const noCoords = schedule[0].rows.find(r => r.itemId === 'i3');
  if (noCoords && !noCoords.point?.lat) ok('无坐标点位保留在排程行（不进几何）');
  else fail('无坐标点位处理错误');
}

// 2) GeoJSON：Point + 每日 LineString，坐标为 [lon, lat]（WGS84）
{
  const gj = tripToGeoJSON(trip, POINTS);
  const points = gj.features.filter(f => f.geometry.type === 'Point');
  const lines = gj.features.filter(f => f.geometry.type === 'LineString');
  if (gj.type === 'FeatureCollection' && points.length === 4 && lines.length === 2) ok('GeoJSON：4 点位 + 2 条日动线（无坐标点位被跳过）');
  else fail(`GeoJSON 要素数错误：points=${points.length} lines=${lines.length}`);
  const redSquare = points.find(f => f.properties.name === '红场 & 剧场');
  if (redSquare && redSquare.geometry.coordinates[0] === 37.6208 && redSquare.geometry.coordinates[1] === 55.7539) {
    ok('GeoJSON 坐标顺序 [lon, lat] 正确');
  } else fail('GeoJSON 坐标顺序错误：' + JSON.stringify(redSquare));
  if (lines[0].geometry.coordinates.length === 2) ok('Day1 动线只含有坐标的 2 个点');
  else fail('Day1 动线坐标数错误');
}

// 3) GPX：wpt/trk 齐全、XML 转义、结构可被常规解析
{
  const gpx = tripToGPX(trip, POINTS, { now });
  if (gpx.startsWith('<?xml version="1.0"') && gpx.includes('<gpx version="1.1"')) ok('GPX 头部合法');
  else fail('GPX 头部错误');
  const wptCount = (gpx.match(/<wpt /g) || []).length;
  const trkCount = (gpx.match(/<trk>/g) || []).length;
  if (wptCount === 4 && trkCount === 2) ok('GPX：4 个 wpt + 2 条 trk');
  else fail(`GPX 计数错误：wpt=${wptCount} trk=${trkCount}`);
  if (gpx.includes('红场 &amp; 剧场') && !gpx.includes('红场 & 剧场')) ok('GPX 特殊字符已转义');
  else fail('GPX 转义错误');
  if (!gpx.includes('待核点位</name></trkpt>')) ok('GPX 轨迹不收录无坐标点位');
  else fail('GPX 收录了无坐标点位');
}

// 4) KML：Placemark 与坐标
{
  const kml = tripToKML(trip, POINTS);
  const pmCount = (kml.match(/<Placemark>/g) || []).length;
  if (kml.includes('<kml xmlns=') && pmCount === 6) ok('KML：4 点位 + 2 动线 = 6 个 Placemark');
  else fail(`KML 计数错误：${pmCount}`);
  if (kml.includes('37.6208,55.7539,0')) ok('KML 坐标格式 lon,lat,0');
  else fail('KML 坐标格式错误');
}

// 5) 点位摘要：unknown 标志可见
{
  const md = pointDigest(trip, POINTS);
  if (md.includes('红场') && md.includes('⚠️ 开放时间待核') && md.includes('夜间清场') && md.includes('第 2 天')) {
    ok('点位摘要含待核标志与备注');
  } else fail('点位摘要内容缺失');
}

// 6) 核验清单：逐日复选框 + 任务 + 紧急信息
{
  const tasks = verificationTasks(trip, POINTS, { today: '2026-07-01' });
  const md = tripChecklistMarkdown(trip, POINTS, { tasks, emergency: '领事馆 +86-10-xxx' });
  if (md.includes('- [ ]') && md.includes('第 1 天（2026-07-10）')) ok('清单含逐日复选框');
  else fail('清单复选框缺失');
  if (md.includes('🔴 高') && md.includes('确认「红场 & 剧场」的开放时间')) ok('清单含按影响排序的核验任务');
  else fail('清单核验任务缺失');
  if (md.includes('紧急电话 112') && md.includes('领事馆')) ok('清单含紧急信息');
  else fail('清单紧急信息缺失');
}

console.log(bad ? `\n${bad} 项失败` : '\nM1 离线包质量门全部通过');
process.exit(bad ? 1 : 0);
