import{t as e}from"./sw-register-slL7fN2v.js";import{t}from"./icp-footer-Crs5Jn1v.js";import{n,t as r}from"./regions-B1YHvA7W.js";import{n as i,r as a,t as o}from"./store-BaZsxKiV.js";import{t as s}from"./data-safety-B_kegElk.js";import{a as c,c as l,g as u,h as d,m as f,n as p,o as ee,r as te,s as ne,t as re,u as m,x as ie}from"./execution-OdKW9pOX.js";var h=e=>String(e??``).replace(/[<>&'"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,"'":`&apos;`,'"':`&quot;`})[e]),g=e=>String(e??``).replace(/\|/g,`\\|`),ae=(e,t)=>(e instanceof Map?e.get(t):(e||{})[t])||null,_=e=>e&&Number.isFinite(e.lat)&&Number.isFinite(e.lon),v=(e,t)=>e?.name||t?.placeNameSnapshot||t?.refId||`未命名`;function y(e,t,{options:n={}}={}){return(e?.days||[]).map((e,r)=>{let i=te(e),a=f({day:e,items:i,places:t||null,options:n}),o=new Map(a.timeline.map(e=>[e.itemId,e]));return{day:e,dayIndex:r,rows:i.map(e=>{let n=e.refId?ae(t,e.refId):null,r=o.get(e.id);return r?{...r,item:e,point:n}:{itemId:e.id,placeId:n?.id||null,name:n?.name||e.placeNameSnapshot||e.id,arrive:null,start:null,end:null,duration:Number.isFinite(e.estimatedDuration)?e.estimatedDuration:n?.estimatedDuration??null,transitMinutes:0,mode:`none`,transitSource:`none`,transitSourceKind:`none`,calendar:`unknown`,unscheduled:!0,item:e,point:n}}),result:a}})}function oe(e,t,{options:n={}}={}){let r=[];return y(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{let i=[];n.forEach(n=>{if(!_(n.point))return;let a=[n.point.lon,n.point.lat];i.push(a),r.push({type:`Feature`,geometry:{type:`Point`,coordinates:a},properties:{kind:`visit`,day:t+1,date:e.date||``,name:v(n.point,n.item),arrive:Number.isFinite(n.arrive)?d(n.arrive):``,duration:n.duration??null,status:n.item?.plannedStatus||`planned`}})}),i.length>=2&&r.push({type:`Feature`,geometry:{type:`LineString`,coordinates:i},properties:{kind:`day-route`,day:t+1,date:e.date||``}})}),{type:`FeatureCollection`,features:r}}function se(e,t,{options:n={},now:r=()=>Date.now()}={}){let i=[],a=[];return y(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{let r=[];n.forEach(n=>{if(!_(n.point))return;let a=h(v(n.point,n.item)),o=h(`第 ${t+1} 天${e.date?` ${e.date}`:``}${Number.isFinite(n.arrive)?` · 计划 ${d(n.arrive)} 到达`:``}`);i.push(`  <wpt lat="${n.point.lat}" lon="${n.point.lon}"><name>${a}</name><desc>${o}</desc></wpt>`),r.push(`    <trkpt lat="${n.point.lat}" lon="${n.point.lon}"><name>${a}</name></trkpt>`)}),r.length&&a.push(`  <trk><name>${h(`第 ${t+1} 天${e.date?` ${e.date}`:``}`)}</name>\n  <trkseg>\n${r.join(`
`)}\n  </trkseg></trk>`)}),`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="niuma-travel" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${h(e?.title||`行程`)}</name><time>${new Date(r()).toISOString()}</time></metadata>
${i.join(`
`)}
${a.join(`
`)}
</gpx>
`}function ce(e,t,{options:n={}}={}){let r=[];return y(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{let i=[];n.forEach(e=>{_(e.point)&&(i.push(`${e.point.lon},${e.point.lat},0`),r.push(`    <Placemark><name>${h(v(e.point,e.item))}</name><description>${h(`第 ${t+1} 天 · ${Number.isFinite(e.arrive)?d(e.arrive):``}`)}</description><Point><coordinates>${e.point.lon},${e.point.lat},0</coordinates></Point></Placemark>`))}),i.length>=2&&r.push(`    <Placemark><name>${h(`第 ${t+1} 天动线`)}</name><LineString><coordinates>${i.join(` `)}</coordinates></LineString></Placemark>`)}),`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${h(e?.title||`行程`)}</name>
${r.join(`
`)}
  </Document>
</kml>
`}function le(e,t,{options:n={}}={}){let r=[`# ${e?.title||`行程`} · 点位摘要`,``];return y(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{r.push(`## 第 ${t+1} 天${e.date?`（${e.date}）`:``}`),n.forEach(e=>{if(!e.item)return;let t=v(e.point,e.item),n=Number.isFinite(e.arrive)?`${d(e.arrive)}–${d(e.end)}`:`待定`,i=[`**${t}**`,n,`停留 ${e.duration} 分钟`];e.point?.openCalendar===`unknown`&&i.push(`⚠️ 开放时间待核`),e.point?.ticket===`unknown`&&i.push(`⚠️ 门票待核`),e.point?.note&&i.push(`备注：${e.point.note}`),e.item.notes&&i.push(`我的备注：${e.item.notes}`),r.push(`- `+i.map(g).join(` · `))}),e.note&&r.push(`> 💡 ${e.note}`),r.push(``)}),r.join(`
`)}function ue(e,t,{options:n={},tasks:r=[],emergency:i=``}={}){let a=[`# ${e?.title||`行程`} · 离线核验清单`,``];if(a.push(`导出时间：${new Date().toISOString().slice(0,16).replace(`T`,` `)}（离线可用）`,``),y(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n,result:r})=>{a.push(`## 第 ${t+1} 天${e.date?`（${e.date}）`:``}`),n.length||a.push(`（空）`),n.forEach(e=>{if(!e.item)return;let t=e.item.plannedStatus===`done`?`[x]`:e.item.plannedStatus===`skipped`?`[-]`:`[ ]`,n=Number.isFinite(e.arrive)?`${d(e.arrive)}–${d(e.end)}`:`—`,r=[];e.calendar===`unknown`&&r.push(`开放时间待核`),e.transitSourceKind===`model-estimate`&&r.push(`交通为估算`),a.push(`- ${t} ${n} ${g(v(e.point,e.item))}${r.length?`（${r.join(`，`)}）`:``}`)}),r?.stats&&a.push(`> 预计停留 ${(r.stats.dwellMinutes/60).toFixed(1)}h · 通行 ${r.stats.transitMinutes}m${r.stats.unknownHours?` · ${r.stats.unknownHours} 处开放时间待核`:``}`),e.note&&a.push(`> 💡 ${e.note}`),a.push(``)}),r.length){a.push(`## 出发前核验任务（按影响排序）`,``);let e={high:`🔴 高`,medium:`🟡 中`,low:`⚪ 低`};r.forEach(t=>a.push(`- [ ] ${e[t.impact]||t.impact} ${g(t.question)}`)),a.push(``)}let o=[e?.notes,i].filter(e=>typeof e==`string`&&e.trim());return o.length&&(a.push(`## 紧急与备注`,``),o.forEach(e=>a.push(e.trim(),``))),a.join(`
`)}var b=document.getElementById(`today-app`),x=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),S=e=>String(e).padStart(2,`0`),C=()=>{let e=new Date;return`${e.getFullYear()}-${S(e.getMonth()+1)}-${S(e.getDate())}`},de=()=>{let e=new Date;return e.getHours()*60+e.getMinutes()},w=()=>{let e=new Date;return`${S(e.getHours())}:${S(e.getMinutes())}`},fe=e=>{let t=new Date(e);return`${S(t.getMonth()+1)}-${S(t.getDate())} ${S(t.getHours())}:${S(t.getMinutes())}`},T=e=>{let t=e<0?`−`:``,n=Math.abs(e);return n>=60?`${t}${Math.floor(n/60)}h${n%60?S(n%60):``}`:`${t}${n}m`},pe={empty:`今天没有排程条目`,feasible:`✅ 结构可行，证据充分`,conditional:`⚠️ 条件式可排（仍有待核事实或估算段）`,unmodeled:`⚠️ 含长途未建模段（需自行安排航班/长距离交通）`,infeasible:`⛔ 存在硬冲突，建议回编辑器调整`},me={generate:`🛠`,edit:`✏️`,reorder:`🔀`,move:`📦`,resize:`⏱`,trim:`✂️`,repair:`🧰`,replace:`🔁`,complete:`✅`,skip:`⏭`,arrive:`📍`,undo:`↶`,import:`📥`,note:`📝`},E=null,D=``,O=new Map,k=null,A=null,j=[],M=null,N=0,P=[],F=[],I=[],L=null;function R(e){let t=document.querySelector(`.td-toast`);t||(t=document.createElement(`div`),t.className=`td-toast`,document.body.appendChild(t)),t.textContent=e,t.classList.add(`show`),clearTimeout(R._t),R._t=setTimeout(()=>t.classList.remove(`show`),2200)}function z(e){if(!e)return``;for(let t of e.items){if(t.type===`note`||t.type===`task`||t.plannedStatus===`skipped`)continue;let e=t.refId?O.get(t.refId):null;if(e&&typeof e.region==`string`&&e.region)return e.region}return``}function B(e){let t=z(M.days[e]);if(!t)return``;for(let n=e-1;n>=0;--n){let e=z(M.days[n]);if(e)return e===t?``:e}return``}function V(e){return{start:e.startTime,end:e.endTime,transportMode:e.transportMode||`transit`,matrix:A,entryRegion:B(N),regionNames:he()}}function he(){let e={};if(k&&k.byId)for(let[t,n]of k.byId)e[t]=n.name||t;return e}function H(){let e=M.days[N];return{day:e,state:p({trip:M,day:e,visits:P,places:O,options:V(e),nowMinutes:de()})}}function U(e){return e.item&&e.item.refId?O.get(e.item.refId):null}function W(e){return!e||!Number.isFinite(e.lat)?``:`https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=18/${e.lat}/${e.lon}`}var G=e=>U(e)?.name||e.item?.placeNameSnapshot||e.name||`未命名`;function K(e){let t=[];e.calendar===`unknown`&&e.placeId&&t.push(`<span class="td-flag unknown">开放时间待核</span>`),e.unmodeled&&t.push(`<span class="td-flag estimate">✈️ 长途未建模（需自行安排航班/长距离交通）</span>`),e.transitSourceKind===`model-estimate`&&e.transitMinutes>0&&t.push(`<span class="td-flag estimate">交通为估算</span>`),e.transitSourceKind===`third-party-route`&&t.push(`<span class="td-flag">第三方路线</span>`);let n=e.placeId?O.get(e.placeId):null;return n&&!r(n,k)&&t.push(`<span class="td-flag">⛔ 该点位所在板块已隐藏</span>`),t.join(``)}function q(){if(!M){xe();return}let{day:e,state:t}=H(),{rows:n,current:r,next:i,bufferMinutes:a,progress:o,result:s}=t,c=s.structural,l=c===`infeasible`?`is-bad`:c===`conditional`||c===`unmodeled`?`is-warn`:``,d=r||i,f=Number.isFinite(a)?`<span class="td-buffer ${a<10?`tight`:`ok`}">${a<0?`已吃紧 ${T(a)}`:`还可缓冲 ${T(a)}`}</span>`:``;b.innerHTML=`
    ${D?`<div class="td-card td-emergency">⚠️ ${x(D)}</div>`:``}
    <div class="td-toolbar">
      <select id="td-trip">${j.map(e=>`<option value="${x(e.id)}" ${e.id===M.id?`selected`:``}>${x(e.title)}</option>`).join(``)}</select>
      <select id="td-day">${M.days.map((e,t)=>`<option value="${t}" ${t===N?`selected`:``}>第 ${t+1} 天${e.date?` ${e.date}`:``}</option>`).join(``)}</select>
      <a class="td-btn" href="./plan.html">🧭 编辑器</a>
    </div>

    <div class="td-card">
      <div class="td-progress">
        <span>✅ 完成 ${o.done}</span>
        <span>⏭ 跳过 ${o.skipped}</span>
        <span>⏳ 待办 ${o.pending}</span>
        ${f}
      </div>
      <div class="td-verdict ${l}">${x(pe[c]||c)}</div>
      ${s.stats&&s.stats.unknownHours?`<div class="td-muted">${s.stats.unknownHours} 处开放时间待核</div>`:``}
    </div>

    ${d?`
    <div class="td-card td-now">
      <div class="td-label">${r?`正在进行`:`下一项`}</div>
      <div class="td-name">${x(G(d))}</div>
      <div class="td-time">${Number.isFinite(d.arrive)?`${u(d.arrive)}–${u(d.end)}`:`时间待定`} · 停留 ${d.duration??`—`} 分钟${d.transitMinutes?` · 路上约 ${d.transitMinutes} 分钟`:``}</div>
      <div>${K(d)}</div>
      <div class="td-actions">
        <button class="td-btn primary" data-act="done" data-id="${x(d.itemId)}">✅ 完成</button>
        ${r?``:`<button class="td-btn" data-act="arrive" data-id="${x(d.itemId)}">📍 到达打卡</button>`}
        <button class="td-btn warn" data-act="skip" data-id="${x(d.itemId)}">⏭ 跳过</button>
        ${W(U(d))?`<a class="td-btn" href="${W(U(d))}" target="_blank" rel="noopener">🧭 导航</a>`:``}
      </div>
    </div>`:`
    <div class="td-card"><h2>🎉 今天全部完成</h2><div class="td-muted">没有待办项了，好好休息。</div></div>`}

    <div class="td-card">
      <h2>📋 今天的时间表</h2>
      ${n.length?n.map(e=>ge(e,r)).join(``):`<div class="td-muted">（空）</div>`}
    </div>

    ${e.note?`<div class="td-card td-emergency">💡 ${x(e.note)}</div>`:``}
    ${M.notes?`<div class="td-card td-emergency">🚨 ${x(M.notes)}</div>`:``}

    ${_e()}
    ${ve()}
    ${ye()}
    ${be()}
  `,Ee()}function ge(e,t){let n=e.status===`done`?`is-done`:e.status===`skipped`?`is-skipped`:``,r=t&&t.itemId===e.itemId?`is-current`:``,i=e.unscheduled?`is-unscheduled`:``,a=Number.isFinite(e.arrive)?`${u(e.arrive)}<br>${u(e.end)}`:`待定`,o=e.status===`done`?`✅`:e.status===`skipped`?`⏭`:e.item?.type===`meal`?`🍽`:e.item?.type===`break`?`☕`:`📍`,s=U(e),c=e.status===`pending`&&e.item&&(e.item.type===`visit`||e.item.type===`reservation`||e.item.type===`meal`||e.item.type===`break`);return`
    <div class="td-row ${n} ${r} ${i}">
      <div class="td-time">${a}</div>
      <div class="td-body">
        <div class="td-name">${o} ${x(G(e))}</div>
        <div class="td-sub">${e.transitMinutes?`路上约 ${e.transitMinutes} 分钟 · `:``}停留 ${e.duration??`—`} 分钟 ${K(e)}</div>
      </div>
      <div class="td-row-actions">
        ${c?`<button class="td-btn" data-act="done" data-id="${x(e.itemId)}">✅</button>
        <button class="td-btn" data-act="skip" data-id="${x(e.itemId)}">⏭</button>`:``}
        ${W(s)?`<a class="td-btn" href="${W(s)}" target="_blank" rel="noopener">🧭</a>`:``}
      </div>
    </div>`}function _e(){let e=m(M,O,{today:C()});if(!e.length)return``;let t={high:`🔴`,medium:`🟡`,low:`⚪`};return`
    <div class="td-card">
      <h2>🧾 出发前核验（${e.length}）</h2>
      ${e.slice(0,12).map(e=>`<div class="td-task"><span class="td-impact">${t[e.impact]||``}</span>${x(e.question)}</div>`).join(``)}
      ${e.length>12?`<div class="td-muted">…共 ${e.length} 条，完整清单见离线包</div>`:``}
    </div>`}function ve(){return F.length?`
    <div class="td-card">
      <h2>🕘 变更日志（最近 ${Math.min(F.length,20)} 条）</h2>
      ${F.slice(0,20).map(e=>`
        <div class="td-event"><span class="td-event-time">${fe(e.at)}</span>${me[e.kind]||`•`} ${x(e.summary||e.kind)}</div>`).join(``)}
    </div>`:``}function ye(){let e=c(M,{visits:P,legs:I}),t=e.visits.filter(e=>e.status===`visited`),n=e.legs.filter(e=>Number.isFinite(e.errorMinutes));if(!t.length&&!n.length)return``;let r=e=>{let t=Number.isFinite(e.plannedDuration)?e.plannedDuration:null;return`<div class="td-event"><span class="td-event-time">${x(e.actualStart||`—`)}–${x(e.actualEnd||`—`)}</span>✅ ${x(e.name)}${t===null?``:` · 计划停留 ${t} 分钟`}</div>`},i=e=>{for(let t of M.days){let n=(t.items||[]).find(t=>t.id===e);if(n)return n.placeNameSnapshot||n.type||`条目`}return``};return`
    <div class="td-card">
      <h2>📊 实际 vs 计划</h2>
      ${t.length?t.map(r).join(``):`<div class="td-muted">（还没有完成记录）</div>`}
      ${n.length?`<div class="td-muted" style="margin-top:6px">通行偏差</div>${n.map(e=>{let t=e.errorMinutes,n=t>5?`is-bad`:``,r=i(e.toItemId);return`<div class="td-event ${n}"><span class="td-event-time">${t>0?`+`:``}${t} 分钟</span>🧭 ${r?`去「${x(r)}」`:`路上`}实际 ${e.actualMinutes} 分钟（计划 ${e.plannedMinutes??`—`}）${e.mode?` · ${x(e.mode)}`:``}</div>`}).join(``)}`:``}
      <div class="td-muted" style="margin-top:6px">只报告、不改写原始记录；这些偏差将来会用于校准通行估算。</div>
    </div>`}function be(){return`
    <div class="td-card">
      <h2>📦 离线包</h2>
      <div class="td-muted" style="margin-bottom:8px">全部在本机生成，飞行模式可用；数据不出这台设备。</div>
      <div class="td-actions">
        <button class="td-btn" data-dl="json">行程 JSON</button>
        <button class="td-btn" data-dl="gpx">GPX 轨迹</button>
        <button class="td-btn" data-dl="kml">KML</button>
        <button class="td-btn" data-dl="geojson">GeoJSON</button>
        <button class="td-btn" data-dl="checklist">核验清单 MD</button>
        <button class="td-btn" data-dl="digest">点位摘要 MD</button>
      </div>
    </div>`}function xe(){b.innerHTML=`
    ${D?`<div class="td-card td-emergency">⚠️ ${x(D)}</div>`:``}
    <div class="td-card">
      <h2>选择要执行的行程</h2>
      ${j.length?`
        <div class="td-toolbar"><select id="td-trip">${j.map(e=>`<option value="${x(e.id)}">${x(e.title)}（${e.days.length} 天）</option>`).join(``)}</select>
        <button class="td-btn primary" id="td-open">打开</button></div>
        <div class="td-muted">也可以先去 <a href="./plan.html">🧭 行程计划</a> 新建或调整。</div>`:`<div class="td-muted">还没有行程。先去 <a href="./plan.html">🧭 行程计划</a> 生成一份草案。</div>`}
    </div>`;let e=document.getElementById(`td-open`);e&&(e.onclick=()=>{let e=document.getElementById(`td-trip`),t=j.find(t=>t.id===e.value);t&&Y(t.id)})}async function J(){j=await E.listTrips()}async function Y(e){let t=await E.getTrip(e);if(!t){R(`行程不存在`),await J(),M=null,q();return}M=t;let n=ee(t,C());N=n?n.dayIndex:0,await X(),q()}async function X(){if(!M){P=[],F=[],I=[];return}[P,F,I]=await Promise.all([E.listVisits({tripId:M.id}),E.listEvents({tripId:M.id}),E.listLegs({tripId:M.id})])}async function Z(){if(!M)return;let e=await E.getTrip(M.id);e&&(M=e),await X(),q()}async function Q(e,t){if(!e.ok)return R(e.error||`操作失败`),!1;let n;try{n=await E.applyExecution({trip:e.trip,visit:e.visit||null,event:e.event||null,leg:e.leg||null})}catch(e){return R(`保存失败：`+(e&&e.message||`浏览器存储不可用`)),!1}return n.ok?(n.trip&&(M=n.trip),await X(),q(),t&&R(t),!0):(n.code===`revision-conflict`?(R(`行程已在别处更新，已刷新`),await Z()):R(`保存失败：`+(n.errors&&n.errors[0]&&n.errors[0].message||`未知错误`)),!1)}async function Se(e){let t=H().state.rows.find(t=>t.itemId===e);await Q(re(M,e,{at:Date.now(),actualEnd:w(),existingVisits:P}),`已完成「${t?G(t):``}」`)}async function Ce(e){let t=prompt(`跳过原因（可留空）：`,``);if(t===null)return;let n=H().state.rows.find(t=>t.itemId===e);await Q(l(M,e,{reason:t,at:Date.now(),existingVisits:P}),`已跳过「${n?G(n):``}」`)}async function we(e){let{day:t,state:n}=H(),r=n.rows.find(t=>t.itemId===e);if(!r)return;let i=Number.isFinite(r.transitMinutes)?r.transitMinutes:null,a=prompt(`到达「${G(r)}」。这段路实际走了几分钟？`,i===null?`15`:String(i));if(a===null)return;let o=Number(a);if(!Number.isFinite(o)||o<0){R(`分钟数无效`);return}let s=ne(M,t,r.item,{plannedMinutes:i,mode:r.mode,actualMinutes:o,at:Date.now()});await Q({ok:!0,trip:null,leg:s.leg,event:s.event},`已记录：路上 ${Math.round(o)} 分钟`)}function $(e,t,n=`text/plain;charset=utf-8`){let r=new Blob([t],{type:n}),i=document.createElement(`a`);i.href=URL.createObjectURL(r),i.download=e,i.click(),setTimeout(()=>URL.revokeObjectURL(i.href),5e3)}async function Te(e){if(!M)return;let t=C(),n={options:V(M.days[N]||{})},r=m(M,O,{today:t});if(e===`json`){let e=await E.exportAll();$(`trip-backup-${t}.json`,JSON.stringify(e,null,2),`application/json`)}else e===`gpx`?$(`trip-${t}.gpx`,se(M,O,n),`application/gpx+xml`):e===`kml`?$(`trip-${t}.kml`,ce(M,O,n),`application/vnd.google-earth.kml+xml`):e===`geojson`?$(`trip-${t}.geojson`,JSON.stringify(oe(M,O,n),null,2),`application/geo+json`):e===`checklist`?$(`checklist-${t}.md`,ue(M,O,{...n,tasks:r}),`text/markdown;charset=utf-8`):e===`digest`&&$(`digest-${t}.md`,le(M,O,n),`text/markdown;charset=utf-8`);R(`已导出`)}function Ee(){let e=document.getElementById(`td-trip`);e&&(e.onchange=()=>Y(e.value));let t=document.getElementById(`td-day`);t&&(t.onchange=()=>{N=Number(t.value)||0,q()}),b.querySelectorAll(`[data-act]`).forEach(e=>{e.onclick=()=>{let t=e.getAttribute(`data-id`),n=e.getAttribute(`data-act`);n===`done`?Se(t):n===`skip`?Ce(t):n===`arrive`&&we(t)}}),b.querySelectorAll(`[data-dl]`).forEach(e=>{e.onclick=()=>Te(e.getAttribute(`data-dl`))})}async function De(){if(await J(),!j.length){M=null,q();return}let e=C();await Y((j.find(e=>e.status===`active`)||j.find(t=>t.startDate&&t.endDate&&t.startDate<=e&&e<=t.endDate)||j[0]).id)}(async()=>{let[e,r,c]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/transit-matrix.json`).then(e=>e.ok?e.json():null).catch(()=>null),n()]);k=c;let l=Array.isArray(e)?e:e.points||[];O=new Map(l.map(e=>[e.id,e])),A=ie(r);try{E=await a({driver:o()}),await E.getMeta(`__probe`)}catch{E=await a({driver:i()}),D=`IndexedDB 不可用，本次会话的改动不会被保存`}D||s({store:E}).catch(()=>{}),E.subscribe(e=>{e.origin!==E.clientId&&(e.area===`trips`||e.area===`visits`||e.area===`events`||e.area===`legs`||e.area===`execution`||e.area===`import`)&&Z()}),t(),await De(),L=setInterval(()=>{M&&q()},3e4)})().catch(e=>{b.innerHTML=`<div class="td-card">⚠️ 加载失败：${x(e.message)}</div>`}),window.addEventListener(`beforeunload`,()=>{L&&clearInterval(L)}),e();