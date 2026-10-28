import"./base-BJw1lW7I.js";/* empty css             */var e=document.getElementById(`plan-app`),t=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),n=`travel-plans-v1`,r=`planner-ai-config`,i={cities:[],cityColors:{}},a=JSON.parse(localStorage.getItem(n)||`[]`),o={mode:`list`,planId:null,form:null,showAI:!1},s={pts:null,rts:null},c={建筑:/建筑|构成主义|斯大林|现代主义|粗野|先锋派|新艺术|折衷|古典主义|摩天|工业遗产/,美食:/餐厅|咖啡|食堂|小吃|甜品|酒吧|美食|饮品|冰淇淋|下午茶|大排档|自助|火锅/,博物馆:/博物馆|美术馆|展览|画廊/,自然:/海湾|公园|湖泊|雨林|峡谷|海岛|沙滩|森林|冰川|温泉|湿地|草原/,摄影:/拍照|摄影|观景|登顶|全景|机位|出片|扫街/,地铁:/地铁站|火车站|交通|口岸|机场/,文学:/文学|故居|书店|诗人|作家|纪念雕像/,购物:/商场|市场|免税|巴扎|市集|步行街/};function l(e){let t=`${e.type} ${e.cluster} ${e.highlight||``} ${(e.tags||[]).join(` `)}`;return Object.keys(c).filter(e=>c[e].test(t))}function u(e){let t=s.pts.filter(t=>!t.pending&&t.city===e.city),n=t;if(e.interests.length){let r=t.filter(t=>l(t).some(t=>e.interests.includes(t)));r.length>=4&&(n=r)}let r=s.rts.filter(t=>t.city===e.city),i=new Map(s.pts.map(e=>[e.name,e])),a=new Set,o=[],c=e=>e.filter(e=>!a.has(e.id));for(let t of r.slice(0,e.days)){let e=t.steps.map(e=>e.point).filter(Boolean).map(e=>i.get(e)).filter(Boolean);e.forEach(e=>a.add(e.id)),o.push(f(o.length+1,d(e),`参考动线：${t.name} · ${t.tip||t.summary||``}`))}let u=c(n),p=new Map;for(let e of u){let t=e.cluster;p.has(t)||p.set(t,[]),p.get(t).push(e)}let m=[...p.values()].sort((e,t)=>t.length-e.length),h=0;for(;o.length<e.days&&h<m.length;){let e=[];for(;e.length<6&&h<m.length;)e.push(...m[h++]);e.forEach(e=>a.add(e.id)),o.push(f(o.length+1,d(e),``))}for(;o.length<e.days&&u.length;){let e=m[o.length*7%m.length]||u;o.push(f(o.length+1,d(e.slice(0,6)),`该城市点位有限，建议放慢节奏或搭配周边城市`))}return{id:`p`+Date.now().toString(36),name:`${e.city}${e.days}日游草案`,city:e.city,date:e.date,daysN:o.length,source:`rule`,createdAt:Date.now(),interests:e.interests,days:o}}function d(e){let t={morning:[],afternoon:[],evening:[]},n=e.filter(e=>/餐厅|咖啡|甜品|酒吧|下午茶|大排档|自助|火锅|食堂|小吃|粥铺/.test(e.type)),r=e.filter(e=>!n.includes(e));t.morning=r.filter((e,t)=>t%2==0).slice(0,3).map(e=>e.name),t.afternoon=r.filter((e,t)=>t%2==1).slice(0,3).map(e=>e.name),t.evening=n.slice(0,2).map(e=>e.name);let i=r.filter(e=>![...t.morning,...t.afternoon].includes(e.name));return t.afternoon.push(...i.map(e=>e.name)),t}function f(e,t,n){return{day:e,slots:t,tip:n}}var p=()=>localStorage.getItem(`friend-token`)||localStorage.getItem(`admin-token`)||``,m={},h=null,g=localStorage.getItem(`planner-ai-model`)||``,_=!1;try{let e=JSON.parse(localStorage.getItem(r)||`null`);e&&(e.endpoint||e.key||e.model)&&(m=e,localStorage.removeItem(r),setTimeout(()=>x(`旧版 AI 配置已改为本次会话有效；长期接入请在朋友页「我的 AI 接入」保存`),800))}catch{}async function v(){if(!p()){h=null;return}try{let e=await fetch(`./api/index.php?a=ai_policy`,{headers:{Authorization:`Bearer ${p()}`}}),t=await e.json().catch(()=>({}));h=e.ok&&!t.error?t:null,h&&Array.isArray(h.models)&&h.models.length&&!h.models.includes(g)&&(g=h.models[0])}catch{h=null}}var y={get ready(){return!!p()||!!m.endpoint},async generate(e,t){let n=m.endpoint||`./api/index.php?a=plan`,r=m.key||p(),i={params:e,context:t},a=m.model||g;a&&(i.model=a);let o=await fetch(n,{method:`POST`,headers:{"Content-Type":`application/json`,...r?{Authorization:`Bearer ${r}`}:{}},body:JSON.stringify(i)}),s=await o.json().catch(()=>({}));if(!o.ok)throw Error(s.error||`AI 接口 `+o.status);let c=s.plan||s;if(!c||!Array.isArray(c.days))throw Error(`AI 返回格式不符`);return typeof s.remaining==`number`&&h&&(h.remaining_today=s.remaining),{...c,id:`p`+Date.now().toString(36),city:e.city,date:e.date,source:`ai`,createdAt:Date.now()}}};function b(){return m.endpoint?`✨ AI 生成（自定义接口）`:p()?h&&!h.has_custom&&!h.site_enabled?`✨ AI 生成（站内通道停用）`:`✨ AI 生成`:`✨ AI 生成（需登录）`}function x(e){let t=document.createElement(`div`);t.className=`plan-toast`,t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add(`show`),20),setTimeout(()=>{t.classList.remove(`show`),setTimeout(()=>t.remove(),400)},3200)}function S(){return o.mode===`list`?C():o.mode===`create`?w():E()}function C(){e.innerHTML=`
    <div class="pl-head">
      <h2>🧭 我的计划</h2>
      <button class="pl-btn primary" id="pl-new">＋ 新建计划</button>
    </div>
    ${a.length?a.map(e=>`
      <div class="pl-card" data-open="${e.id}">
        <div class="pl-card-top">
          <span class="pl-name">${t(e.name)}</span>
          <span class="pl-src ${e.source}">${e.source===`ai`?`AI`:`规则`}</span>
        </div>
        <div class="pl-meta">${t(e.city)} · ${t(e.date||`日期待定`)} · ${e.days.length} 天 · ${e.days.reduce((e,t)=>e+t.slots.morning.length+t.slots.afternoon.length+t.slots.evening.length,0)} 个点位</div>
        <div class="pl-ops">
          <button class="pl-btn small" data-export="${e.id}">导出 Markdown</button>
          <button class="pl-btn small danger" data-del="${e.id}">删除</button>
        </div>
      </div>`).join(``):`<div class="pl-empty">还没有计划<br><span>点右上角"新建计划"生成第一份行程草案</span></div>`}
    <div class="pl-foot">规则引擎离线可用 · AI 生成需登录账号（朋友页 / 管理页）</div>`,document.getElementById(`pl-new`).onclick=()=>{o.mode=`create`,o.form={city:i.cities[0]||``,date:``,days:3,interests:[]},S()}}function w(){let n=o.form;e.innerHTML=`
    <div class="pl-head"><h2>新建计划</h2><button class="pl-btn" id="pl-back">← 返回</button></div>
    <div class="pl-form card">
      <label>目的地
        <select id="pl-city">${[...i.cities].sort().map(e=>`<option ${e===n.city?`selected`:``}>${t(e)}</option>`).join(``)}</select>
      </label>
      <label>出发日期 <input id="pl-date" type="date" value="${t(n.date)}"></label>
      <label>天数 <input id="pl-days" type="number" min="1" max="14" value="${n.days}"></label>
      <div class="pl-label">兴趣标签（可多选，不选=全城点位）</div>
      <div class="pl-chips">${Object.keys(c).map(e=>`<button class="chip ${n.interests.includes(e)?`on`:``}" data-int="${e}">${e}</button>`).join(``)}</div>
      <div class="pl-gen">
        <button class="pl-btn primary big" id="pl-gen-rule">⚙️ 规则引擎生成（离线）</button>
        <button class="pl-btn big" id="pl-gen-ai">${b()}</button>
      </div>
      ${h?`<div class="pl-label">${h.has_custom?`已接入你自己的 AI（不占用本站次数）`:`今日剩余 ${h.remaining_today}/${h.quota} 次`}</div>`:``}
      ${h&&!h.has_custom&&h.models&&h.models.length?`
      <label>AI 模型
        <select id="pl-model">${h.models.map(e=>`<option ${e===g?`selected`:``}>${t(e)}</option>`).join(``)}</select>
      </label>`:``}
      <button class="pl-ai-toggle" id="pl-ai-cfg">高级：自定义接口${m.endpoint?`（本次会话已启用 ✓）`:``}</button>
      ${o.showAI?`
      <div class="pl-ai-box">
        <label>Endpoint（https）<input id="ai-endpoint" placeholder="https://api.example.com/v1/chat/completions" value="${t(m.endpoint||``)}"></label>
        <label>API Key（可选）<input id="ai-key" type="password" placeholder="sk-..." value="${t(m.key||``)}"></label>
        <label>模型名（可选）<input id="ai-model" placeholder="deepseek-v4-pro ..." value="${t(m.model||``)}"></label>
        <div class="pl-ai-note">仅本次会话有效，密钥不再存入浏览器。长期接入请到 <a href="./friend.html">朋友页</a> 登录后在「我的 AI 接入」保存（随账号存放于服务器）。</div>
        <button class="pl-btn small" id="ai-save">本次会话生效</button>
        <button class="pl-btn small" id="ai-clear">清除覆盖</button>
      </div>`:``}
    </div>`,document.getElementById(`pl-back`).onclick=()=>{o.mode=`list`,S()},document.getElementById(`pl-city`).onchange=e=>n.city=e.target.value,document.getElementById(`pl-date`).onchange=e=>n.date=e.target.value,document.getElementById(`pl-days`).onchange=e=>n.days=Math.max(1,Math.min(14,+e.target.value||3));let r=document.getElementById(`pl-model`);r&&(r.onchange=e=>{g=e.target.value,localStorage.setItem(`planner-ai-model`,g)}),e.querySelectorAll(`[data-int]`).forEach(e=>e.onclick=()=>{let t=e.dataset.int;n.interests=n.interests.includes(t)?n.interests.filter(e=>e!==t):[...n.interests,t],S()}),document.getElementById(`pl-ai-cfg`).onclick=()=>{o.showAI=!o.showAI,S()};let a=document.getElementById(`ai-save`);a&&(a.onclick=()=>{m={endpoint:document.getElementById(`ai-endpoint`).value.trim(),key:document.getElementById(`ai-key`).value.trim(),model:document.getElementById(`ai-model`).value.trim()},x(m.endpoint?`自定义接口已启用（本次会话）`:`已保存`),S()});let s=document.getElementById(`ai-clear`);s&&(s.onclick=()=>{m={},x(`已清除自定义覆盖`),S()}),document.getElementById(`pl-gen-rule`).onclick=()=>T(`rule`),document.getElementById(`pl-gen-ai`).onclick=()=>T(`ai`)}async function T(e){let t=o.form;if(!t.city)return x(`请选择目的地`);if(_)return;e===`ai`&&!y.ready&&(x(`未登录，已用规则引擎离线生成（登录后可用 AI）`),e=`rule`),_=!0;let r=document.getElementById(`pl-gen-ai`);r&&e===`ai`&&(r.disabled=!0,r.textContent=`✨ 生成中（约 30-60 秒）…`),x(`生成中…`);try{let r=e===`ai`?await y.generate(t,{points:s.pts.filter(e=>e.city===t.city),routes:s.rts.filter(e=>e.city===t.city)}):u(t);a.unshift(r),localStorage.setItem(n,JSON.stringify(a)),o.mode=`detail`,o.planId=r.id,_=!1,S(),x(`计划已生成 ✓`),r.note&&setTimeout(()=>x(r.note),600)}catch(e){_=!1,x(`AI 生成失败：`+e.message+`，已回退规则引擎`);let r=u(t);a.unshift(r),localStorage.setItem(n,JSON.stringify(a)),o.mode=`detail`,o.planId=r.id,S()}}function E(){let r=a.find(e=>e.id===o.planId);if(!r)return o.mode=`list`,S();let c=new Map(s.pts.map(e=>[e.name,e])),l=i.cityColors[r.city]||`#B71C1C`,u={morning:`🌅 上午`,afternoon:`☀️ 下午`,evening:`🌙 晚上`};e.innerHTML=`
    <div class="pl-head">
      <h2>${t(r.name)}</h2>
      <button class="pl-btn" id="pl-back">← 返回</button>
    </div>
    <div class="pl-meta" style="margin:0 0 12px">${t(r.city)} · ${t(r.date||`日期待定`)} · ${r.days.length} 天 · 来源：${r.source===`ai`?`AI`:`规则引擎`}</div>
    ${r.note?`<div class="pl-tip" style="margin-bottom:12px">⚠️ ${t(r.note)}</div>`:``}
    ${r.days.map(e=>`
      <div class="pl-day card" style="border-left:4px solid ${l}">
        <div class="pl-day-head">Day ${e.day} <span>${e.slots.morning.length+e.slots.afternoon.length+e.slots.evening.length} 个点位</span></div>
        ${Object.keys(u).map(n=>e.slots[n].length?`
          <div class="pl-slot">
            <div class="pl-slot-name">${u[n]}</div>
            ${e.slots[n].map(e=>{let n=c.get(e);return`<div class="pl-point"><span class="pl-dot" style="background:${n?i.cityColors[n.city]||`#546E7A`:`#999`}"></span>${t(e)}<span class="pl-ptype">${n?t(n.type):``}</span></div>`}).join(``)}
          </div>`:``).join(``)}
        ${e.tip?`<div class="pl-tip">💡 ${t(e.tip)}`:``}
      </div>`).join(``)}
    <div class="pl-ops" style="margin-top:14px">
      <button class="pl-btn primary" id="pl-exp">导出 Markdown</button>
      <button class="pl-btn danger" id="pl-del">删除计划</button>
    </div>`,document.getElementById(`pl-back`).onclick=()=>{o.mode=`list`,S()},document.getElementById(`pl-exp`).onclick=()=>D(r),document.getElementById(`pl-del`).onclick=()=>{a=a.filter(e=>e.id!==r.id),localStorage.setItem(n,JSON.stringify(a)),o.mode=`list`,S(),x(`已删除`)}}function D(e){let t=new Map(s.pts.map(e=>[e.name,e])),n=[`# ${e.name}`,``,`> ${e.city} · ${e.date||`日期待定`} · 来源：${e.source===`ai`?`AI`:`规则引擎`}`,``,...e.days.flatMap(e=>[`## Day ${e.day}`,``,...Object.entries(e.slots).flatMap(([e,n])=>n.length?[`### ${{morning:`上午`,afternoon:`下午`,evening:`晚上`}[e]}`,``,...n.map(e=>{let n=t.get(e);return`- **${e}**${n?`（${n.type}）`:``}`}),``]:[]),...e.tip?[`> 💡 ${e.tip}`,``]:[]])].join(`
`),r=document.createElement(`a`);r.href=URL.createObjectURL(new Blob([n],{type:`text/markdown`})),r.download=`${e.name}.md`,r.click(),x(`已导出 Markdown`)}e.addEventListener(`click`,e=>{let t=e.target.closest(`[data-open]`);if(t&&!e.target.closest(`[data-del],[data-export]`)){o.mode=`detail`,o.planId=t.dataset.open,S();return}let r=e.target.closest(`[data-del]`);if(r){a=a.filter(e=>e.id!==r.dataset.del),localStorage.setItem(n,JSON.stringify(a)),S(),x(`已删除`);return}let i=e.target.closest(`[data-export]`);if(i){let e=a.find(e=>e.id===i.dataset.export);e&&D(e)}}),(async()=>{let[e,t,n]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/routes.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),v()]);s.pts=e,s.rts=t,i=n,S()})().catch(n=>{e.innerHTML=`<div class="pl-empty">⚠️ 加载失败：${t(n.message)}</div>`});