import"./base-BJw1lW7I.js";import{a as e,i as t,n,r,t as i}from"./checkin-ChHhTLNU.js";import{t as a}from"./marked.esm-HaWzKJJ6.js";a.setOptions({gfm:!0,breaks:!0});var o=document.getElementById(`notes-app`),s=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),c=e=>({莫斯科:`俄罗斯`,"莫斯科州/近郊":`俄罗斯`,圣彼得堡:`俄罗斯`,叶卡捷琳堡:`俄罗斯`,阿拉木图:`哈萨克斯坦`,哈尔滨:`中国`,伊宁:`中国`,三亚:`中国`})[e]||`其他`,l={中国:0,俄罗斯:1,哈萨克斯坦:2,其他:3},u={中国:`🇨🇳`,俄罗斯:`🇷🇺`,哈萨克斯坦:`🇰🇿`,其他:`🌍`},d=[],f={cities:[],cityColors:{}},p=[],m=n(),h=new Set,g=``,_=null,v=null,y=()=>d.filter(e=>!e.pending),b=e=>i(m,e);function x(e){let t=2*Math.PI*34;return`<svg viewBox="0 0 84 84" class="ring">
    <circle cx="42" cy="42" r="34" class="ring-bg"/>
    <circle cx="42" cy="42" r="34" class="ring-fg" stroke-dasharray="${(e*t).toFixed(1)} ${t.toFixed(1)}"/>
    <text x="42" y="40" class="ring-num">${Math.round(e*100)}%</text>
    <text x="42" y="54" class="ring-lbl">完成度</text>
  </svg>`}function S(){let e=y(),n=e.filter(e=>b(e.id)),r=d.length-e.length,i=t(m),a={};for(let t of e){let e=c(t.city);a[e]=a[e]||{total:0,done:0},a[e].total++,b(t.id)&&a[e].done++}let o=Object.keys(a).sort((e,t)=>l[e]-l[t]);return`<section class="dash card">
    <div class="dash-top">
      ${x(e.length?n.length/e.length:0)}
      <div class="dash-nums">
        <div class="dn-row"><b>${e.length}</b><span>点位</span></div>
        <div class="dn-row"><b class="dn-done">${n.length}</b><span>已打卡</span></div>
        <div class="dn-row"><b>${i}</b><span>累计次数</span></div>
        <div class="dn-row"><b>${r}</b><span>待核</span></div>
      </div>
    </div>
    <div class="dash-countries">
      ${o.map(e=>`<span class="cc-chip">${u[e]} ${s(e)} <b>${a[e].done}</b>/${a[e].total}</span>`).join(``)}
    </div>
    <div class="dash-cities">
      ${[...f.cities].sort((e,t)=>{let n=l[c(e)],r=l[c(t)];return n===r?f.cities.indexOf(e)-f.cities.indexOf(t):n-r}).filter(t=>e.some(e=>e.city===t)).map(t=>{let n=e.filter(e=>e.city===t),r=n.filter(e=>b(e.id)).length,i=f.cityColors[t]||`#546E7A`;return`<div class="dc-row">
          <span class="dc-name">${s(t)}</span>
          <span class="dc-bar"><i style="width:${n.length?Math.round(r/n.length*100):0}%;background:${i}"></i></span>
          <span class="dc-num">${r}/${n.length}</span>
        </div>`}).join(``)}
    </div>
  </section>`}function C(){let e=y().filter(e=>!g||e.name.toLowerCase().includes(g)||(e.name_en||``).toLowerCase().includes(g)||e.type.includes(g)),t=new Map;for(let n of e)t.has(n.city)||t.set(n.city,[]),t.get(n.city).push(n);let n=[...t.keys()].sort((e,t)=>{let n=l[c(e)],r=l[c(t)];return n===r?f.cities.indexOf(e)-f.cities.indexOf(t):n-r}),r=`<section class="card">
    <div class="card-head"><h2>📍 打卡清单</h2>
      <input id="cl-search" class="cl-search" type="text" placeholder="筛选点位…" value="${s(g)}">
    </div>`;e.length||(r+=`<div class="empty">无匹配点位</div>`);for(let e of n){let n=t.get(e),i=n.filter(e=>b(e.id)).length,a=f.cityColors[e]||`#546E7A`,o=e,l=h.has(o);if(r+=`<div class="cl-city" data-toggle="${s(o)}">
      <span class="cl-arrow">${l?`▶`:`▼`}</span>
      <span class="cl-dot" style="background:${a}"></span>
      <span class="cl-name">${s(c(e))} · ${s(e)}</span>
      <span class="cl-count">${i}/${n.length}</span>
    </div>`,!l)for(let e of n){let t=b(e.id),n=m[e.id]||{},i=t?[n.last,n.n>1?`第 ${n.n} 次`:``,n.note].filter(Boolean).join(` · `):``;r+=`<label class="cl-row${t?` done`:``}">
        <input type="checkbox" data-check="${s(e.id)}" ${t?`checked`:``} style="accent-color:${a}">
        <span class="cl-pname">${s(e.name)}${i?`<span class="cl-ckinfo">${s(i)}</span>`:``}</span>
        <span class="cl-ptype">${s(e.type)}</span>
        ${t?`<button class="cl-edit" data-edit="${s(e.id)}" title="记录日期 / 次数 / 感想">✎</button>`:``}
      </label>`,v===e.id&&(r+=`<div class="cl-editor" data-editor="${s(e.id)}">
        <label>日期 <input type="date" data-f="last" value="${s(n.last||new Date().toISOString().slice(0,10))}"></label>
        <label>第几次 <input type="number" data-f="n" min="1" max="99" value="${n.n||1}"></label>
        <label>一句话感想 <input type="text" data-f="note" maxlength="100" placeholder="如：夕阳下的红场" value="${s(n.note||``)}"></label>
        <div class="cl-editor-ops">
          <button class="cl-save" data-save="${s(e.id)}">保存</button>
          <button class="cl-cancel" data-cancel>取消</button>
        </div>
      </div>`)}}return r+`</section>`}function w(e){let t=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),n={},r=e;if(t){r=e.slice(t[0].length);for(let e of t[1].split(/\r?\n/)){let t=e.match(/^([\w一-龥]+):\s*(.*)$/);t&&(n[t[1].trim()]=t[2].trim())}}return{meta:n,html:a.parse(r)}}function T(){let e=`<section class="card">
    <div class="card-head"><h2>📝 旅行笔记</h2><span class="nh-count">${p.length} 篇</span></div>`;p.length||(e+=`<div class="empty">还没有笔记</div>`);for(let t of p){let n=_===t.file;e+=`<article class="note${n?` open`:``}" data-note="${s(t.file)}">
      <div class="note-head">
        <span class="note-title">${s(t.title)}</span>
        <span class="note-date">${s(t.date||``)}</span>
      </div>
      ${t.summary?`<div class="note-summary">${s(t.summary)}</div>`:``}
      ${n?`<div class="note-body"></div>`:``}
    </article>`}return e+`</section>`}function E(){o.innerHTML=S()+C()+T();let e=document.getElementById(`cl-search`);if(e&&e.addEventListener(`input`,()=>{g=e.value.trim().toLowerCase();let t=e.selectionStart;E();let n=document.getElementById(`cl-search`);n&&(n.focus(),n.setSelectionRange(t,t))}),_){let e=o.querySelector(`.note.open .note-body`);e&&!e.dataset.loaded&&(e.dataset.loaded=`1`,fetch(`./content/notes/${encodeURIComponent(_)}.md`).then(e=>e.text()).then(t=>{let{meta:n,html:r}=w(t),i=r.replace(/<img\s/gi,`<img loading="lazy" onerror="this.style.display='none'" `);e.innerHTML=`<div class="md">${i}</div><div class="note-meta">${s(n.location||``)}</div>`}))}}o.addEventListener(`click`,t=>{let n=t.target.closest(`[data-edit]`);if(n){t.preventDefault();let e=n.dataset.edit;v=v===e?null:e,E();return}if(t.target.closest(`[data-cancel]`)){v=null,E();return}let r=t.target.closest(`[data-save]`);if(r){let t=r.dataset.save,n=o.querySelector(`[data-editor="${CSS.escape(t)}"]`),i=e=>n?.querySelector(`[data-f="${e}"]`)?.value??``;e(m,t,{last:i(`last`),n:i(`n`),note:i(`note`)}),v=null,E();return}let i=t.target.closest(`[data-toggle]`);if(i){let e=i.dataset.toggle;h.has(e)?h.delete(e):h.add(e),E();return}let a=t.target.closest(`[data-note]`);if(a&&!t.target.closest(`a`)){_=_===a.dataset.note?null:a.dataset.note,E(),_&&document.querySelector(`[data-note="${CSS.escape(_)}"]`)?.scrollIntoView({behavior:`smooth`,block:`start`});return}}),o.addEventListener(`change`,e=>{let t=e.target.closest(`input[data-check]`);t&&(r(m,t.dataset.check),v&&v!==t.dataset.check&&(v=null),E())}),(async()=>{let[e,t,n]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.ok?e.json():[])]);d=e,f=t,p=n,E()})().catch(e=>{o.innerHTML=`<div class="empty">⚠️ 加载失败：${s(e.message)}</div>`});