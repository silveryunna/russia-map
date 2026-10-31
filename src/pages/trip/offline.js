// M1 最小离线包（纯函数）：把 Trip 导出为可离线携带的格式。
// 覆盖 ROADMAP M1 工作项 5：Trip JSON（走 store.exportAll）、点位摘要、GeoJSON、GPX/KML、核验清单。
// 坐标一律使用 data/points.json 的 WGS84；无坐标的条目跳过几何、只进清单文本。

import { evaluateDay, formatMinutes } from '../plan/feasibility.js';
import { dayItems } from './execution.js';

const escapeXml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const escapeMd = s => String(s ?? '').replace(/\|/g, '\\|');

const getPoint = (pointsById, id) =>
  (pointsById instanceof Map ? pointsById.get(id) : (pointsById || {})[id]) || null;

const hasCoords = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

const pointName = (point, item) => point?.name || item?.placeNameSnapshot || item?.refId || '未命名';

// 每天的排程行（与 CI 同一个 evaluateDay），附带点位坐标；供 GeoJSON/GPX/KML/清单共用
export function dayScheduleRows(trip, pointsById, { options = {} } = {}) {
  return (trip?.days || []).map((day, dayIndex) => {
    const items = dayItems(day);
    const result = evaluateDay({ day, items, places: pointsById || null, options });
    const byItemId = new Map(result.timeline.map(row => [row.itemId, row]));
    const rows = items.map(item => {
      const point = item.refId ? getPoint(pointsById, item.refId) : null;
      const scheduled = byItemId.get(item.id);
      if (scheduled) return { ...scheduled, item, point };
      // 缺坐标/缺时长的条目不在 evaluateDay 的 timeline 里；离线清单必须如实列出，标 unscheduled
      return {
        itemId: item.id, placeId: point?.id || null, name: point?.name || item.placeNameSnapshot || item.id,
        arrive: null, start: null, end: null,
        duration: Number.isFinite(item.estimatedDuration) ? item.estimatedDuration : (point?.estimatedDuration ?? null),
        transitMinutes: 0, mode: 'none', transitSource: 'none', transitSourceKind: 'none',
        calendar: 'unknown', unscheduled: true, item, point,
      };
    });
    return { day, dayIndex, rows, result };
  });
}

export function tripToGeoJSON(trip, pointsById, { options = {} } = {}) {
  const features = [];
  dayScheduleRows(trip, pointsById, { options }).forEach(({ day, dayIndex, rows }) => {
    const coords = [];
    rows.forEach(row => {
      if (!hasCoords(row.point)) return;
      const xy = [row.point.lon, row.point.lat];
      coords.push(xy);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: xy },
        properties: {
          kind: 'visit',
          day: dayIndex + 1,
          date: day.date || '',
          name: pointName(row.point, row.item),
          arrive: Number.isFinite(row.arrive) ? formatMinutes(row.arrive) : '',
          duration: row.duration ?? null,
          status: row.item?.plannedStatus || 'planned',
        },
      });
    });
    if (coords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { kind: 'day-route', day: dayIndex + 1, date: day.date || '' },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}

