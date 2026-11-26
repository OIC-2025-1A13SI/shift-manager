// 単体テスト（ドメイン層）。実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPeriodDates, getPeriodCandidates, weekdayLabel, nextDateInPeriod, periodKey, isValidDateKey,
} from '../src/domain/calendar.js';
import { hourOptions, minuteOptions, clampTime, validateShift, setShift, clearShift, minutesToClock } from '../src/domain/shift.js';
import { touchHistory, removeHistory } from '../src/domain/history.js';
import { formatShift, buildSubmission, buildLines, countMissing } from '../src/domain/formatter.js';
import { createDefaultAppData, validateAppData } from '../src/domain/appData.js';
import { createBackup, parseBackup } from '../src/infrastructure/backup.js';

const t = (minutes) => ({ kind: 'time', minutes });
const range = (start, end) => ({ kind: 'range', start, end });
const OPEN = { kind: 'open' };
const LAST = { kind: 'last' };
const NONE = { kind: 'none' };
const H = (h, m = 0) => h * 60 + m;

test('T01 2026年12月前半: 1〜15日、1日は火曜日', () => {
  const d = getPeriodDates({ year: 2026, month: 12, half: 'first' });
  assert.equal(d.length, 15);
  assert.equal(d[0], '2026-12-01');
  assert.equal(d[14], '2026-12-15');
  assert.equal(weekdayLabel('2026-12-01'), '火');
});

test('T02 2026年12月後半: 16〜31日', () => {
  const d = getPeriodDates({ year: 2026, month: 12, half: 'second' });
  assert.equal(d[0], '2026-12-16');
  assert.equal(d.at(-1), '2026-12-31');
  assert.equal(d.length, 16);
});

test('T03 2027年2月後半は28日まで／2028年2月後半は29日まで', () => {
  assert.equal(getPeriodDates({ year: 2027, month: 2, half: 'second' }).at(-1), '2027-02-28');
  assert.equal(getPeriodDates({ year: 2028, month: 2, half: 'second' }).at(-1), '2028-02-29');
  assert.equal(getPeriodDates({ year: 2026, month: 11, half: 'second' }).at(-1), '2026-11-30');
});

test('T04 12月起動時の翌月は翌年1月', () => {
  const c = getPeriodCandidates(new Date(2026, 11, 20));
  assert.deepEqual(c.map(periodKey), ['2026-12-first', '2026-12-second', '2027-01-first', '2027-01-second']);
  const nov = getPeriodCandidates(new Date(2026, 10, 26));
  assert.deepEqual(nov.map(periodKey), ['2026-11-first', '2026-11-second', '2026-12-first', '2026-12-second']);
});

test('曜日はタイムゾーンに依存しない', () => {
  assert.equal(weekdayLabel('2027-01-01'), '金');
  assert.equal(weekdayLabel('2028-02-29'), '火');
  assert.equal(isValidDateKey('2027-02-29'), false);
  assert.equal(isValidDateKey('2028-02-29'), true);
});

test('T05(v2) ホイールは時10〜30・分0〜59、30:00を超えない', () => {
  assert.deepEqual([hourOptions()[0], hourOptions().at(-1), hourOptions().length], [10, 30, 21]);
  assert.equal(minuteOptions().length, 60);
  assert.equal(clampTime(30, 45), 1800);
  assert.equal(clampTime(9, 59), 600);
  assert.equal(minutesToClock(1800), '30:00');
  assert.equal(validateShift(range(t(H(19)), t(1801))).ok, false);
});

test('v2 1分刻みの書式: 分は00なら省略、それ以外は:MM', () => {
  assert.equal(formatShift(range(t(H(18, 45)), t(H(23, 5)))), '18:45-23:05');
  assert.equal(formatShift(range(t(H(10, 1)), LAST)), '10:01-LA');
  assert.equal(validateShift(range(t(H(19, 15)), t(H(23)))).ok, true);
});

test('T06 18:30〜23:00 → 18:30-23', () => assert.equal(formatShift(range(t(H(18, 30)), t(H(23)))), '18:30-23'));
test('T07 19:00〜30:00 → 19-30', () => assert.equal(formatShift(range(t(H(19)), t(H(30)))), '19-30'));

