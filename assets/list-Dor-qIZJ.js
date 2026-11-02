import"./base-BJw1lW7I.js";import{t as e}from"./icp-footer-Crs5Jn1v.js";import{t}from"./sw-register-Buwh9M9Z.js";import{t as n}from"./repository-S4n7XRWx.js";import{t as r}from"./degraded-banner-xQ4k_aEb.js";var i=document.getElementById(`list-app`),a=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),o=[],s={cityColors:{},cities:[]},c=null,l={query:``,collapsed:new Set,tagFilter:new Set,checked:new Set},u=()=>o.filter(e=>!e.pending),d=()=>o.filter(e=>e.pending);function f(e){return!l.tagFilter.size||e.tags&&e.tags.some(e=>l.tagFilter.has(e))}function p(){let e=l.query.trim().toLowerCase(),t=u().filter(f);e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))));let n=new Map;for(let e of t){n.has(e.city)||n.set(e.city,new Map);let t=n.get(e.city);t.has(e.cluster)||t.set(e.cluster,[]),t.get(e.cluster).push(e)}return[...n.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}function m(){let e=l.query.trim().toLowerCase(),t=d().filter(f);return e?t.filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))):t}function h(){let e=u().filter(e=>l.checked.has(e.id)).length,t=u().length?Math.round(e/u().length*100):0,n=`
    <div class="list-summary">
      共 ${u().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${a(l.query)}">`,r=new Map;for(let e of u())for(let t of e.tags||[])r.set(t,(r.get(t)||0)+1);if(r.size){let e=[...r.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12);n+=`<div class="l-tags">${e.map(([e,t])=>`<button class="tag-chip${l.tagFilter.has(e)?` active`:``}" data-tag="${a(e)}" title="筛选标签（可叠加）">#${a(e)} ${t}</button>`).join(``)}</div>`}for(let{city:e,clusters:t}of p()){let r=s.cityColors[e]||`#546E7A`,i=`city:`+e,o=l.collapsed.has(i),c=t.reduce((e,t)=>e+t.points.length,0),u=t.reduce((e,t)=>e+t.points.filter(e=>l.checked.has(e.id)).length,0);if(n+=`
      <div class="l-city" data-toggle="${a(i)}">
        <span class="head-arrow">${o?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${r}"></span>${a(e)}
        <span class="head-count">（${u}/${c}）</span>
      </div>`,!o)for(let{cluster:r,points:i}of t){let t=e+`||`+r,o=l.collapsed.has(t),s=i.filter(e=>l.checked.has(e.id)).length;n+=`
        <div class="l-cluster" data-toggle="${a(t)}">
          <span class="head-arrow">${o?`▶`:`▼`}</span>${a(r)}
          <span class="head-count">（${s}/${i.length}）</span>
        </div>`,!o&&(n+=i.map(e=>{let t=l.checked.has(e.id);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${a(e.id)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${a(e.name)}</span>
            <span class="lp-sub">${e.confidence!=null&&e.confidence<100?`⚠ `:``}${a(e.type)} · ${a(e.highlight||``)}${e.tags&&e.tags.length?` · `+e.tags.map(e=>`#`+a(e)).join(` `):``}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}let o=m();if(o.length){let e=l.collapsed.has(`__pending`);n+=`
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
        </div>`).join(``))}i.innerHTML=n}i.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;l.query=e.target.value;let t=e.target.selectionStart;h();let n=i.querySelector(`.list-search`);n.focus(),n.setSelectionRange(t,t)}),i.addEventListener(`change`,async e=>{let t=e.target.dataset?.check;t&&c&&(await c.toggle(t),l.checked=new Set(Object.keys(c.getCheckins())),h())}),i.addEventListener(`click`,e=>{let t=e.target.closest(`[data-tag]`);if(t){let e=t.dataset.tag;l.tagFilter.has(e)?l.tagFilter.delete(e):l.tagFilter.add(e),h();return}if(e.target.closest(`input,a`))return;let n=e.target.closest(`[data-toggle]`);if(!n)return;let r=n.dataset.toggle;l.collapsed.has(r)?l.collapsed.delete(r):l.collapsed.add(r),h()});async function g(){[c,o,s]=await Promise.all([n({onChange:e=>{l.checked=new Set(Object.keys(e)),o.length&&h()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json())]),l.checked=new Set(Object.keys(c.getCheckins())),c.degraded&&r(`IndexedDB 不可用，打卡改动只会留在内存、刷新即丢；请关闭隐私模式或检查浏览器存储权限`),h()}g().catch(e=>{console.error(e),i.textContent=`⚠️ 加载失败，请刷新重试`}),t(),e();