// 评分体系：平台评分（大众点评/携程/小红书）+ 私人米其林（第一方评分卡）
// 数据源：window.__ratings__（data/ratings.json，已由 fetch 脚本合并 michelin-manual）
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// 点评数格式化：≥1万 → x.x万
export function fmtCount(r) {
  if (!r || !r.count) return 0;
  return r.count >= 1e4 ? (r.count / 1e4).toFixed(1).replace(/\.0$/, '') + '万' : r.count;
}

// 有效评分过滤：小红书要有 verdict；第一方（dims）要 overall>0；平台分要 score>0 且点评数达标
export function validRatings(entry) {
  const list = (entry && (entry.ratings || [entry])) || [];
  return list.filter((r) =>
    r && (r.src === '小红书'
      ? r.verdict
      : r.dims
        ? r.overall > 0
        : r.score > 0 && (r.count >= 10 || (r.src === '大众点评' && r.count >= 5))));
}

// 平台评分 pill（大众点评红 / 小红书粉 / 其他黄；携程未核实带 ⚠️）
function ratingPill(r) {
  const bg = r.src === '大众点评' ? '#FFF3EF' : r.src === '小红书' ? '#FFF0F3' : '#FFF7E6';
  const bd = r.src === '大众点评' ? '#FFD3C2' : r.src === '小红书' ? '#FFC2D1' : '#FFDFA8';
  const fg = r.src === '大众点评' ? '#8A3A22' : r.src === '小红书' ? '#A02040' : '#8A5A00';
  const checked = r.checked || (window.__ratings__ || {}).updated || '';
  const score = r.src === '小红书'
    ? `<span style="font-weight:800;color:#FF2442;font-size:13px;white-space:nowrap">${r.verdict === '避雷' ? '⛔' : r.verdict === '一般' ? '🟡' : '🟢'} ${esc(r.verdict)}</span>`
    : `<span style="font-weight:800;color:${r.src === '大众点评' ? '#FF6633' : '#E8A33D'};font-size:13px">★ ${r.score}</span>${
        r.page ? `<span style="font-size:11px" title="已经官方页面核实">✅</span>`
        : r.src === '携程' ? `<span style="font-size:11px" title="未经官方页面核实，仅供参考">⚠️</span>` : ''}`;
  const mid = r.src === '小红书'
    ? `${esc(r.src)}${r.note ? ` · ${esc(r.note)}` : ''}`
    : `${esc(r.src)}${fmtCount(r) ? ` · ${fmtCount(r)} 条点评` : ''}`;
  return `<div style="margin-bottom:6px"><a href="${esc(r.url || '#')}" target="_blank" rel="noopener" title="采集于 ${esc(checked)}，实时数据以${esc(r.src)}为准" style="display:flex;align-items:center;gap:6px;text-decoration:none;background:${bg};border:1px solid ${bd};border-radius:8px;padding:6px 9px;font-size:12px;color:${fg}">${score}<span style="flex:1">${mid}</span><span style="font-size:11px;opacity:.75">${r.src === '小红书' ? '看笔记 ›' : '去看点评 ›'}</span></a></div>`;
}

// 私人米其林卡（👑站长 / ●朋友；星级 + 维度分 + 一句话）
function michelinCard(r) {
  const o = Math.max(0, Math.min(5, r.overall || 0));
  const star = '★'.repeat(o) + '☆'.repeat(5 - o);
  const who = r.src === '站长' ? '👑 站长' : `● ${esc(String(r.src).replace(/^朋友:/, ''))}`;
  const dims = r.dims ? Object.entries(r.dims).map(([d, v]) => `${esc(d)} ${v}`).join(' · ') : '';
  const when = r.visited && /^\d{4}-\d{2}$/.test(r.visited) ? `${+r.visited.slice(5)}月去的` : '';
  return `<div style="margin-bottom:6px;border:1px solid #EAD9C2;border-radius:8px;padding:7px 9px;background:#FFFDF8">` +
    `<div style="display:flex;align-items:center;gap:6px;font-size:12px"><span style="font-weight:700">${who}</span><span style="color:#E8A33D;letter-spacing:1px">${star}</span>${when ? `<span style="color:#999;font-size:11px">${when}</span>` : ''}</div>` +
    `${dims ? `<div style="font-size:11px;color:#7A5C3E;margin-top:3px">${dims}</div>` : ''}` +
    `${r.note ? `<div style="font-size:12px;color:#444;margin-top:3px">${esc(r.note)}</div>` : ''}</div>`;
}

// 弹窗评分区：有第一方评分时显示页签（默认米其林页）；否则直接列平台评分
// 注意：页签内容显隐用 .rtpg 类规则，不能写内联 display（内联会压过样式表，两页全隐的教训）
export function ratingTabs(p, rl) {
  const fp = rl
    .filter((r) => r.dims)
    .sort((a, b) =>
      (a.src === '站长' ? 0 : 1) - (b.src === '站长' ? 0 : 1) ||
      String(b.visited || b.checked || '').localeCompare(String(a.visited || a.checked || '')));
  const tp = rl.filter((r) => !r.dims);
  if (!fp.length) return tp.map((r) => ratingPill(r)).join('');
  const id = p.id;
  const pills = tp.length
    ? tp.map((r) => ratingPill(r)).join('')
    : `<div style="font-size:12px;color:#999;padding:4px 0">暂无平台评分</div>`;
  const cards = fp.map(michelinCard).join('');
  return `<style>.rtpg{display:none}.rtlb label{flex:1;text-align:center;font-size:12px;padding:4px 0;border-radius:7px;border:1px solid #ddd;color:#888;cursor:pointer}#rtm-${id}:checked~.rtm-${id}{display:block}#rtp-${id}:checked~.rtp-${id}{display:block}#rtm-${id}:checked~.rtlb label[for=rtm-${id}],#rtp-${id}:checked~.rtlb label[for=rtp-${id}]{background:#B71C1C;color:#fff;border-color:#B71C1C}</style><div style="margin:6px 0"><input type="radio" name="rt-${id}" id="rtm-${id}" style="display:none" checked><input type="radio" name="rt-${id}" id="rtp-${id}" style="display:none"><div class="rtlb" style="display:flex;gap:6px;margin-bottom:6px"><label for="rtm-${id}">🍴 私人米其林</label><label for="rtp-${id}">平台评分</label></div><div class="rtpg rtm-${id}">${cards}</div><div class="rtpg rtp-${id}">${pills}</div></div>`;
}

// 侧栏点位行的评分徽章：★4.5点评 / ★4.6携程
export function ratingBadges(id) {
  const entry = window.__ratings__ && window.__ratings__.items ? window.__ratings__.items[id] : null;
  if (!entry) return '';
  const list = ((entry.ratings || [entry])).filter(
    (r) => r && r.score > 0 && (r.count >= 10 || (r.src === '大众点评' && r.count >= 5)));
  return list
    .map((r) => ` <span style="color:${r.src === '大众点评' ? '#FF6633' : '#E8A33D'};font-weight:700">★${r.score}${r.src === '大众点评' ? '点评' : '携程'}</span>`)
    .join('');
}
