// 国内点位多方地图交叉核对的公共口径（audit-china-cross / audit-baidu 共用）
// 只放纯函数与常量：不读文件、不发请求，方便未来单测。
export const CN_CITIES = new Set(['哈尔滨', '伊宁', '三亚', '赛里木湖', '博乐', '阿拉山口', '霍尔果斯', '乌鲁木齐']);

// 百度 Agent Plan 的 region 用行政区全称；拿不到时回退城市名。
export const CITY_REGION = {
  哈尔滨: '哈尔滨市', 伊宁: '伊宁市', 三亚: '三亚市', 赛里木湖: '博尔塔拉蒙古自治州',
  博乐: '博乐市', 阿拉山口: '阿拉山口市', 霍尔果斯: '霍尔果斯市', 乌鲁木齐: '乌鲁木齐市',
};

// 跨县市点位（如「三亚行程」里的陵水/万宁/保亭/文昌）必须先落到省级 region 才查得到；
// 只给地级市会返回同名不同地的 POI（分界洲岛 → 三亚市区的潜水基地，差 74km）。
export const PROVINCE = {
  哈尔滨: '黑龙江省', 伊宁: '新疆维吾尔自治区', 三亚: '海南省', 赛里木湖: '新疆维吾尔自治区',
  博乐: '新疆维吾尔自治区', 阿拉山口: '新疆维吾尔自治区', 霍尔果斯: '新疆维吾尔自治区', 乌鲁木齐: '新疆维吾尔自治区',
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

// 去掉名称里的城市前缀，避免「伊宁六星街」这种库内命名干扰匹配。
// 剩余部分至少 3 字才剥：「三亚湾」剥完只剩「湾」、「博乐机场」剥完只剩「机场」会把检索带偏。
export function coreName(name, city) {
  const n = cleanName(name).replace(/ /g, '');
  const c = cleanName(city || '').replace(/ /g, '');
  if (c && n.startsWith(c) && n.length - c.length >= 3) return n.slice(c.length);
  return n;
}

// 0..1 名称匹配度：1 完全相同；连续包含 0.9/0.8/0.7（最可信）；
// 只有零散字重合的最多 0.6——「伊犁边防宾馆」不能压过「伊宁伊犁宾馆」这种真正包含的候选。
export function nameScore(title, kw) {
  const t = cleanName(title).replace(/ /g, '');
  const k = cleanName(kw).replace(/ /g, '');
  if (!t || !k) return 0;
  if (t === k) return 1;
  const short = t.length <= k.length ? t : k;
  const long = t.length <= k.length ? k : t;
  if (long.includes(short)) {
    const r = short.length / long.length;
    return r >= 0.75 ? 0.9 : r >= 0.45 ? 0.8 : 0.7;
  }
  const set = new Set(t);
  let hit = 0;
  for (const ch of new Set(k)) if (set.has(ch)) hit++;
  const cov = hit / new Set(k).size;
  const r = Math.min(t.length, k.length) / Math.max(t.length, k.length);
  return Math.min(0.6, +(cov * (0.5 + 0.5 * r)).toFixed(3));
}
