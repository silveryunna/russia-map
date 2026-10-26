// 核对三亚沿海点位：与腾讯 suggestion 比对，输出偏差>250m的清单（GCJ->WGS后再算距离）
const KEY=process.env.QQ_LBS_KEY;if(!KEY){console.error('缺少环境变量 QQ_LBS_KEY（腾讯地图Key，只存本机/NAS，不入库）');process.exit(1);}
const PI=Math.PI,AXIS=6378245.0,EE=0.00669342162296594323;
const tL=(x,y)=>{let r=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;r+=(20*Math.sin(y*PI)+40*Math.sin(y/3*PI))*2/3;r+=(160*Math.sin(y/12*PI)+320*Math.sin(y*PI/30))*2/3;return r};
const tN=(x,y)=>{let r=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;r+=(20*Math.sin(x*PI)+40*Math.sin(x/3*PI))*2/3;r+=(150*Math.sin(x/12*PI)+300*Math.sin(x/30*PI))*2/3;return r};
const cv=(lat,lon)=>{const a=tL(lon-105,lat-35),b=tN(lon-105,lat-35);const ra=lat/180*PI;let m=Math.sin(ra);m=1-EE*m*m;const sm=Math.sqrt(m);return [lat-(a*180)/((AXIS*(1-EE))/(m*sm)*PI),lon-(b*180)/(AXIS/sm*Math.cos(ra)*PI)]};
const dist=(a,la,lo)=>{const dx=(a[1]-lo)*111320*Math.cos(a[0]*PI/180),dy=(a[0]-la)*110540;return Math.hypot(dx,dy)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
import { readFileSync } from 'node:fs';
const d=JSON.parse(readFileSync('data/points.json','utf8'));
// 重点核对：截图涉及的 + 昨日批次 + 沿海度假/海岛类
const IDS=['p561','p564','p566','p567','p569','p577','p578','p595','p596','p597','p598','p599','p600','p601','p602','p603','p604','p600','p619','p621'];
const seen=new Set();
for(const id of IDS){
  if(seen.has(id))continue; seen.add(id);
  const p=d.find(x=>x.id===id); if(!p||p.lat==null){console.log(id,p?.name,'无坐标');continue;}
  const core=p.name.replace(/（[^（）]*）/g,'').trim();
  const region=/文昌|陵水|万宁|琼海|海口/.exec(p.name)?.[0]||p.city;
  const u=`https://apis.map.qq.com/ws/place/v1/suggestion?keyword=${encodeURIComponent(core)}&region=${encodeURIComponent(region)}&page_size=5&key=${KEY}`;
  let rows=[];
  try{const r=await fetch(u,{headers:{Referer: 'https://julyyunna.art/'},signal:AbortSignal.timeout(15000)});const j=await r.json();rows=j.data||[];}catch(e){console.log(id,p.name,'查询失败');continue;}
  await sleep(250);
  if(!rows.length){console.log(id,p.name,'→ 腾讯无结果');continue;}
  // 对每个候选转WGS后算距离，取最近
  let best=null,bd=1e9;
  for(const c of rows){const[wLa,wLo]=cv(c.location.lat,c.location.lng);const dd=dist([wLa,wLo],p.lat,p.lon);if(dd<bd){bd=dd;best={t:c.title,loc:[wLa,wLo],raw:[c.location.lat,c.location.lng]}}}
  const flag=bd>250?'⚠️':'✓';
  console.log(flag,id,p.name,'| 偏差',Math.round(bd),'m | 当前',p.lat,p.lon,'| 腾讯',best.t,best.loc[0].toFixed(5),best.loc[1].toFixed(5));
}
