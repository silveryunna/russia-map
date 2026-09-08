import"./base-PdgKi3kY.js";import{t as e}from"./sw-register-DQUWfbwc.js";var t=`travel-checkin-v1`,n=document.getElementById(`list-app`),r=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),i=[],a={cityColors:{},cities:[]},o={query:``,collapsed:new Set,checked:new Set(JSON.parse(localStorage.getItem(t)||`[]`))},s=()=>i.filter(e=>!e.pending),c=()=>i.filter(e=>e.pending);function l(){let e=o.query.trim().toLowerCase(),t=s();e&&(t=t.filter(t=>t.name.toLowerCase().includes(e)||t.cluster.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)));let n=new Map;for(let e of t){n.has(e.city)||n.set(e.city,new Map);let t=n.get(e.city);t.has(e.cluster)||t.set(e.cluster,[]),t.get(e.cluster).push(e)}return[...n.entries()].map(([e,t])=>({city:e,clusters:[...t.entries()].map(([e,t])=>({cluster:e,points:t}))}))}function u(){let e=o.query.trim().toLowerCase();return e?c().filter(t=>t.name.toLowerCase().includes(e)||t.type.toLowerCase().includes(e)||(t.highlight||``).toLowerCase().includes(e)||t.city.toLowerCase().includes(e)):c()}function d(){let e=s().filter(e=>o.checked.has(e.name)).length,t=s().length?Math.round(e/s().length*100):0,i=`
    <div class="list-summary">
      共 ${s().length} 个点位 · 已打卡 <b>${e}</b> 个 · 完成度 ${t}%
      <span class="ls-bar"><span class="ls-fill" style="width:${t}%"></span></span>
    </div>
    <input class="list-search" type="text" placeholder="搜索点位 / 类别 / 城市…" value="${r(o.query)}">`;for(let{city:e,clusters:t}of l()){let n=a.cityColors[e]||`#546E7A`,s=`city:`+e,c=o.collapsed.has(s),l=t.reduce((e,t)=>e+t.points.length,0),u=t.reduce((e,t)=>e+t.points.filter(e=>o.checked.has(e.name)).length,0);if(i+=`
      <div class="l-city" data-toggle="${r(s)}">
        <span class="head-arrow">${c?`▶`:`▼`}</span>
        <span class="head-dot" style="background:${n}"></span>${r(e)}
        <span class="head-count">（${u}/${l}）</span>
      </div>`,!c)for(let{cluster:n,points:a}of t){let t=e+`||`+n,s=o.collapsed.has(t),c=a.filter(e=>o.checked.has(e.name)).length;i+=`
        <div class="l-cluster" data-toggle="${r(t)}">
          <span class="head-arrow">${s?`▶`:`▼`}</span>${r(n)}
          <span class="head-count">（${c}/${a.length}）</span>
        </div>`,!s&&(i+=a.map(e=>{let t=o.checked.has(e.name);return`
        <label class="l-point${t?` done`:``}">
          <input type="checkbox" data-check="${r(e.name)}" ${t?`checked`:``}>
          <span class="lp-main">
            <span class="lp-name">${r(e.name)}</span>
            <span class="lp-sub">${r(e.type)} · ${r(e.highlight||``)}</span>
          </span>
          <a class="lp-map" href="./map.html" title="打开地图页查看" onclick="event.stopPropagation()">🗺</a>
        </label>`}).join(``))}}let c=u();if(c.length){let e=o.collapsed.has(`__pending`);i+=`
      <div class="l-city pending" data-toggle="__pending">
        <span class="head-arrow">${e?`▶`:`▼`}</span>
        <span class="head-dot"></span>📌 待核实坐标
        <span class="head-count">（${c.length}）</span>
      </div>`,e||(i+=c.map(e=>`
        <div class="l-point pending">
          <span class="pr-badge">待核</span>
          <span class="lp-main">
            <span class="lp-name">${r(e.name)}</span>
            <span class="lp-sub">${r(e.city)} · ${r(e.type)}${e.highlight?` · `+r(e.highlight):``}</span>
          </span>
        </div>`).join(``))}n.innerHTML=i}n.addEventListener(`input`,e=>{if(!e.target.classList.contains(`list-search`))return;o.query=e.target.value;let t=e.target.selectionStart;d();let r=n.querySelector(`.list-search`);r.focus(),r.setSelectionRange(t,t)}),n.addEventListener(`change`,e=>{let n=e.target.dataset?.check;n&&(o.checked.has(n)?o.checked.delete(n):o.checked.add(n),localStorage.setItem(t,JSON.stringify([...o.checked])),d())}),n.addEventListener(`click`,e=>{if(e.target.closest(`input,a`))return;let t=e.target.closest(`[data-toggle]`);if(!t)return;let n=t.dataset.toggle;o.collapsed.has(n)?o.collapsed.delete(n):o.collapsed.add(n),d()});async function f(){[i,a]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/meta.json`).then(e=>e.json())]),d()}f().catch(e=>{console.error(e),n.textContent=`⚠️ 加载失败，请刷新重试`}),e();