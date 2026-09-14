import"./base-BJw1lW7I.js";import{n as e,t}from"./sw-register-DJuU55yn.js";import{t as n}from"./marked.esm-HaWzKJJ6.js";var r=document.getElementById(`notes-app`),i=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]);n.setOptions({gfm:!0,breaks:!0});function a(e){let t=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),r={},i=e;if(t){i=e.slice(t[0].length);for(let e of t[1].split(/\r?\n/)){let t=e.match(/^([\w一-龥]+):\s*(.*)$/);t&&(r[t[1].trim()]=t[2].trim())}}return{meta:r,html:n.parse(i)}}var o=[],s=null;function c(){if(!o.length){r.innerHTML=`
      <div class="notes-empty">
        <p>📝 还没有笔记</p>
        <p class="ne-tip">在 <code>content/notes/</code> 目录下新建 <code>.md</code> 文件，<br>并在 <code>index.json</code> 中登记即可发布。</p>
      </div>`;return}r.innerHTML=`
    <div class="notes-list">
      ${o.map(e=>`
        <a class="note-card" data-file="${i(e.file)}">
          <div class="nc-title">${i(e.title||e.file)}</div>
          ${e.summary?`<div class="nc-summary">${i(e.summary)}</div>`:``}
          ${e.date?`<div class="nc-date">📅 ${i(e.date)}</div>`:``}
        </a>`).join(``)}
    </div>`}async function l(e){let t=o.find(t=>t.file===e);r.innerHTML=`<div class="notes-empty">加载中…</div>`;try{let{meta:n,html:o}=a(await fetch(`./content/notes/${encodeURIComponent(e)}`).then(e=>{if(!e.ok)throw Error(String(e.status));return e.text()})),s=n.title||t?.title||e,c=n.date||t?.date||``;r.innerHTML=`
      <article class="note-article">
        <a class="na-back" data-back>← 返回笔记列表</a>
        <h1 class="na-title">${i(s)}</h1>
        ${c?`<div class="na-date">📅 ${i(c)}</div>`:``}
        <div class="na-body">${o}</div>
      </article>`,document.title=`${s} · 牛马打工人的旅行笔记`}catch{r.innerHTML=`
      <div class="notes-empty">
        <p>⚠️ 文章加载失败</p>
        <p class="ne-tip"><a data-back style="color:var(--accent);cursor:pointer">← 返回笔记列表</a></p>
      </div>`}}r.addEventListener(`click`,e=>{if(e.target.closest(`[data-back]`)){s=null,document.title=`旅行笔记 · 牛马打工人的旅行笔记`,c();return}let t=e.target.closest(`.note-card[data-file]`);t&&(s=t.dataset.file,l(s))});async function u(){o=await fetch(`./content/notes/index.json`).then(e=>e.json()),o.sort((e,t)=>String(t.date||``).localeCompare(String(e.date||``))),c()}u().catch(e=>{console.error(e),r.textContent=`⚠️ 加载失败，请刷新重试`}),t(),e();