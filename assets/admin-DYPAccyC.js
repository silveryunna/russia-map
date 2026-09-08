import{r as e,t}from"./leaflet-CpUWbOAs.js";import"./base-PdgKi3kY.js";import{t as n}from"./marked.esm-HaWzKJJ6.js";var r=e(t(),1);n.setOptions({gfm:!0,breaks:!0});var i=document.getElementById(`admin-app`),a=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),o={tab:`points`,points:[],pointsDirty:!1,ptQuery:``,editIdx:-1,site:null,siteDirty:!1,notesIndex:[],notesDirty:!1,noteFile:null,noteDraft:null,photos:[],photosDirty:!1,photoIdx:-1,loaded:!1};async function s(){let[e,t,n,r]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/site.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.json()),fetch(`./photos/index.json`).then(e=>e.json())]);o.points=e,o.site=t,o.notesIndex=n,o.photos=r,o.loaded=!0}function c(){let e=[];if(o.pointsDirty&&e.push({path:`data/points.json`,gen:u}),o.siteDirty&&e.push({path:`data/site.json`,gen:d}),o.notesDirty||S()){for(let t of o.notesIndex)x.get(t.file)?.dirty&&e.push({path:`content/notes/${t.file}`,gen:()=>m(t.file)});o.notesDirty&&e.push({path:`content/notes/index.json`,gen:f})}return o.photosDirty&&e.push({path:`photos/index.json`,gen:p}),e}function l(e,t){let n=new Blob([t],{type:`application/octet-stream`}),r=document.createElement(`a`);r.href=URL.createObjectURL(n),r.download=e.replace(/\//g,`__`),r.click(),setTimeout(()=>URL.revokeObjectURL(r.href),5e3)}var u=()=>JSON.stringify(o.points,null,2)+`
`,d=()=>JSON.stringify(o.site,null,2)+`
`,f=()=>JSON.stringify(o.notesIndex,null,2)+`
`,p=()=>JSON.stringify(o.photos,null,2)+`
`;function m(e){let t=x.get(e),n=[`---`];return t.meta.title&&n.push(`title: ${t.meta.title}`),t.meta.date&&n.push(`date: ${t.meta.date}`),t.meta.summary&&n.push(`summary: ${t.meta.summary}`),n.push(`---`),n.join(`
`)+`

`+t.body.trim()+`
`}function h(){let e=o.ptQuery.trim().toLowerCase(),t=o.points.map((e,t)=>({p:e,i:t})).filter(({p:t})=>!e||t.name.toLowerCase().includes(e)||(t.city||``).toLowerCase().includes(e)||(t.cluster||``).toLowerCase().includes(e)),n=[...new Set(o.points.map(e=>e.city))],r=[...new Set(o.points.map(e=>e.cluster))],i=`<div class="ae-hint">从左侧选择一个点位，或点「新增点位」</div>`;if(o.editIdx>=0){let e=o.points[o.editIdx];i=`
      <div class="ae-form">
        <label>名称 *<input id="pt-name" value="${a(e.name)}"></label>
        <label>城市 *<input id="pt-city" list="dl-cities" value="${a(e.city)}">
          <datalist id="dl-cities">${n.map(e=>`<option value="${a(e)}">`).join(``)}</datalist></label>
        <label>点位群 *<input id="pt-cluster" list="dl-clusters" value="${a(e.cluster)}">
          <datalist id="dl-clusters">${r.map(e=>`<option value="${a(e)}">`).join(``)}</datalist></label>
        <label>类别<input id="pt-type" value="${a(e.type||``)}"></label>
        <label>亮点/简介<input id="pt-highlight" value="${a(e.highlight||``)}"></label>
        <label>备注<input id="pt-note" value="${a(e.note||``)}"></label>
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
          <input class="ae-search" placeholder="搜索名称/城市/点位群…" value="${a(o.ptQuery)}">
          <button class="btn" data-act="pt-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${t.map(({p:e,i:t})=>`
            <div class="ae-item${t===o.editIdx?` active`:``}" data-pt="${t}">
              <span class="ae-item-name">${a(e.name)}</span>
              <span class="ae-item-sub">${a(e.city)} · ${e.pending?`⏳待核`:`📍`+e.lat?.toFixed(3)}</span>
            </div>`).join(``)||`<div class="ae-hint">无匹配点位</div>`}
        </div>
        <div class="ae-count">共 ${o.points.length} 个点位</div>
      </div>
      <div class="ae-right">${i}</div>
    </div>`}function g(){if(o.editIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`pt-name`);if(!t)return alert(`名称不能为空`);let n=parseFloat(e(`pt-lat`)),r=parseFloat(e(`pt-lon`)),i=!isNaN(n)&&!isNaN(r),a=o.points.findIndex((e,n)=>e.name===t&&n!==o.editIdx);a>=0&&!confirm(`已存在同名点位「${t}」（${o.points[a].city}），确定保留重复？`)||(o.points[o.editIdx]={id:o.points[o.editIdx].id||_(),name:t,city:e(`pt-city`)||`其他城市`,cluster:e(`pt-cluster`)||`未分组`,type:e(`pt-type`),highlight:e(`pt-highlight`),note:e(`pt-note`),...i?{lat:n,lon:r}:{lat:null,lon:null},pending:!i||document.getElementById(`pt-pending`).checked},o.pointsDirty=!0,A())}function _(){let e=o.points.reduce((e,t)=>{let n=parseInt(String(t.id||``).replace(/^p/,``),10);return isNaN(n)?e:Math.max(e,n)},0);return`p`+String(e+1).padStart(3,`0`)}var v=null,y=null;function b(){let e=document.getElementById(`pt-map`);if(!e){v?.remove(),v=null,y=null;return}let t=o.points[o.editIdx];v&&=(v.remove(),null);let n=t&&t.lat!=null&&t.lon!=null;v=r.map(e,{scrollWheelZoom:!1}).setView(n?[t.lat,t.lon]:[55.75,37.62],n?13:4),r.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`,{maxZoom:19}).addTo(v),n&&(y=r.marker([t.lat,t.lon]).addTo(v)),v.on(`click`,e=>{let{lat:t,lng:n}=e.latlng;y?y.setLatLng(e.latlng):y=r.marker(e.latlng).addTo(v);let i=document.getElementById(`pt-lat`),a=document.getElementById(`pt-lon`);i&&(i.value=t.toFixed(6)),a&&(a.value=n.toFixed(6))})}var x=new Map;function S(){return[...x.values()].some(e=>e.dirty)}function C(){let e=`<div class="ae-hint">从左侧选择笔记，或点「新建笔记」</div>`;if(o.noteFile&&o.noteDraft){let t=o.noteDraft;e=`
      <div class="ae-form">
        <label>文件名<input id="nt-file" value="${a(o.noteFile)}" ${o.noteFile===`__new__`?``:`disabled`} placeholder="如 my-first-note.md"></label>
        <label>标题 *<input id="nt-title" value="${a(t.meta.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="nt-date" type="date" value="${a(t.meta.date||``)}"></label>
        </div>
        <label>摘要<input id="nt-summary" value="${a(t.meta.summary||``)}" placeholder="列表页显示的一句话"></label>
        <label>正文（Markdown）<textarea id="nt-body" rows="14">${a(t.body)}</textarea></label>
        <label>预览<div id="nt-preview" class="nt-preview"></div></label>
        <div class="ae-btns">
          <button class="btn primary" data-act="nt-save">保存笔记</button>
          <button class="btn danger" data-act="nt-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${o.notesIndex.length} 篇笔记</span>
          <button class="btn" data-act="nt-new">＋新建</button>
        </div>
        <div class="ae-list">
          ${o.notesIndex.map(e=>`
            <div class="ae-item${e.file===o.noteFile?` active`:``}" data-nt="${a(e.file)}">
              <span class="ae-item-name">${a(e.title||e.file)}</span>
              <span class="ae-item-sub">${a(e.date||``)}${x.get(e.file)?.dirty?` · ✏️未导出`:``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有笔记</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}async function w(e){if(e===`__new__`){o.noteFile=`__new__`,o.noteDraft={meta:{title:``,date:new Date().toISOString().slice(0,10),summary:``},body:``,dirty:!1},A();return}let t=o.notesIndex.find(t=>t.file===e);if(t){if(!x.has(e)){let n=await fetch(`./content/notes/${encodeURIComponent(e)}`).then(e=>e.text()),r=n.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),i={title:t.title,date:t.date,summary:t.summary};x.set(e,{meta:i,body:r?n.slice(r[0].length):n,dirty:!1})}o.noteFile=e,o.noteDraft=x.get(e),A()}}function T(){let e=e=>document.getElementById(e)?.value.trim(),t=e(`nt-title`),n=document.getElementById(`nt-body`)?.value??``;if(!t)return alert(`标题不能为空`);if(!n.trim())return alert(`正文不能为空`);if(o.noteFile===`__new__`){let r=e(`nt-file`);if(r||=`${Date.now()}.md`,r.endsWith(`.md`)||(r+=`.md`),o.notesIndex.some(e=>e.file===r))return alert(`文件名已存在`);x.set(r,{meta:{title:t,date:e(`nt-date`),summary:e(`nt-summary`)},body:n,dirty:!0}),o.notesIndex.unshift({file:r,title:t,date:e(`nt-date`),summary:e(`nt-summary`)}),o.notesDirty=!0,o.noteFile=r,o.noteDraft=x.get(r)}else{let r=x.get(o.noteFile);r.meta={title:t,date:e(`nt-date`),summary:e(`nt-summary`)},r.body=n,r.dirty=!0;let i=o.notesIndex.find(e=>e.file===o.noteFile);i&&(i.title=t,i.date=e(`nt-date`),i.summary=e(`nt-summary`)),o.notesDirty=!0}A()}function E(){let e=`<div class="ae-hint">从左侧选择条目，或点「新增条目」</div>`;if(o.photoIdx>=0){let t=o.photos[o.photoIdx];e=`
      <div class="ae-form">
        <label>照片文件名 *<input id="ph-src" value="${a(t.src)}" placeholder="如 2026-09-01-red-square.jpg">
          <span class="ae-tip">照片文件本体通过微信发给 Kimi，随推送一起上传</span></label>
        <label>标题<input id="ph-title" value="${a(t.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="ph-date" type="date" value="${a(t.date||``)}"></label>
          <label>地点<input id="ph-place" value="${a(t.place||``)}"></label>
        </div>
        <div class="ae-btns">
          <button class="btn primary" data-act="ph-save">保存条目</button>
          <button class="btn danger" data-act="ph-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${o.photos.length} 张照片</span>
          <button class="btn" data-act="ph-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${o.photos.map((e,t)=>`
            <div class="ae-item${t===o.photoIdx?` active`:``}" data-ph="${t}">
              <span class="ae-item-name">${a(e.title||e.src)}</span>
              <span class="ae-item-sub">${a(e.src)}${e.date?` · `+a(e.date):``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有照片</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}function D(){if(o.photoIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`ph-src`);if(!t)return alert(`文件名不能为空`);o.photos[o.photoIdx]={src:t,title:e(`ph-title`),date:e(`ph-date`),place:e(`ph-place`)},o.photosDirty=!0,A()}function O(){return`
    <div class="ae-form" style="max-width:520px">
      <label>网站标题<input id="st-title" value="${a(o.site.title||``)}"></label>
      <label>副标题<input id="st-sub" value="${a(o.site.subtitle||``)}"></label>
      <label>图标 Emoji<input id="st-emoji" value="${a(o.site.emoji||``)}" maxlength="4"></label>
      <div class="ae-btns">
        <button class="btn primary" data-act="st-save">保存</button>
        <span class="ae-tip">保存后记得在底部导出 data/site.json</span>
      </div>
      <div class="ae-hint" style="margin-top:12px">注意：浏览器标签页标题、PWA 应用名等写死在页面里，改动后需要 Kimi 重新构建发布才生效。</div>
    </div>`}function k(){let e=c();return e.length?`
    <div class="export-bar">
      <div class="eb-title">📦 本次变更（${e.length} 个文件）— 下载后发给 Kimi 即完成发布：</div>
      <div class="eb-files">
        ${e.map((e,t)=>`<button class="btn small" data-dl="${t}">⬇ ${a(e.path)}</button>`).join(``)}
        <button class="btn small primary" data-dl-all>⬇ 全部下载</button>
      </div>
    </div>`:``}function A(){i.innerHTML=`
    <div class="admin-tabs">
      ${[[`points`,`📍 点位（${o.points.length}）`],[`notes`,`📝 笔记（${o.notesIndex.length}）`],[`album`,`📷 相册（${o.photos.length}）`],[`site`,`⚙️ 网站信息`]].map(([e,t])=>`<button class="at-tab${o.tab===e?` active`:``}" data-tab="${e}">${t}</button>`).join(``)}
    </div>
    ${o.tab===`points`?h():``}
    ${o.tab===`notes`?C():``}
    ${o.tab===`album`?E():``}
    ${o.tab===`site`?O():``}
    ${k()}`,o.tab===`points`&&b(),o.tab===`notes`&&j()}function j(){let e=document.getElementById(`nt-body`),t=document.getElementById(`nt-preview`);e&&t&&(t.innerHTML=n.parse(e.value))}i.addEventListener(`input`,e=>{if(e.target.id===`nt-body`){j();return}if(e.target.classList.contains(`ae-search`)){o.ptQuery=e.target.value;let t=e.target.selectionStart;A();let n=i.querySelector(`.ae-search`);n.focus(),n.setSelectionRange(t,t)}}),i.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-tab]`);if(t){o.tab=t.dataset.tab,A();return}let n=e.target.closest(`[data-dl]`);if(n){let e=c()[Number(n.dataset.dl)];l(e.path,e.gen());return}if(e.target.closest(`[data-dl-all]`)){for(let e of c())l(e.path,e.gen());return}let r=e.target.closest(`[data-pt]`);if(r){o.editIdx=Number(r.dataset.pt),A();return}let i=e.target.closest(`[data-act]`)?.dataset.act;if(i===`pt-new`){o.points.unshift({name:``,city:``,cluster:``,type:``,highlight:``,note:``,lat:null,lon:null,pending:!0}),o.editIdx=0,A();return}if(i===`pt-save`)return g();if(i===`pt-del`){confirm(`确定删除「${o.points[o.editIdx].name}」？`)&&(o.points.splice(o.editIdx,1),o.pointsDirty=!0,o.editIdx=-1,A());return}let a=e.target.closest(`[data-nt]`);if(a)return w(a.dataset.nt);if(i===`nt-new`)return w(`__new__`);if(i===`nt-save`)return T();if(i===`nt-del`){confirm(`确定删除笔记「${o.noteFile}」？`)&&(x.delete(o.noteFile),o.notesIndex=o.notesIndex.filter(e=>e.file!==o.noteFile),o.notesDirty=!0,o.noteFile=null,o.noteDraft=null,A());return}let s=e.target.closest(`[data-ph]`);if(s){o.photoIdx=Number(s.dataset.ph),A();return}if(i===`ph-new`){o.photos.unshift({src:``,title:``,date:``,place:``}),o.photoIdx=0,A();return}if(i===`ph-save`)return D();if(i===`ph-del`){confirm(`确定删除「${o.photos[o.photoIdx].src}」？`)&&(o.photos.splice(o.photoIdx,1),o.photosDirty=!0,o.photoIdx=-1,A());return}if(i===`st-save`){let e=e=>document.getElementById(e)?.value.trim();o.site={emoji:e(`st-emoji`),title:e(`st-title`),subtitle:e(`st-sub`)},o.siteDirty=!0,A();return}}),s().then(A).catch(e=>{console.error(e),i.textContent=`⚠️ 加载失败，请刷新重试`});