// @ts-check
/** AppData の初期値・検証・移行（v2: docs/v2_redesign.md §5）。 */

import { isValidDateKey, parsePeriodKey } from './calendar.js';
import { validateShift, isValidMinutes } from './shift.js';
import { HISTORY_LIMIT } from './history.js';

/** @typedef {import('./types.js').AppData} AppData */
/** @typedef {import('./types.js').PaySettings} PaySettings */

export const SCHEMA_VERSION = 2;

/** @returns {PaySettings} */
export function createDefaultPay() {
  return {
    hourlyWage: null,
    nightStart: 22 * 60,
    nightEnd: 29 * 60, // 翌5:00
    nightRatePercent: 25,
    soloBonus: 0,
    transportPerDay: 0,
    closingDay: 0, // 末日締め
    payMonthOffset: 1,
    payDay: 15, // 翌月15日払い
    monthlyTarget: 0,
    openTime: null,
    lastTime: null,
  };
}

/** @returns {AppData} */
export function createDefaultAppData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    hopes: {},
    confirmed: {},
    hopeHistory: [],
    confirmedHistory: [],
    weekdayTemplates: {},
    pay: createDefaultPay(),
    periods: {},
    settings: { greetingEnabled: false, greetingPrefix: '', greetingSuffix: '' },
  };
}

/** @param {unknown} v */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v */
const isIso = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
/** @param {unknown} v @param {number} min @param {number} max */
const isInt = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** 確定シフトの時間部分 @param {any} c */
export function validateConfirmedTimes(c) {
  if (!isObj(c)) return 'データ形式が不正です';
  if (!isValidMinutes(c.start) || !isValidMinutes(c.end)) return '時刻が範囲外です';
  if (c.end <= c.start) return '終了は開始より後にしてください';
  if (!isInt(c.breakMinutes, 0, c.end - c.start - 1)) return '休憩時間が不正です';
  return null;
}

/**
 * v2 の構造と値を検証する。不正な場合は理由を返し、データは一切変更しない。
 * @param {unknown} raw
 * @returns {{ ok: true, data: AppData } | { ok: false, errors: string[] }}
 */
