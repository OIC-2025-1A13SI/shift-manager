// @ts-check
/** 最近使った時間の履歴（R16, R17, Q07）。配列は最近使った順（先頭が最新）。 */

import { normalizeShift, shiftKey } from './shift.js';

/** @typedef {import('./types.js').HistoryEntry} HistoryEntry */
/** @typedef {import('./types.js').TimeShift} TimeShift */

export const HISTORY_LIMIT = 10;

/**
 * 使用した時間範囲を履歴の先頭へ。重複は移動、11件目以降は最も長く使われていないものを削除。
 * @param {HistoryEntry[]} history
 * @param {TimeShift} shift
 * @param {string} nowIso
 * @param {() => string} newId
 * @returns {HistoryEntry[]}
 */
export function touchHistory(history, shift, nowIso, newId) {
  const key = shiftKey(shift);
  const existing = history.find((h) => shiftKey(h.shift) === key);
  const entry = existing
    ? { ...existing, lastUsedAt: nowIso }
    : { id: newId(), shift: normalizeShift(shift), lastUsedAt: nowIso };
  const rest = history.filter((h) => h !== existing);
  return [entry, ...rest].slice(0, HISTORY_LIMIT);
}

/** 個別削除。登録済みの希望シフトには影響しない（R16, T19）。
 * @param {HistoryEntry[]} history @param {string} id */
export function removeHistory(history, id) {
  return history.filter((h) => h.id !== id);
}
