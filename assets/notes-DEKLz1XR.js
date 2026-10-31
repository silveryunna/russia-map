import"./base-BJw1lW7I.js";import{a as e,r as t}from"./checkin-44ePzKVA.js";import{t as n}from"./repository-Ca4uC0Jv.js";import{t as r}from"./marked.esm-HaWzKJJ6.js";r.setOptions({gfm:!0,breaks:!0});var i=document.getElementById(`notes-app`),a=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),o=e=>({莫斯科:`俄罗斯`,"莫斯科州/近郊":`俄罗斯`,圣彼得堡:`俄罗斯`,叶卡捷琳堡:`俄罗斯`,阿拉木图:`哈萨克斯坦`,哈尔滨:`中国`,伊宁:`中国`,三亚:`中国`})[e]||`其他`,s={中国:0,俄罗斯:1,哈萨克斯坦:2,其他:3},c={中国:`🇨🇳`,俄罗斯:`🇷🇺`,哈萨克斯坦:`🇰🇿`,其他:`🌍`},l=[],u={cities:[],cityColors:{}},d=[],f=null,p={},m=new Set,h=``,g=null,_=null,v=()=>l.filter(e=>!e.pending),y=e=>t(p,e);function b(e){let t=2*Math.PI*34;return`<svg viewBox="0 0 84 84" class="ring">
    <circle cx="42" cy="42" r="34" class="ring-bg"/>
    <circle cx="42" cy="42" r="34" class="ring-fg" stroke-dasharray="${(e*t).toFixed(1)} ${t.toFixed(1)}"/>
    <text x="42" y="40" class="ring-num">${Math.round(e*100)}%</text>
    <text x="42" y="54" class="ring-lbl">完成度</text>
  </svg>`}function x(){let t=v(),n=t.filter(e=>y(e.id)),r=l.length-t.length,i=e(p),d={};for(let e of t){let t=o(e.city);d[t]=d[t]||{total:0,done:0},d[t].total++,y(e.id)&&d[t].done++}let f=Object.keys(d).sort((e,t)=>s[e]-s[t]);return`<section class="dash card">
    <div class="dash-top">
      ${b(t.length?n.length/t.length:0)}
      <div class="dash-nums">
        <div class="dn-row"><b>${t.length}</b><span>点位</span></div>
        <div class="dn-row"><b class="dn-done">${n.length}</b><span>已打卡</span></div>
        <div class="dn-row"><b>${i}</b><span>累计次数</span></div>
        <div class="dn-row"><b>${r}</b><span>待核</span></div>
      </div>
    </div>
    <div class="dash-countries">
      ${f.map(e=>`<span class="cc-chip">${c[e]} ${a(e)} <b>${d[e].done}</b>/${d[e].total}</span>`).join(``)}
    </div>
    <div class="dash-cities">
      ${[...u.cities].sort((e,t)=>{let n=s[o(e)],r=s[o(t)];return n===r?u.cities.indexOf(e)-u.cities.indexOf(t):n-r}).filter(e=>t.some(t=>t.city===e)).map(e=>{let n=t.filter(t=>t.city===e),r=n.filter(e=>y(e.id)).length,i=u.cityColors[e]||`#546E7A`;return`<div class="dc-row">
          <span class="dc-name">${a(e)}</span>
          <span class="dc-bar"><i style="width:${n.length?Math.round(r/n.length*100):0}%;background:${i}"></i></span>
          <span class="dc-num">${r}/${n.length}</span>
        </div>`}).join(``)}
    </div>
  </section>`}function S(){let e=v().filter(e=>!h||e.name.toLowerCase().includes(h)||(e.name_en||``).toLowerCase().includes(h)||e.type.includes(h)),t=new Map;for(let n of e)t.has(n.city)||t.set(n.city,[]),t.get(n.city).push(n);let n=[...t.keys()].sort((e,t)=>{let n=s[o(e)],r=s[o(t)];return n===r?u.cities.indexOf(e)-u.cities.indexOf(t):n-r}),r=`<section class="card">
    <div class="card-head"><h2>📍 打卡清单</h2>
      <input id="cl-search" class="cl-search" type="text" placeholder="筛选点位…" value="${a(h)}">
    </div>`;e.length||(r+=`<div class="empty">无匹配点位</div>`);for(let e of n){let n=t.get(e),i=n.filter(e=>y(e.id)).length,s=u.cityColors[e]||`#546E7A`,c=e,l=m.has(c);if(r+=`<div class="cl-city" data-toggle="${a(c)}">
      <span class="cl-arrow">${l?`▶`:`▼`}</span>
      <span class="cl-dot" style="background:${s}"></span>
      <span class="cl-name">${a(o(e))} · ${a(e)}</span>
      <span class="cl-count">${i}/${n.length}</span>
    </div>`,!l)for(let e of n){let t=y(e.id),n=p[e.id]||{},i=t?[n.last,n.n>1?`第 ${n.n} 次`:``,n.note].filter(Boolean).join(` · `):``;r+=`<label class="cl-row${t?` done`:``}">
        <input type="checkbox" data-check="${a(e.id)}" ${t?`checked`:``} style="accent-color:${s}">
        <span class="cl-pname">${a(e.name)}${i?`<span class="cl-ckinfo">${a(i)}</span>`:``}</span>
        <span class="cl-ptype">${a(e.type)}</span>
        ${t?`<button class="cl-edit" data-edit="${a(e.id)}" title="记录日期 / 次数 / 感想">✎</button>`:``}
      </label>`,_===e.id&&(r+=`<div class="cl-editor" data-editor="${a(e.id)}">
        <label>日期 <input type="date" data-f="last" value="${a(n.last||new Date().toISOString().slice(0,10))}"></label>
        <label>第几次 <input type="number" data-f="n" min="1" max="99" value="${n.n||1}"></label>
        <label>一句话感想 <input type="text" data-f="note" maxlength="100" placeholder="如：夕阳下的红场" value="${a(n.note||``)}"></label>
        <div class="cl-editor-ops">
          <button class="cl-save" data-save="${a(e.id)}">保存</button>
          <button class="cl-cancel" data-cancel>取消</button>
        </div>
      </div>`)}}return r+`</section>`}function C(e){let t=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),n={},i=e;if(t){i=e.slice(t[0].length);for(let e of t[1].split(/\r?\n/)){let t=e.match(/^([\w一-龥]+):\s*(.*)$/);t&&(n[t[1].trim()]=t[2].trim())}}return{meta:n,html:r.parse(i)}}function w(){let e=`<section class="card">
    <div class="card-head"><h2>📝 旅行笔记</h2><span class="nh-count">${d.length} 篇</span></div>`;d.length||(e+=`<div class="empty">还没有笔记</div>`);for(let t of d){let n=g===t.file;e+=`<article class="note${n?` open`:``}" data-note="${a(t.file)}">
      <div class="note-head">
        <span class="note-title">${a(t.title)}</span>
        <span class="note-date">${a(t.date||``)}</span>
      </div>
      ${t.summary?`<div class="note-summary">${a(t.summary)}</div>`:``}
      ${n?`<div class="note-body"></div>`:``}
    </article>`}return e+`</section>`}function T(){i.innerHTML=x()+S()+w();let e=document.getElementById(`cl-search`);if(e&&e.addEventListener(`input`,()=>{h=e.value.trim().toLowerCase();let t=e.selectionStart;T();let n=document.getElementById(`cl-search`);n&&(n.focus(),n.setSelectionRange(t,t))}),g){let e=i.querySelector(`.note.open .note-body`);e&&!e.dataset.loaded&&(e.dataset.loaded=`1`,fetch(`./content/notes/${encodeURIComponent(g)}.md`).then(e=>e.text()).then(t=>{let{meta:n,html:r}=C(t),i=r.replace(/<img\s/gi,`<img loading="lazy" onerror="this.style.display='none'" `);e.innerHTML=`<div class="md">${i}</div><div class="note-meta">${a(n.location||``)}</div>`}))}}i.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-edit]`);if(t){e.preventDefault();let n=t.dataset.edit;_=_===n?null:n,T();return}if(e.target.closest(`[data-cancel]`)){_=null,T();return}let n=e.target.closest(`[data-save]`);if(n){let e=n.dataset.save,t=i.querySelector(`[data-editor="${CSS.escape(e)}"]`),r=e=>t?.querySelector(`[data-f="${e}"]`)?.value??``;p=await f.update(e,{last:r(`last`),n:r(`n`),note:r(`note`)}),_=null,T();return}let r=e.target.closest(`[data-toggle]`);if(r){let e=r.dataset.toggle;m.has(e)?m.delete(e):m.add(e),T();return}let a=e.target.closest(`[data-note]`);if(a&&!e.target.closest(`a`)){g=g===a.dataset.note?null:a.dataset.note,T(),g&&document.querySelector(`[data-note="${CSS.escape(g)}"]`)?.scrollIntoView({behavior:`smooth`,block:`start`});return}}),i.addEventListener(`change`,async e=>{let t=e.target.closest(`input[data-check]`);t&&f&&(await f.toggle(t.dataset.check),p=f.getCheckins(),_&&_!==t.dataset.check&&(_=null),T())}),(async()=>{let[e,t,r,i]=await Promise.all([n({onChange:e=>{p=e,l.length&&T()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.ok?e.json():[])]);f=e,p=f.getCheckins(),l=t,u=r,d=i,T()})().catch(e=>{i.innerHTML=`<div class="empty">⚠️ 加载失败：${a(e.message)}</div>`});