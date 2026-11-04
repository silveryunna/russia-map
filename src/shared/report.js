// A-16 举报弹窗：friend 页与 account 页共用（原因分类 + 说明 + 提交回调）
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const REPORT_REASONS = [['fake', '虚假信息'], ['copyright', '侵权'], ['privacy', '隐私'], ['spam', '垃圾信息'], ['other', '其他']];

/**
 * submit: (payload) => Promise<{ ok, duplicate?, error? }>，由调用页提供（各自带 token 的 api 封装）
 */
export function openReportDialog({ targetType = 'submission', targetId, label = '', submit }) {
  const mask = document.createElement('div');
  mask.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:var(--sp-4,16px)';
  mask.innerHTML = `
    <div class="card" style="max-width:480px;width:100%;margin:0">
      <h3 style="margin:0 0 var(--sp-2,8px)">🚩 举报</h3>
      <div class="fr-note" style="margin-top:0">对象：${esc(label || `${targetType} #${targetId}`)}</div>
      <label>原因
        <select id="rp-reason">${REPORT_REASONS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      </label>
      <label>说明（选「其他」时必填）<textarea id="rp-note" rows="3" maxlength="500"></textarea></label>
      <div style="display:flex;gap:var(--sp-2,8px);margin-top:var(--sp-3,12px)">
        <button class="pl-btn small primary" id="rp-send">提交举报</button>
        <button class="pl-btn small" id="rp-cancel">取消</button>
      </div>
      <div class="fr-note" id="rp-msg"></div>
    </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.querySelector('#rp-cancel').onclick = close;
  mask.querySelector('#rp-send').onclick = async () => {
    const msg = mask.querySelector('#rp-msg');
    const reason = mask.querySelector('#rp-reason').value;
    const note = mask.querySelector('#rp-note').value.trim();
    if (reason === 'other' && note.length < 2) { msg.textContent = '选「其他」时请补充说明'; return; }
    msg.textContent = '提交中…';
    try {
      const j = await submit({ targetType, targetId: String(targetId), reason, note });
      msg.textContent = j.duplicate ? '已举报过该内容（重复举报已去重）' : '举报已提交，管理员将在 24h 内处理 ✓';
      setTimeout(close, 1200);
    } catch (e) { msg.textContent = '失败：' + e.message; }
  };
}
