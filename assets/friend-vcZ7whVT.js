import{t as e}from"./sw-register-slL7fN2v.js";import{a as t,n}from"./regions-B1YHvA7W.js";import{i as r,r as i}from"./checkin-CXOSYQp4.js";import{t as a}from"./repository-J-vaQOLh.js";import{i as o,n as s,r as c,s as l}from"./report-CuUDn4Fo.js";/* empty css             */var u=document.getElementById(`friend-app`),d=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),f=`friend-token`,p=`./api/index.php`,m=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2),h=localStorage.getItem(f)||``,g=null,_=[],v=null,y={},b=`photo`,x=[];async function S(e,t,n=`POST`){let r=await fetch(`${p}?a=${e}`,{method:n,headers:{"Content-Type":`application/json; charset=utf-8`,...h?{Authorization:`Bearer ${h}`}:{}},body:t?JSON.stringify(t):void 0}),i=await r.json().catch(()=>({error:`响应解析失败`}));if(r.status===401)throw C(),Error(i.error||`登录已过期`);if(i.error)throw Error(i.error);return i}function C(){localStorage.removeItem(f),h=``,g=null}function w(e){let t=document.createElement(`div`);t.className=`plan-toast`,t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add(`show`),20),setTimeout(()=>{t.classList.remove(`show`),setTimeout(()=>t.remove(),400)},3200)}function T(){u.innerHTML=`
    <div class="fr-login card">
      <h2>👋 朋友投稿入口</h2>
      <p class="fr-tip">向站长领取账号后登录，可以传照片、写游记、帮同行打卡</p>
      <label>账号 <input id="fr-user" autocomplete="username"></label>
      <label>密码 <input id="fr-pass" type="password" autocomplete="current-password"></label>
      <button class="pl-btn primary big" id="fr-login">登录</button>
      <div class="fr-err" id="fr-err"></div>
    </div>`,document.getElementById(`fr-login`).onclick=async()=>{let e=document.getElementById(`fr-err`);e.textContent=``;try{let e=await(await fetch(`${p}?a=login`,{method:`POST`,headers:{"Content-Type":`application/json; charset=utf-8`},body:JSON.stringify({user:document.getElementById(`fr-user`).value.trim(),pass:document.getElementById(`fr-pass`).value})})).json();if(e.error)throw Error(e.error);h=e.token,localStorage.setItem(f,h),g=e,D()}catch(t){e.textContent=t.message}}}async function E(e){e.innerHTML=`<div class="pl-empty">加载中…</div>`;let t={endpoint:``,model:``,has_key:!1};try{t=await S(`ai_settings`,void 0,`GET`)}catch(t){e.innerHTML=`<div class="pl-empty">加载失败：${d(t.message)}</div>`;return}let n=t.model&&!l(t.model);e.innerHTML=`
    <div class="card fr-form">
      <h3 style="margin:0">🤖 我的 AI 接入</h3>
      <label>Endpoint（https）<input id="fa-endpoint" name="ai-cfg-ep" autocomplete="off" value="${d(t.endpoint||``)}" placeholder="留空 = 使用站内通道"></label>
      <label>模型
        <select id="fa-model-sel">
          <option value="">默认（站内配置）</option>
          ${o.map(e=>`<option value="${e.id}" ${e.id===t.model?`selected`:``}>${d(e.name)}（${e.tier} · ¥${e.pin}/¥${e.pout}）</option>`).join(``)}
          <option value="__custom" ${n?`selected`:``}>自定义…</option>
        </select>
      </label>
      <input id="fa-model-custom" autocomplete="off" name="ai-cfg-model" style="display:${n?``:`none`}" value="${n?d(t.model):``}" placeholder="自定义模型 ID">
      <label>API Key <input id="fa-key" name="ai-cfg-key" type="password" autocomplete="new-password" placeholder="${t.has_key?`已保存（留空保持不变）`:`sk-...`}"></label>
      <div class="fr-note">${d(c(t))}</div>
      <button class="pl-btn primary big" id="fa-save">保存</button>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="pl-btn small" id="fa-test">⚡ 测试连接</button>
        <button class="pl-btn small danger" id="fa-clear">清除（回到站内通道）</button>
      </div>
      <div class="fr-note" id="fa-result"></div>
      <div class="fr-note">配置后，行程计划页的 AI 生成将走你自己的接口（OpenAI 兼容格式），不占用本站次数；密钥随账号保存在服务器，任何接口都不会回显明文。模型名旁的价格为 TokenHub 刊例快照（2026-10-27）。</div>
    </div>`;let r=()=>{let e=document.getElementById(`fa-model-sel`);return e.value===`__custom`?document.getElementById(`fa-model-custom`).value.trim():e.value};document.getElementById(`fa-model-sel`).onchange=e=>{document.getElementById(`fa-model-custom`).style.display=e.target.value===`__custom`?``:`none`},document.getElementById(`fa-save`).onclick=async()=>{try{await S(`ai_settings`,{endpoint:document.getElementById(`fa-endpoint`).value.trim(),model:r(),key:document.getElementById(`fa-key`).value}),w(`已保存 ✓`),E(e)}catch(e){w(`失败：`+e.message)}},document.getElementById(`fa-test`).onclick=async()=>{let e=document.getElementById(`fa-result`),t=document.getElementById(`fa-test`);t.disabled=!0,e.textContent=`测试中（真实调一次模型，约几秒）…`;try{let t=await S(`ai_test`,{endpoint:document.getElementById(`fa-endpoint`).value.trim(),model:r(),key:document.getElementById(`fa-key`).value});e.textContent=t.ok?`✓ 连通正常 · 延迟 ${(t.latency_ms/1e3).toFixed(1)}s · 模型 ${t.model} 回复：${t.preview||`（空）`}`:`✗ ${t.error||`测试失败`}`}catch(t){e.textContent=`✗ `+t.message}t.disabled=!1},document.getElementById(`fa-clear`).onclick=async()=>{try{await S(`ai_settings`,{endpoint:``}),w(`已清除`),E(e)}catch(e){w(`失败：`+e.message)}}}async function D(){u.innerHTML=`<div class="pl-empty">加载中…</div>`;try{[_,x,y]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),S(`my`,void 0,`GET`).catch(()=>({items:[]})),a().then(e=>e.getCheckins()).catch(()=>r())])}catch(e){u.innerHTML=`<div class="pl-empty">加载失败：${d(e.message)}<br><button class="pl-btn" id="fr-retry">重试</button></div>`,document.getElementById(`fr-retry`).onclick=()=>location.reload();return}v=await n(),_=t(_,v),x=x.items||[],O()}function O(){u.innerHTML=`
    <div class="fr-top">
      <span>你好，<b>${d(g?.name||``)}</b></span>
      <button class="pl-btn small" id="fr-out">退出</button>
    </div>
    <div class="fr-tabs">
      ${[[`photo`,`📷 传照片`],[`note`,`📝 写笔记`],[`checkin`,`📍 打卡`],[`fact`,`🛠 纠错`],[`mine`,`我的投稿 (${x.length})`],[`ai`,`🤖 AI 接入`]].map(([e,t])=>`<button class="fr-tab ${b===e?`on`:``}" data-tab="${e}">${t}</button>`).join(``)}
    </div>
    <div id="fr-body"></div>`,document.getElementById(`fr-out`).onclick=async()=>{try{await S(`logout`,{},`POST`)}catch{}C(),T()},u.querySelectorAll(`[data-tab]`).forEach(e=>e.onclick=()=>{b=e.dataset.tab,O()});let e=document.getElementById(`fr-body`);b===`photo`?A(e):b===`note`?j(e):b===`checkin`?M(e):b===`fact`?F(e):b===`ai`?E(e):I(e)}function k(e,t){let n=new Image;n.onload=()=>{let e=Math.min(1,1600/Math.max(n.width,n.height)),r=document.createElement(`canvas`);r.width=Math.round(n.width*e),r.height=Math.round(n.height*e),r.getContext(`2d`).drawImage(n,0,0,r.width,r.height),t(r.toDataURL(`image/jpeg`,.82)),URL.revokeObjectURL(n.src)},n.src=URL.createObjectURL(e)}function A(e){e.innerHTML=`
    <div class="card fr-form">
      <label>关联点位（可选）<input id="ph-point" list="pt-list" placeholder="输入点位名筛选…"></label>
      <datalist id="pt-list">${_.filter(e=>!e.pending).map(e=>`<option value="${d(e.name)}">`).join(``)}</datalist>
      <label>一句话说明 <input id="ph-title" placeholder="如：蜈支洲岛的玻璃海" maxlength="100"></label>
      <label>选择照片 <input id="ph-file" type="file" accept="image/*"></label>
      <div id="ph-preview"></div>
      <button class="pl-btn primary big" id="ph-send" disabled>提交审核</button>
      <div class="fr-note">照片会压缩至最长边 1600px 后提交，仅管理员可见，采纳后展示在相册</div>
    </div>`;let t=``;document.getElementById(`ph-file`).onchange=e=>{let n=e.target.files[0];n&&k(n,e=>{t=e,document.getElementById(`ph-preview`).innerHTML=`<img src="${t}" alt="">`,document.getElementById(`ph-send`).disabled=!1})},document.getElementById(`ph-send`).onclick=async()=>{let e=document.getElementById(`ph-send`);e.disabled=!0,e.textContent=`提交中…`;let n=m();try{let e=document.getElementById(`ph-point`).value.trim(),r=_.find(t=>t.name===e);await S(`submit`,{type:`photo`,title:document.getElementById(`ph-title`).value.trim(),pointId:r?r.id:``,dataUrl:t,idem:n}),w(`已提交，等待站长审核 ✓`),b=`mine`,D()}catch(t){w(`失败：`+t.message),e.disabled=!1,e.textContent=`提交审核`}}}function j(e){e.innerHTML=`
    <div class="card fr-form">
      <label>关联点位（可选）<input id="nt-point" list="pt-list2" placeholder="输入点位名…"></label>
      <datalist id="pt-list2">${_.filter(e=>!e.pending).map(e=>`<option value="${d(e.name)}">`).join(``)}</datalist>
      <label>标题 <input id="nt-title" placeholder="如：三亚潜水一日游" maxlength="100"></label>
      <label>正文（支持 Markdown）<textarea id="nt-body" rows="8" placeholder="# 标题&#10;记录今天的见闻…"></textarea></label>
      <button class="pl-btn primary big" id="nt-send">提交审核</button>
      <div class="fr-note">采纳后会作为旅行笔记展示在网站</div>
    </div>`,document.getElementById(`nt-send`).onclick=async()=>{let e=document.getElementById(`nt-point`).value.trim(),t=_.find(t=>t.name===e);try{await S(`submit`,{type:`note`,title:document.getElementById(`nt-title`).value.trim(),body:document.getElementById(`nt-body`).value,pointId:t?t.id:``,idem:m()}),w(`已提交，等待站长审核 ✓`),b=`mine`,D()}catch(e){w(`失败：`+e.message)}}}function M(e){let t=y||{};e.innerHTML=`
    <div class="card fr-form">
      <label>搜索点位 <input id="ck-q" placeholder="如：中央大街 / 红场"></label>
      <div id="ck-list" class="fr-cklist"></div>
      <div class="fr-note">提交后与站长的打卡清单合并（待审核）</div>
    </div>`;let n=document.getElementById(`ck-list`),r=e=>{let r=_.filter(t=>!t.pending&&(!e||t.name.toLowerCase().includes(e)||(t.name_en||``).toLowerCase().includes(e))).slice(0,30);n.innerHTML=r.map(e=>{let n=i(t,e.id);return`
      <div class="fr-ckrow">
        <span>${d(e.name)}</span>
        <button class="pl-btn small" data-ck="${d(e.id)}" ${n?`disabled`:``}>${n?`本站已打卡`:`提交打卡`}</button>
      </div>`}).join(``)||`<div class="fr-note">无匹配点位</div>`,n.querySelectorAll(`[data-ck]`).forEach(e=>e.onclick=async()=>{e.disabled=!0,e.textContent=`提交中…`;try{await S(`submit`,{type:`checkin`,pointId:e.dataset.ck,idem:m()}),w(`打卡已提交 ✓`),e.textContent=`已提交`}catch(t){w(`失败：`+t.message),e.disabled=!1,e.textContent=`提交打卡`}})};r(``),document.getElementById(`ck-q`).oninput=e=>r(e.target.value.trim().toLowerCase())}var N=[[`hours`,`营业时间`],[`ticket`,`门票`],[`rating`,`评分`],[`other`,`其他说明`]],P={hours:`hours`,ticket:`ticket`,rating:`rating`,other:`note`};function F(e){e.innerHTML=`
    <div class="card fr-form">
      <label>要纠错的点位 <input id="fc-point" list="pt-list3" placeholder="输入点位名筛选…" autocomplete="off"></label>
      <datalist id="pt-list3">${_.filter(e=>!e.pending).map(e=>`<option value="${d(e.name)}">`).join(``)}</datalist>
      <div class="fr-note" id="fc-current">选择点位后显示当前值</div>
      <label>要修改的字段
        <select id="fc-field">${N.map(([e,t])=>`<option value="${e}">${t}</option>`).join(``)}</select>
      </label>
      <label>更正后的值 <input id="fc-value" maxlength="200" placeholder="营业时间 09:00-18:00 / 门票 100元 / 评分 4.5"></label>
      <label>来源链接（与证据截图至少填一项）<input id="fc-src" type="url" maxlength="300" placeholder="https://…"></label>
      <label>证据截图（可选）<input id="fc-file" type="file" accept="image/*"></label>
      <div id="fc-preview"></div>
      <label>补充说明（可选）<textarea id="fc-body" rows="2" maxlength="500" placeholder="为什么需要修改…"></textarea></label>
      <button class="pl-btn primary big" id="fc-send">提交纠错</button>
      <div class="fr-note">审核通过后生成一条可应用变更（changeset），由工具合并进数据并保留前后值，可整批回滚。</div>
    </div>`;let t=``,n=()=>{let e=_.find(e=>e.name===document.getElementById(`fc-point`).value.trim()),t=document.getElementById(`fc-field`).value,n=document.getElementById(`fc-current`);if(!e){n.textContent=`选择点位后显示当前值`;return}let r=e[P[t]];n.textContent=`当前值：${r==null?`（数据里没有这个字段）`:String(r)}`};document.getElementById(`fc-point`).oninput=n,document.getElementById(`fc-field`).onchange=n,document.getElementById(`fc-file`).onchange=e=>{let n=e.target.files[0];n&&k(n,e=>{t=e,document.getElementById(`fc-preview`).innerHTML=`<img src="${t}" alt="">`})},document.getElementById(`fc-send`).onclick=async()=>{let e=_.find(e=>e.name===document.getElementById(`fc-point`).value.trim());if(!e)return w(`请从列表中选择点位`);let n=document.getElementById(`fc-send`);n.disabled=!0,n.textContent=`提交中…`;try{await S(`submit`,{type:`fact`,pointId:e.id,targetField:document.getElementById(`fc-field`).value,value:document.getElementById(`fc-value`).value.trim(),sourceUrl:document.getElementById(`fc-src`).value.trim(),evidence:t,body:document.getElementById(`fc-body`).value.trim(),idem:m()}),w(`纠错已提交，等待站长审核 ✓`),b=`mine`,D()}catch(e){w(`失败：`+e.message),n.disabled=!1,n.textContent=`提交纠错`}}}function I(e){let t={pending:`⏳ 待审核`,approved:`✅ 已采纳`,rejected:`❌ 未采纳`,needs_more:`💬 需补充`,removed:`🚫 已移除`},n={photo:`📷`,note:`📝`,checkin:`📍`,fact:`🛠`};e.innerHTML=x.length?`<div class="card"><div class="fr-mine">
    ${x.map(e=>`<div class="fr-mine-row">
      <span class="fr-mine-type">${n[e.type]||`•`}</span>
      <span class="fr-mine-title">${d(e.title||e.point_id||``)}</span>
      ${e.target_field?`<span class="ad-who">${d(e.target_field)} → ${d(e.new_value||``)}</span>`:``}
      <span class="fr-mine-st">${t[e.status]||e.status}</span>
      ${e.reason&&(e.status===`needs_more`||e.status===`rejected`)?`<span class="fr-note" style="margin-top:0">理由：${d(e.reason)}</span>`:``}
      ${e.status===`removed`?``:`<button class="pl-btn small" data-report="${e.id}">🚩 举报</button>`}
    </div>`).join(``)}
  </div></div>`:`<div class="pl-empty">还没有投稿<br><span>上传照片、写笔记、帮打卡或纠错</span></div>`,e.querySelectorAll(`[data-report]`).forEach(e=>e.onclick=()=>{let t=x.find(t=>t.id===+e.dataset.report);s({targetType:`submission`,targetId:e.dataset.report,label:t?.title||`投稿 #${e.dataset.report}`,submit:e=>S(`report`,e)})})}(async()=>{if(h)try{g=await S(`me`),D();return}catch{}T()})(),e();