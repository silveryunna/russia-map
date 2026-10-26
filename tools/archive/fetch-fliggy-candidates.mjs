// 一次性：为待录入新点位抓取飞猪 search-poi 候选坐标（直跑 bundle，规避 Windows spawn/编码坑）
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
const BUNDLE = process.env.APPDATA + '/npm/node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs';
if (!existsSync(BUNDLE)) { console.error('bundle missing'); process.exit(1); }

// [name, city, keyword]
const LIST = [
  ['林姐香味海鲜（第一市场总店）','三亚','林姐香味海鲜'],
  ['海螺号海鲜店','三亚','海螺号海鲜'],
  ['四川小胡子海鲜加工（海棠湾店）','三亚','四川小胡子海鲜'],
  ['琼乡阁海南菜餐厅（三亚湾店）','三亚','琼乡阁'],
  ['郑阿婆清补凉','三亚','郑阿婆清补凉'],
  ['正宗抱罗粉','三亚','正宗抱罗粉'],
  ['渔村炸鸡店','三亚','渔村炸鸡'],
  ['阿公烧烤','三亚','阿公烧烤'],
  ['阿菊冷饮店','三亚','阿菊冷饮'],
  ['阿婆东山羊肉店','三亚','阿婆东山羊肉'],
  ['大众牛骨汤','三亚','大众牛骨汤'],
  ['利国餐厅','三亚','利国餐厅'],
  ['文妈后安粉','三亚','文妈后安粉'],
  ['龟劲角（小东海粉红断桥）','三亚','龟劲角'],
  ['三亚海韵酒店（椰梦长廊草坪机位）','三亚','海韵酒店'],
  ['三亚婚纱摄影基地','三亚','三亚婚纱摄影基地'],
  ['三亚文华东方酒店（海边石门机位）','三亚','三亚文华东方酒店'],
  ['尖岭（陵水）','陵水','尖岭'],
  ['桥海牧场（万宁）','万宁','桥海牧场'],
  ['山海浪人（万宁）','万宁','山海浪人'],
  ['山钦湾燕子洞（万宁）','万宁','山钦湾'],
  ['木兰湾（文昌）','文昌','木兰湾'],
  ['石头公园（文昌）','文昌','石头公园'],
  ['孟菜园（琼海）','琼海','孟菜园'],
  ['云洞图书馆（海口）','海口','云洞图书馆'],
];

function query(city, kw) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BUNDLE, 'search-poi', '--city-name', city, '--keyword', kw],
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        let data = null;
        try {
          const j = JSON.parse(stdout.trim().split('\n').pop());
          data = j?.data ?? null;
        } catch {}
        resolve(data); // 退出码不可信，只看 stdout（CLI 非控制台 spawn 必崩但 JSON 完整）
      });
  });
}

const out = {};
for (const [name, city, kw] of LIST) {
  const d = await query(city, kw);
  if (d && d.itemList && d.itemList.length) {
    out[name] = d.itemList.slice(0, 3).map(it => ({
      name: it.name, address: it.address, lat: it.latitude, lon: it.longitude,
    }));
  } else {
    out[name] = [];
  }
  console.log(name, '->', out[name].length ? out[name].length + ' hits' : 'NONE');
}
writeFileSync('tools/fliggy-new-candidates.json', JSON.stringify(out, null, 1), 'utf-8');
