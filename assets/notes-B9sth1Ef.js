import{t as e}from"./sw-register-CGfnD3s9.js";import{a as t,r as n}from"./checkin-CXOSYQp4.js";import{t as r}from"./repository-C3nTwTXy.js";import{t as i}from"./degraded-banner-BBIUUDrt.js";import{t as a}from"./data-safety-BZz0DD6l.js";import{t as o}from"./markdown-DRaKq2fB.js";var s=document.getElementById(`notes-app`),c=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),l=e=>({莫斯科:`俄罗斯`,"莫斯科州/近郊":`俄罗斯`,圣彼得堡:`俄罗斯`,叶卡捷琳堡:`俄罗斯`,阿拉木图:`哈萨克斯坦`,哈尔滨:`中国`,伊宁:`中国`,三亚:`中国`})[e]||`其他`,u={中国:0,俄罗斯:1,哈萨克斯坦:2,其他:3},d={中国:`🇨🇳`,俄罗斯:`🇷🇺`,哈萨克斯坦:`🇰🇿`,其他:`🌍`},f=[],p={cities:[],cityColors:{}},m=[],h=null,g={},_=new Set,v=``,y=null,b=null,x=()=>f.filter(e=>!e.pending),S=e=>n(g,e);function C(e){let t=2*Math.PI*34;return`<svg viewBox="0 0 84 84" class="ring">
    <circle cx="42" cy="42" r="34" class="ring-bg"/>
    <circle cx="42" cy="42" r="34" class="ring-fg" stroke-dasharray="${(e*t).toFixed(1)} ${t.toFixed(1)}"/>
    <text x="42" y="40" class="ring-num">${Math.round(e*100)}%</text>
    <text x="42" y="54" class="ring-lbl">完成度</text>
  </svg>`}function w(){let e=x(),n=e.filter(e=>S(e.id)),r=f.length-e.length,i=t(g),a={};for(let t of e){let e=l(t.city);a[e]=a[e]||{total:0,done:0},a[e].total++,S(t.id)&&a[e].done++}let o=Object.keys(a).sort((e,t)=>u[e]-u[t]);return`<section class="dash card">
    <div class="dash-top">
      ${C(e.length?n.length/e.length:0)}
      <div class="dash-nums">
        <div class="dn-row"><b>${e.length}</b><span>点位</span></div>
        <div class="dn-row"><b class="dn-done">${n.length}</b><span>已打卡</span></div>
        <div class="dn-row"><b>${i}</b><span>累计次数</span></div>
        <div class="dn-row"><b>${r}</b><span>待核</span></div>
      </div>
    </div>
    <div class="dash-countries">
      ${o.map(e=>`<span class="cc-chip">${d[e]} ${c(e)} <b>${a[e].done}</b>/${a[e].total}</span>`).join(``)}
    </div>
    <div class="dash-cities">
      ${[...p.cities].sort((e,t)=>{let n=u[l(e)],r=u[l(t)];return n===r?p.cities.indexOf(e)-p.cities.indexOf(t):n-r}).filter(t=>e.some(e=>e.city===t)).map(t=>{let n=e.filter(e=>e.city===t),r=n.filter(e=>S(e.id)).length,i=p.cityColors[t]||`#546E7A`;return`<div class="dc-row">
          <span class="dc-name">${c(t)}</span>
          <span class="dc-bar"><i style="width:${n.length?Math.round(r/n.length*100):0}%;background:${i}"></i></span>
          <span class="dc-num">${r}/${n.length}</span>
        </div>`}).join(``)}
    </div>
  </section>`}function T(){let e=x().filter(e=>!v||e.name.toLowerCase().includes(v)||(e.name_en||``).toLowerCase().includes(v)||e.type.includes(v)),t=new Map;for(let n of e)t.has(n.city)||t.set(n.city,[]),t.get(n.city).push(n);let n=[...t.keys()].sort((e,t)=>{let n=u[l(e)],r=u[l(t)];return n===r?p.cities.indexOf(e)-p.cities.indexOf(t):n-r}),r=`<section class="card">
    <div class="card-head"><h2>📍 打卡清单</h2>
      <input id="cl-search" class="cl-search" type="text" placeholder="筛选点位…" value="${c(v)}">
    </div>`;e.length||(r+=`<div class="empty">无匹配点位</div>`);for(let e of n){let n=t.get(e),i=n.filter(e=>S(e.id)).length,a=p.cityColors[e]||`#546E7A`,o=e,s=_.has(o);if(r+=`<div class="cl-city" data-toggle="${c(o)}">
      <span class="cl-arrow">${s?`▶`:`▼`}</span>
      <span class="cl-dot" style="background:${a}"></span>
      <span class="cl-name">${c(l(e))} · ${c(e)}</span>
      <span class="cl-count">${i}/${n.length}</span>
    </div>`,!s)for(let e of n){let t=S(e.id),n=g[e.id]||{},i=t?[n.last,n.n>1?`第 ${n.n} 次`:``,n.note].filter(Boolean).join(` · `):``;r+=`<label class="cl-row${t?` done`:``}">
        <input type="checkbox" data-check="${c(e.id)}" ${t?`checked`:``} style="accent-color:${a}">
        <span class="cl-pname">${c(e.name)}${i?`<span class="cl-ckinfo">${c(i)}</span>`:``}</span>
        <span class="cl-ptype">${c(e.type)}</span>
        ${t?`<button class="cl-edit" data-edit="${c(e.id)}" title="记录日期 / 次数 / 感想">✎</button>`:``}
      </label>`,b===e.id&&(r+=`<div class="cl-editor" data-editor="${c(e.id)}">
        <label>日期 <input type="date" data-f="last" value="${c(n.last||new Date().toISOString().slice(0,10))}"></label>
        <label>第几次 <input type="number" data-f="n" min="1" max="99" value="${n.n||1}"></label>
        <label>一句话感想 <input type="text" data-f="note" maxlength="100" placeholder="如：夕阳下的红场" value="${c(n.note||``)}"></label>
        <div class="cl-editor-ops">
          <button class="cl-save" data-save="${c(e.id)}">保存</button>
          <button class="cl-cancel" data-cancel>取消</button>
        </div>
      </div>`)}}return r+`</section>`}function E(e){let t=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),n={},r=e;if(t){r=e.slice(t[0].length);for(let e of t[1].split(/\r?\n/)){let t=e.match(/^([\w一-龥]+):\s*(.*)$/);t&&(n[t[1].trim()]=t[2].trim())}}return{meta:n,html:o(r)}}function D(){let e=`<section class="card">
    <div class="card-head"><h2>📝 旅行笔记</h2><span class="nh-count">${m.length} 篇</span></div>`;m.length||(e+=`<div class="empty">还没有笔记</div>`);for(let t of m){let n=y===t.file;e+=`<article class="note${n?` open`:``}" data-note="${c(t.file)}">
      <div class="note-head">
        <span class="note-title">${c(t.title)}</span>
        <span class="note-date">${c(t.date||``)}</span>
      </div>
      ${t.summary?`<div class="note-summary">${c(t.summary)}</div>`:``}
      ${n?`<div class="note-body"></div>`:``}
    </article>`}return e+`</section>`}function O(){s.innerHTML=w()+T()+D();let e=document.getElementById(`cl-search`);if(e&&e.addEventListener(`input`,()=>{v=e.value.trim().toLowerCase();let t=e.selectionStart;O();let n=document.getElementById(`cl-search`);n&&(n.focus(),n.setSelectionRange(t,t))}),y){let e=s.querySelector(`.note.open .note-body`);e&&!e.dataset.loaded&&(e.dataset.loaded=`1`,fetch(`./content/notes/${encodeURIComponent(y)}.md`).then(e=>e.text()).then(t=>{let{meta:n,html:r}=E(t);e.innerHTML=`<div class="md">${r}</div><div class="note-meta">${c(n.location||``)}</div>`,e.querySelectorAll(`.md img`).forEach(e=>{e.addEventListener(`error`,()=>{e.style.display=`none`},{once:!0})})}))}}s.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-edit]`);if(t){e.preventDefault();let n=t.dataset.edit;b=b===n?null:n,O();return}if(e.target.closest(`[data-cancel]`)){b=null,O();return}let n=e.target.closest(`[data-save]`);if(n){let e=n.dataset.save,t=s.querySelector(`[data-editor="${CSS.escape(e)}"]`),r=e=>t?.querySelector(`[data-f="${e}"]`)?.value??``;try{g=await h.update(e,{last:r(`last`),n:r(`n`),note:r(`note`)})}catch{g=h.getCheckins()}b=null,O();return}let r=e.target.closest(`[data-toggle]`);if(r){let e=r.dataset.toggle;_.has(e)?_.delete(e):_.add(e),O();return}let i=e.target.closest(`[data-note]`);if(i&&!e.target.closest(`a`)){y=y===i.dataset.note?null:i.dataset.note,O(),y&&document.querySelector(`[data-note="${CSS.escape(y)}"]`)?.scrollIntoView({behavior:`smooth`,block:`start`});return}}),s.addEventListener(`change`,async e=>{let t=e.target.closest(`input[data-check]`);if(t&&h){try{await h.toggle(t.dataset.check)}catch{}g=h.getCheckins(),b&&b!==t.dataset.check&&(b=null),O()}}),(async()=>{let[e,t,n,o]=await Promise.all([r({onChange:e=>{g=e,f.length&&O()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.ok?e.json():[])]);h=e,g=h.getCheckins(),f=t,p=n,m=o,O(),e.degraded?i(`IndexedDB 不可用，打卡改动只会留在内存、刷新即丢；请关闭隐私模式或检查浏览器存储权限`):a({store:e.store}).catch(()=>{})})().catch(e=>{s.innerHTML=`<div class="empty">⚠️ 加载失败：${c(e.message)}</div>`}),e();