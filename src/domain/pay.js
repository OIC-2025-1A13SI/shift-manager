// @ts-check
/**
 * 給料計算（docs/v2_redesign.md §3.6, §4）。
 * - 1日の時給 ＝（時給の個別設定 または 基本時給）＋（一人シフトなら加算額）
 * - 深夜時間（初期値 22:00〜翌5:00）の分は時給 ×（1 ＋ 割増率）。割増は一人シフト加算後の時給に掛かる
 * - 休憩はまず深夜以外の時間から差し引く
 * - 1円未満は日ごとに切り捨て
 * - 交通費は確定シフトがある日ごとに加算
 * - 締め日・給料日（翌月15日払いなど）から、給料日ごとの対象期間を決める
 */

import { daysInMonth, toDateKey, addMonths, parseDateKey, monthDates } from './calendar.js';
import { hopeToConfirmed } from './confirmed.js';

/** @typedef {import('./types.js').DateKey} DateKey */
/** @typedef {import('./types.js').MonthRef} MonthRef */
/** @typedef {import('./types.js').PaySettings} PaySettings */
/** @typedef {import('./types.js').ConfirmedShift} ConfirmedShift */
/** @typedef {import('./types.js').ConfirmedRecord} ConfirmedRecord */
/** @typedef {import('./types.js').ShiftRecord} ShiftRecord */

/**
 * @typedef {{
 *   wage: number, paidMinutes: number, nightMinutes: number,
 *   base: number, nightPremium: number, soloBonus: number, total: number,
 * }} DayPay
 */

/**
 * 1日分の給料。基本時給も個別設定もない場合は null（計算できない）。
 * @param {Pick<ConfirmedShift, 'start' | 'end' | 'breakMinutes' | 'solo' | 'hourlyWage'>} c
 * @param {PaySettings} pay
 * @returns {DayPay | null}
 */
export function dayPay(c, pay) {
  const baseWage = c.hourlyWage ?? pay.hourlyWage;
  if (baseWage === null) return null;
  const bonus = c.solo ? pay.soloBonus : 0;
  const wage = baseWage + bonus;
  const work = c.end - c.start;
  const night = Math.max(0, Math.min(c.end, pay.nightEnd) - Math.max(c.start, pay.nightStart));
  const normal = work - night;
  const fromNormal = Math.min(c.breakMinutes, normal);
  const normalPaid = normal - fromNormal;
  const nightPaid = Math.max(0, night - (c.breakMinutes - fromNormal));
  const paidMinutes = normalPaid + nightPaid;
  const rate = pay.nightRatePercent / 100;
  const exact = (wage * paidMinutes) / 60 + (wage * rate * nightPaid) / 60;
  const total = Math.floor(exact + 1e-9);
  const nightPremium = Math.floor((wage * rate * nightPaid) / 60 + 1e-9);
  const soloBonus = Math.floor((bonus * paidMinutes) / 60 + 1e-9);
  return { wage, paidMinutes, nightMinutes: nightPaid, base: total - nightPremium - soloBonus, nightPremium, soloBonus, total };
}

/** 月の締め日 @param {MonthRef} m @param {number} closingDay 0=末日 */
function closingDate(m, closingDay) {
  const last = daysInMonth(m.year, m.month);
  return toDateKey(m.year, m.month, closingDay === 0 ? last : Math.min(closingDay, last));
}

/**
 * 給料日（その月の支給日）と、その給料日に支払われる勤務の対象期間。
 * @param {MonthRef} payMonth 給料が支払われる月
 * @param {PaySettings} pay
 * @returns {{ payday: DateKey, from: DateKey, to: DateKey }}
 */
export function payPeriod(payMonth, pay) {
  const lastDay = daysInMonth(payMonth.year, payMonth.month);
  const payday = toDateKey(payMonth.year, payMonth.month, pay.payDay === 0 ? lastDay : Math.min(pay.payDay, lastDay));
  const workMonth = addMonths(payMonth, -pay.payMonthOffset);
  const to = closingDate(workMonth, pay.closingDay);
  const prevClose = closingDate(addMonths(workMonth, -1), pay.closingDay);
  const p = parseDateKey(prevClose);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const from = toDateKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { payday, from, to };
}

/** その日以降で最初の給料日の月 @param {DateKey} today @param {PaySettings} pay @returns {MonthRef} */
export function upcomingPayMonth(today, pay) {
  const t = parseDateKey(today);
  const m = { year: t.year, month: t.month };
  return payPeriod(m, pay).payday >= today ? m : addMonths(m, 1);
}

/** 表示中の月に含まれる給料日（¥ 印用） @param {MonthRef} m @param {PaySettings} pay */
export function paydayInMonth(m, pay) {
  return payPeriod(m, pay).payday;
}

/** 期間内の日付（両端を含む） @param {DateKey} from @param {DateKey} to */
function datesBetween(from, to) {
  const out = [];
  let m = { year: parseDateKey(from).year, month: parseDateKey(from).month };
  for (let i = 0; i < 3; i++) {
    for (const d of monthDates(m)) if (d >= from && d <= to) out.push(d);
    m = addMonths(m, 1);
  }
  return out;
}

/**
 * 給料日ごとの集計。
 * @param {MonthRef} payMonth
 * @param {Record<DateKey, ConfirmedRecord>} confirmed
 * @param {Record<DateKey, ShiftRecord>} hopes
 * @param {PaySettings} pay
 */
export function summarizePay(payMonth, confirmed, hopes, pay) {
  const period = payPeriod(payMonth, pay);
  const dates = datesBetween(period.from, period.to);
  /** @type {{ date: DateKey, c: ConfirmedRecord, pay: DayPay | null }[]} */
  const days = [];
  const sum = { base: 0, nightPremium: 0, soloBonus: 0, transport: 0, total: 0, paidMinutes: 0, nightMinutes: 0, days: 0 };
  let computable = true;
  for (const d of dates) {
    const c = confirmed[d];
    if (!c) continue;
    const p = dayPay(c, pay);
    days.push({ date: d, c, pay: p });
    sum.days++;
    sum.transport += pay.transportPerDay;
    if (!p) { computable = false; continue; }
    sum.base += p.base;
    sum.nightPremium += p.nightPremium;
    sum.soloBonus += p.soloBonus;
    sum.paidMinutes += p.paidMinutes;
    sum.nightMinutes += p.nightMinutes;
  }
  sum.total = sum.base + sum.nightPremium + sum.soloBonus + sum.transport;
  // 希望だけで確定がない日（希望どおりに確定した場合の見込み。休憩なしで計算）
  let hopeDays = 0;
  let hopeTotal = 0;
  let hopeUnknown = 0;
  for (const d of dates) {
    if (confirmed[d] || !hopes[d]) continue;
    const r = hopeToConfirmed(hopes[d].shift, pay);
    if (r === null) continue;
    if (!r.ok) { hopeUnknown++; continue; }
    const p = dayPay({ start: r.start, end: r.end, breakMinutes: 0, solo: false, hourlyWage: null }, pay);
    if (!p) { hopeUnknown++; continue; }
    hopeDays++;
    hopeTotal += p.total + pay.transportPerDay;
  }
  return { period, days, sum, computable, hope: { days: hopeDays, total: hopeTotal, unknown: hopeUnknown } };
}

/** "19時間7分" @param {number} minutes */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/** "¥27,684" @param {number} yen */
export function formatYen(yen) {
  return `¥${yen.toLocaleString('ja-JP')}`;
}
