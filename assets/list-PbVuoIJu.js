import"./base-CLrNf-fO.js";import{t as e}from"./icp-footer-Crs5Jn1v.js";import{t}from"./sw-register-Buwh9M9Z.js";import{t as n}from"./repository-BNydOybX.js";import{t as r}from"./degraded-banner-xQ4k_aEb.js";var i=`#546570`,a=document.getElementById(`list-app`),o=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),s=[],c={cityColors:{},cities:[]},l=null,u={query:``,collapsed:new Set,tagFilter:new Set,checked:new Set},d=()=>s.filter(e=>!e.pending),f=()=>s.filter(e=>e.pending);function p(e){return!u.tagFilter.size||e.tags&&e.tags.some(e=>u.tagFilter.has(e))}function m(){let e=u.query.trim().toLowerCase(),t=d().filter(p);e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))));let n=new Map;for(let e of t){n.has(e.city)||n.set(e.city,new Map);let t=n.get(e.city);t.has(e.cluster)||t.set(e.cluster,[]),t.get(e.cluster).push(e)}return[...n.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}function h(){let e=u.query.trim().toLowerCase(),t=f().filter(p);return e?t.filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))):t}function g(){let e=d().filter(e=>u.checked.has(e.id)).length,t=d().length?Math.round(e/d().length*100):0,n=`
    <div class="list-summary">
      共 ${d().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${o(u.query)}">`,r=new Map;for(let e of d())for(let t of e.tags||[])r.set(t,(r.get(t)||0)+1);if(r.size){let e=[...r.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12);n+=`<div class="l-tags">${e.map(([e,t])=>`<button class="tag-chip${u.tagFilter.has(e)?` active`:``}" data-tag="${o(e)}" title="筛选标签（可叠加）">#${o(e)} ${t}</button>`).join(``)}</div>`}for(let{city:e,clusters:t}of m()){let r=c.cityColors[e]||i,a=`city:`+e,s=u.collapsed.has(a),l=t.reduce((e,t)=>e+t.points.length,0),d=t.reduce((e,t)=>e+t.points.filter(e=>u.checked.has(e.id)).length,0);if(n+=`
      <div class="l-city" data-toggle="${o(a)}">
        <span class="head-arrow">${s?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${r}"></span>${o(e)}
        <span class="head-count">（${d}/${l}）</span>
      </div>`,!s)for(let{cluster:r,points:i}of t){let t=e+`||`+r,a=u.collapsed.has(t),s=i.filter(e=>u.checked.has(e.id)).length;n+=`
        <div class="l-cluster" data-toggle="${o(t)}">
          <span class="head-arrow">${a?`▶`:`▼`}</span>${o(r)}
          <span class="head-count">（${s}/${i.length}）</span>
        </div>`,!a&&(n+=i.map(e=>{let t=u.checked.has(e.id);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${o(e.id)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${o(e.name)}</span>
            <span class="lp-sub">${e.confidence!=null&&e.confidence<100?`⚠ `:``}${o(e.type)} · ${o(e.highlight||``)}${e.tags&&e.tags.length?` · `+e.tags.map(e=>`#`+o(e)).join(` `):``}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}let s=h();if(s.length){let e=u.collapsed.has(`__pending`);n+=`
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${e?`▶`:`▼`}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${s.length}）</span>
      </div>`,e||(n+=s.map(e=>`
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${o(e.name)}</span>
            <span class="lp-sub">${o(e.city)} · ${o(e.type)}${e.highlight?` · `+o(e.highlight):``}</span>
          </span>
        </div>`).join(``))}a.innerHTML=n}a.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;u.query=e.target.value;let t=e.target.selectionStart;g();let n=a.querySelector(`.list-search`);n.focus(),n.setSelectionRange(t,t)}),a.addEventListener(`change`,async e=>{let t=e.target.dataset?.check;t&&l&&(await l.toggle(t),u.checked=new Set(Object.keys(l.getCheckins())),g())}),a.addEventListener(`click`,e=>{let t=e.target.closest(`[data-tag]`);if(t){let e=t.dataset.tag;u.tagFilter.has(e)?u.tagFilter.delete(e):u.tagFilter.add(e),g();return}if(e.target.closest(`input,a`))return;let n=e.target.closest(`[data-toggle]`);if(!n)return;let r=n.dataset.toggle;u.collapsed.has(r)?u.collapsed.delete(r):u.collapsed.add(r),g()});async function _(){[l,s,c]=await Promise.all([n({onChange:e=>{u.checked=new Set(Object.keys(e)),s.length&&g()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json())]),u.checked=new Set(Object.keys(l.getCheckins())),l.degraded&&r(`IndexedDB 不可用，打卡改动只会留在内存、刷新即丢；请关闭隐私模式或检查浏览器存储权限`),g()}_().catch(e=>{console.error(e),a.textContent=`⚠️ 加载失败，请刷新重试`}),t(),e();