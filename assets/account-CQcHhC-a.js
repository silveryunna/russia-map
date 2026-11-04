import{t as e}from"./sw-register-slL7fN2v.js";import{a as t,i as n,n as r,o as i,r as a,s as o,t as s}from"./report-CuUDn4Fo.js";/* empty css             */var c=document.getElementById(`account-app`),l=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),u=`admin-token`,d=`./api/index.php`,f={hours:`营业时间`,ticket:`门票`,rating:`评分`,other:`其他说明`},p={hours:`hours`,ticket:`ticket`,rating:`rating`,other:`note`},m={pending:`待审核`,needs_more:`需补充`,approved:`已采纳`,rejected:`未采纳`,removed:`已移除`},h={remove:`移除内容`,dismiss:`驳回举报`,ban:`封禁投稿者`,unban:`解除封禁`},g=localStorage.getItem(u)||``,_=[],v=[],y=[],b=[],x=[],S=0,C=0,w=[],T=`pending`,E=`pending`,D=``,O=`pending`,k=new Set,A={},j=``;async function M(e,t,n=`POST`,r=``){let i=await fetch(`${d}?a=${e}${r?`&`+r:``}`,{method:n,headers:{"Content-Type":`application/json; charset=utf-8`,...g?{Authorization:`Bearer ${g}`}:{}},body:t?JSON.stringify(t):void 0}),a=await i.json().catch(()=>({error:`响应解析失败`}));if(i.status===401)throw localStorage.removeItem(u),g=``,F(),Error(a.error||`请重新登录`);if(a.error)throw Error(a.error);return a}function N(e){let t=document.createElement(`div`);t.className=`plan-toast`,t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add(`show`),20),setTimeout(()=>{t.classList.remove(`show`),setTimeout(()=>t.remove(),400)},3200)}function P(){let e=``,t=new Uint8Array(8);return crypto.getRandomValues(t),t.forEach(t=>e+=`abcdefghjkmnpqrstuvwxyz23456789`[t%31]),e}function F(){c.innerHTML=`
    <div class="fr-login card">
      <h2>🔐 协作管理</h2>
      <p class="fr-tip">管理员登录后可开通朋友账号、审核投稿</p>
      <label>账号 <input id="ad-user" value="admin"></label>
      <label>密码 <input id="ad-pass" type="password"></label>
      <button class="pl-btn primary big" id="ad-login">登录</button>
      <div class="fr-err" id="ad-err"></div>
    </div>`,document.getElementById(`ad-login`).onclick=async()=>{let e=document.getElementById(`ad-err`);e.textContent=``;try{let e=await(await fetch(`${d}?a=login`,{method:`POST`,headers:{"Content-Type":`application/json; charset=utf-8`},body:JSON.stringify({user:document.getElementById(`ad-user`).value.trim(),pass:document.getElementById(`ad-pass`).value})})).json();if(e.error||!e.admin)throw Error(e.error||`非管理员账号`);g=e.token,localStorage.setItem(u,g),I()}catch(t){e.textContent=t.message}}}async function I(){c.innerHTML=`<div class="pl-empty">加载中…</div>`;try{[_,v,y,w]=await Promise.all([M(`accounts`,void 0,`GET`).then(e=>e.accounts),M(`pending`,void 0,`GET`,`status=${E}${D?`&type=`+D:``}`).then(e=>e.items),fetch(`./data/points.json`).then(e=>e.json()),M(`changesets`,void 0,`GET`).then(e=>e.items)]);let e=await M(`reports`,void 0,`GET`,`status=${O}`);b=e.items,x=e.logs||[],S=e.overdue||0,C=e.pending||0}catch(e){c.innerHTML=`<div class="pl-empty">加载失败：${l(e.message)}<br><button class="pl-btn" id="ad-retry">重试</button></div>`,document.getElementById(`ad-retry`).onclick=()=>location.reload();return}L()}function L(){c.innerHTML=`
    <div class="fr-top">
      <span><b>🔐 协作管理</b></span>
      <button class="pl-btn small" id="ad-out">退出</button>
    </div>
    <div class="fr-tabs">
      <button class="fr-tab ${T===`pending`?`on`:``}" data-tab="pending">内容审核 (${v.length})</button>
      <button class="fr-tab ${T===`reports`?`on`:``}" data-tab="reports">举报 (${C}${S?` · 超时 ${S}`:``})</button>
      <button class="fr-tab ${T===`changesets`?`on`:``}" data-tab="changesets">变更入库 (${w.length})</button>
      <button class="fr-tab ${T===`accounts`?`on`:``}" data-tab="accounts">账号 (${_.length})</button>
      <button class="fr-tab ${T===`ai`?`on`:``}" data-tab="ai">AI 设置</button>
    </div>
    <div id="ad-body"></div>`,document.getElementById(`ad-out`).onclick=async()=>{try{await M(`logout`,{},`POST`)}catch{}localStorage.removeItem(u),g=``,F()},c.querySelectorAll(`[data-tab]`).forEach(e=>e.onclick=()=>{T=e.dataset.tab,k.clear(),L()}),T===`pending`?R():T===`reports`?W():T===`changesets`?G():T===`accounts`?K():$()}async function R(){let e=document.getElementById(`ad-body`),t=new Map(y.map(e=>[e.id,e])),n={photo:`📷`,note:`📝`,checkin:`📍`,fact:`🛠`},i=`
    <div class="card ad-new">
      <div class="ad-new-row">
        <label style="flex:1">状态 <select id="ad-st">${[`pending`,`needs_more`,`approved`,`rejected`,`removed`].map(e=>`<option value="${e}" ${E===e?`selected`:``}>${m[e]}</option>`).join(``)}</select></label>
        <label style="flex:1">类型 <select id="ad-type">
          <option value="">全部</option>
          ${[[`photo`,`照片`],[`note`,`笔记`],[`checkin`,`打卡`],[`fact`,`纠错`]].map(([e,t])=>`<option value="${e}" ${D===e?`selected`:``}>${t}</option>`).join(``)}
        </select></label>
        <button class="pl-btn small primary" id="ad-bulk">批量采纳</button>
      </div>
      <div class="fr-note">驳回与「需补充」必须填写理由；每次状态变更都记录操作人、时间与理由。纠错通过后只生成 changeset，不直接改线上数据。</div>
    </div>`;if(!v.length){e.innerHTML=i+`<div class="pl-empty">🎉 当前筛选下没有内容</div>`,z(e);return}e.innerHTML=i+`<div class="ad-list">`+v.map(e=>{let r=e.point_id?t.get(e.point_id):null,i=e.type===`fact`&&r?r[p[e.target_field]]:void 0;return`
    <div class="ad-item card" data-id="${e.id}">
      <div class="ad-item-top">
        <input type="checkbox" data-sel="${e.id}" ${k.has(e.id)?`checked`:``}>
        <span class="fr-mine-type">${n[e.type]||`•`}</span>
        <b>${l(e.title||{checkin:`打卡`}[e.type]||``)}</b>
        <span class="ad-who">${l(e.username)}</span>
        <span class="ad-subcnt">${m[e.status]||e.status}</span>
      </div>
      ${e.type===`fact`?`<div class="ad-point">🛠 ${f[e.target_field]||e.target_field}：现值 ${i===void 0?`（无）`:l(String(i))} → <b>${l(e.new_value)}</b></div>`:``}
      ${e.source_url?`<div class="ad-point">🔗 <a href="${l(e.source_url)}" target="_blank" rel="noopener noreferrer">${l(e.source_url)}</a></div>`:``}
      ${e.has_evidence?`<div class="ad-photo" data-photo="${e.id}">加载证据…</div>`:``}
      ${e.body?`<div class="ad-body">${l(e.body.slice(0,300))}${e.body.length>300?`…`:``}</div>`:``}
      ${r?`<div class="ad-point">📍 ${l(r.name)}（${l(r.city)}）</div>`:e.point_id?`<div class="ad-point">📍 ${l(e.point_id)}</div>`:``}
      <div class="pl-ops">
        <button class="pl-btn small primary" data-ok="${e.id}">✅ 采纳</button>
        <button class="pl-btn small" data-more="${e.id}">💬 需补充</button>
        <button class="pl-btn small danger" data-no="${e.id}">❌ 拒绝</button>
        <button class="pl-btn small" data-report="${e.id}">🚩 举报</button>
      </div>
    </div>`}).join(``)+`</div>`,e.querySelectorAll(`[data-photo]`).forEach(e=>{let t=e.dataset.photo;A[t]||(A[t]=fetch(`${d}?a=photo&id=${t}`,{headers:{Authorization:`Bearer ${g}`}}).then(e=>e.ok?e.blob():null)),A[t].then(t=>{if(!t){e.textContent=`证据加载失败`;return}e.innerHTML=`<img src="${URL.createObjectURL(t)}" alt="">`})}),e.querySelectorAll(`[data-sel]`).forEach(e=>e.onchange=()=>{let t=+e.dataset.sel;e.checked?k.add(t):k.delete(t)}),e.querySelectorAll(`[data-ok]`).forEach(e=>e.onclick=()=>{let t=prompt(`采纳理由（会记入审核日志）`,`内容真实且符合收录标准`);t&&t.trim().length>=2&&H([+e.dataset.ok],`approve`,t.trim())}),e.querySelectorAll(`[data-more]`).forEach(e=>e.onclick=()=>{let t=prompt(`需要补充什么？（会发给投稿人）`);t&&t.trim().length>=2&&H([+e.dataset.more],`needs_more`,t.trim())}),e.querySelectorAll(`[data-no]`).forEach(e=>e.onclick=()=>{let t=prompt(`驳回理由（必填，至少 2 字）`);t&&t.trim().length>=2&&H([+e.dataset.no],`reject`,t.trim())}),e.querySelectorAll(`[data-report]`).forEach(e=>e.onclick=()=>{let t=v.find(t=>t.id===+e.dataset.report);r({targetType:`submission`,targetId:e.dataset.report,label:t?.title||`投稿 #${e.dataset.report}`,submit:e=>M(`report`,e)})}),z(e)}function z(e){let t=e.querySelector(`#ad-st`),n=e.querySelector(`#ad-type`);t&&(t.onchange=()=>{E=t.value,k.clear(),B().then(L).catch(e=>N(e.message))}),n&&(n.onchange=()=>{D=n.value,k.clear(),B().then(L).catch(e=>N(e.message))});let r=e.querySelector(`#ad-bulk`);r&&(r.onclick=()=>{if(!k.size)return N(`先勾选要采纳的投稿`);let e=prompt(`批量采纳 ${k.size} 条的共用理由`,`内容真实且符合收录标准`);e&&e.trim().length>=2&&H([...k],`approve`,e.trim())})}async function B(){v=(await M(`pending`,void 0,`GET`,`status=${E}${D?`&type=`+D:``}`)).items}async function V(){await B(),w=(await M(`changesets`,void 0,`GET`)).items;let e=await M(`reports`,void 0,`GET`,`status=${O}`);b=e.items,x=e.logs||[],S=e.overdue||0,C=e.pending||0,L()}async function H(e,t,n=``){try{let r=await M(`review`,{ids:e,action:t,reason:n}),i={approve:`已采纳`,needs_more:`已标记需补充`,reject:`已拒绝`}[t];N(i+(r.skipped?.length?`（${r.skipped.length} 条跳过）`:``)),k.clear(),await V()}catch(e){N(`失败：`+e.message)}}async function U(){let e=await M(`reports`,void 0,`GET`,`status=${O}`);b=e.items,x=e.logs||[],S=e.overdue||0,C=e.pending||0}function W(){let e=document.getElementById(`ad-body`),t=e=>(s.find(([t])=>t===e)||[e,e])[1],n=`
    <div class="card ad-new">
      <div class="ad-new-row">
        <label style="flex:1">状态 <select id="ad-rst">
          ${[[`pending`,`待处理`],[`handled`,`已处理`],[`all`,`全部`]].map(([e,t])=>`<option value="${e}" ${O===e?`selected`:``}>${t}</option>`).join(``)}
        </select></label>
        <span class="ad-who">处理时限目标 24h${S?` · ⚠ 已超时 ${S} 条`:``}</span>
      </div>
      <div class="fr-note">处理动作写入举报日志；封禁投稿者会同时清掉该账号全部会话。</div>
    </div>`,r=b.length?b.map(e=>`
    <div class="ad-item card">
      <div class="ad-item-top">
        <b>#${e.id} ${t(e.reason)}</b>
        <span class="ad-who">${l(e.reporter)}</span>
        <span class="ad-subcnt">${e.status===`pending`?`待处理`:`已处理`}${e.overdue?` · ⚠ 超时`:``}</span>
      </div>
      <div class="ad-point">${e.target_type===`submission`?`投稿 #${e.target_id}${e.s_title?` · `+l(e.s_title):``}`:`点位 ${l(e.target_id)}`}</div>
      ${e.note?`<div class="ad-body">${l(e.note)}</div>`:``}
      <div class="fr-note">举报于 ${new Date(e.created*1e3).toLocaleString(`zh-CN`)}${e.handled_by?` · 由 ${l(e.handled_by)} ${h[e.action]||e.action}`:``}</div>
      ${e.status===`pending`?`<div class="pl-ops">
        ${e.target_type===`submission`?`<button class="pl-btn small danger" data-h="${e.id}" data-act="remove">移除内容</button>`:``}
        <button class="pl-btn small" data-h="${e.id}" data-act="dismiss">驳回举报</button>
        ${e.s_username?`<button class="pl-btn small danger" data-h="${e.id}" data-act="ban">封禁投稿者</button>`:``}
      </div>`:``}
    </div>`).join(``):`<div class="pl-empty">当前筛选下没有举报</div>`,i=x.length?`<div class="card"><div class="ad-sec-title">处理与封禁日志</div>
    ${x.map(e=>`<div class="fr-note" style="margin-top:var(--sp-1,4px)">#${e.id} · ${new Date(e.created*1e3).toLocaleString(`zh-CN`)} · ${l(e.actor)} ${h[e.action]||e.action}${e.note?` · `+l(e.note):``}</div>`).join(``)}
  </div>`:``;e.innerHTML=n+`<div class="ad-list">${r}</div>`+i;let a=e.querySelector(`#ad-rst`);a&&(a.onchange=async()=>{O=a.value;try{await U(),W()}catch(e){N(e.message)}}),e.querySelectorAll(`[data-h]`).forEach(e=>e.onclick=async()=>{let t=e.dataset.act,n=t===`dismiss`?prompt(`驳回理由（可选）`)||``:prompt(`处理备注（可选）`)||``;try{await M(`report_handle`,{id:+e.dataset.h,action:t,note:n}),N(`已处理：`+(h[t]||t)),await U(),W()}catch(e){N(`失败：`+e.message)}})}function G(){let e=document.getElementById(`ad-body`);e.innerHTML=`
    <div class="card ad-new">
      <div class="ad-new-row"><button class="pl-btn small primary" id="ad-export">⬇ 导出待应用 JSON</button></div>
      <div class="fr-note">导出后在服务器执行：<code>node tools/apply-changesets.mjs --input ready.json --by "操作人"</code>；重复执行幂等，回滚用 <code>--rollback &lt;run_id&gt;</code>。被后续变更覆盖时会提示冲突并跳过。</div>
    </div>
    <div class="ad-list">${w.length?w.map(e=>`
    <div class="ad-item card">
      <div class="ad-item-top"><b>#${e.id} · 投稿 #${e.submission_id}</b>
        <span class="ad-subcnt">${e.status}${e.run_id?` · `+l(e.run_id):``}</span>
      </div>
      <div class="ad-point">📍 ${l(e.city||``)} ${l(e.point_id)} · ${l(e.json_path)}：${e.before_value===null?`（原无）`:l(e.before_value)} → <b>${l(e.new_value)}</b></div>
      ${e.applied_by?`<div class="fr-note">由 ${l(e.applied_by)} 于 ${new Date(e.applied_at*1e3).toLocaleString(`zh-CN`)} 应用</div>`:``}
    </div>`).join(``):`<div class="pl-empty">没有待应用变更</div>`}</div>`;let t=e.querySelector(`#ad-export`);t&&(t.onclick=()=>{let e=w.filter(e=>e.status===`ready`);if(!e.length)return N(`没有待应用变更`);let t=new Blob([JSON.stringify({version:1,items:e},null,2)],{type:`application/json`}),n=document.createElement(`a`);n.href=URL.createObjectURL(t),n.download=`changesets-ready-${Date.now()}.json`,n.click(),setTimeout(()=>URL.revokeObjectURL(n.href),1e3),N(`已导出 ${e.length} 条变更`)})}function K(){let e=document.getElementById(`ad-body`);e.innerHTML=`
    ${j?`<div class="card" style="border-color:#B71C1C"><div class="fr-note" style="color:#3A3226;font-size:14px;margin-top:0">${j}</div></div>`:``}
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
      ${_.length?_.map(e=>`
        <div class="fr-ckrow">
          <span><b>${l(e.username)}</b>${e.display?` <span class="ad-who">${l(e.display)}</span>`:``}${e.banned?` <span class="ad-subcnt">🚫 已封禁</span>`:``}</span>
          <span class="ad-subcnt">投稿 ${e.submissions}</span>
          <button class="pl-btn small" data-ban="${l(e.username)}" data-on="${+!e.banned}">${e.banned?`解除封禁`:`封禁`}</button>
          <button class="pl-btn small danger" data-rm="${l(e.username)}">删除</button>
        </div>`).join(``):`<div class="fr-note">还没有账号</div>`}
    </div>`,document.getElementById(`nw-gen`).onclick=()=>{document.getElementById(`nw-pass`).value=P()},document.getElementById(`nw-create`).onclick=async()=>{let e=document.getElementById(`nw-user`).value.trim(),t=document.getElementById(`nw-pass`).value,n=document.getElementById(`nw-display`).value.trim(),r=document.getElementById(`nw-result`);try{await M(`accounts`,{user:e,pass:t,display:n}),j=`✅ 已创建，把账号密码发给朋友：<br>账号 <b>${l(e)}</b> · 密码 <b>${l(t)}</b>`,_=(await M(`accounts`,void 0,`GET`)).accounts,L(),N(`账号已创建 ✓`)}catch(e){r.textContent=`失败：`+e.message}},e.querySelectorAll(`[data-ban]`).forEach(e=>e.onclick=async()=>{let t=e.dataset.on===`1`;if(!t||confirm(`封禁账号 ${e.dataset.ban}？将同时清掉其全部会话。`))try{await M(`ban`,{user:e.dataset.ban,banned:t}),_=(await M(`accounts`,void 0,`GET`)).accounts,L(),N(t?`已封禁`:`已解除封禁`)}catch(e){N(`失败：`+e.message)}}),e.querySelectorAll(`[data-rm]`).forEach(e=>e.onclick=async()=>{if(confirm(`删除账号 ${e.dataset.rm}？其投稿保留。`))try{let t=await fetch(`${d}?a=accounts&user=${encodeURIComponent(e.dataset.rm)}`,{method:`DELETE`,headers:{Authorization:`Bearer ${g}`}}),n=await t.json().catch(()=>({}));if(!t.ok||n.error)throw Error(n.error||`删除失败`);_=_.filter(t=>t.username!==e.dataset.rm),L(),N(`已删除`)}catch(e){N(`失败：`+e.message)}})}var q=e=>`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`,J={friend:[],admin:[]};function Y(e){let r=J[e],i=r.filter(e=>!o(e));return`
    <div class="ai-chips">
      ${n.map(n=>`<button type="button" class="chip ${r.includes(n.id)?`on`:``}" data-field="${e}" data-mid="${n.id}" title="${n.id} · 输入 ¥${n.pin} / 输出 ¥${n.pout} 每百万 token（刊例快照价）">${l(n.name)}<span class="ai-tier ${t[n.tier]||``}">${n.tier}</span></button>`).join(``)}
      ${i.map(t=>`<button type="button" class="chip on" data-field="${e}" data-mid="${l(t)}">${l(t)}<span class="ai-tier">自定义</span></button>`).join(``)}
    </div>
    <div class="ad-new-row" style="margin-top:8px">
      <input placeholder="自定义模型 ID，回车添加" data-custom="${e}" autocomplete="off" name="ai-custom-${e}">
    </div>`}function X(e){let t=document.getElementById(`ad-body`);t.querySelectorAll(`[data-field="${e}"][data-mid]`).forEach(t=>t.onclick=()=>{let n=t.dataset.mid;J[e]=J[e].includes(n)?J[e].filter(e=>e!==n):[...J[e],n],Z(e)});let n=t.querySelector(`[data-custom="${e}"]`);n&&(n.onkeydown=t=>{if(t.key!==`Enter`)return;let r=n.value.trim().replace(/[^\w./-]/g,``);r&&!J[e].includes(r)&&(J[e]=[...J[e],r],Z(e))})}function Z(e){let t=document.getElementById(`chips-${e}`);t&&(t.innerHTML=Y(e),X(e))}function ee(e,t,r){let i=r&&!o(r);return`
    <select id="${e}">
      <option value="">默认（站内配置）</option>
      ${n.map(e=>`<option value="${e.id}" ${e.id===r?`selected`:``}>${l(e.name)}（${e.tier} · ¥${e.pin}/¥${e.pout}）</option>`).join(``)}
      <option value="__custom" ${i?`selected`:``}>自定义…</option>
    </select>
    <input id="${t}" autocomplete="off" name="${t}" style="display:${i?``:`none`};margin-top:6px" value="${i?l(r):``}" placeholder="自定义模型 ID">`}function te(e,t){document.getElementById(e).onchange=e=>{document.getElementById(t).style.display=e.target.value===`__custom`?``:`none`}}function Q(e,t){let n=document.getElementById(e);return n.value===`__custom`?document.getElementById(t).value.trim():n.value}async function $(){let e=document.getElementById(`ad-body`);e.innerHTML=`<div class="pl-empty">加载中…</div>`;let t,n,r;try{[t,n,r]=await Promise.all([M(`ai_policy`,void 0,`GET`),M(`ai_usage`,void 0,`GET`),M(`ai_settings`,void 0,`GET`)])}catch(t){e.innerHTML=`<div class="pl-empty">加载失败：${l(t.message)}</div>`;return}let s=t.policy||{};J={friend:[...s.models_friend||[]],admin:[...s.models_admin||[]]};let c=(n.month_by_model||[]).reduce((e,t)=>e+(i(t.model,+t.pt||0,+t.ct||0)??0),0),u=s.month_token_cap??2e6,d=u>0?Math.min(100,Math.round((n.month_site_tokens||0)/u*100)):0,f=q(new Date),p=(n.daily||[]).find(e=>e.d===f),m=Object.fromEntries((n.daily||[]).map(e=>[e.d,e])),h=[];for(let e=13;e>=0;e--){let t=q(new Date(Date.now()-e*864e5));h.push({k:t,...m[t]||{calls:0,fails:0,tok:0}})}let g=Math.max(1,...h.map(e=>+e.tok||0)),_=Math.max(1,...(n.by_model||[]).map(e=>(+e.pt||0)+(+e.ct||0))),v=Math.max(1,...(n.by_user||[]).map(e=>+e.tok||0)),y=n.alerts||[];e.innerHTML=`
    ${y.length?`
    <div class="card ai-alertbar${d>=80?` warn`:``}" role="status">
      <div class="ad-sec-title">用量告警（阈值 60% / 80%，同周期同阈值只告一次）</div>
      ${y.slice(0,8).map(e=>`
        <div class="fr-ckrow">
          <span>${l(e.period)} · 达 <b>${+e.threshold}%</b></span>
          <span class="ad-subcnt">${(+e.tokens||0).toLocaleString()} / ${(+e.cap||0).toLocaleString()} tok · ${new Date(e.created*1e3).toLocaleString(`zh-CN`)}</span>
        </div>`).join(``)}
      ${y.length>8?`<div class="fr-note">另有 ${y.length-8} 条历史，按时间倒序只展示最近 8 条</div>`:``}
      <div class="fr-note">同时写入服务端结构化日志（标签 [ai_alert]），无需配置外部 webhook</div>
    </div>`:``}
    <div class="card ad-new">
      <div class="ad-sec-title">本月概览（站内通道）</div>
      <div class="ai-stats">
        <div><div class="ai-big">${(n.month_site_tokens||0).toLocaleString()}</div><div class="fr-note">tokens</div></div>
        <div><div class="ai-big">≈¥${c.toFixed(2)}</div><div class="fr-note">刊例价估算，未计免费额度</div></div>
        <div><div class="ai-big">${p?+p.calls:0}</div><div class="fr-note">今日生成${p&&+p.fails?`（失败 ${p.fails}）`:``}</div></div>
      </div>
      <div class="ai-progress ${d>=80?`warn`:``}"><i style="width:${d}%"></i></div>
      <div class="fr-note" style="margin-top:4px">熔断进度 ${d}%（阈值 ${(u/1e4).toLocaleString()} 万 token / 月）</div>
    </div>
    <div class="card">
      <div class="ad-sec-title">近 14 天调用</div>
      <div class="ai-bars">${h.map(e=>{let t=Math.max(2,Math.round((+e.tok||0)/g*110)),n=(+e.calls||0)+(+e.fails||0),r=n?Math.round(t*(+e.fails||0)/n):0;return`<div class="ai-bar" title="${e.k}：${+e.calls||0} 次成功 / ${+e.fails||0} 失败 · ${(+e.tok||0).toLocaleString()} tok"><i style="height:${t-r}px"></i>${r?`<i class="fail" style="height:${r}px"></i>`:``}</div>`}).join(``)}</div>
      <div class="ai-bar-x">${h.map((e,t)=>`<span>${t%2?``:e.k.slice(5)}</span>`).join(``)}</div>
      <div class="ai-2col">
        <div>
          <div class="ad-sec-title" style="margin-top:12px">按模型（近 30 天）</div>
          ${(n.by_model||[]).length?n.by_model.map(e=>{let t=i(e.model,+e.pt||0,+e.ct||0),n=Math.max(4,Math.round(((+e.pt||0)+(+e.ct||0))/_*100)),r=o(e.model);return`<div class="ai-hbar"><div class="row"><span class="lbl" title="${l(e.model)}">${l(r?r.name:e.model)}</span><span class="track"><i style="width:${n}%"></i></span><span class="val">${t===null?``:`≈¥`+t.toFixed(2)}</span></div></div>`}).join(``):`<div class="fr-note">暂无记录</div>`}
        </div>
        <div>
          <div class="ad-sec-title" style="margin-top:12px">按用户（近 30 天）</div>
          ${(n.by_user||[]).length?n.by_user.map(e=>{let t=Math.max(4,Math.round((+e.tok||0)/v*100));return`<div class="ai-hbar"><div class="row"><span class="lbl">${l(e.username)}${e.channel===`custom`?` <span class="ad-who">自定义</span>`:``}</span><span class="track"><i style="width:${t}%"></i></span><span class="val">${(+e.tok||0).toLocaleString()}</span></div></div>`}).join(``):`<div class="fr-note">暂无记录</div>`}
        </div>
      </div>
      <div class="ad-sec-title" style="margin-top:14px">最近明细</div>
      ${n.items&&n.items.length?n.items.map(e=>`
        <div class="fr-ckrow">
          <span>${l(e.model||``)} · <b>${l(e.username)}</b> <span class="ad-who">${e.channel===`custom`?`自定义`:`站内`}${+e.ok?``:` · 失败`}</span></span>
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
      <div id="chips-friend">${Y(`friend`)}</div>
      <div class="ad-sec-title" style="margin-top:14px">管理员可用模型</div>
      <div id="chips-admin">${Y(`admin`)}</div>
      <div class="fr-note">价格为 2026-10-27 刊例快照、未计免费额度；旗舰档与省钱档价差可达 40 倍，开放给朋友前留意</div>
      <div class="ad-new-row" style="margin-top:12px">
        <label style="flex:1">月 token 熔断 <input id="aiq-cap" type="number" min="0" max="50000000" value="${u}"></label>
        <label style="flex:1">站内通道 <select id="aiq-enabled"><option value="1" ${s.site_enabled?`selected`:``}>开启</option><option value="0" ${s.site_enabled?``:`selected`}>停用</option></select></label>
      </div>
      <div class="ad-new-row" style="margin-top:12px">
        <label style="flex:1">IP 限流次数 <input id="aiq-ipmax" type="number" min="1" max="1000" value="${s.ip_rate_max??10}"></label>
        <label style="flex:1">窗口秒数 <input id="aiq-ipwin" type="number" min="60" max="86400" value="${s.ip_rate_window??600}"></label>
      </div>
      <div class="fr-note">IP 维度按滑动窗口计数，与账号日额度并存、取更严者；只在实际发起生成时计一次（重放/被拒不占额度）</div>
      <button class="pl-btn primary" id="aiq-save" style="margin-top:10px">保存 AI 设置</button>
    </div>
    <div class="card ad-new">
      <div class="ad-sec-title">我的 AI 接入（配置后我生成计划走自己的接口，不占站内次数）</div>
      <label>Endpoint（https）<input id="aie-endpoint" name="ai-cfg-ep" autocomplete="off" value="${l(r.endpoint||``)}" placeholder="留空 = 使用站内通道"></label>
      <label style="margin-top:8px">模型 ${ee(`aie-model-sel`,`aie-model-custom`,r.model||``)}</label>
      <label style="margin-top:8px">API Key <input id="aie-key" name="ai-cfg-key" type="password" autocomplete="new-password" placeholder="${r.has_key?`已保存（留空保持不变）`:`sk-...`}"></label>
      <div class="fr-note" style="margin-top:4px">${l(a(r))}</div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="pl-btn primary" id="aie-save">保存我的接入</button>
        <button class="pl-btn small" id="aie-test">⚡ 测试连接</button>
        <button class="pl-btn small danger" id="aie-clear">清除（回到站内通道）</button>
      </div>
      <div class="fr-note" id="aie-result" style="margin-top:8px"></div>
    </div>`,X(`friend`),X(`admin`),te(`aie-model-sel`,`aie-model-custom`),document.getElementById(`aiq-save`).onclick=async()=>{if(!J.friend.length||!J.admin.length)return N(`两组的模型范围都不能为空`);try{await M(`ai_policy`,{friend_quota:+document.getElementById(`aiq-friend`).value,admin_quota:+document.getElementById(`aiq-admin`).value,custom_quota:+document.getElementById(`aiq-custom`).value,month_token_cap:+document.getElementById(`aiq-cap`).value,ip_rate_max:+document.getElementById(`aiq-ipmax`).value,ip_rate_window:+document.getElementById(`aiq-ipwin`).value,site_enabled:document.getElementById(`aiq-enabled`).value===`1`,models_friend:J.friend,models_admin:J.admin}),N(`AI 设置已保存 ✓`),$()}catch(e){N(`失败：`+e.message)}},document.getElementById(`aie-save`).onclick=async()=>{try{await M(`ai_settings`,{endpoint:document.getElementById(`aie-endpoint`).value.trim(),model:Q(`aie-model-sel`,`aie-model-custom`),key:document.getElementById(`aie-key`).value}),N(`我的 AI 接入已保存 ✓`),$()}catch(e){N(`失败：`+e.message)}},document.getElementById(`aie-test`).onclick=async()=>{let e=document.getElementById(`aie-result`),t=document.getElementById(`aie-test`);t.disabled=!0,e.textContent=`测试中（真实调一次模型，约几秒）…`;try{let t=await M(`ai_test`,{endpoint:document.getElementById(`aie-endpoint`).value.trim(),model:Q(`aie-model-sel`,`aie-model-custom`),key:document.getElementById(`aie-key`).value});e.textContent=t.ok?`✓ 连通正常 · 延迟 ${(t.latency_ms/1e3).toFixed(1)}s · 模型 ${t.model} 回复：${t.preview||`（空）`}`:`✗ ${t.error||`测试失败`}`}catch(t){e.textContent=`✗ `+t.message}t.disabled=!1},document.getElementById(`aie-clear`).onclick=async()=>{if(confirm(`清除自定义接入，回到站内通道？`))try{await M(`ai_settings`,{endpoint:``}),N(`已清除`),$()}catch(e){N(`失败：`+e.message)}}}(async()=>{if(g)try{await M(`me`),I();return}catch{}F()})(),e();