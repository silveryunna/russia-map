// 一次性：腾讯地图 suggestion 批量取坐标（GCJ-02，输出供人工审核后转 WGS）
import { writeFileSync } from 'node:fs';
const KEY = '4VQBZ-ZGO3G-VGSQE-ILN4G-LWFUK-5WB7H';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// [key, region, keyword]
const LIST = [
  ['linjie','三亚','林姐香味海鲜'],
  ['hailuo','三亚','海螺号海鲜'],
  ['xiaohuzi','三亚','四川小胡子海鲜'],
  ['qiongxiangge','三亚','琼乡阁海南菜'],
  ['zhengapo','三亚','郑阿婆清补凉'],
  ['baoluo','三亚','正宗抱罗粉'],
  ['yucun','三亚','渔村炸鸡'],
  ['agong','三亚','阿公烧烤'],
  ['aju','三亚','阿菊冷饮'],
  ['dongshanyang','三亚','阿婆东山羊肉'],
  ['niugu','三亚','大众牛骨汤'],
  ['liguo','三亚','利国餐厅'],
  ['wenma','三亚','文妈后安粉'],
  ['guijing','三亚','龟劲角'],
  ['haiyun','三亚','三亚海韵度假酒店'],
  ['sheying','三亚','三亚湾婚纱摄影基地'],
  ['wenhua','三亚','三亚文华东方酒店'],
  ['jianling','陵水','尖岭'],
  ['qiaohai','万宁','桥海牧场'],
  ['shanhai','万宁','山海浪人'],
  ['shanqin','万宁','山钦湾'],
  ['mulan','文昌','木兰湾'],
  ['shitou','文昌','石头公园'],
  ['mengcai','琼海','孟菜园'],
  ['yundong','海口','云洞图书馆'],
];
const out = {};
for (const [k, region, kw] of LIST) {
  const u = `https://apis.map.qq.com/ws/place/v1/suggestion?keyword=${encodeURIComponent(kw)}&region=${encodeURIComponent(region)}&page_size=6&key=${KEY}`;
  try {
    const r = await fetch(u, { headers: { Referer: 'https://map.qq.com/' }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    out[k] = (j.data || []).map(x => ({ t: x.title, a: x.address, cat: x.category, lat: x.location.lat, lng: x.location.lng }));
  } catch (e) { out[k] = { err: e.message }; }
  console.log(k, (out[k] || []).length ?? 'ERR');
  await sleep(250);
}
writeFileSync('tools/qq-new-candidates.json', JSON.stringify(out, null, 1), 'utf-8');
