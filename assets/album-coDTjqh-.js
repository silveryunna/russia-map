import"./base-BJw1lW7I.js";import{n as e,t}from"./sw-register-DJuU55yn.js";var n=document.getElementById(`album-app`),r=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),i=[],a=-1;function o(){if(!i.length){n.innerHTML=`
      <div class="album-empty">
        <p>📷 相册还是空的</p>
        <p class="ae-tip">把照片放到 <code>photos/</code> 目录，<br>并在 <code>photos/index.json</code> 中登记即可展示。</p>
      </div>`;return}n.innerHTML=`
    <div class="album-grid">
      ${i.map((e,t)=>`
        <figure class="photo-card" data-idx="${t}">
          <img src="./photos/${encodeURIComponent(e.src)}" alt="${r(e.title||e.src)}" loading="lazy">
          <figcaption>
            ${e.title?`<div class="pc-title">${r(e.title)}</div>`:``}
            <div class="pc-sub">${[e.place,e.date].filter(Boolean).map(r).join(` · `)}</div>
          </figcaption>
        </figure>`).join(``)}
    </div>
    ${a>=0?s():``}`}function s(){let e=i[a];return`
    <div class="viewer" data-viewer>
      <button class="vw-close" data-close>✕</button>
      <button class="vw-prev" data-prev ${a===0?`disabled`:``}>‹</button>
      <img class="vw-img" src="./photos/${encodeURIComponent(e.src)}" alt="${r(e.title||``)}">
      <button class="vw-next" data-next ${a===i.length-1?`disabled`:``}>›</button>
      <div class="vw-cap">${r(e.title||``)}${e.place||e.date?`<span>${[e.place,e.date].filter(Boolean).map(r).join(` · `)}</span>`:``}</div>
      <div class="vw-count">${a+1} / ${i.length}</div>
    </div>`}function c(e){a=e,o(),document.body.style.overflow=`hidden`}function l(){a=-1,o(),document.body.style.overflow=``}function u(e){let t=a+e;t<0||t>=i.length||c(t)}n.addEventListener(`click`,e=>{if(e.target.closest(`[data-close]`))return l();if(e.target.closest(`[data-prev]`))return u(-1);if(e.target.closest(`[data-next]`))return u(1);if(e.target.closest(`[data-viewer]`))return l();let t=e.target.closest(`.photo-card[data-idx]`);t&&c(Number(t.dataset.idx))}),document.addEventListener(`keydown`,e=>{a<0||(e.key===`Escape`&&l(),e.key===`ArrowLeft`&&u(-1),e.key===`ArrowRight`&&u(1))});async function d(){i=await fetch(`./photos/index.json`).then(e=>e.json()),i.sort((e,t)=>String(t.date||`9999`).localeCompare(String(e.date||`9999`))),o()}d().catch(e=>{console.error(e),n.textContent=`⚠️ 加载失败，请刷新重试`}),t(),e();