test('T08 開始=終了、開始>終了は適用不可', () => {
  assert.equal(validateShift(range(t(H(19)), t(H(19)))).ok, false);
  assert.equal(validateShift(range(t(H(23)), t(H(19)))).ok, false);
  assert.equal(validateShift(range(t(H(19)), t(H(19, 30)))).ok, true);
});

test('T09 OP-18、19-LA、OP-LA', () => {
  assert.equal(formatShift(range(OPEN, t(H(18)))), 'OP-18');
  assert.equal(formatShift(range(t(H(19)), LAST)), '19-LA');
  assert.equal(formatShift(range(OPEN, LAST)), 'OP-LA');
  for (const s of [range(OPEN, t(H(18))), range(t(H(19)), LAST), range(OPEN, LAST)]) assert.equal(validateShift(s).ok, true);
});

test('T10 開始のみ、終了のみ、○、×', () => {
  assert.equal(formatShift(range(t(H(19)), NONE)), '19-');
  assert.equal(formatShift(range(NONE, t(H(23)))), '-23');
  assert.equal(formatShift({ kind: 'available' }), '○');
  assert.equal(formatShift({ kind: 'unavailable' }), '×');
});

test('T11 両側指定なしは適用不可', () => assert.equal(validateShift(range(NONE, NONE)).ok, false));

test('Q06 OP-、-LA は適用不可', () => {
  assert.equal(validateShift(range(OPEN, NONE)).ok, false);
  assert.equal(validateShift(range(NONE, LAST)).ok, false);
});

test('範囲外・整数でない時刻は不可', () => {
  assert.equal(validateShift(range(t(570), t(H(12)))).ok, false);
  assert.equal(validateShift(range(t(H(19)), t(1830))).ok, false);
  assert.equal(validateShift(range(t(1140.5), t(H(23)))).ok, false);
});

test('T15/T16 上書きと未入力への復帰', () => {
  let r = setShift({}, ['2026-12-01'], range(t(H(19)), t(H(23))), 'A');
  r = setShift(r, ['2026-12-01'], { kind: 'unavailable' }, 'B');
  assert.equal(r['2026-12-01'].shift.kind, 'unavailable');
  r = clearShift(r, ['2026-12-01']);
  assert.equal('2026-12-01' in r, false);
  const lines = buildLines(['2026-12-01'], r);
  assert.equal(lines[0].text, '12月1日（火）　×');
  assert.equal(lines[0].missing, true);
});

test('翌日計算: 期間末日はnull', () => {
  const d = getPeriodDates({ year: 2026, month: 12, half: 'first' });
  assert.equal(nextDateInPeriod(d, '2026-12-01'), '2026-12-02');
  assert.equal(nextDateInPeriod(d, '2026-12-15'), null);
});

test('T17 同じ履歴を再使用すると重複せず先頭へ', () => {
  let id = 0;
  const gen = () => `h${++id}`;
  let h = touchHistory([], range(t(H(19)), t(H(23))), '1', gen);
  h = touchHistory(h, range(OPEN, t(H(18))), '2', gen);
  h = touchHistory(h, range(t(H(19)), t(H(23))), '3', gen);
  assert.equal(h.length, 2);
  assert.equal(formatShift(h[0].shift), '19-23');
  assert.equal(h[0].id, 'h1');
  assert.equal(h[0].lastUsedAt, '3');
  assert.equal(h[0].pinned, false);
});

test('T18 11種類使うと最古の1件だけ削除され10件', () => {
  let id = 0;
  let h = [];
  for (let i = 0; i < 11; i++) h = touchHistory(h, range(t(H(10) + i * 30), LAST), String(i), () => `h${++id}`);
  assert.equal(h.length, 10);
  assert.equal(h[0].shift.start.minutes, H(10) + 300);
  assert.ok(!h.some((x) => x.shift.start.minutes === H(10)));
});

test('T19 履歴削除は登録済みシフトに影響しない', () => {
  const s = range(t(H(19)), t(H(23)));
  const req = setShift({}, ['2026-12-01'], s, 'A');
  const h = touchHistory([], s, 'A', () => 'x');
  const h2 = removeHistory(h, 'x');
  assert.equal(h2.length, 0);
  assert.equal(formatShift(req['2026-12-01'].shift), '19-23');
});

