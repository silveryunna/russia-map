// 国内点位多方地图交叉核对的公共口径（audit-china-cross / audit-baidu 共用）
// 只放纯函数与常量：不读文件、不发请求，方便未来单测。
export const CN_CITIES = new Set(['哈尔滨', '伊宁', '三亚', '赛里木湖', '博乐', '阿拉山口', '霍尔果斯', '乌鲁木齐']);

// 百度 Agent Plan 的 region 用行政区全称；拿不到时回退城市名。
export const CITY_REGION = {
  哈尔滨: '哈尔滨市', 伊宁: '伊宁市', 三亚: '三亚市', 赛里木湖: '博尔塔拉蒙古自治州',
  博乐: '博乐市', 阿拉山口: '阿拉山口市', 霍尔果斯: '霍尔果斯市', 乌鲁木齐: '乌鲁木齐市',
};

export const AGREE = 150;  // 源间一致阈值
export const FAR = 400;    // 库存落单阈值

// 接受 {lat, lon} 或 [lat, lon]
export const distM = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const [a0, a1] = [a.lat ?? a[0], a.lon ?? a[1]];
  const [b0, b1] = [b.lat ?? b[0], b.lon ?? b[1]];
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin((b0 - a0) * r / 2) ** 2 + Math.cos(a0 * r) * Math.cos(b0 * r) * Math.sin((b1 - a1) * r / 2) ** 2));
};

// 去括号、标点、多余空格：地图 POI 名与库存名对齐用
export const cleanName = (name) => String(name)
  .replace(/（.*?）|\(.*?\)|「|」|《|》|№/g, ' ')
  .replace(/[^\p{Script=Han}A-Za-z0-9 ]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// 0..1 名称匹配度：1 完全相同，0.9 互为子串，否则按去重字符覆盖率
export function nameScore(title, kw) {
  const t = cleanName(title).replace(/ /g, '');
  const k = cleanName(kw).replace(/ /g, '');
  if (!t || !k) return 0;
  if (t === k) return 1;
  if (t.includes(k) || k.includes(t)) return 0.9;
  const set = new Set(t);
  let hit = 0;
  for (const ch of new Set(k)) if (set.has(ch)) hit++;
  return hit / new Set(k).size;
}
