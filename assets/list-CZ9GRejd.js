import"./base-BJw1lW7I.js";import{n as e,t}from"./sw-register-DJuU55yn.js";var n=`travel-checkin-v1`,r=document.getElementById(`list-app`),i=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),a=[],o={cityColors:{},cities:[]},s={query:``,collapsed:new Set,tagFilter:new Set,checked:new Set(JSON.parse(localStorage.getItem(n)||`[]`))},c=()=>a.filter(e=>!e.pending),l=()=>a.filter(e=>e.pending);function u(e){return!s.tagFilter.size||e.tags&&e.tags.some(e=>s.tagFilter.has(e))}function d(){let e=s.query.trim().toLowerCase(),t=c().filter(u);e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))));let n=new Map;for(let e of t){n.has(e.city)||n.set(e.city,new Map);let t=n.get(e.city);t.has(e.cluster)||t.set(e.cluster,[]),t.get(e.cluster).push(e)}return[...n.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}function f(){let e=s.query.trim().toLowerCase(),t=l().filter(u);return e?t.filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))):t}function p(){let e=c().filter(e=>s.checked.has(e.id)).length,t=c().length?Math.round(e/c().length*100):0,n=`
    <div class="list-summary">
      共 ${c().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${i(s.query)}">`,a=new Map;for(let e of c())for(let t of e.tags||[])a.set(t,(a.get(t)||0)+1);if(a.size){let e=[...a.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12);n+=`<div class="l-tags">${e.map(([e,t])=>`<button class="tag-chip${s.tagFilter.has(e)?` active`:``}" data-tag="${i(e)}" title="筛选标签（可叠加）">#${i(e)} ${t}</button>`).join(``)}</div>`}for(let{city:e,clusters:t}of d()){let r=o.cityColors[e]||`#546E7A`,a=`city:`+e,c=s.collapsed.has(a),l=t.reduce((e,t)=>e+t.points.length,0),u=t.reduce((e,t)=>e+t.points.filter(e=>s.checked.has(e.id)).length,0);if(n+=`
      <div class="l-city" data-toggle="${i(a)}">
        <span class="head-arrow">${c?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${r}"></span>${i(e)}
        <span class="head-count">（${u}/${l}）</span>
      </div>`,!c)for(let{cluster:r,points:a}of t){let t=e+`||`+r,o=s.collapsed.has(t),c=a.filter(e=>s.checked.has(e.id)).length;n+=`
        <div class="l-cluster" data-toggle="${i(t)}">
          <span class="head-arrow">${o?`▶`:`▼`}</span>${i(r)}
          <span class="head-count">（${c}/${a.length}）</span>
        </div>`,!o&&(n+=a.map(e=>{let t=s.checked.has(e.id);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${i(e.id)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${i(e.name)}</span>
            <span class="lp-sub">${e.confidence!=null&&e.confidence<100?`⚠ `:``}${i(e.type)} · ${i(e.highlight||``)}${e.tags&&e.tags.length?` · `+e.tags.map(e=>`#`+i(e)).join(` `):``}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}let l=f();if(l.length){let e=s.collapsed.has(`__pending`);n+=`
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${e?`▶`:`▼`}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${l.length}）</span>
      </div>`,e||(n+=l.map(e=>`
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${i(e.name)}</span>
            <span class="lp-sub">${i(e.city)} · ${i(e.type)}${e.highlight?` · `+i(e.highlight):``}</span>
          </span>
        </div>`).join(``))}r.innerHTML=n}r.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;s.query=e.target.value;let t=e.target.selectionStart;p();let n=r.querySelector(`.list-search`);n.focus(),n.setSelectionRange(t,t)}),r.addEventListener(`change`,e=>{let t=e.target.dataset?.check;t&&(s.checked.has(t)?s.checked.delete(t):s.checked.add(t),localStorage.setItem(n,JSON.stringify([...s.checked])),p())}),r.addEventListener(`click`,e=>{let t=e.target.closest(`[data-tag]`);if(t){let e=t.dataset.tag;s.tagFilter.has(e)?s.tagFilter.delete(e):s.tagFilter.add(e),p();return}if(e.target.closest(`input,a`))return;let n=e.target.closest(`[data-toggle]`);if(!n)return;let r=n.dataset.toggle;s.collapsed.has(r)?s.collapsed.delete(r):s.collapsed.add(r),p()});async function m(){[a,o]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json())]),p()}m().catch(e=>{console.error(e),r.textContent=`⚠️ 加载失败，请刷新重试`}),t(),e();