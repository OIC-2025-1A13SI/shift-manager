// @ts-check
/** 曜日のいつもの（weekdayTemplates）を使った入力（docs/v2_redesign.md §3.2, §3.7）。 */

import { weekdayOf } from './calendar.js';
import { normalizeShift } from './shift.js';

/** @typedef {import('./types.js').DateKey} DateKey */
/** @typedef {import('./types.js').Shift} Shift */
/** @typedef {import('./types.js').ShiftRecord} ShiftRecord */
/** @typedef {import('./types.js').WeekdayTemplate} WeekdayTemplate */

/** その日の曜日の希望の型 @param {Record<string, WeekdayTemplate>} templates @param {DateKey} date @returns {Shift | null} */
export function hopeTemplateFor(templates, date) {
  return templates[String(weekdayOf(date))]?.hope ?? null;
}

/**
 * 未入力の日だけを曜日の型で埋める（入力済み・型のない曜日はそのまま）。
 * @param {DateKey[]} dates @param {Record<DateKey, ShiftRecord>} hopes
 * @param {Record<string, WeekdayTemplate>} templates @param {string} nowIso
 * @returns {{ hopes: Record<DateKey, ShiftRecord>, filled: DateKey[] }}
 */
export function fillHopesFromTemplates(dates, hopes, templates, nowIso) {
  const next = { ...hopes };
  const filled = [];
  for (const d of dates) {
    if (next[d]) continue;
    const t = hopeTemplateFor(templates, d);
    if (!t) continue;
    next[d] = { shift: normalizeShift(t), updatedAt: nowIso };
    filled.push(d);
  }
  return { hopes: next, filled };
}
