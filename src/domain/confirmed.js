// @ts-check
/**
 * 確定シフト（docs/v2_redesign.md §3.5）。時刻は当日0時からの分（10:00〜30:00）。
 * 希望シフトとは別の領域（AppData.confirmed）に保存し、混在させない。
 */

import { formatMinutes } from './formatter.js';
import { validateConfirmedTimes } from './appData.js';
import { weekdayOf } from './calendar.js';

/** @typedef {import('./types.js').DateKey} DateKey */
/** @typedef {import('./types.js').Shift} Shift */
/** @typedef {import('./types.js').ShiftRecord} ShiftRecord */
/** @typedef {import('./types.js').ConfirmedShift} ConfirmedShift */
/** @typedef {import('./types.js').ConfirmedRecord} ConfirmedRecord */
/** @typedef {import('./types.js').PaySettings} PaySettings */
/** @typedef {import('./types.js').WeekdayTemplate} WeekdayTemplate */
/** @typedef {{ start: number, end: number, breakMinutes: number }} ConfirmedTimes */

/**
 * 確定シフト全体の検証
 * @param {unknown} c
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateConfirmed(c) {
  const e = validateConfirmedTimes(c);
  if (e) return { ok: false, reason: e };
  const x = /** @type {any} */ (c);
  if (typeof x.solo !== 'boolean') return { ok: false, reason: '一人シフトの指定が不正です' };
  if (!(x.hourlyWage === null || (Number.isInteger(x.hourlyWage) && x.hourlyWage >= 0 && x.hourlyWage <= 100000))) {
    return { ok: false, reason: '時給は0〜100,000円の整数で入力してください' };
  }
  if (typeof x.memo !== 'string' || x.memo.length > 200) return { ok: false, reason: 'メモは200文字までです' };
  return { ok: true };
}

/** 余分なプロパティを落とす @param {ConfirmedShift} c @returns {ConfirmedShift} */
export function normalizeConfirmed(c) {
  return { start: c.start, end: c.end, breakMinutes: c.breakMinutes, solo: c.solo, hourlyWage: c.hourlyWage, memo: c.memo };
}

/** 時間部分だけ @param {ConfirmedTimes} c @returns {ConfirmedTimes} */
export function confirmedTimes(c) {
  return { start: c.start, end: c.end, breakMinutes: c.breakMinutes };
}

/** 履歴の同一判定キー @param {ConfirmedTimes} c */
export function confirmedKey(c) {
  return `${c.start}-${c.end}-${c.breakMinutes}`;
}

/** "19-23" @param {ConfirmedTimes} c */
export function formatConfirmed(c) {
  return `${formatMinutes(c.start)}-${formatMinutes(c.end)}`;
}

/** "休憩30分・一人・時給1,200円" のような補足（何もなければ空文字） @param {Partial<ConfirmedShift>} c */
export function confirmedDetail(c) {
  const parts = [];
  if (c.breakMinutes) parts.push(`休憩${c.breakMinutes}分`);
  if (c.solo) parts.push('一人');
  if (c.hourlyWage !== null && c.hourlyWage !== undefined) parts.push(`時給${c.hourlyWage.toLocaleString('ja-JP')}円`);
  return parts.join('・');
}

/**
 * 希望から確定の時刻を作る（「希望どおり」）。
 * OP/LA は設定のオープン・ラストの時刻で埋める。時刻が決まらない場合は入力画面の初期値（prefill）を返す。
 * × と未入力は対象外（null）。
 * @param {Shift | undefined} hope
 * @param {Pick<PaySettings, 'openTime' | 'lastTime'>} pay
 * @returns {null | { ok: true, start: number, end: number } | { ok: false, start: number | null, end: number | null, reason: string }}
 */
