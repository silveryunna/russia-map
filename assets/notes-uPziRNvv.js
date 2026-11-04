import{t as e}from"./sw-register-slL7fN2v.js";import{a as t,r as n}from"./checkin-CXOSYQp4.js";import{t as r}from"./local-date-DMb6oAfl.js";import{t as i}from"./repository-J-vaQOLh.js";import{n as a,t as o}from"./degraded-banner-DEOLr7E-.js";import{t as s}from"./data-safety-B_kegElk.js";import{t as c}from"./markdown-DRaKq2fB.js";var l=document.getElementById(`notes-app`),u=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),d=e=>({莫斯科:`俄罗斯`,"莫斯科州/近郊":`俄罗斯`,圣彼得堡:`俄罗斯`,叶卡捷琳堡:`俄罗斯`,阿拉木图:`哈萨克斯坦`,哈尔滨:`中国`,伊宁:`中国`,三亚:`中国`})[e]||`其他`,f={中国:0,俄罗斯:1,哈萨克斯坦:2,其他:3},p={中国:`🇨🇳`,俄罗斯:`🇷🇺`,哈萨克斯坦:`🇰🇿`,其他:`🌍`},m=[],h={cities:[],cityColors:{}},g=[],_=null,v={},y=new Set,b=``,x=null,S=null,C=()=>m.filter(e=>!e.pending),w=e=>n(v,e);function T(e){let t=2*Math.PI*34;return`<svg viewBox="0 0 84 84" class="ring">
    <circle cx="42" cy="42" r="34" class="ring-bg"/>
    <circle cx="42" cy="42" r="34" class="ring-fg" stroke-dasharray="${(e*t).toFixed(1)} ${t.toFixed(1)}"/>
    <text x="42" y="40" class="ring-num">${Math.round(e*100)}%</text>
    <text x="42" y="54" class="ring-lbl">完成度</text>
  </svg>`}function E(){let e=C(),n=e.filter(e=>w(e.id)),r=m.length-e.length,i=t(v),a={};for(let t of e){let e=d(t.city);a[e]=a[e]||{total:0,done:0},a[e].total++,w(t.id)&&a[e].done++}let o=Object.keys(a).sort((e,t)=>f[e]-f[t]);return`<section class="dash card">
    <div class="dash-top">
      ${T(e.length?n.length/e.length:0)}
      <div class="dash-nums">
        <div class="dn-row"><b>${e.length}</b><span>点位</span></div>
        <div class="dn-row"><b class="dn-done">${n.length}</b><span>已打卡</span></div>
        <div class="dn-row"><b>${i}</b><span>累计次数</span></div>
        <div class="dn-row"><b>${r}</b><span>待核</span></div>
      </div>
    </div>
    <div class="dash-countries">
      ${o.map(e=>`<span class="cc-chip">${p[e]} ${u(e)} <b>${a[e].done}</b>/${a[e].total}</span>`).join(``)}
    </div>
    <div class="dash-cities">
      ${[...h.cities].sort((e,t)=>{let n=f[d(e)],r=f[d(t)];return n===r?h.cities.indexOf(e)-h.cities.indexOf(t):n-r}).filter(t=>e.some(e=>e.city===t)).map(t=>{let n=e.filter(e=>e.city===t),r=n.filter(e=>w(e.id)).length,i=h.cityColors[t]||`#546E7A`;return`<div class="dc-row">
          <span class="dc-name">${u(t)}</span>
          <span class="dc-bar"><i style="width:${n.length?Math.round(r/n.length*100):0}%;background:${i}"></i></span>
          <span class="dc-num">${r}/${n.length}</span>
        </div>`}).join(``)}
    </div>
  </section>`}function D(){let e=C().filter(e=>!b||e.name.toLowerCase().includes(b)||(e.name_en||``).toLowerCase().includes(b)||e.type.includes(b)),t=new Map;for(let n of e)t.has(n.city)||t.set(n.city,[]),t.get(n.city).push(n);let n=[...t.keys()].sort((e,t)=>{let n=f[d(e)],r=f[d(t)];return n===r?h.cities.indexOf(e)-h.cities.indexOf(t):n-r}),i=`<section class="card">
    <div class="card-head"><h2>📍 打卡清单</h2>
      <input id="cl-search" class="cl-search" type="text" placeholder="筛选点位…" value="${u(b)}">
    </div>`;e.length||(i+=`<div class="empty">无匹配点位</div>`);for(let e of n){let n=t.get(e),a=n.filter(e=>w(e.id)).length,o=h.cityColors[e]||`#546E7A`,s=e,c=y.has(s);if(i+=`<div class="cl-city" data-toggle="${u(s)}">
      <span class="cl-arrow">${c?`▶`:`▼`}</span>
      <span class="cl-dot" style="background:${o}"></span>
      <span class="cl-name">${u(d(e))} · ${u(e)}</span>
      <span class="cl-count">${a}/${n.length}</span>
    </div>`,!c)for(let e of n){let t=w(e.id),n=v[e.id]||{},a=t?[n.last,n.n>1?`第 ${n.n} 次`:``,n.note].filter(Boolean).join(` · `):``;i+=`<label class="cl-row${t?` done`:``}">
        <input type="checkbox" data-check="${u(e.id)}" ${t?`checked`:``} style="accent-color:${o}">
        <span class="cl-pname">${u(e.name)}${a?`<span class="cl-ckinfo">${u(a)}</span>`:``}</span>
        <span class="cl-ptype">${u(e.type)}</span>
        ${t?`<button class="cl-edit" data-edit="${u(e.id)}" title="记录日期 / 次数 / 感想">✎</button>`:``}
      </label>`,S===e.id&&(i+=`<div class="cl-editor" data-editor="${u(e.id)}">
        <label>日期 <input type="date" data-f="last" value="${u(n.last||r())}"></label>
        <label>第几次 <input type="number" data-f="n" min="1" max="99" value="${n.n||1}"></label>
        <label>一句话感想 <input type="text" data-f="note" maxlength="100" placeholder="如：夕阳下的红场" value="${u(n.note||``)}"></label>
        <div class="cl-editor-ops">
          <button class="cl-save" data-save="${u(e.id)}">保存</button>
          <button class="cl-cancel" data-cancel>取消</button>
        </div>
      </div>`)}}return i+`</section>`}function O(e){let t=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),n={},r=e;if(t){r=e.slice(t[0].length);for(let e of t[1].split(/\r?\n/)){let t=e.match(/^([\w一-龥]+):\s*(.*)$/);t&&(n[t[1].trim()]=t[2].trim())}}return{meta:n,html:c(r)}}function k(){let e=`<section class="card">
    <div class="card-head"><h2>📝 旅行笔记</h2><span class="nh-count">${g.length} 篇</span></div>`;g.length||(e+=`<div class="empty">还没有笔记</div>`);for(let t of g){let n=x===t.file;e+=`<article class="note${n?` open`:``}" data-note="${u(t.file)}">
      <div class="note-head">
        <span class="note-title">${u(t.title)}</span>
        <span class="note-date">${u(t.date||``)}</span>
      </div>
      ${t.summary?`<div class="note-summary">${u(t.summary)}</div>`:``}
      ${n?`<div class="note-body"></div>`:``}
    </article>`}return e+`</section>`}function A(){l.innerHTML=E()+D()+k();let e=document.getElementById(`cl-search`);if(e&&e.addEventListener(`input`,()=>{b=e.value.trim().toLowerCase();let t=e.selectionStart;A();let n=document.getElementById(`cl-search`);n&&(n.focus(),n.setSelectionRange(t,t))}),x){let e=l.querySelector(`.note.open .note-body`);e&&!e.dataset.loaded&&(e.dataset.loaded=`1`,fetch(`./content/notes/${encodeURIComponent(x)}.md`).then(e=>e.text()).then(t=>{let{meta:n,html:r}=O(t);e.innerHTML=`<div class="md">${r}</div><div class="note-meta">${u(n.location||``)}</div>`,e.querySelectorAll(`.md img`).forEach(e=>{e.addEventListener(`error`,()=>{e.style.display=`none`},{once:!0})})}))}}l.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-edit]`);if(t){e.preventDefault();let n=t.dataset.edit;S=S===n?null:n,A();return}if(e.target.closest(`[data-cancel]`)){S=null,A();return}let n=e.target.closest(`[data-save]`);if(n){let e=n.dataset.save,t=l.querySelector(`[data-editor="${CSS.escape(e)}"]`),r=e=>t?.querySelector(`[data-f="${e}"]`)?.value??``;try{v=await _.update(e,{last:r(`last`),n:r(`n`),note:r(`note`)})}catch{v=_.getCheckins()}S=null,A();return}let r=e.target.closest(`[data-toggle]`);if(r){let e=r.dataset.toggle;y.has(e)?y.delete(e):y.add(e),A();return}let i=e.target.closest(`[data-note]`);if(i&&!e.target.closest(`a`)){x=x===i.dataset.note?null:i.dataset.note,A(),x&&document.querySelector(`[data-note="${CSS.escape(x)}"]`)?.scrollIntoView({behavior:`smooth`,block:`start`});return}}),l.addEventListener(`change`,async e=>{let t=e.target.closest(`input[data-check]`);if(!t||!_)return;let n=!1;try{n=await _.toggle(t.dataset.check)}catch{}v=_.getCheckins(),S&&S!==t.dataset.check&&(S=null),A(),!n&&_.undoable()&&a(`已取消该点位打卡`,()=>_.undoDelete())}),(async()=>{let[e,t,n,r]=await Promise.all([i({onChange:e=>{v=e,m.length&&A()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.ok?e.json():[])]);_=e,v=_.getCheckins(),m=t,h=n,g=r,A(),e.degraded?o(`IndexedDB 不可用，打卡改动只会留在内存、刷新即丢；请关闭隐私模式或检查浏览器存储权限`):s({store:e.store}).catch(()=>{})})().catch(e=>{l.innerHTML=`<div class="empty">⚠️ 加载失败：${u(e.message)}</div>`}),e();