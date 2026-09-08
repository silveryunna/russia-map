import"./base-PdgKi3kY.js";import{t as e}from"./sw-register-DPVxZZsI.js";import{t}from"./marked.esm-HaWzKJJ6.js";var n=document.getElementById(`notes-app`),r=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]);t.setOptions({gfm:!0,breaks:!0});function i(e){let n=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),r={},i=e;if(n){i=e.slice(n[0].length);for(let e of n[1].split(/\r?\n/)){let t=e.match(/^([\w一-龥]+):\s*(.*)$/);t&&(r[t[1].trim()]=t[2].trim())}}return{meta:r,html:t.parse(i)}}var a=[],o=null;function s(){if(!a.length){n.innerHTML=`
      <div class="notes-empty">
        <p>📝 还没有笔记</p>
        <p class="ne-tip">在 <code>content/notes/</code> 目录下新建 <code>.md</code> 文件，<br>并在 <code>index.json</code> 中登记即可发布。</p>
      </div>`;return}n.innerHTML=`
    <div class="notes-list">
      ${a.map(e=>`
        <a class="note-card" data-file="${r(e.file)}">
          <div class="nc-title">${r(e.title||e.file)}</div>
          ${e.summary?`<div class="nc-summary">${r(e.summary)}</div>`:``}
          ${e.date?`<div class="nc-date">📅 ${r(e.date)}</div>`:``}
        </a>`).join(``)}
    </div>`}async function c(e){let t=a.find(t=>t.file===e);n.innerHTML=`<div class="notes-empty">加载中…</div>`;try{let{meta:a,html:o}=i(await fetch(`./content/notes/${encodeURIComponent(e)}`).then(e=>{if(!e.ok)throw Error(String(e.status));return e.text()})),s=a.title||t?.title||e,c=a.date||t?.date||``;n.innerHTML=`
      <article class="note-article">
        <a class="na-back" data-back>← 返回笔记列表</a>
        <h1 class="na-title">${r(s)}</h1>
        ${c?`<div class="na-date">📅 ${r(c)}</div>`:``}
        <div class="na-body">${o}</div>
      </article>`,document.title=`${s} · 牛马打工人的旅行笔记`}catch{n.innerHTML=`
      <div class="notes-empty">
        <p>⚠️ 文章加载失败</p>
        <p class="ne-tip"><a data-back style="color:var(--accent);cursor:pointer">← 返回笔记列表</a></p>
      </div>`}}n.addEventListener(`click`,e=>{if(e.target.closest(`[data-back]`)){o=null,document.title=`旅行笔记 · 牛马打工人的旅行笔记`,s();return}let t=e.target.closest(`.note-card[data-file]`);t&&(o=t.dataset.file,c(o))});async function l(){a=await fetch(`./content/notes/index.json`).then(e=>e.json()),a.sort((e,t)=>String(t.date||``).localeCompare(String(e.date||``))),s()}l().catch(e=>{console.error(e),n.textContent=`⚠️ 加载失败，请刷新重试`}),e();