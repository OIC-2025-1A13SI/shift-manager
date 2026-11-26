// 単体テスト（v2 で追加したドメイン機能）。実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthGrid, addDays, addMonths, periodOf, nextPeriod, periodOptionsAround, periodKey, todayKey,
} from '../src/domain/calendar.js';
import { touchHistory, togglePin, HISTORY_LIMIT } from '../src/domain/history.js';
import { migrateAppData, createDefaultAppData, validateAppData } from '../src/domain/appData.js';
import { fillHopesFromTemplates } from '../src/domain/templates.js';
import { parseBackup } from '../src/infrastructure/backup.js';
import { formatShift } from '../src/domain/formatter.js';

const range = (s, e) => ({ kind: 'range', start: { kind: 'time', minutes: s }, end: { kind: 'time', minutes: e } });
let n = 0;
const gen = () => `id${++n}`;

test('月カレンダー: 2026年12月は11/29(日)〜1/2(土)の5週', () => {
  const g = monthGrid({ year: 2026, month: 12 });
  assert.equal(g.length, 35);
  assert.deepEqual([g[0].date, g[0].inMonth], ['2026-11-29', false]);
  assert.deepEqual([g[2].date, g[2].inMonth], ['2026-12-01', true]);
  assert.equal(g.at(-1).date, '2027-01-02');
  assert.equal(monthGrid({ year: 2026, month: 8 }).length, 42); // 8/1が土曜 → 6週
  assert.equal(monthGrid({ year: 2027, month: 2 }).length, 35); // 2027/2/1は月曜、2/28は日曜 → 1/31〜3/6の5週
});

test('日付・月の移動（年またぎ・うるう年）', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(addMonths({ year: 2027, month: 1 }, -1), { year: 2026, month: 12 });
  assert.equal(todayKey(new Date(2026, 10, 27, 1, 0)), '2026-11-27');
});

test('半月の計算とコピー期間の候補', () => {
  assert.deepEqual(periodOf('2026-11-27'), { year: 2026, month: 11, half: 'second' });
  assert.deepEqual(nextPeriod({ year: 2026, month: 12, half: 'second' }), { year: 2027, month: 1, half: 'first' });
  assert.deepEqual(periodOptionsAround({ year: 2027, month: 1 }).map(periodKey), [
    '2026-12-first', '2026-12-second', '2027-01-first', '2027-01-second', '2027-02-first', '2027-02-second',
  ]);
});

test('ピン留め: 上に固定され、11件目でも消えない', () => {
  let h = [];
  for (let i = 0; i < 10; i++) h = touchHistory(h, range(600 + i * 30, 1800), String(i), gen);
  const oldest = h.at(-1);
  h = togglePin(h, oldest.id);
  assert.equal(h[0].id, oldest.id);
  assert.equal(h[0].pinned, true);
  h = touchHistory(h, range(1500, 1700), 'new', gen);
  assert.equal(h.length, HISTORY_LIMIT);
  assert.ok(h.some((x) => x.id === oldest.id), 'ピン留めは自動削除されない');
  assert.equal(h[0].id, oldest.id);
  assert.equal(formatShift(h[1].shift), '25-28:20');
  // ピン留めを使ってもピン留めの位置は変わらない
  const before = h.map((x) => x.id);
  h = touchHistory(h, oldest.shift, 'again', gen);
  assert.deepEqual(h.map((x) => x.id), before);
  // ピンを外すとピンなしの先頭へ
  h = togglePin(h, oldest.id);
  assert.equal(h[0].id, oldest.id);
  assert.equal(h[0].pinned, false);
});

test('ピン留めが10件なら新しい時間は追加しない', () => {
  let h = [];
  for (let i = 0; i < 10; i++) h = touchHistory(h, range(600 + i * 30, 1800), String(i), gen);
  for (const e of [...h]) h = togglePin(h, e.id);
  assert.ok(h.every((x) => x.pinned));
  const after = touchHistory(h, range(1500, 1700), 'x', gen);
  assert.equal(after, h);
});

test('v1 データを v2 に移行（希望・履歴・設定・期間を保持）', () => {
  const v1 = {
    schemaVersion: 1,
    requests: { '2026-12-01': { shift: range(1140, 1380), updatedAt: '2026-11-26T00:00:00.000Z' } },
    history: [{ id: 'a', shift: range(1140, 1380), lastUsedAt: '2026-11-26T00:00:00.000Z' }],
    periods: { '2026-12-first': { lastCopiedAt: '2026-11-26T00:00:00.000Z' } },
    settings: { greetingEnabled: true, greetingPrefix: 'お疲れ様です', greetingSuffix: '' },
  };
  const r = migrateAppData(v1);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.migratedFrom, 1);
  assert.equal(r.data.schemaVersion, 2);
  assert.deepEqual(r.data.hopes, v1.requests);
  assert.equal(r.data.hopeHistory[0].pinned, false);
  assert.deepEqual(r.data.confirmed, {});
  assert.equal(r.data.settings.greetingPrefix, 'お疲れ様です');
  assert.equal(r.data.pay.nightRatePercent, 25);
  // v1 のバックアップファイルも読める
  const file = JSON.stringify({ app: 'shift-manager', format: 1, exportedAt: 'x', data: v1 });
  const b = parseBackup(file, file.length);
  assert.ok(b.ok);
  assert.equal(b.data.schemaVersion, 2);
  // 壊れた v1 は拒否
  assert.equal(migrateAppData({ ...v1, requests: 'x' }).ok, false);
});

test('v2 の検証: 確定シフト・曜日の型・給料設定の不正値を拒否', () => {
  const ok = createDefaultAppData();
  ok.confirmed = { '2026-12-01': { start: 1140, end: 1380, breakMinutes: 30, solo: false, hourlyWage: null, memo: '', updatedAt: '2026-11-27T00:00:00Z' } };
  ok.weekdayTemplates = { 2: { hope: range(1140, 1380), confirmed: { start: 1140, end: 1380, breakMinutes: 0 } } };
  assert.ok(validateAppData(ok).ok);
  const badC = structuredClone(ok);
  badC.confirmed['2026-12-01'].end = 1000;
  assert.equal(validateAppData(badC).ok, false);
  const badT = structuredClone(ok);
  badT.weekdayTemplates = { 7: { hope: range(1140, 1380) } };
  assert.equal(validateAppData(badT).ok, false);
  const badP = structuredClone(ok);
  badP.pay.nightRatePercent = -1;
  assert.equal(validateAppData(badP).ok, false);
});

test('曜日のいつもので未入力の日だけ埋める', () => {
  const dates = ['2026-12-01', '2026-12-02', '2026-12-03']; // 火 水 木
  const hopes = { '2026-12-01': { shift: { kind: 'unavailable' }, updatedAt: 'x' } };
  const templates = { 2: { hope: range(1140, 1380) }, 3: { hope: { kind: 'available' } } };
  const r = fillHopesFromTemplates(dates, hopes, templates, 'now');
  assert.deepEqual(r.filled, ['2026-12-02']);
  assert.equal(r.hopes['2026-12-01'].shift.kind, 'unavailable');
  assert.equal(r.hopes['2026-12-02'].shift.kind, 'available');
  assert.equal('2026-12-03' in r.hopes, false);
  assert.equal('2026-12-02' in hopes, false, '元のデータは変更しない');
});
