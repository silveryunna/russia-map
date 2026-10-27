// type 受控词表迁移：447 个自由文本 type → 受控分类
// 用法: node tools/migrate-types.mjs --dry   （只看映射，不改文件）
//       node tools/migrate-types.mjs --apply （写回 data/points.json）
// 词表单一来源：tools/type-vocab.mjs（check-data.mjs import 同一份，改词表只改那里）
import { readFileSync, writeFileSync } from 'node:fs';
import { TYPE_VOCAB } from './type-vocab.mjs';

// 关键词规则，按优先级从上到下匹配（命中即停）
const RULES = [
  [/地铁站|地铁·|地铁$/, '地铁站'],
  [/火车站/, '火车站'],
  [/机场/, '机场'],
  [/水上巴士|码头|航线|游船|渡轮|轮渡/, '水上巴士'],
  [/交通|车站|汽车站|客运站|口岸|边境|海关/, '交通枢纽'],
  [/教堂|修道院|圣殿|主教座堂|礼拜堂|宗教|文庙|清真寺|寺庙|佛教|观音/, '宗教场所'],
  [/博物馆|画廊|美术馆|地堡|故居|展览/, '博物馆'],
  [/宫殿|庄园|克里姆林|城堡|公馆/, '宫殿庄园'],
  [/科技遗迹|科研机构|天文台|射电|望远镜|航天|核|火箭|通信|电话|技术乌托邦/, '科技遗迹'],
  [/工业遗产|铁路遗产|工厂|车库|厂房|制造厂/, '工业遗产'],
  [/文学地理|文学记忆|摇滚|文化空间|转型|遗产|文保|领事馆|旧址|之家|遗迹|大院|街道命名|历史胡同|城市层积|贵族记忆|水文考古|自然遗迹|后工业更新|古街|故居|名人|城市生态|记忆|艺术|学院|教育|音乐|戏剧|贸易|遗址|传说|体育|村落|城市化|村庄|电影院|电影|政治/, '城市记忆'],
  [/凯旋门|纪念碑|纪念牌|保卫战|苏联英雄/, '纪念地'],
  [/图书馆|书店/, '图书馆书店'],
  [/纪念|广场|陵墓|雕像|公墓|烈士|陵园|国保/, '纪念地'],
  [/建筑|七姐妹|构成主义|现代主义|古典主义|塔楼|摩天|住宅|风格|折衷|老宅|官邸|巴洛克|洛可可|哥特/, '建筑'],
  [/公园|花园|森林|自然保护区|滑雪|登山|绿地|池塘|自然景观|堰塞湖|冰川|雪山|湖泊|景区|湖|雨林|徒步|乐园|水族馆/, '公园自然'],
  [/海湾|沙滩|海滩|海岛|海岸|冲浪|渔村|海滨|滨海|海\b/, '海滩'],
  [/街巷|街区|漫步|步行街|小镇|金环|集市|桥|街道|喷泉|庭院|大道|主轴|街景|渔港|公路/, '街区'],
  [/观景|瞭望|俯瞰|全景|天台|摄影|拍照/, '观景'],
  [/演出|剧院|马戏|芭蕾|歌剧|音乐厅|交响|МХАТ/, '演出'],
  [/餐厅|美食|菜|餐饮|咖啡|食堂|食品|小吃|夜市|茶|快餐|大排档|粥|烧烤|海鲜|啤酒|餐吧|糕点|酒吧|酒馆|甜品|[Bb]runch/, '餐饮'],
  [/商场|购物|纪念品|商店|市场|百货|商厦|唱片/, '购物'],
  [/酒店|民宿|宾馆|住宿|青旅|旅馆/, '酒店住宿'],
  [/地标/, '地标'],
];

export const mapType = (t, name) => {
  const s = String(t || '');
  for (const [re, cat] of RULES) if (re.test(s)) return cat;
  const n = String(name || '');
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return '其他';
};

const pts = JSON.parse(readFileSync('data/points.json', 'utf8'));
const changes = [];
for (const p of pts) {
  const cat = mapType(p.type, p.name);
  if (p.type !== cat) changes.push([p.type, cat, p.name]);
}

const byCat = {};
for (const p of pts) { const c = mapType(p.type, p.name); byCat[c] = (byCat[c] || 0) + 1; }
console.log('=== 迁移后词表分布 ===');
Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(String(n).padStart(4), c));
console.log('\n=== 归入「其他」的点位（需人工过目） ===');
for (const p of pts) if (mapType(p.type, p.name) === '其他') console.log(' ', p.type, '→', p.name);
console.log(`\n总点位 ${pts.length}，将改写 ${changes.length} 个 type`);

// 归类结果必须全部落在受控词表内：RULES 若写出越界值，check-data 会对全量点位报错
const unknown = Object.keys(byCat).filter((c) => !TYPE_VOCAB.includes(c));
if (unknown.length) {
  console.error('❌ 归类结果不在受控词表：' + unknown.join('、'));
  process.exit(1);
}
console.log('✅ 归类结果全部在受控词表内');

if (process.argv.includes('--apply')) {
  for (const p of pts) p.type = mapType(p.type, p.name);
  writeFileSync('data/points.json', JSON.stringify(pts, null, 2) + '\n');
  console.log('已写回 data/points.json');
} else {
  console.log('（dry-run，未改文件；加 --apply 应用）');
}
