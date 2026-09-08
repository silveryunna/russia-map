import{t as e}from"./sw-register-CT4SDRCv.js";var t=document.getElementById(`album-app`),n=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),r=[],i=-1;function a(){if(!r.length){t.innerHTML=`
      <div class="album-empty">
        <p>📷 相册还是空的</p>
        <p class="ae-tip">把照片放到 <code>photos/</code> 目录，<br>并在 <code>photos/index.json</code> 中登记即可展示。</p>
      </div>`;return}t.innerHTML=`
    <div class="album-grid">
      ${r.map((e,t)=>`
        <figure class="photo-card" data-idx="${t}">
          <img src="./photos/${encodeURIComponent(e.src)}" alt="${n(e.title||e.src)}" loading="lazy">
          <figcaption>
            ${e.title?`<div class="pc-title">${n(e.title)}</div>`:``}
            <div class="pc-sub">${[e.place,e.date].filter(Boolean).map(n).join(` · `)}</div>
          </figcaption>
        </figure>`).join(``)}
    </div>
    ${i>=0?o():``}`}function o(){let e=r[i];return`
    <div class="viewer" data-viewer>
      <button class="vw-close" data-close>✕</button>
      <button class="vw-prev" data-prev ${i===0?`disabled`:``}>‹</button>
      <img class="vw-img" src="./photos/${encodeURIComponent(e.src)}" alt="${n(e.title||``)}">
      <button class="vw-next" data-next ${i===r.length-1?`disabled`:``}>›</button>
      <div class="vw-cap">${n(e.title||``)}${e.place||e.date?`<span>${[e.place,e.date].filter(Boolean).map(n).join(` · `)}</span>`:``}</div>
      <div class="vw-count">${i+1} / ${r.length}</div>
    </div>`}function s(e){i=e,a(),document.body.style.overflow=`hidden`}function c(){i=-1,a(),document.body.style.overflow=``}function l(e){let t=i+e;t<0||t>=r.length||s(t)}t.addEventListener(`click`,e=>{if(e.target.closest(`[data-close]`))return c();if(e.target.closest(`[data-prev]`))return l(-1);if(e.target.closest(`[data-next]`))return l(1);if(e.target.closest(`[data-viewer]`))return c();let t=e.target.closest(`.photo-card[data-idx]`);t&&s(Number(t.dataset.idx))}),document.addEventListener(`keydown`,e=>{i<0||(e.key===`Escape`&&c(),e.key===`ArrowLeft`&&l(-1),e.key===`ArrowRight`&&l(1))});async function u(){r=await fetch(`./photos/index.json`).then(e=>e.json()),r.sort((e,t)=>String(t.date||`9999`).localeCompare(String(e.date||`9999`))),a()}u().catch(e=>{console.error(e),t.textContent=`⚠️ 加载失败，请刷新重试`}),e();