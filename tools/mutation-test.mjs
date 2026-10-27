// 校验器变异测试：对 data/ 施加单点变异，检测 check-data.mjs 能否捕获
// 用法: node mutation-test.mjs <repo根> <输出.tsv>
import { readFileSync, writeFileSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2]);
const OUT = process.argv[3];
const SRC = resolve(ROOT, 'data');
const TMP = resolve(dirname(fileURLToPath(import.meta.url)), '__mutdata__');

// 可复现随机（mulberry32）
let seed = 20261026;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0, seed / 2 ** 32);

const M = []; // {name, apply(obj)}
const load = () => JSON.parse(JSON.stringify(JSON.parse(readFileSync(resolve(SRC,'points.json'),'utf8'))));
const loadR = () => JSON.parse(JSON.stringify(JSON.parse(readFileSync(resolve(SRC,'routes.json'),'utf8'))));
const loadRt = () => JSON.parse(JSON.stringify(JSON.parse(readFileSync(resolve(SRC,'ratings.json'),'utf8'))));
const first = (p) => p.find(x => x.lat != null);

M.push({name:'重复id', apply(p){p[1].id=p[0].id;}});
M.push({name:'重复name', apply(p){p[1].name=p[0].name;}});
M.push({name:'删除name字段', apply(p){delete p[0].name;}});
M.push({name:'删除city字段', apply(p){delete p[0].city;}});
M.push({name:'删除cluster字段', apply(p){delete p[0].cluster;}});
M.push({name:'坐标越界lat=999', apply(p){const x=first(p);x.lat=999;}});
M.push({name:'坐标lon=-999', apply(p){const x=first(p);x.lon=-999;}});
M.push({name:'坐标置null且未标pending', apply(p){const x=first(p);delete x.pending;x.lat=null;}});
M.push({name:'有坐标但pending=true', apply(p){const x=first(p);x.pending=true;}});
M.push({name:'confidence=50非法值', apply(p){const x=first(p);x.confidence=50;}});
M.push({name:'id格式错误p12', apply(p){p[0].id='p12';}});
M.push({name:'id非字符串', apply(p){p[0].id=123;}});
M.push({name:'lat为字符串', apply(p){const x=first(p);x.lat='55.7';}});
M.push({name:'tags变成字符串', apply(p){p[0].tags='免费';}});
M.push({name:'tags含非字符串元素', apply(p){p[0].tags=['免费',42];}});
M.push({name:'name_en为数字', apply(p){p[0].name_en=42;}});
M.push({name:'动线引用不存在点位', apply(p,r){r[0].steps[0].point='不存在的点位XYZ';}});
M.push({name:'动线steps非数组', apply(p,r){r[0].steps='x';}});
M.push({name:'动线city缺失', apply(p,r){delete r[0].city;}});
M.push({name:'points顶层变对象', apply(p){p = {a:1}; return p;}});
// 第一方评分（私人米其林）变异：先种一条合法评分再破坏它
const seedFP = (rt, p) => { const f = p.find(x => (x.tags||[]).includes('餐厅/咖啡')); rt.items = rt.items || {}; rt.items[f.id] = { ratings: [{ src:'站长', dims:{'口味':5}, overall:5, visited:'2026-09' }] }; return f.id; };
M.push({name:'评分-维度键不属于该类型', apply(p,r,rt){const id=seedFP(rt,p);rt.items[id].ratings[0].dims={'海拔':5};}});
M.push({name:'评分-overall越界', apply(p,r,rt){const id=seedFP(rt,p);rt.items[id].ratings[0].overall=9;}});
M.push({name:'评分-visited格式错', apply(p,r,rt){const id=seedFP(rt,p);rt.items[id].ratings[0].visited='去年';}});
M.push({name:'评分-同点位来源重复', apply(p,r,rt){const id=seedFP(rt,p);rt.items[id].ratings.push({src:'站长',overall:4});}});

const results = [];
for (const m of M) {
  rmSync(TMP, {recursive:true, force:true});
  mkdirSync(TMP);
  cpSync(SRC, TMP, {recursive:true});
  let pts = load(), rts = loadR(), rt = loadRt();
  const ret = m.apply(pts, rts, rt);
  if (ret !== undefined) pts = ret;
  writeFileSync(resolve(TMP,'points.json'), JSON.stringify(pts));
  writeFileSync(resolve(TMP,'routes.json'), JSON.stringify(rts));
  writeFileSync(resolve(TMP,'ratings.json'), JSON.stringify(rt));
  let caught = false, output = '';
  try {
    output = execFileSync(process.execPath, [resolve(ROOT,'tools/check-data.mjs'), TMP], {encoding:'utf8', stdio:['ignore','pipe','pipe']});
    caught = false;
  } catch (e) {
    caught = true;
    output = (e.stdout||'') + (e.stderr||'');
  }
  results.push({mut:m.name, caught});
  console.log(`${caught?'✅捕获':'❌漏检'}  ${m.name}`);
}
rmSync(TMP, {recursive:true, force:true});
writeFileSync(OUT, 'mutation\tcaught\n' + results.map(r=>`${r.mut}\t${r.caught}`).join('\n'));
const caughtN = results.filter(r=>r.caught).length;
console.log(`\n结论: ${caughtN}/${results.length} 个变异被捕获，漏检 ${results.length-caughtN} 个`);
