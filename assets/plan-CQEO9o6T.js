import"./base-BJw1lW7I.js";/* empty css             */var e={morning:3,afternoon:3,evening:2},t={建筑:/建筑|构成主义|斯大林|现代主义|粗野|先锋派|新艺术|折衷|古典主义|摩天|工业遗产/,美食:/餐厅|咖啡|食堂|小吃|甜品|酒吧|美食|饮品|冰淇淋|下午茶|大排档|自助|火锅/,博物馆:/博物馆|美术馆|展览|画廊/,自然:/海湾|公园|湖泊|雨林|峡谷|海岛|沙滩|森林|冰川|温泉|湿地|草原/,摄影:/拍照|摄影|观景|登顶|全景|机位|出片|扫街/,地铁:/地铁站|火车站|交通|口岸|机场/,文学:/文学|故居|书店|诗人|作家|纪念雕像/,购物:/商场|市场|免税|巴扎|市集|步行街/},n=/餐厅|咖啡|甜品|酒吧|下午茶|大排档|自助|火锅|食堂|小吃|粥铺/;function r(e){let t=Number.parseInt(e,10);return Number.isFinite(t)?Math.max(1,Math.min(7,t)):3}function i(e){let n=`${e.type} ${e.cluster} ${e.highlight||``} ${(e.tags||[]).join(` `)}`;return Object.keys(t).filter(e=>t[e].test(n))}function a(e,t=8){let n=new Set,r=[];for(let i of e)if(i&&typeof i==`object`&&i.id&&!n.has(i.id)&&(n.add(i.id),r.push(i),r.length>=t))break;return r}function o(t){let r=a(t),i=r.filter(e=>n.test(e.type||``)),o=r.filter(e=>!n.test(e.type||``)),s={morning:[],afternoon:[],evening:[]},c=(t,n)=>s[t].length<e[t]&&(s[t].push(n),!0);for(let e of o)!c(`morning`,e)&&!c(`afternoon`,e)&&c(`evening`,e);for(let e of i)!c(`evening`,e)&&!c(`afternoon`,e)&&c(`morning`,e);return{slots:{morning:s.morning.map(e=>e.name),afternoon:s.afternoon.map(e=>e.name),evening:s.evening.map(e=>e.name)},usedIds:[...s.morning,...s.afternoon,...s.evening].map(e=>e.id)}}function s(e,t,n){return{day:e,slots:t,tip:n}}function c(e,t){let n=r(e.days),a=Array.isArray(e.interests)?e.interests:[],c=(t.pts||[]).filter(t=>!t.pending&&t.city===e.city),l=c;if(a.length){let e=c.filter(e=>i(e).some(e=>a.includes(e)));e.length>=4&&(l=e)}let u=new Map((t.pts||[]).map(e=>[e.name,e])),d=(t.rts||[]).filter(t=>t.city===e.city),f=new Set,p=[];for(let e of d){if(p.length>=n)break;let t=o((e.steps||[]).map(e=>u.get(e.point)).filter(e=>e&&!f.has(e.id)));t.usedIds.length&&(t.usedIds.forEach(e=>f.add(e)),p.push(s(p.length+1,t.slots,`参考动线：${e.name} · ${e.tip||e.summary||``}`)))}let m=new Map;for(let e of l)f.has(e.id)||(m.has(e.cluster)||m.set(e.cluster,[]),m.get(e.cluster).push(e));let h=[...m.values()].sort((e,t)=>t.length-e.length).flat(),g=0;for(;p.length<n&&g<h.length;){let e=[],t=new Set;for(;e.length<8&&g<h.length;){let n=h[g++];!n||f.has(n.id)||t.has(n.id)||(t.add(n.id),e.push(n))}if(!e.length)continue;let n=o(e);n.usedIds.forEach(e=>f.add(e)),p.push(s(p.length+1,n.slots,``))}let _=p.length<n?`可用点位不足，已生成 ${p.length} 天；建议减少天数、补充点位或搭配周边城市`:``;return{id:`p`+Date.now().toString(36),name:`${e.city}${p.length}日游草案`,city:e.city,date:e.date||``,daysN:p.length,source:`rule`,createdAt:Date.now(),interests:a,days:p,..._?{note:_}:{}}}var l=`travel-plans-v1`,u=[`morning`,`afternoon`,`evening`];function d(e){return Array.isArray(e)?e.filter(e=>typeof e==`string`&&e):[]}function f(e){if(!e||typeof e!=`object`||typeof e.id!=`string`||!e.id||!Array.isArray(e.days))return null;let t=e.days.filter(e=>e&&typeof e==`object`&&e.slots&&typeof e.slots==`object`).map((e,t)=>({day:Number.isFinite(e.day)?e.day:t+1,slots:Object.fromEntries(u.map(t=>[t,d(e.slots[t])])),tip:typeof e.tip==`string`?e.tip:``}));return t.length?{...e,schemaVersion:Number.isFinite(e.schemaVersion)?e.schemaVersion:1,source:e.source===`ai`?`ai`:`rule`,days:t}:null}function p(e,t=Date.now()){let n=e.getItem(l);if(!n)return{plans:[],recovered:!1,backupKey:null,error:``};let r;try{let e=JSON.parse(n);if(r=Array.isArray(e)?e:e&&Array.isArray(e.plans)?e.plans:null,!r)throw Error(`数据结构不是计划数组`)}catch(r){let i=`${l}.bak-${t}`;try{e.setItem(i,n)}catch{}try{e.removeItem(l)}catch{}return{plans:[],recovered:!0,backupKey:i,error:r.message}}return{plans:r.map(f).filter(Boolean),recovered:!1,backupKey:null,error:``}}function m(e,t){let n={schemaVersion:1,updatedAt:Date.now(),plans:t};return e.setItem(l,JSON.stringify(n)),n}var h=document.getElementById(`plan-app`),g=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),_=`planner-ai-config`,v={cities:[],cityColors:{}},y=p(localStorage),b=y.plans,x={mode:`list`,planId:null,form:null,showAI:!1,aiError:``},S={pts:null,rts:null};function C(){try{return m(localStorage,b),y.recovered=!1,!0}catch(e){return N(`本地存储写入失败：`+e.message+`（可先导出 Markdown）`),!1}}var w=()=>localStorage.getItem(`friend-token`)||localStorage.getItem(`admin-token`)||``,T={},E=null,D=localStorage.getItem(`planner-ai-model`)||``,O=!1;try{let e=JSON.parse(localStorage.getItem(_)||`null`);e&&(e.endpoint||e.key||e.model)&&(T=e,localStorage.removeItem(_),setTimeout(()=>N(`旧版 AI 配置已改为本次会话有效；长期接入请在朋友页「我的 AI 接入」保存`),800))}catch{}async function k(){if(!w()){E=null;return}try{let e=await fetch(`./api/index.php?a=ai_policy`,{headers:{Authorization:`Bearer ${w()}`}}),t=await e.json().catch(()=>({}));E=e.ok&&!t.error?t:null,E&&Array.isArray(E.models)&&E.models.length&&!E.models.includes(D)&&(D=E.models[0])}catch{E=null}}var A={get ready(){return!!w()||!!T.endpoint},async generate(e,t){let n=T.endpoint||`./api/index.php?a=plan`,r=T.key||w(),i={params:e,context:t},a=T.model||D;a&&(i.model=a);let o=await fetch(n,{method:`POST`,headers:{"Content-Type":`application/json`,...r?{Authorization:`Bearer ${r}`}:{}},body:JSON.stringify(i)}),s=await o.json().catch(()=>({}));if(!o.ok)throw Error(s.error||`AI 接口 `+o.status);let c=s.plan||s;if(!c||!Array.isArray(c.days))throw Error(`AI 返回格式不符`);return typeof s.remaining==`number`&&E&&(E.remaining_today=s.remaining),{...c,id:`p`+Date.now().toString(36),city:e.city,date:e.date,source:`ai`,channel:T.endpoint?`custom`:`site`,model:s.model||a||``,createdAt:Date.now()}}};function j(e){return e.source===`ai`?`AI（${e.channel===`custom`?`自定义接口`:`站内通道`}${e.model?` · `+e.model:``}）`:`规则引擎（离线）`}function M(){return T.endpoint?`✨ AI 生成（自定义接口）`:w()?E&&!E.has_custom&&!E.site_enabled?`✨ AI 生成（站内通道停用）`:`✨ AI 生成`:`✨ AI 生成（需登录）`}function N(e){let t=document.createElement(`div`);t.className=`plan-toast`,t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add(`show`),20),setTimeout(()=>{t.classList.remove(`show`),setTimeout(()=>t.remove(),400)},3200)}function P(){return x.mode===`list`?F():x.mode===`create`?I():R()}function F(){h.innerHTML=`
    <div class="pl-head">
      <h2>🧭 我的计划</h2>
      <button class="pl-btn primary" id="pl-new">＋ 新建计划</button>
    </div>
    ${y.recovered?`<div class="pl-tip">⚠️ 检测到损坏的本地计划，已备份为 ${g(y.backupKey)} 并重建空列表</div>`:``}
    ${b.length?b.map(e=>`
      <div class="pl-card" data-open="${e.id}">
        <div class="pl-card-top">
          <span class="pl-name">${g(e.name)}</span>
          <span class="pl-src ${e.source}">${e.source===`ai`?`AI`:`规则`}</span>
        </div>
        <div class="pl-meta">${g(e.city)} · ${g(e.date||`日期待定`)} · ${e.days.length} 天 · ${e.days.reduce((e,t)=>e+t.slots.morning.length+t.slots.afternoon.length+t.slots.evening.length,0)} 个点位</div>
        <div class="pl-ops">
          <button class="pl-btn small" data-export="${e.id}">导出 Markdown</button>
          <button class="pl-btn small danger" data-del="${e.id}">删除</button>
        </div>
      </div>`).join(``):`<div class="pl-empty">还没有计划<br><span>点右上角"新建计划"生成第一份行程草案</span></div>`}
    <div class="pl-foot">规则引擎离线可用 · AI 生成需登录账号（朋友页 / 管理页）</div>`,document.getElementById(`pl-new`).onclick=()=>{x.mode=`create`,x.aiError=``,x.showAI=!1,x.form={city:v.cities[0]||``,date:``,days:3,interests:[]},P()}}function I(){let e=x.form;h.innerHTML=`
    <div class="pl-head"><h2>新建计划</h2><button class="pl-btn" id="pl-back">← 返回</button></div>
    <div class="pl-form card">
      <label>目的地
        <select id="pl-city">${[...v.cities].sort().map(t=>`<option ${t===e.city?`selected`:``}>${g(t)}</option>`).join(``)}</select>
      </label>
      <label>出发日期 <input id="pl-date" type="date" value="${g(e.date)}"></label>
      <label>天数 <input id="pl-days" type="number" min="1" max="7" value="${e.days}"></label>
      <div class="pl-label">兴趣标签（可多选，不选=全城点位）</div>
      <div class="pl-chips">${Object.keys(t).map(t=>`<button class="chip ${e.interests.includes(t)?`on`:``}" data-int="${t}">${t}</button>`).join(``)}</div>
      <div class="pl-gen">
        <button class="pl-btn primary big" id="pl-gen-rule">⚙️ 规则引擎生成（离线）</button>
        <button class="pl-btn big" id="pl-gen-ai">${M()}</button>
      </div>
      ${x.aiError?`
      <div class="pl-ai-error">
        <div>AI 生成失败：${g(x.aiError)}</div>
        <div class="pl-ai-error-ops">
          <button class="pl-btn small primary" id="ai-retry">重试 AI</button>
          <button class="pl-btn small" id="ai-fallback">使用离线规则</button>
          <button class="pl-btn small" id="ai-cancel">取消</button>
        </div>
      </div>`:``}
      ${E?`<div class="pl-label">${E.has_custom?`已接入你自己的 AI（不占用本站次数）`:`今日剩余 ${E.remaining_today}/${E.quota} 次`}</div>`:``}
      ${E&&!E.has_custom&&E.models&&E.models.length?`
      <label>AI 模型
        <select id="pl-model">${E.models.map(e=>`<option ${e===D?`selected`:``}>${g(e)}</option>`).join(``)}</select>
      </label>`:``}
      <button class="pl-ai-toggle" id="pl-ai-cfg">高级：自定义接口${T.endpoint?`（本次会话已启用 ✓）`:``}</button>
      ${x.showAI?`
      <div class="pl-ai-box">
        <label>Endpoint（https）<input id="ai-endpoint" placeholder="https://api.example.com/v1/chat/completions" value="${g(T.endpoint||``)}"></label>
        <label>API Key（可选）<input id="ai-key" type="password" placeholder="sk-..." value="${g(T.key||``)}"></label>
        <label>模型名（可选）<input id="ai-model" placeholder="deepseek-v4-pro ..." value="${g(T.model||``)}"></label>
        <div class="pl-ai-note">仅本次会话有效，密钥不再存入浏览器。长期接入请到 <a href="./friend.html">朋友页</a> 登录后在「我的 AI 接入」保存（随账号存放于服务器）。</div>
        <button class="pl-btn small" id="ai-save">本次会话生效</button>
        <button class="pl-btn small" id="ai-clear">清除覆盖</button>
      </div>`:``}
    </div>`,document.getElementById(`pl-back`).onclick=()=>{x.mode=`list`,P()},document.getElementById(`pl-city`).onchange=t=>e.city=t.target.value,document.getElementById(`pl-date`).onchange=t=>e.date=t.target.value,document.getElementById(`pl-days`).onchange=t=>{e.days=r(t.target.value),t.target.value=e.days};let n=document.getElementById(`pl-model`);n&&(n.onchange=e=>{D=e.target.value,localStorage.setItem(`planner-ai-model`,D)}),h.querySelectorAll(`[data-int]`).forEach(t=>t.onclick=()=>{let n=t.dataset.int;e.interests=e.interests.includes(n)?e.interests.filter(e=>e!==n):[...e.interests,n],P()}),document.getElementById(`pl-ai-cfg`).onclick=()=>{x.showAI=!x.showAI,P()};let i=document.getElementById(`ai-save`);i&&(i.onclick=()=>{T={endpoint:document.getElementById(`ai-endpoint`).value.trim(),key:document.getElementById(`ai-key`).value.trim(),model:document.getElementById(`ai-model`).value.trim()},N(T.endpoint?`自定义接口已启用（本次会话）`:`已保存`),P()});let a=document.getElementById(`ai-clear`);a&&(a.onclick=()=>{T={},N(`已清除自定义覆盖`),P()}),document.getElementById(`pl-gen-rule`).onclick=()=>L(`rule`),document.getElementById(`pl-gen-ai`).onclick=()=>L(`ai`);let o=document.getElementById(`ai-retry`);o&&(o.onclick=()=>{x.aiError=``,P(),L(`ai`)});let s=document.getElementById(`ai-fallback`);s&&(s.onclick=()=>{x.aiError=``,P(),L(`rule`)});let c=document.getElementById(`ai-cancel`);c&&(c.onclick=()=>{x.aiError=``,P()})}async function L(e){let t=x.form;if(!t.city)return N(`请选择目的地`);if(O)return;if(e===`ai`&&!A.ready){x.aiError=`未登录或未配置 AI 接口`,P();return}O=!0;let n=document.getElementById(`pl-gen-ai`);n&&e===`ai`&&(n.disabled=!0,n.textContent=`✨ 生成中（约 30-60 秒）…`),N(`生成中…`);try{let n=e===`ai`?await A.generate(t,{points:S.pts.filter(e=>e.city===t.city),routes:S.rts.filter(e=>e.city===t.city)}):c(t,{pts:S.pts,rts:S.rts});if(b.unshift(n),!C()){b=b.filter(e=>e.id!==n.id),O=!1,P();return}x.mode=`detail`,x.planId=n.id,x.aiError=``,O=!1,P(),N(`计划已生成（${j(n)}）`),n.note&&setTimeout(()=>N(n.note),600)}catch(e){O=!1,x.aiError=e.message,P()}}function R(){let e=b.find(e=>e.id===x.planId);if(!e)return x.mode=`list`,P();let t=new Map(S.pts.map(e=>[e.name,e])),n=v.cityColors[e.city]||`#B71C1C`,r={morning:`🌅 上午`,afternoon:`☀️ 下午`,evening:`🌙 晚上`};h.innerHTML=`
    <div class="pl-head">
      <h2>${g(e.name)}</h2>
      <button class="pl-btn" id="pl-back">← 返回</button>
    </div>
    <div class="pl-meta" style="margin:0 0 12px">${g(e.city)} · ${g(e.date||`日期待定`)} · ${e.days.length} 天 · 来源：${g(j(e))}</div>
    ${e.note?`<div class="pl-tip" style="margin-bottom:12px">⚠️ ${g(e.note)}</div>`:``}
    ${e.days.map(e=>`
      <div class="pl-day card" style="border-left:4px solid ${n}">
        <div class="pl-day-head">Day ${e.day} <span>${e.slots.morning.length+e.slots.afternoon.length+e.slots.evening.length} 个点位</span></div>
        ${Object.keys(r).map(n=>e.slots[n].length?`
          <div class="pl-slot">
            <div class="pl-slot-name">${r[n]}</div>
            ${e.slots[n].map(e=>{let n=t.get(e);return`<div class="pl-point"><span class="pl-dot" style="background:${n?v.cityColors[n.city]||`#546E7A`:`#999`}"></span>${g(e)}<span class="pl-ptype">${n?g(n.type):``}</span></div>`}).join(``)}
          </div>`:``).join(``)}
        ${e.tip?`<div class="pl-tip">💡 ${g(e.tip)}`:``}
      </div>`).join(``)}
    <div class="pl-ops" style="margin-top:14px">
      <button class="pl-btn primary" id="pl-exp">导出 Markdown</button>
      <button class="pl-btn danger" id="pl-del">删除计划</button>
    </div>`,document.getElementById(`pl-back`).onclick=()=>{x.mode=`list`,P()},document.getElementById(`pl-exp`).onclick=()=>z(e),document.getElementById(`pl-del`).onclick=()=>{b=b.filter(t=>t.id!==e.id),C(),x.mode=`list`,P(),N(`已删除`)}}function z(e){let t=new Map(S.pts.map(e=>[e.name,e])),n=[`# ${e.name}`,``,`> ${e.city} · ${e.date||`日期待定`} · 来源：${j(e)}`,``,...e.days.flatMap(e=>[`## Day ${e.day}`,``,...Object.entries(e.slots).flatMap(([e,n])=>n.length?[`### ${{morning:`上午`,afternoon:`下午`,evening:`晚上`}[e]}`,``,...n.map(e=>{let n=t.get(e);return`- **${e}**${n?`（${n.type}）`:``}`}),``]:[]),...e.tip?[`> 💡 ${e.tip}`,``]:[]])].join(`
`),r=document.createElement(`a`);r.href=URL.createObjectURL(new Blob([n],{type:`text/markdown`})),r.download=`${e.name}.md`,r.click(),N(`已导出 Markdown`)}h.addEventListener(`click`,e=>{let t=e.target.closest(`[data-open]`);if(t&&!e.target.closest(`[data-del],[data-export]`)){x.mode=`detail`,x.planId=t.dataset.open,P();return}let n=e.target.closest(`[data-del]`);if(n){b=b.filter(e=>e.id!==n.dataset.del),C(),P(),N(`已删除`);return}let r=e.target.closest(`[data-export]`);if(r){let e=b.find(e=>e.id===r.dataset.export);e&&z(e)}}),(async()=>{let[e,t,n]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/routes.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),k()]);S.pts=e,S.rts=t,v=n,P()})().catch(e=>{h.innerHTML=`<div class="pl-empty">⚠️ 加载失败：${g(e.message)}</div>`});