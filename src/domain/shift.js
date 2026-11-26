// @ts-check
/** 希望シフトの検証・設定・取消（設計書 §7.1、Q06、v2: 1分刻み）。 */

/** @typedef {import('./types.js').Shift} Shift */
/** @typedef {import('./types.js').TimeShift} TimeShift */
/** @typedef {import('./types.js').DateKey} DateKey */
/** @typedef {import('./types.js').ShiftRecord} ShiftRecord */

export const MIN_MINUTES = 600; // 10:00
export const MAX_MINUTES = 1800; // 30:00（翌朝6時）
export const STEP_MINUTES = 1; // v2: 1分刻み

/** 時ホイールの候補（10〜30） */
export function hourOptions() {
  const out = [];
  for (let h = MIN_MINUTES / 60; h <= MAX_MINUTES / 60; h++) out.push(h);
  return out;
}

/** 分ホイールの候補（0〜59） */
export function minuteOptions() {
  return Array.from({ length: 60 }, (_, i) => i);
}

/** 時・分を範囲内（10:00〜30:00）に収めた分数にする @param {number} h @param {number} m */
export function clampTime(h, m) {
  return Math.min(Math.max(h * 60 + m, MIN_MINUTES), MAX_MINUTES);
}

/** @param {unknown} m */
export function isValidMinutes(m) {
  return (
    typeof m === 'number' &&
    Number.isInteger(m) &&
    m >= MIN_MINUTES &&
    m <= MAX_MINUTES &&
    (m - MIN_MINUTES) % STEP_MINUTES === 0
  );
}

/** 表示用 "HH:MM"（ホイール用） @param {number} m */
export function minutesToClock(m) {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * 希望シフトの妥当性を判定する。
 * @param {unknown} shift
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateShift(shift) {
  if (!shift || typeof shift !== 'object') return { ok: false, reason: '希望が指定されていません' };
  const s = /** @type {any} */ (shift);
  if (s.kind === 'available' || s.kind === 'unavailable') return { ok: true };
  if (s.kind !== 'range') return { ok: false, reason: '不明な種類です' };
  const { start, end } = s;
  if (!start || !end) return { ok: false, reason: '開始・終了が必要です' };
  if (!['time', 'open', 'none'].includes(start.kind)) return { ok: false, reason: '開始の指定が不正です' };
  if (!['time', 'last', 'none'].includes(end.kind)) return { ok: false, reason: '終了の指定が不正です' };
  if (start.kind === 'time' && !isValidMinutes(start.minutes)) return { ok: false, reason: '開始時刻が範囲外です' };
  if (end.kind === 'time' && !isValidMinutes(end.minutes)) return { ok: false, reason: '終了時刻が範囲外です' };
  if (start.kind === 'none' && end.kind === 'none') return { ok: false, reason: '開始・終了の両方を指定なしにはできません' };
  // Q06: OP- / -LA は許可しない
  if (start.kind === 'open' && end.kind === 'none') return { ok: false, reason: 'OPのときは終了（時刻またはLA）を指定してください' };
  if (start.kind === 'none' && end.kind === 'last') return { ok: false, reason: 'LAのときは開始（時刻またはOP）を指定してください' };
  if (start.kind === 'time' && end.kind === 'time' && end.minutes <= start.minutes) {
    return { ok: false, reason: '終了は開始より後にしてください' };
  }
  return { ok: true };
}

/**
 * 余分なプロパティを落とした正規形を返す（保存・履歴の重複判定用）。
 * @template {Shift} T @param {T} shift @returns {T}
 */
export function normalizeShift(shift) {
  if (shift.kind !== 'range') return /** @type {T} */ ({ kind: shift.kind });
  const start = shift.start.kind === 'time' ? { kind: 'time', minutes: shift.start.minutes } : { kind: shift.start.kind };
  const end = shift.end.kind === 'time' ? { kind: 'time', minutes: shift.end.minutes } : { kind: shift.end.kind };
  return /** @type {T} */ ({ kind: 'range', start, end });
}

/** 同一判定用キー @param {Shift} shift */
export function shiftKey(shift) {
  if (shift.kind !== 'range') return shift.kind;
  const a = shift.start.kind === 'time' ? String(shift.start.minutes) : shift.start.kind;
  const b = shift.end.kind === 'time' ? String(shift.end.minutes) : shift.end.kind;
  return `range:${a}-${b}`;
}

/**
 * 複数日に同じ希望を設定する（R13, R14: 確認なしで上書き）。元のオブジェクトは変更しない。
 * @param {Record<DateKey, ShiftRecord>} requests
 * @param {DateKey[]} dateKeys
 * @param {Shift} shift
 * @param {string} nowIso
 */
export function setShift(requests, dateKeys, shift, nowIso) {
  const v = validateShift(shift);
  if (!v.ok) throw new Error(v.reason);
  if (dateKeys.length === 0) throw new Error('日付が選択されていません');
  const next = { ...requests };
  const normalized = normalizeShift(shift);
  for (const key of dateKeys) next[key] = { shift: normalized, updatedAt: nowIso };
  return next;
}

/**
 * 未入力に戻す（R15）。未入力は日付キーが存在しない状態。
 * @param {Record<DateKey, ShiftRecord>} requests @param {DateKey[]} dateKeys
 */
export function clearShift(requests, dateKeys) {
  const next = { ...requests };
  for (const key of dateKeys) delete next[key];
  return next;
}
