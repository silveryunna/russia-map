import"./base-BJw1lW7I.js";import{i as e,r as t}from"./checkin-44ePzKVA.js";import{t as n}from"./repository-Ca4uC0Jv.js";import{i as r,t as i}from"./ai-models-BHqtacC4.js";/* empty css             */var a=document.getElementById(`friend-app`),o=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),s=`friend-token`,c=`./api/index.php`,l=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2),u=localStorage.getItem(s)||``,d=null,f=[],p={},m=`photo`,h=[];async function g(e,t,n=`POST`){let r=await fetch(`${c}?a=${e}`,{method:n,headers:{"Content-Type":`application/json; charset=utf-8`,...u?{Authorization:`Bearer ${u}`}:{}},body:t?JSON.stringify(t):void 0}),i=await r.json().catch(()=>({error:`响应解析失败`}));if(r.status===401)throw _(),Error(i.error||`登录已过期`);if(i.error)throw Error(i.error);return i}function _(){localStorage.removeItem(s),u=``,d=null}function v(e){let t=document.createElement(`div`);t.className=`plan-toast`,t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add(`show`),20),setTimeout(()=>{t.classList.remove(`show`),setTimeout(()=>t.remove(),400)},3200)}function y(){a.innerHTML=`
    <div class="fr-login card">
      <h2>👋 朋友投稿入口</h2>
      <p class="fr-tip">向站长领取账号后登录，可以传照片、写游记、帮同行打卡</p>
      <label>账号 <input id="fr-user" autocomplete="username"></label>
      <label>密码 <input id="fr-pass" type="password" autocomplete="current-password"></label>
      <button class="pl-btn primary big" id="fr-login">登录</button>
      <div class="fr-err" id="fr-err"></div>
    </div>`,document.getElementById(`fr-login`).onclick=async()=>{let e=document.getElementById(`fr-err`);e.textContent=``;try{let e=await(await fetch(`${c}?a=login`,{method:`POST`,headers:{"Content-Type":`application/json; charset=utf-8`},body:JSON.stringify({user:document.getElementById(`fr-user`).value.trim(),pass:document.getElementById(`fr-pass`).value})})).json();if(e.error)throw Error(e.error);u=e.token,localStorage.setItem(s,u),d=e,x()}catch(t){e.textContent=t.message}}}async function b(e){e.innerHTML=`<div class="pl-empty">加载中…</div>`;let t={endpoint:``,model:``,has_key:!1};try{t=await g(`ai_settings`,void 0,`GET`)}catch(t){e.innerHTML=`<div class="pl-empty">加载失败：${o(t.message)}</div>`;return}let n=t.model&&!r(t.model);e.innerHTML=`
    <div class="card fr-form">
      <h3 style="margin:0">🤖 我的 AI 接入</h3>
      <label>Endpoint（https）<input id="fa-endpoint" name="ai-cfg-ep" autocomplete="off" value="${o(t.endpoint||``)}" placeholder="留空 = 使用站内通道"></label>
      <label>模型
        <select id="fa-model-sel">
          <option value="">默认（站内配置）</option>
          ${i.map(e=>`<option value="${e.id}" ${e.id===t.model?`selected`:``}>${o(e.name)}（${e.tier} · ¥${e.pin}/¥${e.pout}）</option>`).join(``)}
          <option value="__custom" ${n?`selected`:``}>自定义…</option>
        </select>
      </label>
      <input id="fa-model-custom" autocomplete="off" name="ai-cfg-model" style="display:${n?``:`none`}" value="${n?o(t.model):``}" placeholder="自定义模型 ID">
      <label>API Key <input id="fa-key" name="ai-cfg-key" type="password" autocomplete="new-password" placeholder="${t.has_key?`已保存（留空保持不变）`:`sk-...`}"></label>
      <button class="pl-btn primary big" id="fa-save">保存</button>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="pl-btn small" id="fa-test">⚡ 测试连接</button>
        <button class="pl-btn small danger" id="fa-clear">清除（回到站内通道）</button>
      </div>
      <div class="fr-note" id="fa-result"></div>
      <div class="fr-note">配置后，行程计划页的 AI 生成将走你自己的接口（OpenAI 兼容格式），不占用本站次数；密钥随账号保存在服务器，任何接口都不会回显明文。模型名旁的价格为 TokenHub 刊例快照（2026-10-27）。</div>
    </div>`;let a=()=>{let e=document.getElementById(`fa-model-sel`);return e.value===`__custom`?document.getElementById(`fa-model-custom`).value.trim():e.value};document.getElementById(`fa-model-sel`).onchange=e=>{document.getElementById(`fa-model-custom`).style.display=e.target.value===`__custom`?``:`none`},document.getElementById(`fa-save`).onclick=async()=>{try{await g(`ai_settings`,{endpoint:document.getElementById(`fa-endpoint`).value.trim(),model:a(),key:document.getElementById(`fa-key`).value}),v(`已保存 ✓`),b(e)}catch(e){v(`失败：`+e.message)}},document.getElementById(`fa-test`).onclick=async()=>{let e=document.getElementById(`fa-result`),t=document.getElementById(`fa-test`);t.disabled=!0,e.textContent=`测试中（真实调一次模型，约几秒）…`;try{let t=await g(`ai_test`,{endpoint:document.getElementById(`fa-endpoint`).value.trim(),model:a(),key:document.getElementById(`fa-key`).value});e.textContent=t.ok?`✓ 连通正常 · 延迟 ${(t.latency_ms/1e3).toFixed(1)}s · 模型 ${t.model} 回复：${t.preview||`（空）`}`:`✗ ${t.error||`测试失败`}`}catch(t){e.textContent=`✗ `+t.message}t.disabled=!1},document.getElementById(`fa-clear`).onclick=async()=>{try{await g(`ai_settings`,{endpoint:``}),v(`已清除`),b(e)}catch(e){v(`失败：`+e.message)}}}async function x(){a.innerHTML=`<div class="pl-empty">加载中…</div>`;try{[f,h,p]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),g(`my`,void 0,`GET`).catch(()=>({items:[]})),n().then(e=>e.getCheckins()).catch(()=>e())])}catch(e){a.innerHTML=`<div class="pl-empty">加载失败：${o(e.message)}<br><button class="pl-btn" id="fr-retry">重试</button></div>`,document.getElementById(`fr-retry`).onclick=()=>location.reload();return}h=h.items||[],S()}function S(){a.innerHTML=`
    <div class="fr-top">
      <span>你好，<b>${o(d?.name||``)}</b></span>
      <button class="pl-btn small" id="fr-out">退出</button>
    </div>
    <div class="fr-tabs">
      ${[[`photo`,`📷 传照片`],[`note`,`📝 写笔记`],[`checkin`,`📍 打卡`],[`mine`,`我的投稿 (${h.length})`],[`ai`,`🤖 AI 接入`]].map(([e,t])=>`<button class="fr-tab ${m===e?`on`:``}" data-tab="${e}">${t}</button>`).join(``)}
    </div>
    <div id="fr-body"></div>`,document.getElementById(`fr-out`).onclick=async()=>{try{await g(`logout`,{},`POST`)}catch{}_(),y()},a.querySelectorAll(`[data-tab]`).forEach(e=>e.onclick=()=>{m=e.dataset.tab,S()});let e=document.getElementById(`fr-body`);m===`photo`?C(e):m===`note`?w(e):m===`checkin`?T(e):m===`ai`?b(e):E(e)}function C(e){e.innerHTML=`
    <div class="card fr-form">
      <label>关联点位（可选）<input id="ph-point" list="pt-list" placeholder="输入点位名筛选…"></label>
      <datalist id="pt-list">${f.filter(e=>!e.pending).map(e=>`<option value="${o(e.name)}">`).join(``)}</datalist>
      <label>一句话说明 <input id="ph-title" placeholder="如：蜈支洲岛的玻璃海" maxlength="100"></label>
      <label>选择照片 <input id="ph-file" type="file" accept="image/*"></label>
      <div id="ph-preview"></div>
      <button class="pl-btn primary big" id="ph-send" disabled>提交审核</button>
      <div class="fr-note">照片会压缩至最长边 1600px 后提交，仅管理员可见，采纳后展示在相册</div>
    </div>`;let t=``;document.getElementById(`ph-file`).onchange=e=>{let n=e.target.files[0];if(!n)return;let r=new Image;r.onload=()=>{let e=Math.min(1,1600/Math.max(r.width,r.height)),n=document.createElement(`canvas`);n.width=Math.round(r.width*e),n.height=Math.round(r.height*e),n.getContext(`2d`).drawImage(r,0,0,n.width,n.height),t=n.toDataURL(`image/jpeg`,.82),document.getElementById(`ph-preview`).innerHTML=`<img src="${t}" alt="">`,document.getElementById(`ph-send`).disabled=!1,URL.revokeObjectURL(r.src)},r.src=URL.createObjectURL(n)},document.getElementById(`ph-send`).onclick=async()=>{let e=document.getElementById(`ph-send`);e.disabled=!0,e.textContent=`提交中…`;let n=l();try{let e=document.getElementById(`ph-point`).value.trim(),r=f.find(t=>t.name===e);await g(`submit`,{type:`photo`,title:document.getElementById(`ph-title`).value.trim(),pointId:r?r.id:``,dataUrl:t,idem:n}),v(`已提交，等待站长审核 ✓`),m=`mine`,x()}catch(t){v(`失败：`+t.message),e.disabled=!1,e.textContent=`提交审核`}}}function w(e){e.innerHTML=`
    <div class="card fr-form">
      <label>关联点位（可选）<input id="nt-point" list="pt-list2" placeholder="输入点位名…"></label>
      <datalist id="pt-list2">${f.filter(e=>!e.pending).map(e=>`<option value="${o(e.name)}">`).join(``)}</datalist>
      <label>标题 <input id="nt-title" placeholder="如：三亚潜水一日游" maxlength="100"></label>
      <label>正文（支持 Markdown）<textarea id="nt-body" rows="8" placeholder="# 标题&#10;记录今天的见闻…"></textarea></label>
      <button class="pl-btn primary big" id="nt-send">提交审核</button>
      <div class="fr-note">采纳后会作为旅行笔记展示在网站</div>
    </div>`,document.getElementById(`nt-send`).onclick=async()=>{let e=document.getElementById(`nt-point`).value.trim(),t=f.find(t=>t.name===e);try{await g(`submit`,{type:`note`,title:document.getElementById(`nt-title`).value.trim(),body:document.getElementById(`nt-body`).value,pointId:t?t.id:``,idem:l()}),v(`已提交，等待站长审核 ✓`),m=`mine`,x()}catch(e){v(`失败：`+e.message)}}}function T(e){let n=p||{};e.innerHTML=`
    <div class="card fr-form">
      <label>搜索点位 <input id="ck-q" placeholder="如：中央大街 / 红场"></label>
      <div id="ck-list" class="fr-cklist"></div>
      <div class="fr-note">提交后与站长的打卡清单合并（待审核）</div>
    </div>`;let r=document.getElementById(`ck-list`),i=e=>{let i=f.filter(t=>!t.pending&&(!e||t.name.toLowerCase().includes(e)||(t.name_en||``).toLowerCase().includes(e))).slice(0,30);r.innerHTML=i.map(e=>{let r=t(n,e.id);return`
      <div class="fr-ckrow">
        <span>${o(e.name)}</span>
        <button class="pl-btn small" data-ck="${o(e.id)}" ${r?`disabled`:``}>${r?`本站已打卡`:`提交打卡`}</button>
      </div>`}).join(``)||`<div class="fr-note">无匹配点位</div>`,r.querySelectorAll(`[data-ck]`).forEach(e=>e.onclick=async()=>{e.disabled=!0,e.textContent=`提交中…`;try{await g(`submit`,{type:`checkin`,pointId:e.dataset.ck,idem:l()}),v(`打卡已提交 ✓`),e.textContent=`已提交`}catch(t){v(`失败：`+t.message),e.disabled=!1,e.textContent=`提交打卡`}})};i(``),document.getElementById(`ck-q`).oninput=e=>i(e.target.value.trim().toLowerCase())}function E(e){let t={pending:`⏳ 待审核`,approved:`✅ 已采纳`,rejected:`❌ 未采纳`};e.innerHTML=h.length?`<div class="card"><div class="fr-mine">
    ${h.map(e=>`<div class="fr-mine-row">
      <span class="fr-mine-type">${{photo:`📷`,note:`📝`,checkin:`📍`}[e.type]||`•`}</span>
      <span class="fr-mine-title">${o(e.title||e.point_id||``)}</span>
      <span class="fr-mine-st">${t[e.status]||e.status}</span>
    </div>`).join(``)}
  </div></div>`:`<div class="pl-empty">还没有投稿<br><span>上传照片、写笔记或帮打卡</span></div>`}(async()=>{if(u)try{d=await g(`me`),x();return}catch{}y()})();