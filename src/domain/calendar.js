// @ts-check
/** 期間・日付計算。日付は YYYY-MM-DD 文字列で扱い、曜日は UTC で計算してタイムゾーンのずれを防ぐ。 */

/** @typedef {import('./types.js').DateKey} DateKey */
/** @typedef {import('./types.js').Half} Half */
/** @typedef {import('./types.js').PeriodRef} PeriodRef */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/** @param {number} year @param {number} month 1-12 @param {number} day */
export function toDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** @param {DateKey} key @returns {{ year: number, month: number, day: number }} */
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`不正な日付キー: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 実在する暦日かどうか @param {unknown} key */
export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { year, month, day } = parseDateKey(key);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** @param {number} year @param {number} month 1-12 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** @param {DateKey} key @returns {number} 0=日 … 6=土 */
export function weekdayOf(key) {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** @param {DateKey} key */
export function weekdayLabel(key) {
  return WEEKDAYS[weekdayOf(key)];
}

/** @param {PeriodRef} p */
export function periodKey(p) {
  return `${p.year}-${pad2(p.month)}-${p.half}`;
}

/** @param {string} key @returns {PeriodRef | null} */
export function parsePeriodKey(key) {
  const m = /^(\d{4})-(\d{2})-(first|second)$/.exec(key);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month, half: /** @type {Half} */ (m[3]) };
}

/** 期間に含まれる日付（昇順） @param {PeriodRef} p @returns {DateKey[]} */
export function getPeriodDates(p) {
  const startDay = p.half === 'first' ? 1 : 16;
  const endDay = p.half === 'first' ? 15 : daysInMonth(p.year, p.month);
  const dates = [];
  for (let d = startDay; d <= endDay; d++) dates.push(toDateKey(p.year, p.month, d));
  return dates;
}

/** @param {PeriodRef} p */
export function periodRangeLabel(p) {
  const dates = getPeriodDates(p);
  const first = parseDateKey(dates[0]).day;
  const last = parseDateKey(dates[dates.length - 1]).day;
  return `${p.half === 'first' ? '前半' : '後半'} ${first}〜${last}日`;
}

/**
 * 端末のローカル日付（日本で使う前提）から今月・翌月の4候補を返す。
 * @param {Date} now
 * @returns {PeriodRef[]}
 */
export function getPeriodCandidates(now) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  /** @type {Half[]} */
  const halves = ['first', 'second'];
  return [
    ...halves.map((half) => ({ year, month, half })),
    ...halves.map((half) => ({ year: next.year, month: next.month, half })),
  ];
}

/**
 * 期間内での翌日。期間末日なら null（R12: 最終日は留まる）。
 * @param {DateKey[]} dates @param {DateKey} key
 */
export function nextDateInPeriod(dates, key) {
  const i = dates.indexOf(key);
  if (i < 0 || i === dates.length - 1) return null;
  return dates[i + 1];
}
