import{r as e,t}from"./leaflet-default-icon-z5NjA5XR.js";import{t as n}from"./sw-register-slL7fN2v.js";import{t as r}from"./local-date-DMb6oAfl.js";import{t as i}from"./markdown-DRaKq2fB.js";var a=e(t(),1),o=document.getElementById(`admin-app`),s=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),c={tab:`points`,points:[],pointsDirty:!1,ptQuery:``,editIdx:-1,site:null,siteDirty:!1,notesIndex:[],notesDirty:!1,noteFile:null,noteDraft:null,photos:[],photosDirty:!1,photoIdx:-1,loaded:!1};async function l(){let[e,t,n,r]=await Promise.all([fetch(`./data/points.json`).then(e=>e.json()),fetch(`./data/site.json`).then(e=>e.json()),fetch(`./content/notes/index.json`).then(e=>e.json()),fetch(`./photos/index.json`).then(e=>e.json())]);c.points=e,c.site=t,c.notesIndex=n,c.photos=r,c.loaded=!0}function u(){let e=[];if(c.pointsDirty&&e.push({path:`data/points.json`,gen:f}),c.siteDirty&&e.push({path:`data/site.json`,gen:p}),c.notesDirty||w()){for(let t of c.notesIndex)C.get(t.file)?.dirty&&e.push({path:`content/notes/${t.file}`,gen:()=>g(t.file)});c.notesDirty&&e.push({path:`content/notes/index.json`,gen:m})}return c.photosDirty&&e.push({path:`photos/index.json`,gen:h}),e}function d(e,t){let n=new Blob([t],{type:`application/octet-stream`}),r=document.createElement(`a`);r.href=URL.createObjectURL(n),r.download=e.replace(/\//g,`__`),r.click(),setTimeout(()=>URL.revokeObjectURL(r.href),5e3)}var f=()=>JSON.stringify(c.points,null,2)+`
`,p=()=>JSON.stringify(c.site,null,2)+`
`,m=()=>JSON.stringify(c.notesIndex,null,2)+`
`,h=()=>JSON.stringify(c.photos,null,2)+`
`;function g(e){let t=C.get(e),n=[`---`];return t.meta.title&&n.push(`title: ${t.meta.title}`),t.meta.date&&n.push(`date: ${t.meta.date}`),t.meta.summary&&n.push(`summary: ${t.meta.summary}`),n.push(`---`),n.join(`
`)+`

`+t.body.trim()+`
`}function _(){let e=c.ptQuery.trim().toLowerCase(),t=c.points.map((e,t)=>({p:e,i:t})).filter(({p:t})=>!e||t.name.toLowerCase().includes(e)||(t.city||``).toLowerCase().includes(e)||(t.cluster||``).toLowerCase().includes(e)),n=[...new Set(c.points.map(e=>e.city))],r=[...new Set(c.points.map(e=>e.cluster))],i=`<div class="ae-hint">从左侧选择一个点位，或点「新增点位」</div>`;if(c.editIdx>=0){let e=c.points[c.editIdx];i=`
      <div class="ae-form">
        <label>名称 *<input id="pt-name" value="${s(e.name)}"></label>
        <label>城市 *<input id="pt-city" list="dl-cities" value="${s(e.city)}">
          <datalist id="dl-cities">${n.map(e=>`<option value="${s(e)}">`).join(``)}</datalist></label>
        <label>点位群 *<input id="pt-cluster" list="dl-clusters" value="${s(e.cluster)}">
          <datalist id="dl-clusters">${r.map(e=>`<option value="${s(e)}">`).join(``)}</datalist></label>
        <label>类别<input id="pt-type" value="${s(e.type||``)}"></label>
        <label>亮点/简介<input id="pt-highlight" value="${s(e.highlight||``)}"></label>
        <label>备注<input id="pt-note" value="${s(e.note||``)}"></label>
        <div class="ae-row">
          <label>置信度
            <select id="pt-conf">
              <option value="100" ${(e.confidence??100)===100?`selected`:``}>✓ 已核实（100）</option>
              <option value="75" ${e.confidence===75?`selected`:``}>⚠ 中置信（75）</option>
              <option value="0" ${e.confidence===0?`selected`:``}>✗ 未通过（0）</option>
            </select></label>
          <label>标签<input id="pt-tags" value="${s((e.tags||[]).join(`, `))}" placeholder="逗号分隔，如 免费, 周一闭馆">
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
          <input class="ae-search" placeholder="搜索名称/城市/点位群…" value="${s(c.ptQuery)}">
          <button class="btn" data-act="pt-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${t.map(({p:e,i:t})=>`
            <div class="ae-item${t===c.editIdx?` active`:``}" data-pt="${t}">
              <span class="ae-item-name">${s(e.name)}</span>
              <span class="ae-item-sub">${s(e.city)} · ${e.pending?`⏳待核`:`📍`+e.lat?.toFixed(3)}${e.confidence===75?` · ⚠中置信`:e.confidence===0?` · ✗未通过`:``}</span>
            </div>`).join(``)||`<div class="ae-hint">无匹配点位</div>`}
        </div>
        <div class="ae-count">共 ${c.points.length} 个点位</div>
      </div>
      <div class="ae-right">${i}</div>
    </div>`}function v(){if(c.editIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`pt-name`);if(!t)return alert(`名称不能为空`);let n=parseFloat(e(`pt-lat`)),r=parseFloat(e(`pt-lon`)),i=!isNaN(n)&&!isNaN(r),a=c.points.findIndex((e,n)=>e.name===t&&n!==c.editIdx);a>=0&&!confirm(`已存在同名点位「${t}」（${c.points[a].city}），确定保留重复？`)||(c.points[c.editIdx]={id:c.points[c.editIdx].id||y(),name:t,city:e(`pt-city`)||`莫斯科`,cluster:e(`pt-cluster`)||`未分组`,type:e(`pt-type`),highlight:e(`pt-highlight`),note:e(`pt-note`),confidence:Number(document.getElementById(`pt-conf`)?.value??100),tags:(e(`pt-tags`)||``).split(/[,，]/).map(e=>e.trim()).filter(Boolean),...i?{lat:n,lon:r}:{lat:null,lon:null},pending:!i||document.getElementById(`pt-pending`).checked},c.pointsDirty=!0,M())}function y(){let e=c.points.reduce((e,t)=>{let n=parseInt(String(t.id||``).replace(/^p/,``),10);return isNaN(n)?e:Math.max(e,n)},0);return`p`+String(e+1).padStart(3,`0`)}var b=null,x=null;function S(){let e=document.getElementById(`pt-map`);if(!e){b?.remove(),b=null,x=null;return}let t=c.points[c.editIdx];b&&=(b.remove(),null);let n=t&&t.lat!=null&&t.lon!=null;b=a.map(e,{scrollWheelZoom:!1}).setView(n?[t.lat,t.lon]:[55.75,37.62],n?13:4),a.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`,{maxZoom:19}).addTo(b),n&&(x=a.marker([t.lat,t.lon]).addTo(b)),b.on(`click`,e=>{let{lat:t,lng:n}=e.latlng;x?x.setLatLng(e.latlng):x=a.marker(e.latlng).addTo(b);let r=document.getElementById(`pt-lat`),i=document.getElementById(`pt-lon`);r&&(r.value=t.toFixed(6)),i&&(i.value=n.toFixed(6))})}var C=new Map;function w(){return[...C.values()].some(e=>e.dirty)}function T(){let e=`<div class="ae-hint">从左侧选择笔记，或点「新建笔记」</div>`;if(c.noteFile&&c.noteDraft){let t=c.noteDraft;e=`
      <div class="ae-form">
        <label>文件名<input id="nt-file" value="${s(c.noteFile)}" ${c.noteFile===`__new__`?``:`disabled`} placeholder="如 my-first-note.md"></label>
        <label>标题 *<input id="nt-title" value="${s(t.meta.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="nt-date" type="date" value="${s(t.meta.date||``)}"></label>
        </div>
        <label>摘要<input id="nt-summary" value="${s(t.meta.summary||``)}" placeholder="列表页显示的一句话"></label>
        <label>正文（Markdown）<textarea id="nt-body" rows="14">${s(t.body)}</textarea></label>
        <label>预览<div id="nt-preview" class="nt-preview"></div></label>
        <div class="ae-btns">
          <button class="btn primary" data-act="nt-save">保存笔记</button>
          <button class="btn danger" data-act="nt-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${c.notesIndex.length} 篇笔记</span>
          <button class="btn" data-act="nt-new">＋新建</button>
        </div>
        <div class="ae-list">
          ${c.notesIndex.map(e=>`
            <div class="ae-item${e.file===c.noteFile?` active`:``}" data-nt="${s(e.file)}">
              <span class="ae-item-name">${s(e.title||e.file)}</span>
              <span class="ae-item-sub">${s(e.date||``)}${C.get(e.file)?.dirty?` · ✏️未导出`:``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有笔记</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}async function E(e){if(e===`__new__`){c.noteFile=`__new__`,c.noteDraft={meta:{title:``,date:r(),summary:``},body:``,dirty:!1},M();return}let t=c.notesIndex.find(t=>t.file===e);if(t){if(!C.has(e)){let n=await fetch(`./content/notes/${encodeURIComponent(e)}`).then(e=>e.text()),r=n.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/),i={title:t.title,date:t.date,summary:t.summary};C.set(e,{meta:i,body:r?n.slice(r[0].length):n,dirty:!1})}c.noteFile=e,c.noteDraft=C.get(e),M()}}function D(){let e=e=>document.getElementById(e)?.value.trim(),t=e(`nt-title`),n=document.getElementById(`nt-body`)?.value??``;if(!t)return alert(`标题不能为空`);if(!n.trim())return alert(`正文不能为空`);if(c.noteFile===`__new__`){let r=e(`nt-file`);if(r||=`${Date.now()}.md`,r.endsWith(`.md`)||(r+=`.md`),c.notesIndex.some(e=>e.file===r))return alert(`文件名已存在`);C.set(r,{meta:{title:t,date:e(`nt-date`),summary:e(`nt-summary`)},body:n,dirty:!0}),c.notesIndex.unshift({file:r,title:t,date:e(`nt-date`),summary:e(`nt-summary`)}),c.notesDirty=!0,c.noteFile=r,c.noteDraft=C.get(r)}else{let r=C.get(c.noteFile);r.meta={title:t,date:e(`nt-date`),summary:e(`nt-summary`)},r.body=n,r.dirty=!0;let i=c.notesIndex.find(e=>e.file===c.noteFile);i&&(i.title=t,i.date=e(`nt-date`),i.summary=e(`nt-summary`)),c.notesDirty=!0}M()}function O(){let e=`<div class="ae-hint">从左侧选择条目，或点「新增条目」</div>`;if(c.photoIdx>=0){let t=c.photos[c.photoIdx];e=`
      <div class="ae-form">
        <label>照片文件名 *<input id="ph-src" value="${s(t.src)}" placeholder="如 2026-09-01-red-square.jpg">
          <span class="ae-tip">照片文件本体通过微信发给 Kimi，随推送一起上传</span></label>
        <label>标题<input id="ph-title" value="${s(t.title||``)}"></label>
        <div class="ae-row">
          <label>日期<input id="ph-date" type="date" value="${s(t.date||``)}"></label>
          <label>地点<input id="ph-place" value="${s(t.place||``)}"></label>
        </div>
        <div class="ae-btns">
          <button class="btn primary" data-act="ph-save">保存条目</button>
          <button class="btn danger" data-act="ph-del">删除</button>
        </div>
      </div>`}return`
    <div class="ae-layout">
      <div class="ae-left">
        <div class="ae-toolbar">
          <span class="ae-count" style="padding:6px 4px">${c.photos.length} 张照片</span>
          <button class="btn" data-act="ph-new">＋新增</button>
        </div>
        <div class="ae-list">
          ${c.photos.map((e,t)=>`
            <div class="ae-item${t===c.photoIdx?` active`:``}" data-ph="${t}">
              <span class="ae-item-name">${s(e.title||e.src)}</span>
              <span class="ae-item-sub">${s(e.src)}${e.date?` · `+s(e.date):``}</span>
            </div>`).join(``)||`<div class="ae-hint">还没有照片</div>`}
        </div>
      </div>
      <div class="ae-right">${e}</div>
    </div>`}function k(){if(c.photoIdx<0)return;let e=e=>document.getElementById(e)?.value.trim(),t=e(`ph-src`);if(!t)return alert(`文件名不能为空`);c.photos[c.photoIdx]={src:t,title:e(`ph-title`),date:e(`ph-date`),place:e(`ph-place`)},c.photosDirty=!0,M()}function A(){return`
    <div class="ae-form" style="max-width:520px">
      <label>网站标题<input id="st-title" value="${s(c.site.title||``)}"></label>
      <label>副标题<input id="st-sub" value="${s(c.site.subtitle||``)}"></label>
      <label>图标 Emoji<input id="st-emoji" value="${s(c.site.emoji||``)}" maxlength="4"></label>
      <label>备案号（ICP）<input id="st-icp" value="${s(c.site.icp||``)}" placeholder="如 沪ICP备XXXXXXXX号，留空则不显示">
        <span class="ae-tip">显示在所有公开页面底部，自动链接到 beian.miit.gov.cn</span></label>
      <div class="ae-btns">
        <button class="btn primary" data-act="st-save">保存</button>
        <span class="ae-tip">保存后记得在底部导出 data/site.json</span>
      </div>
      <div class="ae-hint" style="margin-top:12px">注意：浏览器标签页标题、PWA 应用名等写死在页面里，改动后需要 Kimi 重新构建发布才生效。</div>
    </div>`}function j(){let e=u();return e.length?`
    <div class="export-bar">
      <div class="eb-title">📦 本次变更（${e.length} 个文件）— 下载后发给 Kimi 即完成发布：</div>
      <div class="eb-files">
        ${e.map((e,t)=>`<button class="btn small" data-dl="${t}">⬇ ${s(e.path)}</button>`).join(``)}
        <button class="btn small primary" data-dl-all>⬇ 全部下载</button>
      </div>
    </div>`:``}function M(){o.innerHTML=`
    <div class="admin-tabs">
      ${[[`points`,`📍 点位（${c.points.length}）`],[`notes`,`📝 笔记（${c.notesIndex.length}）`],[`album`,`📷 相册（${c.photos.length}）`],[`site`,`⚙️ 网站信息`]].map(([e,t])=>`<button class="at-tab${c.tab===e?` active`:``}" data-tab="${e}">${t}</button>`).join(``)}
    </div>
    ${c.tab===`points`?_():``}
    ${c.tab===`notes`?T():``}
    ${c.tab===`album`?O():``}
    ${c.tab===`site`?A():``}
    ${j()}`,c.tab===`points`&&S(),c.tab===`notes`&&N()}function N(){let e=document.getElementById(`nt-body`),t=document.getElementById(`nt-preview`);e&&t&&(t.innerHTML=i(e.value))}o.addEventListener(`input`,e=>{if(e.target.id===`nt-body`){N();return}if(e.target.classList.contains(`ae-search`)){c.ptQuery=e.target.value;let t=e.target.selectionStart;M();let n=o.querySelector(`.ae-search`);n.focus(),n.setSelectionRange(t,t)}}),o.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-tab]`);if(t){c.tab=t.dataset.tab,M();return}let n=e.target.closest(`[data-dl]`);if(n){let e=u()[Number(n.dataset.dl)];d(e.path,e.gen());return}if(e.target.closest(`[data-dl-all]`)){for(let e of u())d(e.path,e.gen());return}let r=e.target.closest(`[data-pt]`);if(r){c.editIdx=Number(r.dataset.pt),M();return}let i=e.target.closest(`[data-act]`)?.dataset.act;if(i===`pt-new`){c.points.unshift({name:``,city:``,cluster:``,type:``,highlight:``,note:``,lat:null,lon:null,pending:!0}),c.editIdx=0,M();return}if(i===`pt-save`)return v();if(i===`pt-del`){confirm(`确定删除「${c.points[c.editIdx].name}」？`)&&(c.points.splice(c.editIdx,1),c.pointsDirty=!0,c.editIdx=-1,M());return}let a=e.target.closest(`[data-nt]`);if(a)return E(a.dataset.nt);if(i===`nt-new`)return E(`__new__`);if(i===`nt-save`)return D();if(i===`nt-del`){confirm(`确定删除笔记「${c.noteFile}」？`)&&(C.delete(c.noteFile),c.notesIndex=c.notesIndex.filter(e=>e.file!==c.noteFile),c.notesDirty=!0,c.noteFile=null,c.noteDraft=null,M());return}let o=e.target.closest(`[data-ph]`);if(o){c.photoIdx=Number(o.dataset.ph),M();return}if(i===`ph-new`){c.photos.unshift({src:``,title:``,date:``,place:``}),c.photoIdx=0,M();return}if(i===`ph-save`)return k();if(i===`ph-del`){confirm(`确定删除「${c.photos[c.photoIdx].src}」？`)&&(c.photos.splice(c.photoIdx,1),c.photosDirty=!0,c.photoIdx=-1,M());return}if(i===`st-save`){let e=e=>document.getElementById(e)?.value.trim();c.site={emoji:e(`st-emoji`),title:e(`st-title`),subtitle:e(`st-sub`),icp:e(`st-icp`)},c.siteDirty=!0,M();return}}),l().then(M).catch(e=>{console.error(e),o.textContent=`⚠️ 加载失败，请刷新重试`}),n();