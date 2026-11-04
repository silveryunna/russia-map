// 本地日期（纯函数，无 DOM / storage / fetch）
// 统一"某时刻属于哪一天 / 今天几号"的口径：
//   - 给了合法 IANA 时区（Trip.homeTimeZone / ItineraryItem.timeZone）→ 按该时区取日历日
//   - 没给或非法 → 回退设备本地时区
// 背景：`new Date().toISOString().slice(0, 10)` 取的是 UTC 日期，东八区 00:00–08:00
// 会把"今天"落到前一天（打卡日期、计划今天、备份提醒都会错一天）。

const pad = n => String(n).padStart(2, '0');

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function deviceDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 时间戳/Date → YYYY-MM-DD（按 timeZone，缺省设备本地）；非法输入返回空串 */
export function dateInZone(value = Date.now(), timeZone = '') {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  if (isValidTimeZone(timeZone)) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const pick = type => (parts.find(p => p.type === type) || {}).value || '';
    const y = pick('year');
    const m = pick('month');
    const day = pick('day');
    if (y && m && day) return `${y}-${m}-${day}`;
  }
  return deviceDate(d);
}

/** 今天（按 timeZone，缺省设备本地） */
export function todayInZone(timeZone = '') {
  return dateInZone(new Date(), timeZone);
}
