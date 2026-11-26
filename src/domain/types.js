// @ts-check
/**
 * 型定義（JSDoc）。docs/v2_redesign.md §5 のデータ構造に対応する。
 *
 * @typedef {{ kind: 'time', minutes: number } | { kind: 'open' } | { kind: 'none' }} Start
 * @typedef {{ kind: 'time', minutes: number } | { kind: 'last' } | { kind: 'none' }} End
 * @typedef {{ kind: 'range', start: Start, end: End }} TimeShift
 * @typedef {TimeShift | { kind: 'available' } | { kind: 'unavailable' }} Shift  希望シフト
 * @typedef {string} DateKey  YYYY-MM-DD（日本の暦日）
 * @typedef {'first' | 'second'} Half  first=1〜15日, second=16日〜末日
 * @typedef {{ shift: Shift, updatedAt: string }} ShiftRecord
 * @typedef {{ id: string, shift: TimeShift, lastUsedAt: string, pinned: boolean }} HistoryEntry
 * @typedef {{ lastEditedAt?: string, lastCopiedAt?: string }} PeriodMeta
 * @typedef {{ greetingEnabled: boolean, greetingPrefix: string, greetingSuffix: string }} Settings
 *
 * 確定シフト（段階②で画面を実装。時刻は当日0時からの分、10:00〜30:00）
 * @typedef {{ start: number, end: number, breakMinutes: number, solo: boolean, hourlyWage: number | null, memo: string }} ConfirmedShift
 * @typedef {ConfirmedShift & { updatedAt: string }} ConfirmedRecord
 * @typedef {{ id: string, shift: { start: number, end: number, breakMinutes: number }, lastUsedAt: string, pinned: boolean }} ConfirmedHistoryEntry
 *
 * 曜日のいつもの（キーは '0'=日 … '6'=土）
 * @typedef {{ hope?: Shift, confirmed?: { start: number, end: number, breakMinutes: number } }} WeekdayTemplate
 *
 * 給料の設定（段階③で画面を実装）
 * @typedef {{
 *   hourlyWage: number | null,
 *   nightStart: number, nightEnd: number, nightRatePercent: number,
 *   soloBonus: number, transportPerDay: number,
 *   closingDay: number, payMonthOffset: number, payDay: number,
 *   monthlyTarget: number,
 *   openTime: number | null, lastTime: number | null,
 * }} PaySettings  closingDay/payDay は 0=末日
 *
 * @typedef {{
 *   schemaVersion: 2,
 *   hopes: Record<DateKey, ShiftRecord>,
 *   confirmed: Record<DateKey, ConfirmedRecord>,
 *   hopeHistory: HistoryEntry[],
 *   confirmedHistory: ConfirmedHistoryEntry[],
 *   weekdayTemplates: Record<string, WeekdayTemplate>,
 *   pay: PaySettings,
 *   periods: Record<string, PeriodMeta>,
 *   settings: Settings,
 * }} AppData
 *
 * @typedef {{ year: number, month: number, half: Half }} PeriodRef
 * @typedef {{ year: number, month: number }} MonthRef
 */

export {};
