import"./base-BJw1lW7I.js";import{i as e,n as t,r as n,t as r}from"./ai-models-BHqtacC4.js";/* empty css             */var i=document.getElementById(`account-app`),a=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),o=`admin-token`,s=`./api/index.php`,c=localStorage.getItem(o)||``,l=[],u=[],d=[],f=`pending`,p={},m=``;async function h(e,t,n=`POST`){let r=await fetch(`${s}?a=${e}`,{method:n,headers:{"Content-Type":`application/json; charset=utf-8`,...c?{Authorization:`Bearer ${c}`}:{}},body:t?JSON.stringify(t):void 0}),i=await r.json().catch(()=>({error:`响应解析失败`}));if(r.status===401)throw localStorage.removeItem(o),c=``,v(),Error(i.error||`请重新登录`);if(i.error)throw Error(i.error);return i}function g(e){let t=document.createElement(`div`);t.className=`plan-toast`,t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add(`show`),20),setTimeout(()=>{t.classList.remove(`show`),setTimeout(()=>t.remove(),400)},3200)}function _(){let e=``,t=new Uint8Array(8);return crypto.getRandomValues(t),t.forEach(t=>e+=`abcdefghjkmnpqrstuvwxyz23456789`[t%31]),e}function v(){i.innerHTML=`
    <div class="fr-login card">
      <h2>🔐 协作管理</h2>
      <p class="fr-tip">管理员登录后可开通朋友账号、审核投稿</p>
      <label>账号 <input id="ad-user" value="admin"></label>
      <label>密码 <input id="ad-pass" type="password"></label>
      <button class="pl-btn primary big" id="ad-login">登录</button>
      <div class="fr-err" id="ad-err"></div>
    </div>`,document.getElementById(`ad-login`).onclick=async()=>{let e=document.getElementById(`ad-err`);e.textContent=``;try{let e=await(await fetch(`${s}?a=login`,{method:`POST`,headers:{"Content-Type":`application/json; charset=utf-8`},body:JSON.stringify({user:document.getElementById(`ad-user`).value.trim(),pass:document.getElementById(`ad-pass`).value})})).json();if(e.error||!e.admin)throw Error(e.error||`非管理员账号`);c=e.token,localStorage.setItem(o,c),y()}catch(t){e.textContent=t.message}}}async function y(){i.innerHTML=`<div class="pl-empty">加载中…</div>`;try{[l,u,d]=await Promise.all([h(`accounts`,void 0,`GET`).then(e=>e.accounts),h(`pending`,void 0,`GET`).then(e=>e.items),fetch(`./data/points.json`).then(e=>e.json())])}catch(e){i.innerHTML=`<div class="pl-empty">加载失败：${a(e.message)}<br><button class="pl-btn" id="ad-retry">重试</button></div>`,document.getElementById(`ad-retry`).onclick=()=>location.reload();return}b()}function b(){i.innerHTML=`
    <div class="fr-top">
      <span><b>🔐 协作管理</b></span>
      <button class="pl-btn small" id="ad-out">退出</button>
    </div>
    <div class="fr-tabs">
      <button class="fr-tab ${f===`pending`?`on`:``}" data-tab="pending">待审核 (${u.length})</button>
      <button class="fr-tab ${f===`accounts`?`on`:``}" data-tab="accounts">账号 (${l.length})</button>
      <button class="fr-tab ${f===`ai`?`on`:``}" data-tab="ai">AI 设置</button>
    </div>
    <div id="ad-body"></div>`,document.getElementById(`ad-out`).onclick=async()=>{try{await h(`logout`,{},`POST`)}catch{}localStorage.removeItem(o),c=``,v()},i.querySelectorAll(`[data-tab]`).forEach(e=>e.onclick=()=>{f=e.dataset.tab,b()}),f===`pending`?x():f===`accounts`?C():M()}async function x(){let e=document.getElementById(`ad-body`);if(!u.length){e.innerHTML=`<div class="pl-empty">🎉 没有待审核的投稿</div>`;return}let t=new Map(d.map(e=>[e.id,e]));e.innerHTML=`<div class="ad-list">`+u.map(e=>`
    <div class="ad-item card" data-id="${e.id}">
      <div class="ad-item-top">
        <span class="fr-mine-type">${{photo:`📷`,note:`📝`,checkin:`📍`}[e.type]}</span>
        <b>${a(e.title||{checkin:`打卡`}[e.type]||``)}</b>
        <span class="ad-who">${a(e.username)}</span>
      </div>
      ${e.type===`photo`?`<div class="ad-photo" data-photo="${e.id}">加载照片…</div>`:``}
      ${e.body?`<div class="ad-body">${a(e.body.slice(0,300))}${e.body.length>300?`…`:``}</div>`:``}
      ${e.point_id&&t.get(e.point_id)?`<div class="ad-point">📍 ${a(t.get(e.point_id).name)}（${a(t.get(e.point_id).city)}）</div>`:e.point_id?`<div class="ad-point">📍 ${a(e.point_id)}</div>`:``}
      <div class="pl-ops">
        <button class="pl-btn small primary" data-ok="${e.id}">✅ 采纳</button>
        <button class="pl-btn small danger" data-no="${e.id}">❌ 拒绝</button>
      </div>
    </div>`).join(``)+`</div>`,e.querySelectorAll(`[data-photo]`).forEach(e=>{let t=e.dataset.photo;p[t]||(p[t]=fetch(`${s}?a=photo&id=${t}`,{headers:{Authorization:`Bearer ${c}`}}).then(e=>e.ok?e.blob():null)),p[t].then(t=>{if(!t){e.textContent=`照片加载失败`;return}e.innerHTML=`<img src="${URL.createObjectURL(t)}" alt="">`})}),e.querySelectorAll(`[data-ok]`).forEach(e=>e.onclick=()=>S(e.dataset.ok,`approve`)),e.querySelectorAll(`[data-no]`).forEach(e=>e.onclick=()=>S(e.dataset.no,`reject`))}async function S(e,t){try{await h(t,{id:+e}),g(t===`approve`?`已采纳（数据入库需 Kimi 协助合并）`:`已拒绝`),u=u.filter(t=>t.id!==+e),b()}catch(e){g(`失败：`+e.message)}}function C(){let e=document.getElementById(`ad-body`);e.innerHTML=`
    ${m?`<div class="card" style="border-color:#B71C1C"><div class="fr-note" style="color:#3A3226;font-size:14px;margin-top:0">${m}</div></div>`:``}
    <div class="card ad-new">
      <div class="ad-sec-title">开通新账号</div>
      <div class="ad-new-row">
        <input id="nw-user" placeholder="账号名（2-20字）">
        <input id="nw-pass" placeholder="密码（至少6位）">
        <button class="pl-btn small" id="nw-gen">🎲 生成</button>
      </div>
      <input id="nw-display" placeholder="备注名（如：小李）" style="margin-top:8px">
      <button class="pl-btn primary" id="nw-create" style="margin-top:10px">创建账号</button>
      <div class="fr-note" id="nw-result"></div>
    </div>
    <div class="card"><div class="ad-sec-title">已有账号</div>
      ${l.length?l.map(e=>`
        <div class="fr-ckrow">
          <span><b>${a(e.username)}</b>${e.display?` <span class="ad-who">${a(e.display)}</span>`:``}</span>
          <span class="ad-subcnt">投稿 ${e.submissions}</span>
          <button class="pl-btn small danger" data-rm="${a(e.username)}">删除</button>
        </div>`).join(``):`<div class="fr-note">还没有账号</div>`}
    </div>`,document.getElementById(`nw-gen`).onclick=()=>{document.getElementById(`nw-pass`).value=_()},document.getElementById(`nw-create`).onclick=async()=>{let e=document.getElementById(`nw-user`).value.trim(),t=document.getElementById(`nw-pass`).value,n=document.getElementById(`nw-display`).value.trim(),r=document.getElementById(`nw-result`);try{await h(`accounts`,{user:e,pass:t,display:n}),m=`✅ 已创建，把账号密码发给朋友：<br>账号 <b>${a(e)}</b> · 密码 <b>${a(t)}</b>`,l=(await h(`accounts`,void 0,`GET`)).accounts,b(),g(`账号已创建 ✓`)}catch(e){r.textContent=`失败：`+e.message}},e.querySelectorAll(`[data-rm]`).forEach(e=>e.onclick=async()=>{if(confirm(`删除账号 ${e.dataset.rm}？其投稿保留。`))try{let t=await fetch(`${s}?a=accounts&user=${encodeURIComponent(e.dataset.rm)}`,{method:`DELETE`,headers:{Authorization:`Bearer ${c}`}}),n=await t.json().catch(()=>({}));if(!t.ok||n.error)throw Error(n.error||`删除失败`);l=l.filter(t=>t.username!==e.dataset.rm),b(),g(`已删除`)}catch(e){g(`失败：`+e.message)}})}var w=e=>`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`,T={friend:[],admin:[]};function E(n){let i=T[n],o=i.filter(t=>!e(t));return`
    <div class="ai-chips">
      ${r.map(e=>`<button type="button" class="chip ${i.includes(e.id)?`on`:``}" data-field="${n}" data-mid="${e.id}" title="${e.id} · 输入 ¥${e.pin} / 输出 ¥${e.pout} 每百万 token（刊例快照价）">${a(e.name)}<span class="ai-tier ${t[e.tier]||``}">${e.tier}</span></button>`).join(``)}
      ${o.map(e=>`<button type="button" class="chip on" data-field="${n}" data-mid="${a(e)}">${a(e)}<span class="ai-tier">自定义</span></button>`).join(``)}
    </div>
    <div class="ad-new-row" style="margin-top:8px">
      <input placeholder="自定义模型 ID，回车添加" data-custom="${n}" autocomplete="off" name="ai-custom-${n}">
    </div>`}function D(e){let t=document.getElementById(`ad-body`);t.querySelectorAll(`[data-field="${e}"][data-mid]`).forEach(t=>t.onclick=()=>{let n=t.dataset.mid;T[e]=T[e].includes(n)?T[e].filter(e=>e!==n):[...T[e],n],O(e)});let n=t.querySelector(`[data-custom="${e}"]`);n&&(n.onkeydown=t=>{if(t.key!==`Enter`)return;let r=n.value.trim().replace(/[^\w./-]/g,``);r&&!T[e].includes(r)&&(T[e]=[...T[e],r],O(e))})}function O(e){let t=document.getElementById(`chips-${e}`);t&&(t.innerHTML=E(e),D(e))}function k(t,n,i){let o=i&&!e(i);return`
    <select id="${t}">
      <option value="">默认（站内配置）</option>
      ${r.map(e=>`<option value="${e.id}" ${e.id===i?`selected`:``}>${a(e.name)}（${e.tier} · ¥${e.pin}/¥${e.pout}）</option>`).join(``)}
      <option value="__custom" ${o?`selected`:``}>自定义…</option>
    </select>
    <input id="${n}" autocomplete="off" name="${n}" style="display:${o?``:`none`};margin-top:6px" value="${o?a(i):``}" placeholder="自定义模型 ID">`}function A(e,t){document.getElementById(e).onchange=e=>{document.getElementById(t).style.display=e.target.value===`__custom`?``:`none`}}function j(e,t){let n=document.getElementById(e);return n.value===`__custom`?document.getElementById(t).value.trim():n.value}async function M(){let t=document.getElementById(`ad-body`);t.innerHTML=`<div class="pl-empty">加载中…</div>`;let r,i,o;try{[r,i,o]=await Promise.all([h(`ai_policy`,void 0,`GET`),h(`ai_usage`,void 0,`GET`),h(`ai_settings`,void 0,`GET`)])}catch(e){t.innerHTML=`<div class="pl-empty">加载失败：${a(e.message)}</div>`;return}let s=r.policy||{};T={friend:[...s.models_friend||[]],admin:[...s.models_admin||[]]};let c=(i.month_by_model||[]).reduce((e,t)=>e+(n(t.model,+t.pt||0,+t.ct||0)??0),0),l=s.month_token_cap??2e6,u=l>0?Math.min(100,Math.round((i.month_site_tokens||0)/l*100)):0,d=w(new Date),f=(i.daily||[]).find(e=>e.d===d),p=Object.fromEntries((i.daily||[]).map(e=>[e.d,e])),m=[];for(let e=13;e>=0;e--){let t=w(new Date(Date.now()-e*864e5));m.push({k:t,...p[t]||{calls:0,fails:0,tok:0}})}let _=Math.max(1,...m.map(e=>+e.tok||0)),v=Math.max(1,...(i.by_model||[]).map(e=>(+e.pt||0)+(+e.ct||0))),y=Math.max(1,...(i.by_user||[]).map(e=>+e.tok||0));t.innerHTML=`
    <div class="card ad-new">
      <div class="ad-sec-title">本月概览（站内通道）</div>
      <div class="ai-stats">
        <div><div class="ai-big">${(i.month_site_tokens||0).toLocaleString()}</div><div class="fr-note">tokens</div></div>
        <div><div class="ai-big">≈¥${c.toFixed(2)}</div><div class="fr-note">刊例价估算，未计免费额度</div></div>
        <div><div class="ai-big">${f?+f.calls:0}</div><div class="fr-note">今日生成${f&&+f.fails?`（失败 ${f.fails}）`:``}</div></div>
      </div>
      <div class="ai-progress ${u>=80?`warn`:``}"><i style="width:${u}%"></i></div>
      <div class="fr-note" style="margin-top:4px">熔断进度 ${u}%（阈值 ${(l/1e4).toLocaleString()} 万 token / 月）</div>
    </div>
    <div class="card">
      <div class="ad-sec-title">近 14 天调用</div>
      <div class="ai-bars">${m.map(e=>{let t=Math.max(2,Math.round((+e.tok||0)/_*110)),n=(+e.calls||0)+(+e.fails||0),r=n?Math.round(t*(+e.fails||0)/n):0;return`<div class="ai-bar" title="${e.k}：${+e.calls||0} 次成功 / ${+e.fails||0} 失败 · ${(+e.tok||0).toLocaleString()} tok"><i style="height:${t-r}px"></i>${r?`<i class="fail" style="height:${r}px"></i>`:``}</div>`}).join(``)}</div>
      <div class="ai-bar-x">${m.map((e,t)=>`<span>${t%2?``:e.k.slice(5)}</span>`).join(``)}</div>
      <div class="ai-2col">
        <div>
          <div class="ad-sec-title" style="margin-top:12px">按模型（近 30 天）</div>
          ${(i.by_model||[]).length?i.by_model.map(t=>{let r=n(t.model,+t.pt||0,+t.ct||0),i=Math.max(4,Math.round(((+t.pt||0)+(+t.ct||0))/v*100)),o=e(t.model);return`<div class="ai-hbar"><div class="row"><span class="lbl" title="${a(t.model)}">${a(o?o.name:t.model)}</span><span class="track"><i style="width:${i}%"></i></span><span class="val">${r===null?``:`≈¥`+r.toFixed(2)}</span></div></div>`}).join(``):`<div class="fr-note">暂无记录</div>`}
        </div>
        <div>
          <div class="ad-sec-title" style="margin-top:12px">按用户（近 30 天）</div>
          ${(i.by_user||[]).length?i.by_user.map(e=>{let t=Math.max(4,Math.round((+e.tok||0)/y*100));return`<div class="ai-hbar"><div class="row"><span class="lbl">${a(e.username)}${e.channel===`custom`?` <span class="ad-who">自定义</span>`:``}</span><span class="track"><i style="width:${t}%"></i></span><span class="val">${(+e.tok||0).toLocaleString()}</span></div></div>`}).join(``):`<div class="fr-note">暂无记录</div>`}
        </div>
      </div>
      <div class="ad-sec-title" style="margin-top:14px">最近明细</div>
      ${i.items&&i.items.length?i.items.map(e=>`
        <div class="fr-ckrow">
          <span>${a(e.model||``)} · <b>${a(e.username)}</b> <span class="ad-who">${e.channel===`custom`?`自定义`:`站内`}${+e.ok?``:` · 失败`}</span></span>
          <span class="ad-subcnt">${((+e.pt||0)+(+e.ct||0)).toLocaleString()} tok</span>
        </div>`).join(``):`<div class="fr-note">还没有 AI 调用记录</div>`}
    </div>
    <div class="card ad-new">
      <div class="ad-sec-title">每日生成次数上限</div>
      <div class="ad-new-row">
        <label style="flex:1">朋友 <input id="aiq-friend" type="number" min="0" max="100" value="${s.friend_quota??3}"></label>
        <label style="flex:1">管理员 <input id="aiq-admin" type="number" min="0" max="100" value="${s.admin_quota??30}"></label>
        <label style="flex:1">自定义接入 <input id="aiq-custom" type="number" min="0" max="100" value="${s.custom_quota??20}"></label>
      </div>
      <div class="ad-sec-title" style="margin-top:14px">朋友可用模型（点击切换，悬浮看单价）</div>
      <div id="chips-friend">${E(`friend`)}</div>
      <div class="ad-sec-title" style="margin-top:14px">管理员可用模型</div>
      <div id="chips-admin">${E(`admin`)}</div>
      <div class="fr-note">价格为 2026-10-27 刊例快照、未计免费额度；旗舰档与省钱档价差可达 40 倍，开放给朋友前留意</div>
      <div class="ad-new-row" style="margin-top:12px">
        <label style="flex:1">月 token 熔断 <input id="aiq-cap" type="number" min="0" max="50000000" value="${l}"></label>
        <label style="flex:1">站内通道 <select id="aiq-enabled"><option value="1" ${s.site_enabled?`selected`:``}>开启</option><option value="0" ${s.site_enabled?``:`selected`}>停用</option></select></label>
      </div>
      <button class="pl-btn primary" id="aiq-save" style="margin-top:10px">保存 AI 设置</button>
    </div>
    <div class="card ad-new">
      <div class="ad-sec-title">我的 AI 接入（配置后我生成计划走自己的接口，不占站内次数）</div>
      <label>Endpoint（https）<input id="aie-endpoint" name="ai-cfg-ep" autocomplete="off" value="${a(o.endpoint||``)}" placeholder="留空 = 使用站内通道"></label>
      <label style="margin-top:8px">模型 ${k(`aie-model-sel`,`aie-model-custom`,o.model||``)}</label>
      <label style="margin-top:8px">API Key <input id="aie-key" name="ai-cfg-key" type="password" autocomplete="new-password" placeholder="${o.has_key?`已保存（留空保持不变）`:`sk-...`}"></label>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="pl-btn primary" id="aie-save">保存我的接入</button>
        <button class="pl-btn small" id="aie-test">⚡ 测试连接</button>
        <button class="pl-btn small danger" id="aie-clear">清除（回到站内通道）</button>
      </div>
      <div class="fr-note" id="aie-result" style="margin-top:8px"></div>
    </div>`,D(`friend`),D(`admin`),A(`aie-model-sel`,`aie-model-custom`),document.getElementById(`aiq-save`).onclick=async()=>{if(!T.friend.length||!T.admin.length)return g(`两组的模型范围都不能为空`);try{await h(`ai_policy`,{friend_quota:+document.getElementById(`aiq-friend`).value,admin_quota:+document.getElementById(`aiq-admin`).value,custom_quota:+document.getElementById(`aiq-custom`).value,month_token_cap:+document.getElementById(`aiq-cap`).value,site_enabled:document.getElementById(`aiq-enabled`).value===`1`,models_friend:T.friend,models_admin:T.admin}),g(`AI 设置已保存 ✓`),M()}catch(e){g(`失败：`+e.message)}},document.getElementById(`aie-save`).onclick=async()=>{try{await h(`ai_settings`,{endpoint:document.getElementById(`aie-endpoint`).value.trim(),model:j(`aie-model-sel`,`aie-model-custom`),key:document.getElementById(`aie-key`).value}),g(`我的 AI 接入已保存 ✓`),M()}catch(e){g(`失败：`+e.message)}},document.getElementById(`aie-test`).onclick=async()=>{let e=document.getElementById(`aie-result`),t=document.getElementById(`aie-test`);t.disabled=!0,e.textContent=`测试中（真实调一次模型，约几秒）…`;try{let t=await h(`ai_test`,{endpoint:document.getElementById(`aie-endpoint`).value.trim(),model:j(`aie-model-sel`,`aie-model-custom`),key:document.getElementById(`aie-key`).value});e.textContent=t.ok?`✓ 连通正常 · 延迟 ${(t.latency_ms/1e3).toFixed(1)}s · 模型 ${t.model} 回复：${t.preview||`（空）`}`:`✗ ${t.error||`测试失败`}`}catch(t){e.textContent=`✗ `+t.message}t.disabled=!1},document.getElementById(`aie-clear`).onclick=async()=>{if(confirm(`清除自定义接入，回到站内通道？`))try{await h(`ai_settings`,{endpoint:``}),g(`已清除`),M()}catch(e){g(`失败：`+e.message)}}}(async()=>{if(c)try{await h(`me`),y();return}catch{}v()})();