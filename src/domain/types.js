// @ts-check
/**
 * 型定義（JSDoc）。設計書 §5 のデータ構造に対応する。
 * ビルド不要の JavaScript で書き、将来 TypeScript へ移行しやすいよう型を明示する。
 *
 * @typedef {{ kind: 'time', minutes: number } | { kind: 'open' } | { kind: 'none' }} Start
 * @typedef {{ kind: 'time', minutes: number } | { kind: 'last' } | { kind: 'none' }} End
 * @typedef {{ kind: 'range', start: Start, end: End }} TimeShift
 * @typedef {TimeShift | { kind: 'available' } | { kind: 'unavailable' }} Shift
 * @typedef {string} DateKey  YYYY-MM-DD（日本の暦日）
 * @typedef {'first' | 'second'} Half  first=1〜15日, second=16日〜末日
 * @typedef {{ shift: Shift, updatedAt: string }} ShiftRecord
 * @typedef {{ id: string, shift: TimeShift, lastUsedAt: string }} HistoryEntry
 * @typedef {{ lastEditedAt?: string, lastCopiedAt?: string }} PeriodMeta
 * @typedef {{ greetingEnabled: boolean, greetingPrefix: string, greetingSuffix: string }} Settings
 * @typedef {{
 *   schemaVersion: 1,
 *   requests: Record<DateKey, ShiftRecord>,
 *   history: HistoryEntry[],
 *   periods: Record<string, PeriodMeta>,
 *   settings: Settings,
 * }} AppData
 *
 * Phase 2 の確定シフトは AppData に別領域（例: confirmed）を追加して管理する。
 * 希望シフト（requests）とは混在させない。
 *
 * @typedef {{ year: number, month: number, half: Half }} PeriodRef
 */

export {};
