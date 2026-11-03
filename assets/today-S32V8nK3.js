import"./base-CLrNf-fO.js";import{t as e}from"./icp-footer-Crs5Jn1v.js";import{n as t,r as n,t as r}from"./store-CKBDx_-R.js";import{a as i,c as a,g as o,h as s,m as c,n as l,o as u,r as d,s as f,t as ee,u as p,x as m}from"./execution-DIqgBe4H.js";var h=e=>String(e??``).replace(/[<>&'"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,"'":`&apos;`,'"':`&quot;`})[e]),g=e=>String(e??``).replace(/\|/g,`\\|`),_=(e,t)=>(e instanceof Map?e.get(t):(e||{})[t])||null,v=e=>e&&Number.isFinite(e.lat)&&Number.isFinite(e.lon),y=(e,t)=>e?.name||t?.placeNameSnapshot||t?.refId||`未命名`;function b(e,t,{options:n={}}={}){return(e?.days||[]).map((e,r)=>{let i=d(e),a=c({day:e,items:i,places:t||null,options:n}),o=new Map(a.timeline.map(e=>[e.itemId,e]));return{day:e,dayIndex:r,rows:i.map(e=>{let n=e.refId?_(t,e.refId):null,r=o.get(e.id);return r?{...r,item:e,point:n}:{itemId:e.id,placeId:n?.id||null,name:n?.name||e.placeNameSnapshot||e.id,arrive:null,start:null,end:null,duration:Number.isFinite(e.estimatedDuration)?e.estimatedDuration:n?.estimatedDuration??null,transitMinutes:0,mode:`none`,transitSource:`none`,transitSourceKind:`none`,calendar:`unknown`,unscheduled:!0,item:e,point:n}}),result:a}})}function x(e,t,{options:n={}}={}){let r=[];return b(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{let i=[];n.forEach(n=>{if(!v(n.point))return;let a=[n.point.lon,n.point.lat];i.push(a),r.push({type:`Feature`,geometry:{type:`Point`,coordinates:a},properties:{kind:`visit`,day:t+1,date:e.date||``,name:y(n.point,n.item),arrive:Number.isFinite(n.arrive)?s(n.arrive):``,duration:n.duration??null,status:n.item?.plannedStatus||`planned`}})}),i.length>=2&&r.push({type:`Feature`,geometry:{type:`LineString`,coordinates:i},properties:{kind:`day-route`,day:t+1,date:e.date||``}})}),{type:`FeatureCollection`,features:r}}function te(e,t,{options:n={},now:r=()=>Date.now()}={}){let i=[],a=[];return b(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{let r=[];n.forEach(n=>{if(!v(n.point))return;let a=h(y(n.point,n.item)),o=h(`第 ${t+1} 天${e.date?` ${e.date}`:``}${Number.isFinite(n.arrive)?` · 计划 ${s(n.arrive)} 到达`:``}`);i.push(`  <wpt lat="${n.point.lat}" lon="${n.point.lon}"><name>${a}</name><desc>${o}</desc></wpt>`),r.push(`    <trkpt lat="${n.point.lat}" lon="${n.point.lon}"><name>${a}</name></trkpt>`)}),r.length&&a.push(`  <trk><name>${h(`第 ${t+1} 天${e.date?` ${e.date}`:``}`)}</name>\n  <trkseg>\n${r.join(`
`)}\n  </trkseg></trk>`)}),`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="niuma-travel" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${h(e?.title||`行程`)}</name><time>${new Date(r()).toISOString()}</time></metadata>
${i.join(`
`)}
${a.join(`
`)}
</gpx>
`}function ne(e,t,{options:n={}}={}){let r=[];return b(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{let i=[];n.forEach(e=>{v(e.point)&&(i.push(`${e.point.lon},${e.point.lat},0`),r.push(`    <Placemark><name>${h(y(e.point,e.item))}</name><description>${h(`第 ${t+1} 天 · ${Number.isFinite(e.arrive)?s(e.arrive):``}`)}</description><Point><coordinates>${e.point.lon},${e.point.lat},0</coordinates></Point></Placemark>`))}),i.length>=2&&r.push(`    <Placemark><name>${h(`第 ${t+1} 天动线`)}</name><LineString><coordinates>${i.join(` `)}</coordinates></LineString></Placemark>`)}),`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${h(e?.title||`行程`)}</name>
${r.join(`
`)}
  </Document>
</kml>
`}function S(e,t,{options:n={}}={}){let r=[`# ${e?.title||`行程`} · 点位摘要`,``];return b(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n})=>{r.push(`## 第 ${t+1} 天${e.date?`（${e.date}）`:``}`),n.forEach(e=>{if(!e.item)return;let t=y(e.point,e.item),n=Number.isFinite(e.arrive)?`${s(e.arrive)}–${s(e.end)}`:`待定`,i=[`**${t}**`,n,`停留 ${e.duration} 分钟`];e.point?.openCalendar===`unknown`&&i.push(`⚠️ 开放时间待核`),e.point?.ticket===`unknown`&&i.push(`⚠️ 门票待核`),e.point?.note&&i.push(`备注：${e.point.note}`),e.item.notes&&i.push(`我的备注：${e.item.notes}`),r.push(`- `+i.map(g).join(` · `))}),e.note&&r.push(`> 💡 ${e.note}`),r.push(``)}),r.join(`
`)}function re(e,t,{options:n={},tasks:r=[],emergency:i=``}={}){let a=[`# ${e?.title||`行程`} · 离线核验清单`,``];if(a.push(`导出时间：${new Date().toISOString().slice(0,16).replace(`T`,` `)}（离线可用）`,``),b(e,t,{options:n}).forEach(({day:e,dayIndex:t,rows:n,result:r})=>{a.push(`## 第 ${t+1} 天${e.date?`（${e.date}）`:``}`),n.length||a.push(`（空）`),n.forEach(e=>{if(!e.item)return;let t=e.item.plannedStatus===`done`?`[x]`:e.item.plannedStatus===`skipped`?`[-]`:`[ ]`,n=Number.isFinite(e.arrive)?`${s(e.arrive)}–${s(e.end)}`:`—`,r=[];e.calendar===`unknown`&&r.push(`开放时间待核`),e.transitSourceKind===`model-estimate`&&r.push(`交通为估算`),a.push(`- ${t} ${n} ${g(y(e.point,e.item))}${r.length?`（${r.join(`，`)}）`:``}`)}),r?.stats&&a.push(`> 预计停留 ${(r.stats.dwellMinutes/60).toFixed(1)}h · 通行 ${r.stats.transitMinutes}m${r.stats.unknownHours?` · ${r.stats.unknownHours} 处开放时间待核`:``}`),e.note&&a.push(`> 💡 ${e.note}`),a.push(``)}),r.length){a.push(`## 出发前核验任务（按影响排序）`,``);let e={high:`🔴 高`,medium:`🟡 中`,low:`⚪ 低`};r.forEach(t=>a.push(`- [ ] ${e[t.impact]||t.impact} ${g(t.question)}`)),a.push(``)}let o=[e?.notes,i].filter(e=>typeof e==`string`&&e.trim());return o.length&&(a.push(`## 紧急与备注`,``),o.forEach(e=>a.push(e.trim(),``))),a.join(`
`)}var C=document.getElementById(`today-app`),w=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),T=e=>String(e).padStart(2,`0`),E=()=>{let e=new Date;return`${e.getFullYear()}-${T(e.getMonth()+1)}-${T(e.getDate())}`},ie=()=>{let e=new Date;return e.getHours()*60+e.getMinutes()},ae=()=>{let e=new Date;return`${T(e.getHours())}:${T(e.getMinutes())}`},oe=e=>{let t=new Date(e);return`${T(t.getMonth()+1)}-${T(t.getDate())} ${T(t.getHours())}:${T(t.getMinutes())}`},D=e=>{let t=e<0?`−`:``,n=Math.abs(e);return n>=60?`${t}${Math.floor(n/60)}h${n%60?T(n%60):``}`:`${t}${n}m`},se={empty:`今天没有排程条目`,feasible:`✅ 结构可行，证据充分`,conditional:`⚠️ 条件式可排（仍有待核事实或估算段）`,infeasible:`⛔ 存在硬冲突，建议回编辑器调整`},ce={generate:`🛠`,edit:`✏️`,reorder:`🔀`,move:`📦`,resize:`⏱`,trim:`✂️`,repair:`🧰`,replace:`🔁`,complete:`✅`,skip:`⏭`,arrive:`📍`,undo:`↶`,import:`📥`,note:`📝`},O=null,k=``,A=new Map,j=null,M=[],N=null,P=0,F=[],I=[],L=[],R=null;function z(e){let t=document.querySelector(`.td-toast`);t||(t=document.createElement(`div`),t.className=`td-toast`,document.body.appendChild(t)),t.textContent=e,t.classList.add(`show`),clearTimeout(z._t),z._t=setTimeout(()=>t.classList.remove(`show`),2200)}function B(e){return{start:e.startTime,end:e.endTime,transportMode:e.transportMode||`transit`,matrix:j}}function V(){let e=N.days[P];return{day:e,state:l({trip:N,day:e,visits:F,places:A,options:B(e),nowMinutes:ie()})}}function H(e){return e.item&&e.item.refId?A.get(e.item.refId):null}function U(e){return!e||!Number.isFinite(e.lat)?``:`https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=18/${e.lat}/${e.lon}`}var W=e=>H(e)?.name||e.item?.placeNameSnapshot||e.name||`未命名`;function G(e){let t=[];return e.calendar===`unknown`&&e.placeId&&t.push(`<span class="td-flag unknown">开放时间待核</span>`),e.transitSourceKind===`model-estimate`&&e.transitMinutes>0&&t.push(`<span class="td-flag estimate">交通为估算</span>`),e.transitSourceKind===`third-party-route`&&t.push(`<span class="td-flag">第三方路线</span>`),t.join(``)}function K(){if(!N){pe();return}let{day:e,state:t}=V(),{rows:n,current:r,next:i,bufferMinutes:a,progress:s,result:c}=t,l=c.structural,u=l===`infeasible`?`is-bad`:l===`conditional`?`is-warn`:``,d=r||i,f=Number.isFinite(a)?`<span class="td-buffer ${a<10?`tight`:`ok`}">${a<0?`已吃紧 ${D(a)}`:`还可缓冲 ${D(a)}`}</span>`:``;C.innerHTML=`
    ${k?`<div class="td-card td-emergency">⚠️ ${w(k)}</div>`:``}
    <div class="td-toolbar">
      <select id="td-trip">${M.map(e=>`<option value="${w(e.id)}" ${e.id===N.id?`selected`:``}>${w(e.title)}</option>`).join(``)}</select>
      <select id="td-day">${N.days.map((e,t)=>`<option value="${t}" ${t===P?`selected`:``}>第 ${t+1} 天${e.date?` ${e.date}`:``}</option>`).join(``)}</select>
      <a class="td-btn" href="./plan.html">🧭 编辑器</a>
    </div>

    <div class="td-card">
      <div class="td-progress">
        <span>✅ 完成 ${s.done}</span>
        <span>⏭ 跳过 ${s.skipped}</span>
        <span>⏳ 待办 ${s.pending}</span>
        ${f}
      </div>
      <div class="td-verdict ${u}">${w(se[l]||l)}</div>
      ${c.stats&&c.stats.unknownHours?`<div class="td-muted">${c.stats.unknownHours} 处开放时间待核</div>`:``}
    </div>

    ${d?`
    <div class="td-card td-now">
      <div class="td-label">${r?`正在进行`:`下一项`}</div>
      <div class="td-name">${w(W(d))}</div>
      <div class="td-time">${Number.isFinite(d.arrive)?`${o(d.arrive)}–${o(d.end)}`:`时间待定`} · 停留 ${d.duration??`—`} 分钟${d.transitMinutes?` · 路上约 ${d.transitMinutes} 分钟`:``}</div>
      <div>${G(d)}</div>
      <div class="td-actions">
        <button class="td-btn primary" data-act="done" data-id="${w(d.itemId)}">✅ 完成</button>
        ${r?``:`<button class="td-btn" data-act="arrive" data-id="${w(d.itemId)}">📍 到达打卡</button>`}
        <button class="td-btn warn" data-act="skip" data-id="${w(d.itemId)}">⏭ 跳过</button>
        ${U(H(d))?`<a class="td-btn" href="${U(H(d))}" target="_blank" rel="noopener">🧭 导航</a>`:``}
      </div>
    </div>`:`
    <div class="td-card"><h2>🎉 今天全部完成</h2><div class="td-muted">没有待办项了，好好休息。</div></div>`}

    <div class="td-card">
      <h2>📋 今天的时间表</h2>
      ${n.length?n.map(e=>le(e,r)).join(``):`<div class="td-muted">（空）</div>`}
    </div>

    ${e.note?`<div class="td-card td-emergency">💡 ${w(e.note)}</div>`:``}
    ${N.notes?`<div class="td-card td-emergency">🚨 ${w(N.notes)}</div>`:``}

    ${q()}
    ${ue()}
    ${de()}
    ${fe()}
  `,ve()}function le(e,t){let n=e.status===`done`?`is-done`:e.status===`skipped`?`is-skipped`:``,r=t&&t.itemId===e.itemId?`is-current`:``,i=e.unscheduled?`is-unscheduled`:``,a=Number.isFinite(e.arrive)?`${o(e.arrive)}<br>${o(e.end)}`:`待定`,s=e.status===`done`?`✅`:e.status===`skipped`?`⏭`:e.item?.type===`meal`?`🍽`:e.item?.type===`break`?`☕`:`📍`,c=H(e),l=e.status===`pending`&&e.item&&(e.item.type===`visit`||e.item.type===`reservation`||e.item.type===`meal`||e.item.type===`break`);return`
    <div class="td-row ${n} ${r} ${i}">
      <div class="td-time">${a}</div>
      <div class="td-body">
        <div class="td-name">${s} ${w(W(e))}</div>
        <div class="td-sub">${e.transitMinutes?`路上约 ${e.transitMinutes} 分钟 · `:``}停留 ${e.duration??`—`} 分钟 ${G(e)}</div>
      </div>
      <div class="td-row-actions">
        ${l?`<button class="td-btn" data-act="done" data-id="${w(e.itemId)}">✅</button>
        <button class="td-btn" data-act="skip" data-id="${w(e.itemId)}">⏭</button>`:``}
        ${U(c)?`<a class="td-btn" href="${U(c)}" target="_blank" rel="noopener">🧭</a>`:``}
      </div>
    </div>`}function q(){let e=p(N,A,{today:E()});if(!e.length)return``;let t={high:`🔴`,medium:`🟡`,low:`⚪`};return`
    <div class="td-card">
      <h2>🧾 出发前核验（${e.length}）</h2>
      ${e.slice(0,12).map(e=>`<div class="td-task"><span class="td-impact">${t[e.impact]||``}</span>${w(e.question)}</div>`).join(``)}
      ${e.length>12?`<div class="td-muted">…共 ${e.length} 条，完整清单见离线包</div>`:``}
    </div>`}function ue(){return I.length?`
    <div class="td-card">
      <h2>🕘 变更日志（最近 ${Math.min(I.length,20)} 条）</h2>
      ${I.slice(0,20).map(e=>`
        <div class="td-event"><span class="td-event-time">${oe(e.at)}</span>${ce[e.kind]||`•`} ${w(e.summary||e.kind)}</div>`).join(``)}
    </div>`:``}function de(){let e=i(N,{visits:F,legs:L}),t=e.visits.filter(e=>e.status===`visited`),n=e.legs.filter(e=>Number.isFinite(e.errorMinutes));if(!t.length&&!n.length)return``;let r=e=>{let t=Number.isFinite(e.plannedDuration)?e.plannedDuration:null;return`<div class="td-event"><span class="td-event-time">${w(e.actualStart||`—`)}–${w(e.actualEnd||`—`)}</span>✅ ${w(e.name)}${t===null?``:` · 计划停留 ${t} 分钟`}</div>`},a=e=>{for(let t of N.days){let n=(t.items||[]).find(t=>t.id===e);if(n)return n.placeNameSnapshot||n.type||`条目`}return``};return`
    <div class="td-card">
      <h2>📊 实际 vs 计划</h2>
      ${t.length?t.map(r).join(``):`<div class="td-muted">（还没有完成记录）</div>`}
      ${n.length?`<div class="td-muted" style="margin-top:6px">通行偏差</div>${n.map(e=>{let t=e.errorMinutes,n=t>5?`is-bad`:``,r=a(e.toItemId);return`<div class="td-event ${n}"><span class="td-event-time">${t>0?`+`:``}${t} 分钟</span>🧭 ${r?`去「${w(r)}」`:`路上`}实际 ${e.actualMinutes} 分钟（计划 ${e.plannedMinutes??`—`}）${e.mode?` · ${w(e.mode)}`:``}</div>`}).join(``)}`:``}
      <div class="td-muted" style="margin-top:6px">只报告、不改写原始记录；这些偏差将来会用于校准通行估算。</div>
    </div>`}function fe(){return`
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
    </div>`}function pe(){C.innerHTML=`
    ${k?`<div class="td-card td-emergency">⚠️ ${w(k)}</div>`:``}
    <div class="td-card">
      <h2>选择要执行的行程</h2>
      ${M.length?`
        <div class="td-toolbar"><select id="td-trip">${M.map(e=>`<option value="${w(e.id)}">${w(e.title)}（${e.days.length} 天）</option>`).join(``)}</select>
        <button class="td-btn primary" id="td-open">打开</button></div>
        <div class="td-muted">也可以先去 <a href="./plan.html">🧭 行程计划</a> 新建或调整。</div>`:`<div class="td-muted">还没有行程。先去 <a href="./plan.html">🧭 行程计划</a> 生成一份草案。</div>`}
    </div>`;let e=document.getElementById(`td-open`);e&&(e.onclick=()=>{let e=document.getElementById(`td-trip`),t=M.find(t=>t.id===e.value);t&&Y(t.id)})}async function J(){M=await O.listTrips()}async function Y(e){let t=await O.getTrip(e);if(!t){z(`行程不存在`),await J(),N=null,K();return}N=t;let n=u(t,E());P=n?n.dayIndex:0,await X(),K()}async function X(){if(!N){F=[],I=[],L=[];return}[F,I,L]=await Promise.all([O.listVisits({tripId:N.id}),O.listEvents({tripId:N.id}),O.listLegs({tripId:N.id})])}async function Z(){if(!N)return;let e=await O.getTrip(N.id);e&&(N=e),await X(),K()}async function Q(e,t){if(!e.ok)return z(e.error||`操作失败`),!1;let n=await O.applyExecution({trip:e.trip,visit:e.visit||null,event:e.event||null,leg:e.leg||null});return n.ok?(n.trip&&(N=n.trip),await X(),K(),t&&z(t),!0):(n.code===`revision-conflict`?(z(`行程已在别处更新，已刷新`),await Z()):z(`保存失败：`+(n.errors&&n.errors[0]&&n.errors[0].message||`未知错误`)),!1)}async function me(e){let t=V().state.rows.find(t=>t.itemId===e);await Q(ee(N,e,{at:Date.now(),actualEnd:ae(),existingVisits:F}),`已完成「${t?W(t):``}」`)}async function he(e){let t=prompt(`跳过原因（可留空）：`,``);if(t===null)return;let n=V().state.rows.find(t=>t.itemId===e);await Q(a(N,e,{reason:t,at:Date.now(),existingVisits:F}),`已跳过「${n?W(n):``}」`)}async function ge(e){let{day:t,state:n}=V(),r=n.rows.find(t=>t.itemId===e);if(!r)return;let i=Number.isFinite(r.transitMinutes)?r.transitMinutes:null,a=prompt(`到达「${W(r)}」。这段路实际走了几分钟？`,i===null?`15`:String(i));if(a===null)return;let o=Number(a);if(!Number.isFinite(o)||o<0){z(`分钟数无效`);return}let s=f(N,t,r.item,{plannedMinutes:i,mode:r.mode,actualMinutes:o,at:Date.now()});await Q({ok:!0,trip:null,leg:s.leg,event:s.event},`已记录：路上 ${Math.round(o)} 分钟`)}function $(e,t,n=`text/plain;charset=utf-8`){let r=new Blob([t],{type:n}),i=document.createElement(`a`);i.href=URL.createObjectURL(r),i.download=e,i.click(),setTimeout(()=>URL.revokeObjectURL(i.href),5e3)}async function _e(e){if(!N)return;let t=E(),n={options:B(N.days[P]||{})},r=p(N,A,{today:t});if(e===`json`){let e=await O.exportAll();$(`trip-backup-${t}.json`,JSON.stringify(e,null,2),`application/json`)}else e===`gpx`?$(`trip-${t}.gpx`,te(N,A,n),`application/gpx+xml`):e===`kml`?$(`trip-${t}.kml`,ne(N,A,n),`application/vnd.google-earth.kml+xml`):e===`geojson`?$(`trip-${t}.geojson`,JSON.stringify(x(N,A,n),null,2),`application/geo+json`):e===`checklist`?$(`checklist-${t}.md`,re(N,A,{...n,tasks:r}),`text/markdown;charset=utf-8`):e===`digest`&&$(`digest-${t}.md`,S(N,A,n),`text/markdown;charset=utf-8`);z(`已导出`)}function ve(){let e=document.getElementById(`td-trip`);e&&(e.onchange=()=>Y(e.value));let t=document.getElementById(`td-day`);t&&(t.onchange=()=>{P=Number(t.value)||0,K()}),C.querySelectorAll(`[data-act]`).forEach(e=>{e.onclick=()=>{let t=e.getAttribute(`data-id`),n=e.getAttribute(`data-act`);n===`done`?me(t):n===`skip`?he(t):n===`arrive`&&ge(t)}}),C.querySelectorAll(`[data-dl]`).forEach(e=>{e.onclick=()=>_e(e.getAttribute(`data-dl`))})}async function ye(){if(await J(),!M.length){N=null,K();return}let e=E();await Y((M.find(e=>e.status===`active`)||M.find(t=>t.startDate&&t.endDate&&t.startDate<=e&&e<=t.endDate)||M[0]).id)}(async()=>{let[i,a]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/transit-matrix.json`).then(e=>e.ok?e.json():null).catch(()=>null)]),o=Array.isArray(i)?i:i.points||[];A=new Map(o.map(e=>[e.id,e])),j=m(a);try{O=await n({driver:r()}),await O.getMeta(`__probe`)}catch{O=await n({driver:t()}),k=`IndexedDB 不可用，本次会话的改动不会被保存`}O.subscribe(e=>{e.origin!==O.clientId&&(e.area===`trips`||e.area===`visits`||e.area===`events`||e.area===`legs`||e.area===`execution`||e.area===`import`)&&Z()}),e(),await ye(),R=setInterval(()=>{N&&K()},3e4)})().catch(e=>{C.innerHTML=`<div class="td-card">⚠️ 加载失败：${w(e.message)}</div>`}),window.addEventListener(`beforeunload`,()=>{R&&clearInterval(R)});