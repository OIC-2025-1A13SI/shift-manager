// @ts-check
/** バックアップの書き出し形式と、復元ファイルの検証（設計書 §7.2、Q10）。 */

import { validateAppData } from '../domain/appData.js';

/** @typedef {import('../domain/types.js').AppData} AppData */

export const BACKUP_APP_ID = 'shift-manager';
export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * @param {AppData} data @param {Date} now
 * @returns {{ filename: string, json: string }}
 */
export function createBackup(data, now) {
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const payload = { app: BACKUP_APP_ID, format: BACKUP_FORMAT, exportedAt: now.toISOString(), data };
  return { filename: `shift-manager-backup-${stamp}.json`, json: JSON.stringify(payload, null, 2) };
}

/**
 * 復元ファイルを検証する。サイズ・JSON・形式・バージョン・日付・時刻・種類をチェックする。
 * @param {string} text @param {number} sizeBytes
 * @returns {{ ok: true, data: AppData } | { ok: false, errors: string[] }}
 */
export function parseBackup(text, sizeBytes) {
  if (sizeBytes > MAX_BACKUP_BYTES) return { ok: false, errors: ['ファイルが大きすぎます（5MBまで）'] };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSONとして読み込めません。ファイルが壊れている可能性があります'] };
  }
  if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP_ID) {
    return { ok: false, errors: ['シフトマネージャーのバックアップファイルではありません'] };
  }
  if (obj.format !== BACKUP_FORMAT) return { ok: false, errors: [`未対応のバックアップ形式です（${String(obj.format)}）`] };
  return validateAppData(obj.data);
}
