import"./base-PdgKi3kY.js";var e=document.getElementById(`admin-app`),t=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),n={tab:`points`,points:[],pointsDirty:!1,ptQuery:``,editIdx:-1,site:null,siteDirty:!1,notesIndex:[],notesDirty:!1,noteFile:null,noteDraft:null,photos:[],photosDirty:!1,photoIdx:-1,loaded:!1};async function r(){let[e,t,r,i]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/site.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.json()),fetch(`./photos/index.json`).then(e=>e.json())]);n.points=e,n.site=t,n.notesIndex=r,n.photos=i,n.loaded=!0}function i(){let e=[];if(n.pointsDirty&&e.push({path:`data/points.json`,gen:o}),n.siteDirty&&e.push({path:`data/site.json`,gen:s}),n.notesDirty||m()){for(let t of n.notesIndex)p.get(t.file)?.dirty&&e.push({path:`content/notes/${t.file}`,gen:()=>u(t.file)});n.notesDirty&&e.push({path:`content/notes/index.json`,gen:c})}return n.photosDirty&&e.push({path:`photos/index.json`,gen:l}),e}function a(e,t){let n=new Blob([t],{type:`application/octet-stream`}),r=document.createElement(`a`);r.href=URL.createObjectURL(n),r.download=e.replace(/\//g,`__`),r.click(),setTimeout(()=>URL.revokeObjectURL(r.href),5e3)}var o=()=>JSON.stringify(n.points,null,2)+`
`,s=()=>JSON.stringify(n.site,null,2)+`
`,c=()=>JSON.stringify(n.notesIndex,null,2)+`
`,l=()=>JSON.stringify(n.photos,null,2)+`
`;function u(e){let t=p.get(e),n=[`---`];return t.meta.title&&n.push(`title: ${t.meta.title}`),t.meta.date&&n.push(`date: ${t.meta.date}`),t.meta.summary&&n.push(`summary: ${t.meta.summary}`),n.push(`---`),n.join(`
`)+`

`+t.body.trim()+`
`}function d(){let e=n.ptQuery.trim().toLowerCase(),r=n.points.map((e,t)=>({p:e,i:t})).filter(({p:t})=>!e||t.name.toLowerCase().includes(e)||(t.city||``).toLowerCase().includes(e)||(t.cluster||``).toLowerCase().includes(e)),i=[...new Set(n.points.map(e=>e.city))],a=[...new Set(n.points.map(e=>e.cluster))],o=`<div class="ae-hint">从左侧选择一个点位，或点「新增点位」</div>`;if(n.editIdx>=0){let e=n.points[n.editIdx];o=`
      <div class="ae-form">
        <label>名称 *<input id="pt-name" value="${t(e.name)}"></label>
        <label>城市 *<input id="pt-city" list="dl-cities" value="${t(e.city)}">
          <datalist id="dl-cities">${i.map(e=>`<option value="${t(e)}">`).join(``)}</datalist></label>
        <label>点位群 *<input id="pt-cluster" list="dl-clusters" value="${t(e.cluster)}">
          <datalist id="dl-clusters">${a.map(e=>`<option value="${t(e)}">`).join(``)}</datalist></label>
        <label>类别<input id="pt-type" value="${t(e.type||``)}"></label>
        <label>亮点/简介<input id="pt-highlight" value="${t(e.highlight||``)}"></label>
        <label>备注<input id="pt-note" value="${t(e.note||``)}"></label>
        <div class="ae-row">
          <label>纬度 lat<input id="pt-lat" type="number" step="any" value="${e.lat??``}" placeholder="留空 = 待核"></label>
          <label>经度 lon<input id="pt-lon" type="number" step="any" value="${e.lon??``}" placeholder="留空 = 待核"></label>
        </div>
        <label class="ae-check"><input id="pt-pending" type="checkbox" ${e.pending?`checked`:``}> 待核实坐标（不上地图）</label>
        <div class="ae-btns">
          <button class="btn primary" data-act="pt-save">保存此点位</button>
          <button class="btn danger" data-act="pt-del">删除</button>
          <span class="ae-tip">坐标留空会自动记为待核</span>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <input class="ae-search" placeholder="搜索名称/城市/点位群…" value="${t(n.ptQuery)}">
          <button class="btn" data-act="pt-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${r.map(({p:e,i:r})=>`
            <div class="ae-item${r===n.editIdx?` active`:``}" data-pt="${r}">
              <span class="ae-item-name">${t(e.name)}</span>
              <span class="ae-item-sub">${t(e.city)} · ${e.pending?`⏳待核`:`📍`+e.lat?.toFixed(3)}</span>
            </div>`).join(``)||`<div class="ae-hint">无匹配点位</div>`}
        </div>
        <div class="ae-count">共 ${n.points.length} 个点位</div>
      </div>
      <div class="ae-right">${o}</div>
    </div>`}function f(){if(n.editIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`pt-name`);if(!t)return alert(`名称不能为空`);let r=parseFloat(e(`pt-lat`)),i=parseFloat(e(`pt-lon`)),a=!isNaN(r)&&!isNaN(i),o=n.points.findIndex((e,r)=>e.name===t&&r!==n.editIdx);o>=0&&!confirm(`已存在同名点位「${t}」（${n.points[o].city}），确定保留重复？`)||(n.points[n.editIdx]={name:t,city:e(`pt-city`)||`其他城市`,cluster:e(`pt-cluster`)||`未分组`,type:e(`pt-type`),highlight:e(`pt-highlight`),note:e(`pt-note`),...a?{lat:r,lon:i}:{lat:null,lon:null},pending:!a||document.getElementById(`pt-pending`).checked},n.pointsDirty=!0,S())}var p=new Map;function m(){return[...p.values()].some(e=>e.dirty)}function h(){let e=`<div class="ae-hint">从左侧选择笔记，或点「新建笔记」</div>`;if(n.noteFile&&n.noteDraft){let r=n.noteDraft;e=`
      <div class="ae-form">
        <label>文件名<input id="nt-file" value="${t(n.noteFile)}" ${n.noteFile===`__new__`?``:`disabled`} placeholder="如 my-first-note.md"></label>
        <label>标题 *<input id="nt-title" value="${t(r.meta.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="nt-date" type="date" value="${t(r.meta.date||``)}"></label>
        </div>
        <label>摘要<input id="nt-summary" value="${t(r.meta.summary||``)}" placeholder="列表页显示的一句话"></label>
        <label>正文（Markdown）<textarea id="nt-body" rows="16">${t(r.body)}</textarea></label>
        <div class="ae-btns">
          <button class="btn primary" data-act="nt-save">保存笔记</button>
          <button class="btn danger" data-act="nt-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${n.notesIndex.length} 篇笔记</span>
          <button class="btn" data-act="nt-new">＋新建</button>
        </div>
        <div class="ae-list">
          ${n.notesIndex.map(e=>`
            <div class="ae-item${e.file===n.noteFile?` active`:``}" data-nt="${t(e.file)}">
              <span class="ae-item-name">${t(e.title||e.file)}</span>
              <span class="ae-item-sub">${t(e.date||``)}${p.get(e.file)?.dirty?` · ✏️未导出`:``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有笔记</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}async function g(e){if(e===`__new__`){n.noteFile=`__new__`,n.noteDraft={meta:{title:``,date:new Date().toISOString().slice(0,10),summary:``},body:``,dirty:!1},S();return}let t=n.notesIndex.find(t=>t.file===e);if(t){if(!p.has(e)){let n=await fetch(`./content/notes/${encodeURIComponent(e)}`).then(e=>e.text()),r=n.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),i={title:t.title,date:t.date,summary:t.summary};p.set(e,{meta:i,body:r?n.slice(r[0].length):n,dirty:!1})}n.noteFile=e,n.noteDraft=p.get(e),S()}}function _(){let e=e=>document.getElementById(e)?.value.trim(),t=e(`nt-title`),r=document.getElementById(`nt-body`)?.value??``;if(!t)return alert(`标题不能为空`);if(!r.trim())return alert(`正文不能为空`);if(n.noteFile===`__new__`){let i=e(`nt-file`);if(i||=`${Date.now()}.md`,i.endsWith(`.md`)||(i+=`.md`),n.notesIndex.some(e=>e.file===i))return alert(`文件名已存在`);p.set(i,{meta:{title:t,date:e(`nt-date`),summary:e(`nt-summary`)},body:r,dirty:!0}),n.notesIndex.unshift({file:i,title:t,date:e(`nt-date`),summary:e(`nt-summary`)}),n.notesDirty=!0,n.noteFile=i,n.noteDraft=p.get(i)}else{let i=p.get(n.noteFile);i.meta={title:t,date:e(`nt-date`),summary:e(`nt-summary`)},i.body=r,i.dirty=!0;let a=n.notesIndex.find(e=>e.file===n.noteFile);a&&(a.title=t,a.date=e(`nt-date`),a.summary=e(`nt-summary`)),n.notesDirty=!0}S()}function v(){let e=`<div class="ae-hint">从左侧选择条目，或点「新增条目」</div>`;if(n.photoIdx>=0){let r=n.photos[n.photoIdx];e=`
      <div class="ae-form">
        <label>照片文件名 *<input id="ph-src" value="${t(r.src)}" placeholder="如 2026-09-01-red-square.jpg">
          <span class="ae-tip">照片文件本体通过微信发给 Kimi，随推送一起上传</span></label>
        <label>标题<input id="ph-title" value="${t(r.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="ph-date" type="date" value="${t(r.date||``)}"></label>
          <label>地点<input id="ph-place" value="${t(r.place||``)}"></label>
        </div>
        <div class="ae-btns">
          <button class="btn primary" data-act="ph-save">保存条目</button>
          <button class="btn danger" data-act="ph-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${n.photos.length} 张照片</span>
          <button class="btn" data-act="ph-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${n.photos.map((e,r)=>`
            <div class="ae-item${r===n.photoIdx?` active`:``}" data-ph="${r}">
              <span class="ae-item-name">${t(e.title||e.src)}</span>
              <span class="ae-item-sub">${t(e.src)}${e.date?` · `+t(e.date):``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有照片</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}function y(){if(n.photoIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`ph-src`);if(!t)return alert(`文件名不能为空`);n.photos[n.photoIdx]={src:t,title:e(`ph-title`),date:e(`ph-date`),place:e(`ph-place`)},n.photosDirty=!0,S()}function b(){return`
    <div class="ae-form" style="max-width:520px">
      <label>网站标题<input id="st-title" value="${t(n.site.title||``)}"></label>
      <label>副标题<input id="st-sub" value="${t(n.site.subtitle||``)}"></label>
      <label>图标 Emoji<input id="st-emoji" value="${t(n.site.emoji||``)}" maxlength="4"></label>
      <div class="ae-btns">
        <button class="btn primary" data-act="st-save">保存</button>
        <span class="ae-tip">保存后记得在底部导出 data/site.json</span>
      </div>
      <div class="ae-hint" style="margin-top:12px">注意：浏览器标签页标题、PWA 应用名等写死在页面里，改动后需要 Kimi 重新构建发布才生效。</div>
    </div>`}function x(){let e=i();return e.length?`
    <div class="export-bar">
      <div class="eb-title">📦 本次变更（${e.length} 个文件）— 下载后发给 Kimi 即完成发布：</div>
      <div class="eb-files">
        ${e.map((e,n)=>`<button class="btn small" data-dl="${n}">⬇ ${t(e.path)}</button>`).join(``)}
        <button class="btn small primary" data-dl-all>⬇ 全部下载</button>
      </div>
    </div>`:``}function S(){e.innerHTML=`
    <div class="admin-tabs">
      ${[[`points`,`📍 点位（${n.points.length}）`],[`notes`,`📝 笔记（${n.notesIndex.length}）`],[`album`,`📷 相册（${n.photos.length}）`],[`site`,`⚙️ 网站信息`]].map(([e,t])=>`<button class="at-tab${n.tab===e?` active`:``}" data-tab="${e}">${t}</button>`).join(``)}
    </div>
    ${n.tab===`points`?d():``}
    ${n.tab===`notes`?h():``}
    ${n.tab===`album`?v():``}
    ${n.tab===`site`?b():``}
    ${x()}`}e.addEventListener(`input`,t=>{if(t.target.classList.contains(`ae-search`)){n.ptQuery=t.target.value;let r=t.target.selectionStart;S();let i=e.querySelector(`.ae-search`);i.focus(),i.setSelectionRange(r,r)}}),e.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-tab]`);if(t){n.tab=t.dataset.tab,S();return}let r=e.target.closest(`[data-dl]`);if(r){let e=i()[Number(r.dataset.dl)];a(e.path,e.gen());return}if(e.target.closest(`[data-dl-all]`)){for(let e of i())a(e.path,e.gen());return}let o=e.target.closest(`[data-pt]`);if(o){n.editIdx=Number(o.dataset.pt),S();return}let s=e.target.closest(`[data-act]`)?.dataset.act;if(s===`pt-new`){n.points.unshift({name:``,city:``,cluster:``,type:``,highlight:``,note:``,lat:null,lon:null,pending:!0}),n.editIdx=0,S();return}if(s===`pt-save`)return f();if(s===`pt-del`){confirm(`确定删除「${n.points[n.editIdx].name}」？`)&&(n.points.splice(n.editIdx,1),n.pointsDirty=!0,n.editIdx=-1,S());return}let c=e.target.closest(`[data-nt]`);if(c)return g(c.dataset.nt);if(s===`nt-new`)return g(`__new__`);if(s===`nt-save`)return _();if(s===`nt-del`){confirm(`确定删除笔记「${n.noteFile}」？`)&&(p.delete(n.noteFile),n.notesIndex=n.notesIndex.filter(e=>e.file!==n.noteFile),n.notesDirty=!0,n.noteFile=null,n.noteDraft=null,S());return}let l=e.target.closest(`[data-ph]`);if(l){n.photoIdx=Number(l.dataset.ph),S();return}if(s===`ph-new`){n.photos.unshift({src:``,title:``,date:``,place:``}),n.photoIdx=0,S();return}if(s===`ph-save`)return y();if(s===`ph-del`){confirm(`确定删除「${n.photos[n.photoIdx].src}」？`)&&(n.photos.splice(n.photoIdx,1),n.photosDirty=!0,n.photoIdx=-1,S());return}if(s===`st-save`){let e=e=>document.getElementById(e)?.value.trim();n.site={emoji:e(`st-emoji`),title:e(`st-title`),subtitle:e(`st-sub`)},n.siteDirty=!0,S();return}}),r().then(S).catch(t=>{console.error(t),e.textContent=`⚠️ 加载失败，请刷新重试`});