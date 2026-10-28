// 分类点位图标：火车站/地铁站/水上巴士/餐厅咖啡/酒店/机场/地堡
// checked=已打卡（置灰），selected=选中（大号+黑边）
import * as L from 'leaflet';

function boxIcon(checked, selected, bg, glyph, fontWeight = 400) {
  const n = selected ? 30 : 26;
  return L.divIcon({
    className: '',
    html: `<div style="width:${n}px;height:${n}px;border-radius:8px;` +
      `background:${checked ? '#9E9E9E' : bg};color:#fff;font:${fontWeight} ${0.55 * n}px/1 system-ui;` +
      `display:flex;align-items:center;justify-content:center;` +
      `border:${selected ? 3 : 2}px solid ${selected ? '#111' : '#fff'};` +
      `box-shadow:0 1px 4px rgba(0,0,0,.55);${checked ? 'opacity:.55;' : ''}">${glyph}</div>`,
    iconSize: [n, n],
    iconAnchor: [n / 2, n / 2],
  });
}

export const stationIcon = (c, s) => boxIcon(c, s, '#37474F', '🚉');
export const metroIcon = (c, s) => boxIcon(c, s, '#D32F2F', 'M', 700);
export const boatIcon = (c, s) => boxIcon(c, s, '#1565C0', '🚤');
export const cafeIcon = (c, s) => boxIcon(c, s, '#795548', '☕');
export const hotelIcon = (c, s) => boxIcon(c, s, '#00695C', '🏨');
export const airportIcon = (c, s) => boxIcon(c, s, '#E65100', '✈');
export const bunkerIcon = (c, s) => boxIcon(c, s, '#455A64', '☢');

// 按 tags/type 选图标；都不中返回 null（调用方回落到圆点）
export function categoryIcon(p, checked, selected) {
  const tags = p.tags || [];
  if (p.type === '火车站') return stationIcon(checked, selected);
  if (tags.includes('地铁站')) return metroIcon(checked, selected);
  if (tags.includes('水上巴士')) return boatIcon(checked, selected);
  if (tags.includes('餐厅/咖啡')) return cafeIcon(checked, selected);
  if (tags.includes('酒店/旅馆')) return hotelIcon(checked, selected);
  if (tags.includes('机场')) return airportIcon(checked, selected);
  if (tags.includes('地堡')) return bunkerIcon(checked, selected);
  return null;
}
