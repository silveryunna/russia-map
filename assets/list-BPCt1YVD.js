import{t as e}from"./sw-register-slL7fN2v.js";import{t}from"./icp-footer-Crs5Jn1v.js";import{a as n,i as r,n as i,r as a}from"./regions-B1YHvA7W.js";import{t as o}from"./repository-J-vaQOLh.js";import{t as s}from"./shortcuts-Dwg1N52X.js";import{n as c,t as l}from"./degraded-banner-DEOLr7E-.js";import{t as u}from"./data-safety-B_kegElk.js";import{t as d}from"./share-B9T0n3LD.js";var f=`#546570`,p=document.getElementById(`list-app`),m=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),h=[],g={cityColors:{},cities:[]},_=null,v=null,y={query:``,collapsed:new Set,tagFilter:new Set,checked:new Set,region:``},b=()=>h.filter(e=>!e.pending),x=()=>h.filter(e=>e.pending);function S(e){return!y.tagFilter.size||e.tags&&e.tags.some(e=>y.tagFilter.has(e))}function C(){let e=y.query.trim().toLowerCase(),t=b().filter(S);return y.region&&(t=t.filter(e=>a(e,_)===y.region)),e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e)))),t}function w(){let e=new Map;for(let t of C()){let n=a(t,_);e.has(n)||e.set(n,new Map);let r=e.get(n);r.has(t.city)||r.set(t.city,new Map);let i=r.get(t.city);i.has(t.cluster)||i.set(t.cluster,[]),i.get(t.cluster).push(t)}let t=(_&&_.regions?_.regions:[]).map(e=>e.id),n=e=>{let t=_&&_.byId?_.byId.get(e):null;return t&&t.name||(e===_?.fallback?`其他`:e||`未分区`)};return[...e.entries()].sort((e,n)=>{let r=t.indexOf(e[0]),i=t.indexOf(n[0]);return(r<0?99:r)-(i<0?99:i)}).map(([e,t])=>({id:e,name:n(e),cities:[...t.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}))}function T(){let e=y.query.trim().toLowerCase(),t=x().filter(S);return y.region&&(t=t.filter(e=>a(e,_)===y.region)),e?t.filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)||(t.tags||[]).some(t=>t.toLowerCase().includes(e))):t}function E(){let e=b().filter(e=>y.checked.has(e.id)).length,t=b().length?Math.round(e/b().length*100):0,n=`
    <div class="list-summary">
      共 ${b().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>`,i=`<input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市 / 标签…" value="${m(y.query)}">`,a=new Map;for(let e of b())for(let t of e.tags||[])a.set(t,(a.get(t)||0)+1);if(a.size){let e=[...a.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12);i+=`<div class="l-tags">${e.map(([e,t])=>`<button class="tag-chip${y.tagFilter.has(e)?` active`:``}" data-tag="${m(e)}" title="筛选标签（可叠加）">#${m(e)} ${t}</button>`).join(``)}</div>`}let o=r(h,_,e=>y.checked.has(e));o.length>1&&(i+=`<div class="l-region-stats">${o.map(e=>`
      <button class="region-chip${y.region===e.id?` active`:``}" data-region="${m(e.id)}" title="只看该板块">
        <b>${m(e.name)}</b><span>${e.total} 个 · 已打卡 ${e.checked} · ${e.coverage}%</span>
      </button>`).join(``)}${y.region?`<button class="region-chip clear" data-region="">显示全部</button>`:``}</div>`);for(let{id:e,name:t,cities:n}of w()){let r=`region:`+e,a=y.collapsed.has(r),o=n.reduce((e,t)=>e+t.clusters.reduce((e,t)=>e+t.points.length,0),0),s=n.reduce((e,t)=>e+t.clusters.reduce((e,t)=>e+t.points.filter(e=>y.checked.has(e.id)).length,0),0);if(i+=`
      <div class="l-region" data-toggle="${m(r)}">
        <span class="head-arrow">${a?`▶`:`▼`}</span>${m(t)}
        <span class="head-count">（${s}/${o} · ${o?Math.round(s/o*100):0}%）</span>
      </div>`,!a)for(let{city:e,clusters:t}of n){let n=g.cityColors[e]||f,r=`city:`+e,a=y.collapsed.has(r),o=t.reduce((e,t)=>e+t.points.length,0),s=t.reduce((e,t)=>e+t.points.filter(e=>y.checked.has(e.id)).length,0);if(i+=`
      <div class="l-city" data-toggle="${m(r)}">
        <span class="head-arrow">${a?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${n}"></span>${m(e)}
        <span class="head-count">（${s}/${o}）</span>
      </div>`,!a)for(let{cluster:n,points:r}of t){let t=e+`||`+n,a=y.collapsed.has(t),o=r.filter(e=>y.checked.has(e.id)).length;i+=`
        <div class="l-cluster" data-toggle="${m(t)}">
          <span class="head-arrow">${a?`▶`:`▼`}</span>${m(n)}
          <span class="head-count">（${o}/${r.length}）</span>
        </div>`,!a&&(i+=r.map(e=>{let t=y.checked.has(e.id);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${m(e.id)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${m(e.name)}</span>
            <span class="lp-sub">${e.confidence!=null&&e.confidence<100?`⚠ `:``}${m(e.type)} · ${m(e.highlight||``)}${e.tags&&e.tags.length?` · `+e.tags.map(e=>`#`+m(e)).join(` `):``}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}}let s=T();if(s.length){let e=y.collapsed.has(`__pending`);i+=`
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${e?`▶`:`▼`}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${s.length}）</span>
      </div>`,e||(i+=s.map(e=>`
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${m(e.name)}</span>
            <span class="lp-sub">${m(e.city)} · ${m(e.type)}${e.highlight?` · `+m(e.highlight):``}</span>
          </span>
        </div>`).join(``))}p.innerHTML=`<div class="list-shell">
    <aside class="list-aside">${n}<p class="aside-note">板块统计与首页同一口径：点位数含待核坐标，已打卡按当前设备记录。</p></aside>
    <main class="list-main">${i}</main>
  </div>`}p.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;y.query=e.target.value;let t=e.target.selectionStart;E();let n=p.querySelector(`.list-search`);n.focus(),n.setSelectionRange(t,t)}),p.addEventListener(`change`,async e=>{let t=e.target.dataset?.check;if(!t||!v)return;let n=!1;try{n=await v.toggle(t)}catch{}y.checked=new Set(Object.keys(v.getCheckins())),E(),!n&&v.undoable()&&c(`已取消该点位打卡`,()=>v.undoDelete())}),p.addEventListener(`click`,e=>{let t=e.target.closest(`[data-tag]`);if(t){let e=t.dataset.tag;y.tagFilter.has(e)?y.tagFilter.delete(e):y.tagFilter.add(e),E();return}let n=e.target.closest(`[data-region]`);if(n){let e=n.dataset.region;y.region=y.region===e?``:e,E();return}if(e.target.closest(`input,a`))return;let r=e.target.closest(`[data-toggle]`);if(!r)return;let i=r.dataset.toggle;y.collapsed.has(i)?y.collapsed.delete(i):y.collapsed.add(i),E()});async function D(){[v,h,g,_]=await Promise.all([o({onChange:e=>{y.checked=new Set(Object.keys(e)),h.length&&E()}}),fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json()),i()]),h=n(h,_),y.checked=new Set(Object.keys(v.getCheckins())),v.degraded?l(`IndexedDB 不可用，打卡改动只会留在内存、刷新即丢；请关闭隐私模式或检查浏览器存储权限`):u({store:v.store}).catch(()=>{}),E()}var O=-1;function k(e){let t=[...p.querySelectorAll(`.l-point:not(.pending)`)];if(!t.length)return;O=(O+e+t.length)%t.length,t.forEach(e=>e.classList.remove(`is-kbd`));let n=t[O];n.classList.add(`is-kbd`),n.scrollIntoView({block:`center`})}s({search:()=>p.querySelector(`.list-search`)?.focus(),region:()=>{let e=[...p.querySelectorAll(`.l-region-stats .region-chip[data-region]`)];e.length&&e[(e.findIndex(e=>e.classList.contains(`active`))+1)%e.length].click()},nextPoint:()=>k(1),prevPoint:()=>k(-1),today:()=>{location.href=`./today.html`},plan:()=>{location.href=`./plan.html`}}),D().catch(e=>{console.error(e),p.textContent=`⚠️ 加载失败，请刷新重试`}),e(),t(),d({title:`旅行打卡清单 · 牛马打工人的旅行笔记`,text:`想去的地方，一个个勾掉`});