export function tripToGPX(trip, pointsById, { options = {}, now = () => Date.now() } = {}) {
  const waypoints = [];
  const tracks = [];
  dayScheduleRows(trip, pointsById, { options }).forEach(({ day, dayIndex, rows }) => {
    const trackPoints = [];
    rows.forEach(row => {
      if (!hasCoords(row.point)) return;
      const name = escapeXml(pointName(row.point, row.item));
      const desc = escapeXml(`第 ${dayIndex + 1} 天${day.date ? ` ${day.date}` : ''}${Number.isFinite(row.arrive) ? ` · 计划 ${formatMinutes(row.arrive)} 到达` : ''}`);
      waypoints.push(`  <wpt lat="${row.point.lat}" lon="${row.point.lon}"><name>${name}</name><desc>${desc}</desc></wpt>`);
      trackPoints.push(`    <trkpt lat="${row.point.lat}" lon="${row.point.lon}"><name>${name}</name></trkpt>`);
    });
    if (trackPoints.length) {
      tracks.push(`  <trk><name>${escapeXml(`第 ${dayIndex + 1} 天${day.date ? ` ${day.date}` : ''}`)}</name>\n  <trkseg>\n${trackPoints.join('\n')}\n  </trkseg></trk>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="niuma-travel" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(trip?.title || '行程')}</name><time>${new Date(now()).toISOString()}</time></metadata>
${waypoints.join('\n')}
${tracks.join('\n')}
</gpx>
`;
}

export function tripToKML(trip, pointsById, { options = {} } = {}) {
  const placemarks = [];
  dayScheduleRows(trip, pointsById, { options }).forEach(({ day, dayIndex, rows }) => {
    const coords = [];
    rows.forEach(row => {
      if (!hasCoords(row.point)) return;
      coords.push(`${row.point.lon},${row.point.lat},0`);
      placemarks.push(`    <Placemark><name>${escapeXml(pointName(row.point, row.item))}</name><description>${escapeXml(`第 ${dayIndex + 1} 天 · ${Number.isFinite(row.arrive) ? formatMinutes(row.arrive) : ''}`)}</description><Point><coordinates>${row.point.lon},${row.point.lat},0</coordinates></Point></Placemark>`);
    });
    if (coords.length >= 2) {
      placemarks.push(`    <Placemark><name>${escapeXml(`第 ${dayIndex + 1} 天动线`)}</name><LineString><coordinates>${coords.join(' ')}</coordinates></LineString></Placemark>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(trip?.title || '行程')}</name>
${placemarks.join('\n')}
  </Document>
</kml>
`;
}

// 点位摘要卡：一个条目一段，含时间、停留、开放信息与注意事项（打印/离线阅读用）
export function pointDigest(trip, pointsById, { options = {} } = {}) {
  const lines = [`# ${trip?.title || '行程'} · 点位摘要`, ''];
  dayScheduleRows(trip, pointsById, { options }).forEach(({ day, dayIndex, rows }) => {
    lines.push(`## 第 ${dayIndex + 1} 天${day.date ? `（${day.date}）` : ''}`);
    rows.forEach(row => {
      if (!row.item) return;
      const name = pointName(row.point, row.item);
      const time = Number.isFinite(row.arrive) ? `${formatMinutes(row.arrive)}–${formatMinutes(row.end)}` : '待定';
      const bits = [`**${name}**`, time, `停留 ${row.duration} 分钟`];
      if (row.point?.openCalendar === 'unknown') bits.push('⚠️ 开放时间待核');
      if (row.point?.ticket === 'unknown') bits.push('⚠️ 门票待核');
      if (row.point?.note) bits.push(`备注：${row.point.note}`);
      if (row.item.notes) bits.push(`我的备注：${row.item.notes}`);
      lines.push('- ' + bits.map(escapeMd).join(' · '));
    });
    if (day.note) lines.push(`> 💡 ${day.note}`);
    lines.push('');
  });
  return lines.join('\n');
}

// 出发前核验清单：行程逐日时刻表 + unknown 核验任务 + 紧急信息
export function tripChecklistMarkdown(trip, pointsById, { options = {}, tasks = [], emergency = '' } = {}) {
  const lines = [`# ${trip?.title || '行程'} · 离线核验清单`, ''];
  lines.push(`导出时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')}（离线可用）`, '');
  dayScheduleRows(trip, pointsById, { options }).forEach(({ day, dayIndex, rows, result }) => {
    lines.push(`## 第 ${dayIndex + 1} 天${day.date ? `（${day.date}）` : ''}`);
    if (!rows.length) lines.push('（空）');
    rows.forEach(row => {
      if (!row.item) return;
      const mark = row.item.plannedStatus === 'done' ? '[x]' : row.item.plannedStatus === 'skipped' ? '[-]' : '[ ]';
      const time = Number.isFinite(row.arrive) ? `${formatMinutes(row.arrive)}–${formatMinutes(row.end)}` : '—';
      const flags = [];
      if (row.calendar === 'unknown') flags.push('开放时间待核');
      if (row.transitSourceKind === 'model-estimate') flags.push('交通为估算');
      lines.push(`- ${mark} ${time} ${escapeMd(pointName(row.point, row.item))}${flags.length ? `（${flags.join('，')}）` : ''}`);
    });
    if (result?.stats) {
      lines.push(`> 预计停留 ${(result.stats.dwellMinutes / 60).toFixed(1)}h · 通行 ${result.stats.transitMinutes}m${result.stats.unknownHours ? ` · ${result.stats.unknownHours} 处开放时间待核` : ''}`);
    }
    if (day.note) lines.push(`> 💡 ${day.note}`);
    lines.push('');
  });
  if (tasks.length) {
    lines.push('## 出发前核验任务（按影响排序）', '');
    const label = { high: '🔴 高', medium: '🟡 中', low: '⚪ 低' };
    tasks.forEach(t => lines.push(`- [ ] ${label[t.impact] || t.impact} ${escapeMd(t.question)}`));
    lines.push('');
  }
  const notes = [trip?.notes, emergency].filter(s => typeof s === 'string' && s.trim());
  if (notes.length) {
    lines.push('## 紧急与备注', '');
    notes.forEach(n => lines.push(n.trim(), ''));
  }
  return lines.join('\n');
}
