import{r as e,t}from"./leaflet-default-icon-z5NjA5XR.js";import{t as n}from"./sw-register-CGfnD3s9.js";import{t as r}from"./markdown-DRaKq2fB.js";var i=e(t(),1),a=document.getElementById(`admin-app`),o=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),s={tab:`points`,points:[],pointsDirty:!1,ptQuery:``,editIdx:-1,site:null,siteDirty:!1,notesIndex:[],notesDirty:!1,noteFile:null,noteDraft:null,photos:[],photosDirty:!1,photoIdx:-1,loaded:!1};async function c(){let[e,t,n,r]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/site.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.json()),fetch(`./photos/index.json`).then(e=>e.json())]);s.points=e,s.site=t,s.notesIndex=n,s.photos=r,s.loaded=!0}function l(){let e=[];if(s.pointsDirty&&e.push({path:`data/points.json`,gen:d}),s.siteDirty&&e.push({path:`data/site.json`,gen:f}),s.notesDirty||C()){for(let t of s.notesIndex)S.get(t.file)?.dirty&&e.push({path:`content/notes/${t.file}`,gen:()=>h(t.file)});s.notesDirty&&e.push({path:`content/notes/index.json`,gen:p})}return s.photosDirty&&e.push({path:`photos/index.json`,gen:m}),e}function u(e,t){let n=new Blob([t],{type:`application/octet-stream`}),r=document.createElement(`a`);r.href=URL.createObjectURL(n),r.download=e.replace(/\//g,`__`),r.click(),setTimeout(()=>URL.revokeObjectURL(r.href),5e3)}var d=()=>JSON.stringify(s.points,null,2)+`
`,f=()=>JSON.stringify(s.site,null,2)+`
`,p=()=>JSON.stringify(s.notesIndex,null,2)+`
`,m=()=>JSON.stringify(s.photos,null,2)+`
`;function h(e){let t=S.get(e),n=[`---`];return t.meta.title&&n.push(`title: ${t.meta.title}`),t.meta.date&&n.push(`date: ${t.meta.date}`),t.meta.summary&&n.push(`summary: ${t.meta.summary}`),n.push(`---`),n.join(`
`)+`

`+t.body.trim()+`
`}function g(){let e=s.ptQuery.trim().toLowerCase(),t=s.points.map((e,t)=>({p:e,i:t})).filter(({p:t})=>!e||t.name.toLowerCase().includes(e)||(t.city||``).toLowerCase().includes(e)||(t.cluster||``).toLowerCase().includes(e)),n=[...new Set(s.points.map(e=>e.city))],r=[...new Set(s.points.map(e=>e.cluster))],i=`<div class="ae-hint">从左侧选择一个点位，或点「新增点位」</div>`;if(s.editIdx>=0){let e=s.points[s.editIdx];i=`
      <div class="ae-form">
        <label>名称 *<input id="pt-name" value="${o(e.name)}"></label>
        <label>城市 *<input id="pt-city" list="dl-cities" value="${o(e.city)}">
          <datalist id="dl-cities">${n.map(e=>`<option value="${o(e)}">`).join(``)}</datalist></label>
        <label>点位群 *<input id="pt-cluster" list="dl-clusters" value="${o(e.cluster)}">
          <datalist id="dl-clusters">${r.map(e=>`<option value="${o(e)}">`).join(``)}</datalist></label>
        <label>类别<input id="pt-type" value="${o(e.type||``)}"></label>
        <label>亮点/简介<input id="pt-highlight" value="${o(e.highlight||``)}"></label>
        <label>备注<input id="pt-note" value="${o(e.note||``)}"></label>
        <div class="ae-row">
          <label>置信度
            <select id="pt-conf">
              <option value="100" ${(e.confidence??100)===100?`selected`:``}>✓ 已核实（100）</option>
              <option value="75" ${e.confidence===75?`selected`:``}>⚠ 中置信（75）</option>
              <option value="0" ${e.confidence===0?`selected`:``}>✗ 未通过（0）</option>
            </select></label>
          <label>标签<input id="pt-tags" value="${o((e.tags||[]).join(`, `))}" placeholder="逗号分隔，如 免费, 周一闭馆">
            <span class="ae-tip">用于筛选 chips，逗号分隔多个</span></label>
        </div>
        <div class="ae-row">
          <label>纬度 lat<input id="pt-lat" type="number" step="any" value="${e.lat??``}" placeholder="留空 = 待核"></label>
          <label>经度 lon<input id="pt-lon" type="number" step="any" value="${e.lon??``}" placeholder="留空 = 待核"></label>
        </div>
        <label>地图取坐标
          <div id="pt-map"></div>
          <span class="ae-tip">点击地图设置坐标（可先拖动/缩放找到位置）</span></label>
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
          <input class="ae-search" placeholder="搜索名称/城市/点位群…" value="${o(s.ptQuery)}">
          <button class="btn" data-act="pt-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${t.map(({p:e,i:t})=>`
            <div class="ae-item${t===s.editIdx?` active`:``}" data-pt="${t}">
              <span class="ae-item-name">${o(e.name)}</span>
              <span class="ae-item-sub">${o(e.city)} · ${e.pending?`⏳待核`:`📍`+e.lat?.toFixed(3)}${e.confidence===75?` · ⚠中置信`:e.confidence===0?` · ✗未通过`:``}</span>
            </div>`).join(``)||`<div class="ae-hint">无匹配点位</div>`}
        </div>
        <div class="ae-count">共 ${s.points.length} 个点位</div>
      </div>
      <div class="ae-right">${i}</div>
    </div>`}function _(){if(s.editIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`pt-name`);if(!t)return alert(`名称不能为空`);let n=parseFloat(e(`pt-lat`)),r=parseFloat(e(`pt-lon`)),i=!isNaN(n)&&!isNaN(r),a=s.points.findIndex((e,n)=>e.name===t&&n!==s.editIdx);a>=0&&!confirm(`已存在同名点位「${t}」（${s.points[a].city}），确定保留重复？`)||(s.points[s.editIdx]={id:s.points[s.editIdx].id||v(),name:t,city:e(`pt-city`)||`其他城市`,cluster:e(`pt-cluster`)||`未分组`,type:e(`pt-type`),highlight:e(`pt-highlight`),note:e(`pt-note`),confidence:Number(document.getElementById(`pt-conf`)?.value??100),tags:(e(`pt-tags`)||``).split(/[,，]/).map(e=>e.trim()).filter(Boolean),...i?{lat:n,lon:r}:{lat:null,lon:null},pending:!i||document.getElementById(`pt-pending`).checked},s.pointsDirty=!0,j())}function v(){let e=s.points.reduce((e,t)=>{let n=parseInt(String(t.id||``).replace(/^p/,``),10);return isNaN(n)?e:Math.max(e,n)},0);return`p`+String(e+1).padStart(3,`0`)}var y=null,b=null;function x(){let e=document.getElementById(`pt-map`);if(!e){y?.remove(),y=null,b=null;return}let t=s.points[s.editIdx];y&&=(y.remove(),null);let n=t&&t.lat!=null&&t.lon!=null;y=i.map(e,{scrollWheelZoom:!1}).setView(n?[t.lat,t.lon]:[55.75,37.62],n?13:4),i.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`,{maxZoom:19}).addTo(y),n&&(b=i.marker([t.lat,t.lon]).addTo(y)),y.on(`click`,e=>{let{lat:t,lng:n}=e.latlng;b?b.setLatLng(e.latlng):b=i.marker(e.latlng).addTo(y);let r=document.getElementById(`pt-lat`),a=document.getElementById(`pt-lon`);r&&(r.value=t.toFixed(6)),a&&(a.value=n.toFixed(6))})}var S=new Map;function C(){return[...S.values()].some(e=>e.dirty)}function w(){let e=`<div class="ae-hint">从左侧选择笔记，或点「新建笔记」</div>`;if(s.noteFile&&s.noteDraft){let t=s.noteDraft;e=`
      <div class="ae-form">
        <label>文件名<input id="nt-file" value="${o(s.noteFile)}" ${s.noteFile===`__new__`?``:`disabled`} placeholder="如 my-first-note.md"></label>
        <label>标题 *<input id="nt-title" value="${o(t.meta.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="nt-date" type="date" value="${o(t.meta.date||``)}"></label>
        </div>
        <label>摘要<input id="nt-summary" value="${o(t.meta.summary||``)}" placeholder="列表页显示的一句话"></label>
        <label>正文（Markdown）<textarea id="nt-body" rows="14">${o(t.body)}</textarea></label>
        <label>预览<div id="nt-preview" class="nt-preview"></div></label>
        <div class="ae-btns">
          <button class="btn primary" data-act="nt-save">保存笔记</button>
          <button class="btn danger" data-act="nt-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${s.notesIndex.length} 篇笔记</span>
          <button class="btn" data-act="nt-new">＋新建</button>
        </div>
        <div class="ae-list">
          ${s.notesIndex.map(e=>`
            <div class="ae-item${e.file===s.noteFile?` active`:``}" data-nt="${o(e.file)}">
              <span class="ae-item-name">${o(e.title||e.file)}</span>
              <span class="ae-item-sub">${o(e.date||``)}${S.get(e.file)?.dirty?` · ✏️未导出`:``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有笔记</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}async function T(e){if(e===`__new__`){s.noteFile=`__new__`,s.noteDraft={meta:{title:``,date:new Date().toISOString().slice(0,10),summary:``},body:``,dirty:!1},j();return}let t=s.notesIndex.find(t=>t.file===e);if(t){if(!S.has(e)){let n=await fetch(`./content/notes/${encodeURIComponent(e)}`).then(e=>e.text()),r=n.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),i={title:t.title,date:t.date,summary:t.summary};S.set(e,{meta:i,body:r?n.slice(r[0].length):n,dirty:!1})}s.noteFile=e,s.noteDraft=S.get(e),j()}}function E(){let e=e=>document.getElementById(e)?.value.trim(),t=e(`nt-title`),n=document.getElementById(`nt-body`)?.value??``;if(!t)return alert(`标题不能为空`);if(!n.trim())return alert(`正文不能为空`);if(s.noteFile===`__new__`){let r=e(`nt-file`);if(r||=`${Date.now()}.md`,r.endsWith(`.md`)||(r+=`.md`),s.notesIndex.some(e=>e.file===r))return alert(`文件名已存在`);S.set(r,{meta:{title:t,date:e(`nt-date`),summary:e(`nt-summary`)},body:n,dirty:!0}),s.notesIndex.unshift({file:r,title:t,date:e(`nt-date`),summary:e(`nt-summary`)}),s.notesDirty=!0,s.noteFile=r,s.noteDraft=S.get(r)}else{let r=S.get(s.noteFile);r.meta={title:t,date:e(`nt-date`),summary:e(`nt-summary`)},r.body=n,r.dirty=!0;let i=s.notesIndex.find(e=>e.file===s.noteFile);i&&(i.title=t,i.date=e(`nt-date`),i.summary=e(`nt-summary`)),s.notesDirty=!0}j()}function D(){let e=`<div class="ae-hint">从左侧选择条目，或点「新增条目」</div>`;if(s.photoIdx>=0){let t=s.photos[s.photoIdx];e=`
      <div class="ae-form">
        <label>照片文件名 *<input id="ph-src" value="${o(t.src)}" placeholder="如 2026-09-01-red-square.jpg">
          <span class="ae-tip">照片文件本体通过微信发给 Kimi，随推送一起上传</span></label>
        <label>标题<input id="ph-title" value="${o(t.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="ph-date" type="date" value="${o(t.date||``)}"></label>
          <label>地点<input id="ph-place" value="${o(t.place||``)}"></label>
        </div>
        <div class="ae-btns">
          <button class="btn primary" data-act="ph-save">保存条目</button>
          <button class="btn danger" data-act="ph-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${s.photos.length} 张照片</span>
          <button class="btn" data-act="ph-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${s.photos.map((e,t)=>`
            <div class="ae-item${t===s.photoIdx?` active`:``}" data-ph="${t}">
              <span class="ae-item-name">${o(e.title||e.src)}</span>
              <span class="ae-item-sub">${o(e.src)}${e.date?` · `+o(e.date):``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有照片</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}function O(){if(s.photoIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`ph-src`);if(!t)return alert(`文件名不能为空`);s.photos[s.photoIdx]={src:t,title:e(`ph-title`),date:e(`ph-date`),place:e(`ph-place`)},s.photosDirty=!0,j()}function k(){return`
    <div class="ae-form" style="max-width:520px">
      <label>网站标题<input id="st-title" value="${o(s.site.title||``)}"></label>
      <label>副标题<input id="st-sub" value="${o(s.site.subtitle||``)}"></label>
      <label>图标 Emoji<input id="st-emoji" value="${o(s.site.emoji||``)}" maxlength="4"></label>
      <label>备案号（ICP）<input id="st-icp" value="${o(s.site.icp||``)}" placeholder="如 沪ICP备XXXXXXXX号，留空则不显示">
        <span class="ae-tip">显示在所有公开页面底部，自动链接到 beian.miit.gov.cn</span></label>
      <div class="ae-btns">
        <button class="btn primary" data-act="st-save">保存</button>
        <span class="ae-tip">保存后记得在底部导出 data/site.json</span>
      </div>
      <div class="ae-hint" style="margin-top:12px">注意：浏览器标签页标题、PWA 应用名等写死在页面里，改动后需要 Kimi 重新构建发布才生效。</div>
    </div>`}function A(){let e=l();return e.length?`
    <div class="export-bar">
      <div class="eb-title">📦 本次变更（${e.length} 个文件）— 下载后发给 Kimi 即完成发布：</div>
      <div class="eb-files">
        ${e.map((e,t)=>`<button class="btn small" data-dl="${t}">⬇ ${o(e.path)}</button>`).join(``)}
        <button class="btn small primary" data-dl-all>⬇ 全部下载</button>
      </div>
    </div>`:``}function j(){a.innerHTML=`
    <div class="admin-tabs">
      ${[[`points`,`📍 点位（${s.points.length}）`],[`notes`,`📝 笔记（${s.notesIndex.length}）`],[`album`,`📷 相册（${s.photos.length}）`],[`site`,`⚙️ 网站信息`]].map(([e,t])=>`<button class="at-tab${s.tab===e?` active`:``}" data-tab="${e}">${t}</button>`).join(``)}
    </div>
    ${s.tab===`points`?g():``}
    ${s.tab===`notes`?w():``}
    ${s.tab===`album`?D():``}
    ${s.tab===`site`?k():``}
    ${A()}`,s.tab===`points`&&x(),s.tab===`notes`&&M()}function M(){let e=document.getElementById(`nt-body`),t=document.getElementById(`nt-preview`);e&&t&&(t.innerHTML=r(e.value))}a.addEventListener(`input`,e=>{if(e.target.id===`nt-body`){M();return}if(e.target.classList.contains(`ae-search`)){s.ptQuery=e.target.value;let t=e.target.selectionStart;j();let n=a.querySelector(`.ae-search`);n.focus(),n.setSelectionRange(t,t)}}),a.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-tab]`);if(t){s.tab=t.dataset.tab,j();return}let n=e.target.closest(`[data-dl]`);if(n){let e=l()[Number(n.dataset.dl)];u(e.path,e.gen());return}if(e.target.closest(`[data-dl-all]`)){for(let e of l())u(e.path,e.gen());return}let r=e.target.closest(`[data-pt]`);if(r){s.editIdx=Number(r.dataset.pt),j();return}let i=e.target.closest(`[data-act]`)?.dataset.act;if(i===`pt-new`){s.points.unshift({name:``,city:``,cluster:``,type:``,highlight:``,note:``,lat:null,lon:null,pending:!0}),s.editIdx=0,j();return}if(i===`pt-save`)return _();if(i===`pt-del`){confirm(`确定删除「${s.points[s.editIdx].name}」？`)&&(s.points.splice(s.editIdx,1),s.pointsDirty=!0,s.editIdx=-1,j());return}let a=e.target.closest(`[data-nt]`);if(a)return T(a.dataset.nt);if(i===`nt-new`)return T(`__new__`);if(i===`nt-save`)return E();if(i===`nt-del`){confirm(`确定删除笔记「${s.noteFile}」？`)&&(S.delete(s.noteFile),s.notesIndex=s.notesIndex.filter(e=>e.file!==s.noteFile),s.notesDirty=!0,s.noteFile=null,s.noteDraft=null,j());return}let o=e.target.closest(`[data-ph]`);if(o){s.photoIdx=Number(o.dataset.ph),j();return}if(i===`ph-new`){s.photos.unshift({src:``,title:``,date:``,place:``}),s.photoIdx=0,j();return}if(i===`ph-save`)return O();if(i===`ph-del`){confirm(`确定删除「${s.photos[s.photoIdx].src}」？`)&&(s.photos.splice(s.photoIdx,1),s.photosDirty=!0,s.photoIdx=-1,j());return}if(i===`st-save`){let e=e=>document.getElementById(e)?.value.trim();s.site={emoji:e(`st-emoji`),title:e(`st-title`),subtitle:e(`st-sub`),icp:e(`st-icp`)},s.siteDirty=!0,j();return}}),c().then(j).catch(e=>{console.error(e),a.textContent=`⚠️ 加载失败，请刷新重试`}),n();