export function hopeToConfirmed(hope, pay) {
  if (!hope || hope.kind === 'unavailable') return null;
  /** @type {number | null} */
  let start = null;
  /** @type {number | null} */
  let end = null;
  if (hope.kind === 'available') {
    start = pay.openTime;
    end = pay.lastTime;
  } else {
    start = hope.start.kind === 'time' ? hope.start.minutes : hope.start.kind === 'open' ? pay.openTime : null;
    end = hope.end.kind === 'time' ? hope.end.minutes : hope.end.kind === 'last' ? pay.lastTime : null;
  }
  if (start === null || end === null) {
    const needsSetting = hope.kind === 'available'
      || (hope.kind === 'range' && ((hope.start.kind === 'open' && pay.openTime === null) || (hope.end.kind === 'last' && pay.lastTime === null)));
    return { ok: false, start, end, reason: needsSetting ? 'オープン・ラストの時刻が未設定です' : '時刻が決まっていません' };
  }
  if (end <= start) return { ok: false, start, end, reason: '終了が開始より前になります' };
  return { ok: true, start, end };
}

/**
 * 複数日に確定シフトを設定する（元のオブジェクトは変更しない）
 * @param {Record<DateKey, ConfirmedRecord>} map @param {DateKey[]} dates @param {ConfirmedShift} c @param {string} nowIso
 */
export function setConfirmed(map, dates, c, nowIso) {
  const v = validateConfirmed(c);
  if (!v.ok) throw new Error(v.reason);
  const next = { ...map };
  for (const d of dates) next[d] = { ...normalizeConfirmed(c), updatedAt: nowIso };
  return next;
}

/** @param {Record<DateKey, ConfirmedRecord>} map @param {DateKey[]} dates */
export function clearConfirmed(map, dates) {
  const next = { ...map };
  for (const d of dates) delete next[d];
  return next;
}

/** @returns {ConfirmedShift} */
export function makeConfirmed(/** @type {ConfirmedTimes} */ t, /** @type {Partial<ConfirmedShift>} */ extra = {}) {
  return { start: t.start, end: t.end, breakMinutes: t.breakMinutes, solo: extra.solo ?? false, hourlyWage: extra.hourlyWage ?? null, memo: extra.memo ?? '' };
}

/**
 * 期間をまとめて確定：未確定の日に希望を写す（「希望どおり」と同じ規則）。
 * @param {DateKey[]} dates
 * @param {Record<DateKey, ConfirmedRecord>} confirmed
 * @param {Record<DateKey, ShiftRecord>} hopes
 * @param {Pick<PaySettings, 'openTime' | 'lastTime'>} pay
 * @param {string} nowIso
 * @returns {{ confirmed: Record<DateKey, ConfirmedRecord>, filled: DateKey[], skipped: DateKey[] }}
 */
export function confirmFromHopes(dates, confirmed, hopes, pay, nowIso) {
  const next = { ...confirmed };
  const filled = [];
  const skipped = [];
  for (const d of dates) {
    if (next[d]) continue;
    const r = hopeToConfirmed(hopes[d]?.shift, pay);
    if (r === null) continue;
    if (!r.ok) { skipped.push(d); continue; }
    next[d] = { ...makeConfirmed({ start: r.start, end: r.end, breakMinutes: 0 }), updatedAt: nowIso };
    filled.push(d);
  }
  return { confirmed: next, filled, skipped };
}

/**
 * 曜日のいつもので未確定の日を埋める（希望・確定で共通の型。2026-11-27 変更）。
 * 型を「希望どおり」と同じ規則で時刻にする。時刻が決まらない日はスキップ。
 * @param {DateKey[]} dates @param {Record<DateKey, ConfirmedRecord>} confirmed
 * @param {Record<string, WeekdayTemplate>} templates
 * @param {Pick<PaySettings, 'openTime' | 'lastTime'>} pay @param {string} nowIso
 * @returns {{ confirmed: Record<DateKey, ConfirmedRecord>, filled: DateKey[], skipped: DateKey[] }}
 */
export function confirmFromTemplates(dates, confirmed, templates, pay, nowIso) {
  const next = { ...confirmed };
  const filled = [];
  const skipped = [];
  for (const d of dates) {
    if (next[d]) continue;
    const r = hopeToConfirmed(templates[String(weekdayOf(d))]?.hope, pay);
    if (r === null) continue;
    if (!r.ok) { skipped.push(d); continue; }
    next[d] = { ...makeConfirmed({ start: r.start, end: r.end, breakMinutes: 0 }), updatedAt: nowIso };
    filled.push(d);
  }
  return { confirmed: next, filled, skipped };
}
