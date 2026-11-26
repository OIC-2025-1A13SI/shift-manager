// @ts-check
/** AppData の初期値・検証・移行（設計書 §5, §7.2）。 */

import { isValidDateKey, parsePeriodKey } from './calendar.js';
import { validateShift } from './shift.js';
import { HISTORY_LIMIT } from './history.js';

/** @typedef {import('./types.js').AppData} AppData */

export const SCHEMA_VERSION = 1;

/** @returns {AppData} */
export function createDefaultAppData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    requests: {},
    history: [], // Q07: 初期履歴は空
    periods: {},
    settings: { greetingEnabled: false, greetingPrefix: '', greetingSuffix: '' }, // Q08: 初期OFF・空欄
  };
}

/** @param {unknown} v */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v */
const isIso = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/**
 * 構造と値を検証する。不正な場合は理由を返し、データは一切変更しない。
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
  if (!isObj(d.requests)) errors.push('requests が不正です');
  else {
    for (const [k, rec] of Object.entries(d.requests)) {
      if (!isValidDateKey(k)) errors.push(`日付が不正です: ${k}`);
      else if (!isObj(rec) || !isIso(rec.updatedAt)) errors.push(`${k} の記録が不正です`);
      else {
        const v = validateShift(rec.shift);
        if (!v.ok) errors.push(`${k}: ${v.reason}`);
      }
    }
  }
  if (!Array.isArray(d.history) || d.history.length > HISTORY_LIMIT) errors.push('history が不正です');
  else {
    const ids = new Set();
    d.history.forEach((h, i) => {
      if (!isObj(h) || typeof h.id !== 'string' || !h.id || ids.has(h.id) || !isIso(h.lastUsedAt)) {
        errors.push(`履歴 ${i + 1} が不正です`);
        return;
      }
      ids.add(h.id);
      if (!h.shift || h.shift.kind !== 'range' || !validateShift(h.shift).ok) errors.push(`履歴 ${i + 1} の時間が不正です`);
    });
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
 * 保存データの読み込み時に使う移行処理。将来 schemaVersion を上げたときにここへ変換を追加する。
 * @param {unknown} raw
 * @returns {{ ok: true, data: AppData } | { ok: false, errors: string[] }}
 */
export function migrateAppData(raw) {
  return validateAppData(raw);
}
