// 行程列表视图：卡片列表、打开、复制、删除。
// 只做渲染与交互接线，状态由调用方通过 ctx 传入（plan.js 仍是组装根）。
// ctx 约定：app/view/trips/meta/store/toast/render/refreshTrips/esc/banners/
//           exportMd/exportBackup/importBackup/current(setter)/resetUndo

import { STATUS_LABEL, dateRange } from './format.js';
import { tripItemCount } from '../trip/schema.js';
import { countNeedsConfirm, duplicateTrip } from '../trip/edit.js';

export function renderTripList(ctx) {
  const { app, view, trips, meta, esc, banners, store, toast, render, refreshTrips, exportMd, exportBackup, importBackup } = ctx;
  const needConfirm = trips.reduce((s, t) => s + countNeedsConfirm(t), 0);

  app.innerHTML = `
    <div class="pl-head">
      <h2>🧭 我的行程</h2>
      <div class="tr-head-ops">
        <button class="pl-btn primary" id="pl-new">＋ 新建</button>
        <button class="pl-btn small" id="tr-import">导入备份</button>
        <button class="pl-btn small" id="tr-export">备份全部</button>
      </div>
    </div>
    ${banners()}
    ${needConfirm ? `<div class="pl-tip">🔎 ${needConfirm} 个点位待确认（旧计划迁移的歧义名称），打开行程点名字即可绑定</div>` : ''}
    ${trips.length ? trips.map(t => `
      <div class="pl-card" data-open="${esc(t.id)}">
        <div class="pl-card-top">
          <span class="pl-name">${esc(t.title)}</span>
          <span class="pl-src ${t.status === 'completed' ? 'ai' : ''}">${esc(STATUS_LABEL[t.status] || t.status)}</span>
        </div>
        <div class="pl-meta">${esc((t.cities || []).join(' / ') || '未设城市')} · ${dateRange(t)} · ${t.days.length} 天 · ${tripItemCount(t)} 项${countNeedsConfirm(t) ? ` · <b class="tr-warn">${countNeedsConfirm(t)} 待确认</b>` : ''}</div>
        <div class="pl-ops">
          <button class="pl-btn small" data-open="${esc(t.id)}">编辑</button>
          <button class="pl-btn small" data-copy="${esc(t.id)}">复制</button>
          <button class="pl-btn small" data-md="${esc(t.id)}">导出 Markdown</button>
          <button class="pl-btn small danger" data-del="${esc(t.id)}">删除</button>
        </div>
      </div>`).join('')
      : `<div class="pl-empty">还没有行程<br><span>点"新建"生成一份草案，之后可以逐日调整、增删点位</span></div>`}
    <div class="pl-foot">数据只存在这台设备的浏览器里（IndexedDB）· 离线可编辑 · 共 ${trips.length} 份行程${needConfirm ? ` · ${needConfirm} 项待确认` : ''}</div>
    <input type="file" id="tr-import-file" accept="application/json,.json" hidden>`;

  document.getElementById('pl-new').onclick = () => {
    view.mode = 'create'; view.aiError = ''; view.showAI = false;
    view.form = { city: meta.cities[0] || '', date: '', days: 3, interests: [] };
    render();
  };
  document.getElementById('tr-export').onclick = exportBackup;
  const file = document.getElementById('tr-import-file');
  document.getElementById('tr-import').onclick = () => file.click();
  file.onchange = () => { if (file.files && file.files[0]) importBackup(file.files[0]); file.value = ''; };

  app.onchange = null;
  app.onclick = e => {
    // 卡片内的按钮必须先于卡片的 data-open 匹配，否则点"复制"会变成"打开"
    const copy = e.target.closest('[data-copy]');
    if (copy) { void copyTrip(ctx, copy.dataset.copy); return; }
    const mdBtn = e.target.closest('[data-md]');
    if (mdBtn) { const t = trips.find(x => x.id === mdBtn.dataset.md); if (t) exportMd(t); return; }
    const del = e.target.closest('[data-del]');
    if (del) { void deleteTrip(ctx, del.dataset.del); return; }
    const open = e.target.closest('[data-open]');
    if (open) void openTrip(ctx, open.dataset.open);
  };
}

export async function openTrip(ctx, id) {
  const { store, toast, render, refreshTrips, view } = ctx;
  const t = await store.getTrip(id);
  if (!t) { toast('行程不存在'); await refreshTrips(); render(); return; }
  ctx.current = t;
  ctx.resetUndo();
  view.mode = 'editor';
  view.picker = null;
  render();
}

export async function copyTrip(ctx, id) {
  const { store, toast, render, refreshTrips } = ctx;
  const src = await store.getTrip(id);
  if (!src) return;
  const r = await store.saveTrip(duplicateTrip(src));
  if (!r.ok) { toast('复制失败：' + ((r.errors[0] || {}).message || '')); return; }
  await refreshTrips();
  render();
  toast('已复制为新行程');
}

export async function deleteTrip(ctx, id) {
  const { store, trips, toast, render, refreshTrips, confirm = globalThis.confirm } = ctx;
  const t = trips.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`删除「${t.title}」？打卡记录会保留（解除关联），不会丢失`)) return;
  const r = await store.deleteTrip(id);
  await refreshTrips();
  render();
  toast(r.detachedVisits ? `已删除，${r.detachedVisits} 条打卡记录已解除关联` : '已删除');
}
