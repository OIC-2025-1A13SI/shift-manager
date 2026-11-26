// @ts-check
/**
 * 最近使った時間の履歴（R16, R17、v2: ピン留め）。
 * 並び順は「ピン留め（ピン留めした順）」→「ピンなし（最近使った順）」。
 * 合計10件まで。超えたらピンなしのうち最も長く使われていないものを削除し、ピン留めは自動削除しない。
 * 10件すべてがピン留めの場合、新しい時間は履歴に追加しない。
 * 希望用と確定用で同じ関数を使う（キーの作り方だけ差し替える）。
 */

import { normalizeShift, shiftKey } from './shift.js';

/** @typedef {import('./types.js').HistoryEntry} HistoryEntry */
/** @typedef {import('./types.js').TimeShift} TimeShift */

export const HISTORY_LIMIT = 10;

/**
 * @template {{ id: string, lastUsedAt: string, pinned: boolean, shift: any }} E
 * @param {E[]} history
 * @param {E['shift']} shift
 * @param {string} nowIso
 * @param {() => string} newId
 * @param {(s: E['shift']) => string} keyOf
 * @param {(s: E['shift']) => E['shift']} normalize
 * @returns {E[]}
 */
export function touchGenericHistory(history, shift, nowIso, newId, keyOf, normalize) {
  const key = keyOf(shift);
  const existing = history.find((h) => keyOf(h.shift) === key);
  const pinned = history.filter((h) => h.pinned);
  let unpinned = history.filter((h) => !h.pinned);
  if (existing) {
    const updated = { ...existing, lastUsedAt: nowIso };
    if (existing.pinned) return history.map((h) => (h === existing ? updated : h));
    unpinned = [updated, ...unpinned.filter((h) => h !== existing)];
    return [...pinned, ...unpinned];
  }
  if (pinned.length >= HISTORY_LIMIT) return history;
  const entry = /** @type {E} */ ({ id: newId(), shift: normalize(shift), lastUsedAt: nowIso, pinned: false });
  unpinned = [entry, ...unpinned].slice(0, HISTORY_LIMIT - pinned.length);
  return [...pinned, ...unpinned];
}

/**
 * 希望シフトの履歴に使用を記録する。
 * @param {HistoryEntry[]} history @param {TimeShift} shift @param {string} nowIso @param {() => string} newId
 * @returns {HistoryEntry[]}
 */
export function touchHistory(history, shift, nowIso, newId) {
  return touchGenericHistory(history, shift, nowIso, newId, shiftKey, normalizeShift);
}

/** 個別削除。登録済みのシフトには影響しない（R16, T19）。
 * @template {{ id: string }} E @param {E[]} history @param {string} id @returns {E[]} */
export function removeHistory(history, id) {
  return history.filter((h) => h.id !== id);
}

/**
 * ピン留めの切り替え。ピン留めするとピン留めグループの末尾、外すとピンなしの先頭へ。
 * @template {{ id: string, pinned: boolean }} E @param {E[]} history @param {string} id @returns {E[]}
 */
export function togglePin(history, id) {
  const target = history.find((h) => h.id === id);
  if (!target) return history;
  const rest = history.filter((h) => h !== target);
  const pinned = rest.filter((h) => h.pinned);
  const unpinned = rest.filter((h) => !h.pinned);
  // どちらの場合も「ピン留めグループの直後＝ピンなしの先頭」の位置になる
  return [...pinned, { ...target, pinned: !target.pinned }, ...unpinned];
}
