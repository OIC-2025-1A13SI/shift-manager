// @ts-check
/** 提出文章の生成（設計書 §2.1、Q08）。 */

import { parseDateKey, weekdayLabel } from './calendar.js';

/** @typedef {import('./types.js').Shift} Shift */
/** @typedef {import('./types.js').DateKey} DateKey */
/** @typedef {import('./types.js').ShiftRecord} ShiftRecord */
/** @typedef {import('./types.js').Settings} Settings */

export const UNSET_OUTPUT = '×';

/** 分が00なら省略、30なら ":30"。24時超えはそのまま（19-30）。 @param {number} minutes */
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
}

/** @param {Shift} shift */
export function formatShift(shift) {
  switch (shift.kind) {
    case 'available':
      return '○';
    case 'unavailable':
      return '×';
    case 'range': {
      const s = shift.start.kind === 'time' ? formatMinutes(shift.start.minutes) : shift.start.kind === 'open' ? 'OP' : '';
      const e = shift.end.kind === 'time' ? formatMinutes(shift.end.minutes) : shift.end.kind === 'last' ? 'LA' : '';
      return `${s}-${e}`;
    }
  }
}

/** "12月1日（火）" @param {DateKey} key */
export function formatDateLabel(key) {
  const { month, day } = parseDateKey(key);
  return `${month}月${day}日（${weekdayLabel(key)}）`;
}

/**
 * プレビュー行。未入力は × として表示し missing で区別する。
 * @param {DateKey[]} dates @param {Record<DateKey, ShiftRecord>} requests
 * @returns {{ date: DateKey, text: string, missing: boolean }[]}
 */
export function buildLines(dates, requests) {
  return dates.map((date) => {
    const rec = requests[date];
    const value = rec ? formatShift(rec.shift) : UNSET_OUTPUT;
    return { date, text: `${formatDateLabel(date)}　${value}`, missing: !rec };
  });
}

/** @param {DateKey[]} dates @param {Record<DateKey, ShiftRecord>} requests */
export function countMissing(dates, requests) {
  return dates.filter((d) => !requests[d]).length;
}

/** 挨拶文が空（空白のみ含む）なら null。前後の改行は除く。 @param {string} text */
function greetingPart(text) {
  if (!text || text.trim() === '') return null;
  return text.replace(/^[\r\n]+|[\r\n\s]+$/g, '');
}

/**
 * 提出文章（プレビュー・コピー共通。T22 で一致させるため同じ関数を使う）。
 * 挨拶文ON時は 先頭文 / 日程 / 末尾文 を改行のみで連結（Q08: 空行なし）。
 * @param {DateKey[]} dates @param {Record<DateKey, ShiftRecord>} requests @param {Settings} settings
 */
export function buildSubmission(dates, requests, settings) {
  const parts = [];
  const prefix = settings.greetingEnabled ? greetingPart(settings.greetingPrefix) : null;
  const suffix = settings.greetingEnabled ? greetingPart(settings.greetingSuffix) : null;
  if (prefix) parts.push(prefix);
  parts.push(buildLines(dates, requests).map((l) => l.text).join('\n'));
  if (suffix) parts.push(suffix);
  return parts.join('\n');
}
