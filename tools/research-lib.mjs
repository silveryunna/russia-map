// 资料补全流水线纯逻辑：缺口队列、候选事实校验、状态汇总
// 研究产物默认写到仓库外（webroot 之外）；这里只处理结构化数据

export const RESEARCH_FIELDS = ['openCalendar', 'ticket', 'name_local', 'duration', 'sources'];
export const CANDIDATE_STATUS = ['pending', 'verified', 'estimated', 'conflict', 'unknown'];
export const SOURCE_TYPES = ['official', 'curated', 'social', 'estimate'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\//i;

const FIELD_GAP = {
  openCalendar: (p) => p.openCalendar === undefined || p.openCalendar === 'unknown'
    || (p.openCalendar && typeof p.openCalendar === 'object'
      && (!p.openCalendar.days || !p.openCalendar.open || !p.openCalendar.close)),
  ticket: (p) => typeof p.ticket !== 'string' || !p.ticket.trim() || p.ticket === 'unknown',
  name_local: (p) => typeof p.name_local !== 'string' || !p.name_local.trim(),
  duration: (p) => !Number.isInteger(p.estimatedDuration) || p.estimatedDuration <= 0,
  sources: (p) => !Array.isArray(p.sources) || !p.sources.length,
};

export function missingFields(point, fields = RESEARCH_FIELDS) {
  return fields.filter((f) => RESEARCH_FIELDS.includes(f) && FIELD_GAP[f](point));
}

// 从数据缺口生成研究队列：动线覆盖优先、使用次数降序；limit 控制试点规模
export function buildGapQueue({ points, routes = [], city, fields = ['openCalendar', 'ticket'], limit = 20, now = Date.now() } = {}) {
  const cityPoints = (Array.isArray(points) ? points : []).filter((p) => p && p.city === city && !p.pending);
  const cityRoutes = (Array.isArray(routes) ? routes : []).filter((r) => r && r.city === city);
  const scopeIds = cityRoutes.length
    ? new Set(cityRoutes.flatMap((r) => (r.steps || []).map((s) => s.pointId)).filter(Boolean))
    : null;
  const usage = new Map();
  for (const r of cityRoutes) {
    for (const s of r.steps || []) if (s.pointId) usage.set(s.pointId, (usage.get(s.pointId) || 0) + 1);
  }

  const queue = [];
  for (const p of cityPoints) {
    if (scopeIds && !scopeIds.has(p.id)) continue;
    const missing = missingFields(p, fields);
    if (!missing.length) continue;
    queue.push({
      pointId: p.id,
      name: p.name || '',
      city: p.city,
      fields: missing,
      routeUsage: usage.get(p.id) || 0,
      status: 'pending',
      queuedAt: new Date(now).toISOString(),
    });
  }
  queue.sort((a, b) => b.routeUsage - a.routeUsage || a.pointId.localeCompare(b.pointId));
  return queue.slice(0, Math.max(0, Number(limit) || 0));
}

function checkValue(field, value, status, err, where) {
  if (field === 'openCalendar') {
    if (status === 'verified' && value === 'unknown') return err(`${where} verified 不能是 unknown`);
    if (value === 'unknown') return;
    if (!value || typeof value !== 'object') return err(`${where} openCalendar 需要对象或 "unknown"`);
    for (const k of ['days', 'open', 'close']) if (!value[k]) err(`${where} openCalendar 缺 ${k}`);
    return;
  }
  if (field === 'ticket') {
    if (typeof value !== 'string' || !value.trim()) err(`${where} ticket 需要非空字符串`);
    else if (status === 'verified' && value === 'unknown') err(`${where} verified 不能是 unknown`);
    return;
  }
  if (field === 'name_local') {
    if (typeof value !== 'string' || !value.trim()) err(`${where} name_local 需要非空字符串`);
    return;
  }
  if (field === 'duration') {
    if (!Number.isInteger(value) || value <= 0 || value > 720) err(`${where} duration 需要 1–720 的整数`);
    return;
  }
  if (field === 'sources') {
    if (!Array.isArray(value) || !value.length) err(`${where} sources 需要非空数组`);
  }
}

// 候选事实校验：verified 必须来自官方来源；UGC 只能作为 estimated/conflict 线索
export function validateCandidates(candidates) {
  const errors = [];
  const err = (message) => errors.push(message);
  if (!Array.isArray(candidates)) return { ok: false, errors: ['候选文件必须是数组'] };
  const seen = new Set();

  candidates.forEach((c, i) => {
    const where = `[${i}]`;
    if (!c || typeof c !== 'object') return err(`${where} 不是对象`);
    if (typeof c.pointId !== 'string' || !c.pointId) err(`${where} 缺 pointId`);
    if (!RESEARCH_FIELDS.includes(c.field)) err(`${where} field 非法：${c.field}`);
    if (!CANDIDATE_STATUS.includes(c.status)) err(`${where} status 非法：${c.status}`);
    if (!SOURCE_TYPES.includes(c.sourceType)) err(`${where} sourceType 非法：${c.sourceType}`);
    if (c.pointId && c.field) {
      const key = `${c.pointId}|${c.field}`;
      if (seen.has(key)) err(`${where} 同一 pointId+field 重复`);
      seen.add(key);
    }
    if (!DATE_RE.test(c.collectedAt || '')) err(`${where} collectedAt 需 YYYY-MM-DD`);
    if (!DATE_RE.test(c.reviewAfter || '')) err(`${where} reviewAfter 需 YYYY-MM-DD`);
    if (DATE_RE.test(c.collectedAt || '') && DATE_RE.test(c.reviewAfter || '') && c.reviewAfter < c.collectedAt) {
      err(`${where} reviewAfter 早于 collectedAt`);
    }
    if (c.status === 'verified' && c.sourceType !== 'official') {
      err(`${where} verified 必须来自 official 来源（UGC 只能做线索）`);
    }
    if (c.status !== 'unknown' && !HTTPS_RE.test(c.sourceUrl || '')) {
      err(`${where} 非 unknown 候选必须有 https 来源链接`);
    }
    if (c.status === 'conflict' && (typeof c.note !== 'string' || !c.note.trim())) {
      err(`${where} conflict 需要 note 说明冲突`);
    }
    checkValue(c.field, c.value, c.status, err, where);
  });

  return { ok: errors.length === 0, errors };
}

export function summarizeCandidates(candidates, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const byStatus = Object.fromEntries(CANDIDATE_STATUS.map((s) => [s, 0]));
  const byField = Object.fromEntries(RESEARCH_FIELDS.map((f) => [f, 0]));
  const bySource = Object.fromEntries(SOURCE_TYPES.map((s) => [s, 0]));
  let expired = 0;
  for (const c of list) {
    if (!c) continue;
    if (byStatus[c.status] !== undefined) byStatus[c.status] += 1;
    if (byField[c.field] !== undefined) byField[c.field] += 1;
    if (bySource[c.sourceType] !== undefined) bySource[c.sourceType] += 1;
    if (c.status !== 'unknown' && DATE_RE.test(c.reviewAfter || '') && c.reviewAfter < today) expired += 1;
  }
  return { total: list.length, byStatus, byField, bySource, expired };
}

// 队列剩余字段：已有候选（任何状态，包括 unknown）的 pointId+field 视为已处理
export function queueRemaining(queueItems, candidates) {
  const covered = new Set((Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && c.pointId && c.field)
    .map((c) => `${c.pointId}|${c.field}`));
  return (Array.isArray(queueItems) ? queueItems : []).reduce(
    (sum, it) => sum + (Array.isArray(it.fields) ? it.fields : []).filter((f) => !covered.has(`${it.pointId}|${f}`)).length,
    0,
  );
}
