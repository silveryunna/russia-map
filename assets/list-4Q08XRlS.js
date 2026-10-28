import"./base-BJw1lW7I.js";import{n as e,t}from"./sw-register-DDL0-JvC.js";import{n,r}from"./checkin-ChHhTLNU.js";var i=document.getElementById(`list-app`),a=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),o=[],s={cityColors:{},cities:[]},c={query:``,collapsed:new Set,tagFilter:new Set,checked:new Set(Object.keys(n()))},l=()=>o.filter(e=>!e.pending),u=()=>o.filter(e=>e.pending);function d(e){return!c.tagFilter.size||e.tags&&e.tags.some(e=>c.tagFilter.has(e))}function f(){let e=c.query.trim().toLowerCase(),t=l().filter(d);e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))));let n=new Map;for(let e of t){n.has(e.city)||n.set(e.city,new Map);let t=n.get(e.city);t.has(e.cluster)||t.set(e.cluster,[]),t.get(e.cluster).push(e)}return[...n.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}function p(){let e=c.query.trim().toLowerCase(),t=u().filter(d);return e?t.filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))):t}function m(){let e=l().filter(e=>c.checked.has(e.id)).length,t=l().length?Math.round(e/l().length*100):0,n=`
    <div class="list-summary">
      共 ${l().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${a(c.query)}">`,r=new Map;for(let e of l())for(let t of e.tags||[])r.set(t,(r.get(t)||0)+1);if(r.size){let e=[...r.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12);n+=`<div class="l-tags">${e.map(([e,t])=>`<button class="tag-chip${c.tagFilter.has(e)?` active`:``}" data-tag="${a(e)}" title="筛选标签（可叠加）">#${a(e)} ${t}</button>`).join(``)}</div>`}for(let{city:e,clusters:t}of f()){let r=s.cityColors[e]||`#546E7A`,i=`city:`+e,o=c.collapsed.has(i),l=t.reduce((e,t)=>e+t.points.length,0),u=t.reduce((e,t)=>e+t.points.filter(e=>c.checked.has(e.id)).length,0);if(n+=`
      <div class="l-city" data-toggle="${a(i)}">
        <span class="head-arrow">${o?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${r}"></span>${a(e)}
        <span class="head-count">（${u}/${l}）</span>
      </div>`,!o)for(let{cluster:r,points:i}of t){let t=e+`||`+r,o=c.collapsed.has(t),s=i.filter(e=>c.checked.has(e.id)).length;n+=`
        <div class="l-cluster" data-toggle="${a(t)}">
          <span class="head-arrow">${o?`▶`:`▼`}</span>${a(r)}
          <span class="head-count">（${s}/${i.length}）</span>
        </div>`,!o&&(n+=i.map(e=>{let t=c.checked.has(e.id);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${a(e.id)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${a(e.name)}</span>
            <span class="lp-sub">${e.confidence!=null&&e.confidence<100?`⚠ `:``}${a(e.type)} · ${a(e.highlight||``)}${e.tags&&e.tags.length?` · `+e.tags.map(e=>`#`+a(e)).join(` `):``}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}let o=p();if(o.length){let e=c.collapsed.has(`__pending`);n+=`
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${e?`▶`:`▼`}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${o.length}）</span>
      </div>`,e||(n+=o.map(e=>`
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${a(e.name)}</span>
            <span class="lp-sub">${a(e.city)} · ${a(e.type)}${e.highlight?` · `+a(e.highlight):``}</span>
          </span>
        </div>`).join(``))}i.innerHTML=n}i.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;c.query=e.target.value;let t=e.target.selectionStart;m();let n=i.querySelector(`.list-search`);n.focus(),n.setSelectionRange(t,t)}),i.addEventListener(`change`,e=>{let t=e.target.dataset?.check;if(!t)return;let i=n();r(i,t),c.checked=new Set(Object.keys(i)),m()}),i.addEventListener(`click`,e=>{let t=e.target.closest(`[data-tag]`);if(t){let e=t.dataset.tag;c.tagFilter.has(e)?c.tagFilter.delete(e):c.tagFilter.add(e),m();return}if(e.target.closest(`input,a`))return;let n=e.target.closest(`[data-toggle]`);if(!n)return;let r=n.dataset.toggle;c.collapsed.has(r)?c.collapsed.delete(r):c.collapsed.add(r),m()});async function h(){[o,s]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json())]),m()}h().catch(e=>{console.error(e),i.textContent=`⚠️ 加载失败，请刷新重试`}),t(),e();