export function validateAppData(raw) {
  const errors = [];
  if (!isObj(raw)) return { ok: false, errors: ['データ形式が不正です'] };
  const d = /** @type {any} */ (raw);
  if (d.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, errors: [`未対応のデータバージョンです（${String(d.schemaVersion)}）`] };
  }
  if (!isObj(d.hopes)) errors.push('hopes が不正です');
  else {
    for (const [k, rec] of Object.entries(d.hopes)) {
      if (!isValidDateKey(k)) errors.push(`日付が不正です: ${k}`);
      else if (!isObj(rec) || !isIso(rec.updatedAt)) errors.push(`${k} の記録が不正です`);
      else {
        const v = validateShift(rec.shift);
        if (!v.ok) errors.push(`${k}: ${v.reason}`);
      }
    }
  }
  if (!isObj(d.confirmed)) errors.push('confirmed が不正です');
  else {
    for (const [k, rec] of Object.entries(d.confirmed)) {
      if (!isValidDateKey(k)) { errors.push(`確定の日付が不正です: ${k}`); continue; }
      const e = validateConfirmedTimes(rec);
      if (e) { errors.push(`確定 ${k}: ${e}`); continue; }
      if (typeof rec.solo !== 'boolean' || typeof rec.memo !== 'string' || !isIso(rec.updatedAt)
        || !(rec.hourlyWage === null || isInt(rec.hourlyWage, 0, 100000))) errors.push(`確定 ${k} の記録が不正です`);
    }
  }
  const checkHistory = (/** @type {unknown} */ list, /** @type {string} */ name, /** @type {(s: any) => boolean} */ okShift) => {
    if (!Array.isArray(list) || list.length > HISTORY_LIMIT) { errors.push(`${name} が不正です`); return; }
    const ids = new Set();
    list.forEach((h, i) => {
      if (!isObj(h) || typeof h.id !== 'string' || !h.id || ids.has(h.id) || !isIso(h.lastUsedAt) || typeof h.pinned !== 'boolean') {
        errors.push(`${name} ${i + 1} が不正です`);
        return;
      }
      ids.add(h.id);
      if (!okShift(h.shift)) errors.push(`${name} ${i + 1} の時間が不正です`);
    });
  };
  checkHistory(d.hopeHistory, '履歴', (s) => isObj(s) && s.kind === 'range' && validateShift(s).ok);
  checkHistory(d.confirmedHistory, '確定の履歴', (s) => validateConfirmedTimes(s) === null);

  if (!isObj(d.weekdayTemplates)) errors.push('weekdayTemplates が不正です');
  else {
    for (const [k, t] of Object.entries(d.weekdayTemplates)) {
      if (!/^[0-6]$/.test(k) || !isObj(t)) { errors.push(`曜日の型が不正です: ${k}`); continue; }
      if (t.hope !== undefined && !validateShift(t.hope).ok) errors.push(`曜日の型 ${k} の希望が不正です`);
      if (t.confirmed !== undefined && validateConfirmedTimes(t.confirmed)) errors.push(`曜日の型 ${k} の確定が不正です`);
    }
  }

  const p = d.pay;
  const optTime = (/** @type {unknown} */ v) => v === null || isValidMinutes(v);
  if (!isObj(p) || !(p.hourlyWage === null || isInt(p.hourlyWage, 0, 100000))
    || !isInt(p.nightStart, 0, 48 * 60) || !isInt(p.nightEnd, 0, 48 * 60) || !isInt(p.nightRatePercent, 0, 200)
    || !isInt(p.soloBonus, 0, 100000) || !isInt(p.transportPerDay, 0, 100000)
    || !isInt(p.closingDay, 0, 28) || !isInt(p.payMonthOffset, 0, 2) || !isInt(p.payDay, 0, 28)
    || !isInt(p.monthlyTarget, 0, 100000000) || !optTime(p.openTime) || !optTime(p.lastTime)) {
    errors.push('給料の設定が不正です');
  }

  if (!isObj(d.periods)) errors.push('periods が不正です');
  else {
    for (const [k, meta] of Object.entries(d.periods)) {
      if (!parsePeriodKey(k) || !isObj(meta)) { errors.push(`期間が不正です: ${k}`); continue; }
      for (const f of ['lastEditedAt', 'lastCopiedAt']) {
        if (meta[f] !== undefined && !isIso(meta[f])) errors.push(`${k}.${f} が不正です`);
      }
    }
  }
  const s = d.settings;
  if (!isObj(s) || typeof s.greetingEnabled !== 'boolean' || typeof s.greetingPrefix !== 'string' || typeof s.greetingSuffix !== 'string') {
    errors.push('settings が不正です');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: /** @type {AppData} */ (structuredClone(d)) };
}

/**
 * 保存データ・バックアップの読み込み時の移行。v1（requests / history）を v2 に変換してから検証する。
 * @param {unknown} raw
 * @returns {{ ok: true, data: AppData, migratedFrom?: number } | { ok: false, errors: string[] }}
 */
export function migrateAppData(raw) {
  if (isObj(raw) && /** @type {any} */ (raw).schemaVersion === 1) {
    const v1 = /** @type {any} */ (raw);
    const base = createDefaultAppData();
    const converted = {
      ...base,
      hopes: v1.requests,
      hopeHistory: Array.isArray(v1.history) ? v1.history.map((/** @type {any} */ h) => (isObj(h) ? { ...h, pinned: false } : h)) : v1.history,
      periods: v1.periods,
      settings: v1.settings,
    };
    const r = validateAppData(converted);
    return r.ok ? { ...r, migratedFrom: 1 } : r;
  }
  return validateAppData(raw);
}