test('出力書式: 全角括弧・全角スペース・ゼロ埋めなし・昇順', () => {
  const dates = ['2026-12-01', '2026-12-02', '2026-12-03'];
  let r = setShift({}, ['2026-12-01'], range(t(H(19)), t(H(23))), 'A');
  r = setShift(r, ['2026-12-02'], range(t(H(18, 30)), LAST), 'A');
  r = setShift(r, ['2026-12-03'], { kind: 'unavailable' }, 'A');
  const s = buildSubmission(dates, r, createDefaultAppData().settings);
  assert.equal(s, '12月1日（火）　19-23\n12月2日（水）　18:30-LA\n12月3日（木）　×');
});

test('T22/Q08 挨拶文は改行のみで連結、空の挨拶文は省略', () => {
  const dates = ['2026-12-01'];
  const r = setShift({}, dates, { kind: 'available' }, 'A');
  const on = (p, s) => ({ greetingEnabled: true, greetingPrefix: p, greetingSuffix: s });
  assert.equal(buildSubmission(dates, r, on('お疲れ様です。', 'よろしくお願いします。')), 'お疲れ様です。\n12月1日（火）　○\nよろしくお願いします。');
  assert.equal(buildSubmission(dates, r, on('', 'よろしく')), '12月1日（火）　○\nよろしく');
  assert.equal(buildSubmission(dates, r, on('  \n', '')), '12月1日（火）　○');
  assert.equal(buildSubmission(dates, r, { ...on('A', 'B'), greetingEnabled: false }), '12月1日（火）　○');
  assert.equal(buildSubmission(dates, r, on('A\n\n', '\nB')), 'A\n12月1日（火）　○\nB');
});

test('未入力件数', () => {
  const dates = getPeriodDates({ year: 2026, month: 12, half: 'first' });
  const r = setShift({}, ['2026-12-03'], { kind: 'available' }, 'A');
  assert.equal(countMissing(dates, r), 14);
});

test('T26 バックアップの書き出し・読み込みで全データ保持', () => {
  const data = createDefaultAppData();
  data.hopes = setShift({}, ['2026-12-01', '2026-12-02'], range(OPEN, LAST), '2026-11-26T00:00:00.000Z');
  data.hopeHistory = touchHistory([], range(OPEN, LAST), '2026-11-26T00:00:00.000Z', () => 'id1');
  data.periods = { '2026-12-first': { lastEditedAt: '2026-11-26T00:00:00.000Z' } };
  data.settings = { greetingEnabled: true, greetingPrefix: 'お疲れ様です', greetingSuffix: 'よろしく' };
  const { json, filename } = createBackup(data, new Date(2026, 10, 26, 11, 5, 9));
  assert.equal(filename, 'shift-manager-backup-20261126-110509.json');
  const r = parseBackup(json, json.length);
  assert.ok(r.ok);
  assert.deepEqual(r.data, data);
});

test('T27 壊れたJSON・未対応バージョン・不正値は拒否', () => {
  assert.equal(parseBackup('{oops', 5).ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'other', format: 1, data: {} }), 10).ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'shift-manager', format: 2, data: {} }), 10).ok, false);
  const bad = { ...createDefaultAppData(), schemaVersion: 3 };
  assert.equal(parseBackup(JSON.stringify({ app: 'shift-manager', format: 1, data: bad }), 10).ok, false);
  const badDate = createDefaultAppData();
  badDate.hopes = { '2027-02-29': { shift: { kind: 'available' }, updatedAt: '2026-11-26T00:00:00Z' } };
  assert.equal(validateAppData(badDate).ok, false);
  const badTime = createDefaultAppData();
  badTime.hopes = { '2026-12-01': { shift: range(t(1830), LAST), updatedAt: '2026-11-26T00:00:00Z' } };
  assert.equal(validateAppData(badTime).ok, false);
  const badKind = createDefaultAppData();
  badKind.hopes = { '2026-12-01': { shift: { kind: 'maybe' }, updatedAt: '2026-11-26T00:00:00Z' } };
  assert.equal(validateAppData(badKind).ok, false);
  assert.equal(parseBackup('{}', 6 * 1024 * 1024).ok, false);
});
