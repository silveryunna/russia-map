import{t as e}from"./sw-register-CGfnD3s9.js";import{t}from"./icp-footer-Crs5Jn1v.js";import{t as n}from"./repository-C3nTwTXy.js";import{t as r}from"./degraded-banner-BBIUUDrt.js";import{t as i}from"./data-safety-BZz0DD6l.js";var a=`#546570`,o=document.getElementById(`list-app`),s=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),c=[],l={cityColors:{},cities:[]},u=null,d={query:``,collapsed:new Set,tagFilter:new Set,checked:new Set},f=()=>c.filter(e=>!e.pending),p=()=>c.filter(e=>e.pending);function m(e){return!d.tagFilter.size||e.tags&&e.tags.some(e=>d.tagFilter.has(e))}function h(){let e=d.query.trim().toLowerCase(),t=f().filter(m);e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))));let n=new Map;for(let e of t){n.has(e.city)||n.set(e.city,new Map);let t=n.get(e.city);t.has(e.cluster)||t.set(e.cluster,[]),t.get(e.cluster).push(e)}return[...n.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}function g(){let e=d.query.trim().toLowerCase(),t=p().filter(m);return e?t.filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))):t}function _(){let e=f().filter(e=>d.checked.has(e.id)).length,t=f().length?Math.round(e/f().length*100):0,n=`
    <div class="list-summary">
      共 ${f().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${s(d.query)}">`,r=new Map;for(let e of f())for(let t of e.tags||[])r.set(t,(r.get(t)||0)+1);if(r.size){let e=[...r.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12);n+=`<div class="l-tags">${e.map(([e,t])=>`<button class="tag-chip${d.tagFilter.has(e)?` active`:``}" data-tag="${s(e)}" title="筛选标签（可叠加）">#${s(e)} ${t}</button>`).join(``)}</div>`}for(let{city:e,clusters:t}of h()){let r=l.cityColors[e]||a,i=`city:`+e,o=d.collapsed.has(i),c=t.reduce((e,t)=>e+t.points.length,0),u=t.reduce((e,t)=>e+t.points.filter(e=>d.checked.has(e.id)).length,0);if(n+=`
      <div class="l-city" data-toggle="${s(i)}">
        <span class="head-arrow">${o?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${r}"></span>${s(e)}
        <span class="head-count">（${u}/${c}）</span>
      </div>`,!o)for(let{cluster:r,points:i}of t){let t=e+`||`+r,a=d.collapsed.has(t),o=i.filter(e=>d.checked.has(e.id)).length;n+=`
        <div class="l-cluster" data-toggle="${s(t)}">
          <span class="head-arrow">${a?`▶`:`▼`}</span>${s(r)}
          <span class="head-count">（${o}/${i.length}）</span>
        </div>`,!a&&(n+=i.map(e=>{let t=d.checked.has(e.id);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${s(e.id)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${s(e.name)}</span>
            <span class="lp-sub">${e.confidence!=null&&e.confidence<100?`⚠ `:``}${s(e.type)} · ${s(e.highlight||``)}${e.tags&&e.tags.length?` · `+e.tags.map(e=>`#`+s(e)).join(` `):``}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}let i=g();if(i.length){let e=d.collapsed.has(`__pending`);n+=`
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${e?`▶`:`▼`}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${i.length}）</span>
      </div>`,e||(n+=i.map(e=>`
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${s(e.name)}</span>
            <span class="lp-sub">${s(e.city)} · ${s(e.type)}${e.highlight?` · `+s(e.highlight):``}</span>
          </span>
        </div>`).join(``))}o.innerHTML=n}o.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;d.query=e.target.value;let t=e.target.selectionStart;_();let n=o.querySelector(`.list-search`);n.focus(),n.setSelectionRange(t,t)}),o.addEventListener(`change`,async e=>{let t=e.target.dataset?.check;if(t&&u){try{await u.toggle(t)}catch{}d.checked=new Set(Object.keys(u.getCheckins())),_()}}),o.addEventListener(`click`,e=>{let t=e.target.closest(`[data-tag]`);if(t){let e=t.dataset.tag;d.tagFilter.has(e)?d.tagFilter.delete(e):d.tagFilter.add(e),_();return}if(e.target.closest(`input,a`))return;let n=e.target.closest(`[data-toggle]`);if(!n)return;let r=n.dataset.toggle;d.collapsed.has(r)?d.collapsed.delete(r):d.collapsed.add(r),_()});async function v(){[u,c,l]=await Promise.all([n({onChange:e=>{d.checked=new Set(Object.keys(e)),c.length&&_()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json())]),d.checked=new Set(Object.keys(u.getCheckins())),u.degraded?r(`IndexedDB 不可用，打卡改动只会留在内存、刷新即丢；请关闭隐私模式或检查浏览器存储权限`):i({store:u.store}).catch(()=>{}),_()}v().catch(e=>{console.error(e),o.textContent=`⚠️ 加载失败，请刷新重试`}),e(),t();