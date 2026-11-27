// 単体テスト（段階②：確定シフト）。実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hopeToConfirmed, validateConfirmed, formatConfirmed, confirmedDetail, confirmFromHopes, confirmFromTemplates, makeConfirmed,
} from '../src/domain/confirmed.js';
import { createController } from '../src/application/controller.js';
import { createMemoryStorage } from '../src/infrastructure/storage.js';
import { validateAppData } from '../src/domain/appData.js';

const H = (h, m = 0) => h * 60 + m;
const t = (m) => ({ kind: 'time', minutes: m });
const range = (s, e) => ({ kind: 'range', start: s, end: e });
const OPEN = { kind: 'open' };
const LAST = { kind: 'last' };
const NONE = { kind: 'none' };
const PAY = { openTime: H(10), lastTime: H(29) };
const NOPAY = { openTime: null, lastTime: null };
const DEC1 = { year: 2026, month: 12, half: 'first' };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('希望どおり: 時刻・OP/LA・○・×・片側のみ', () => {
  assert.deepEqual(hopeToConfirmed(range(t(H(19)), t(H(23))), NOPAY), { ok: true, start: H(19), end: H(23) });
  assert.deepEqual(hopeToConfirmed(range(OPEN, t(H(18))), PAY), { ok: true, start: H(10), end: H(18) });
  assert.deepEqual(hopeToConfirmed(range(t(H(19)), LAST), PAY), { ok: true, start: H(19), end: H(29) });
  assert.deepEqual(hopeToConfirmed({ kind: 'available' }, PAY), { ok: true, start: H(10), end: H(29) });
  assert.equal(hopeToConfirmed({ kind: 'unavailable' }, PAY), null);
  assert.equal(hopeToConfirmed(undefined, PAY), null);
  const op = hopeToConfirmed(range(OPEN, t(H(18))), NOPAY);
  assert.equal(op.ok, false);
  assert.equal(op.reason, 'オープン・ラストの時刻が未設定です');
  assert.equal(op.end, H(18));
  const half = hopeToConfirmed(range(t(H(19)), NONE), PAY);
  assert.deepEqual([half.ok, half.start, half.end, half.reason], [false, H(19), null, '時刻が決まっていません']);
  const rev = hopeToConfirmed(range(t(H(19)), LAST), { openTime: null, lastTime: H(18) });
  assert.equal(rev.ok, false);
});

test('確定の検証と表示', () => {
  const ok = makeConfirmed({ start: H(19), end: H(23, 30), breakMinutes: 30 }, { solo: true, hourlyWage: 1200 });
  assert.ok(validateConfirmed(ok).ok);
  assert.equal(formatConfirmed(ok), '19-23:30');
  assert.equal(confirmedDetail(ok), '休憩30分・一人・時給1,200円');
  assert.equal(confirmedDetail(makeConfirmed({ start: H(19), end: H(23), breakMinutes: 0 })), '');
  assert.equal(validateConfirmed({ ...ok, end: H(19) }).ok, false);
  assert.equal(validateConfirmed({ ...ok, breakMinutes: H(4, 30) }).ok, false, '休憩が勤務時間以上');
  assert.equal(validateConfirmed({ ...ok, breakMinutes: -5 }).ok, false);
  assert.equal(validateConfirmed({ ...ok, hourlyWage: 1200.5 }).ok, false);
  assert.equal(validateConfirmed({ ...ok, memo: 'x'.repeat(201) }).ok, false);
});

test('期間をまとめて確定: 未確定で希望がある日だけ、決まらない日はスキップ', () => {
  const hopes = {
    '2026-12-01': { shift: range(t(H(19)), t(H(23))), updatedAt: 'x' },
    '2026-12-02': { shift: range(OPEN, LAST), updatedAt: 'x' },
    '2026-12-03': { shift: { kind: 'unavailable' }, updatedAt: 'x' },
    '2026-12-04': { shift: range(t(H(19)), t(H(22))), updatedAt: 'x' },
  };
  const confirmed = { '2026-12-04': { ...makeConfirmed({ start: H(17), end: H(22), breakMinutes: 0 }), updatedAt: 'x' } };
  const dates = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'];
  const a = confirmFromHopes(dates, confirmed, hopes, NOPAY, 'now');
  assert.deepEqual(a.filled, ['2026-12-01']);
  assert.deepEqual(a.skipped, ['2026-12-02']);
  assert.equal(a.confirmed['2026-12-04'].start, H(17), '確定済みは変えない');
  const b = confirmFromHopes(dates, confirmed, hopes, PAY, 'now');
  assert.deepEqual(b.filled, ['2026-12-01', '2026-12-02']);
  assert.equal(b.confirmed['2026-12-02'].end, H(29));
});

test('曜日のいつもの（希望と共通）で未確定の日を埋める', () => {
  const templates = { 2: { hope: range(t(H(18)), t(H(23))) }, 3: { hope: range(OPEN, LAST) }, 4: { hope: { kind: 'unavailable' } } };
  const confirmed = { '2026-12-08': { ...makeConfirmed({ start: H(17), end: H(22), breakMinutes: 0 }), updatedAt: 'x' } };
  const dates = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-08'];
  const r = confirmFromTemplates(dates, confirmed, templates, NOPAY, 'now');
  assert.deepEqual(r.filled, ['2026-12-01']);
  assert.deepEqual(r.skipped, ['2026-12-02'], 'OP/LA の時刻が未登録の水曜はスキップ');
  assert.equal(r.confirmed['2026-12-01'].start, H(18));
  assert.equal(r.confirmed['2026-12-08'].start, H(17), '確定済みは変えない');
  assert.equal('2026-12-03' in r.confirmed, false, '×の木曜は対象外');
  assert.deepEqual(confirmFromTemplates(dates, confirmed, templates, PAY, 'now').filled, ['2026-12-01', '2026-12-02']);
});

async function ready(storage = createMemoryStorage()) {
  let n = 0;
  const c = createController({
    storage,
    writeClipboard: async () => true,
    saveFile: async () => 'saved',
    now: () => new Date(new Date(2026, 10, 27, 10).getTime() + n++),
    newId: () => `id${++n}`,
  });
  await c.init();
  return c;
}

test('確定の入力: 翌日へ移動、履歴、取り消し、希望とは別に保存', async () => {
  const storage = createMemoryStorage();
  const c = await ready(storage);
  c.tapDate('2026-12-01');
  c.applyHope(range(t(H(19)), t(H(23))));
  c.tapDate('2026-12-01');
  assert.ok(c.applyConfirmed(makeConfirmed({ start: H(18, 30), end: H(23), breakMinutes: 30 }, { solo: true })));
  const s = c.getState();
  assert.equal(s.selected, '2026-12-02');
  assert.equal(s.data.confirmed['2026-12-01'].start, H(18, 30));
  assert.equal(s.data.hopes['2026-12-01'].shift.start.minutes, H(19), '希望は変わらない');
  assert.equal(s.data.confirmedHistory.length, 1);
  assert.deepEqual(s.data.confirmedHistory[0].shift, { start: H(18, 30), end: H(23), breakMinutes: 30 });
  // 履歴から（同じ時間を再使用しても重複しない）
  c.applyConfirmedHistory(s.data.confirmedHistory[0].id);
  assert.equal(c.getState().data.confirmed['2026-12-02'].breakMinutes, 30);
  assert.equal(c.getState().data.confirmed['2026-12-02'].solo, false, '一人は引き継がない（新しい日）');
  assert.equal(c.getState().data.confirmedHistory.length, 1);
  // 取り消し
  c.tapDate('2026-12-02');
  c.clearConfirmed();
  assert.equal('2026-12-02' in c.getState().data.confirmed, false);
  assert.equal(c.getState().selected, '2026-12-02');
  // 不正な確定は保存しない
  assert.equal(c.applyConfirmed(makeConfirmed({ start: H(19), end: H(19), breakMinutes: 0 })), false);
  await tick();
  const saved = storage.peek();
  assert.ok(validateAppData(saved).ok);
  assert.equal(saved.confirmed['2026-12-01'].solo, true);
});

test('希望どおり（単日）: 決まれば確定、決まらなければ初期値を返す', async () => {
  const c = await ready();
  c.tapDate('2026-12-01');
  c.applyHope(range(t(H(19)), t(H(23))));
  c.applyHope(range(OPEN, t(H(18))));
  c.applyHope({ kind: 'unavailable' });
  c.tapDate('2026-12-01');
  assert.deepEqual(c.confirmAsHope(), { done: true });
  assert.equal(c.getState().data.confirmed['2026-12-01'].end, H(23));
  assert.equal(c.getState().selected, '2026-12-02');
  const r = c.confirmAsHope();
  assert.equal(r.done, false);
  assert.deepEqual(r.prefill, { start: null, end: H(18) });
  c.setOpenLastTime('openTime', H(10, 30));
  assert.deepEqual(c.confirmAsHope(), { done: true });
  assert.equal(c.getState().data.confirmed['2026-12-02'].start, H(10, 30));
  assert.equal(c.confirmAsHope(), null, '×の日は対象外');
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(c.setOpenLastTime('lastTime', 1801), false);
});

test('希望どおり（複数選択）とまとめて確定・曜日のいつもの', async () => {
  const c = await ready();
  c.tapDate('2026-12-01');
  c.applyHope(range(t(H(19)), t(H(23))));
  c.applyHope(range(t(H(19)), NONE));
  c.applyHope(range(t(H(17)), t(H(22))));
  c.toggleMulti();
  for (const d of ['2026-12-01', '2026-12-02']) c.tapDate(d);
  c.confirmAsHope();
  assert.match(c.getState().message.text, /1日を確定しました（1日は/);
  assert.deepEqual(Object.keys(c.getState().data.confirmed), ['2026-12-01']);
  const r = c.confirmPeriodFromHopes(DEC1);
  assert.deepEqual(r.filled, ['2026-12-03']);
  assert.deepEqual(r.skipped, ['2026-12-02']);
  c.setHopeTemplate(3, range(t(H(18)), t(H(22)))); // 水（希望・確定で共通）
  assert.equal(c.confirmPeriodFromTemplates(DEC1).filled.length, 2); // 12/2, 12/9（12/16 は後半）
  assert.equal(c.getState().data.confirmed['2026-12-02'].start, H(18));
  c.tapDate('2026-12-16');
  assert.deepEqual(c.applyConfirmedTemplate(), { done: true });
  assert.equal(c.getState().data.confirmed['2026-12-16'].end, H(22));
  c.setHopeTemplate(3, range(OPEN, t(H(22))));
  c.tapDate('2026-12-23');
  const r2 = c.applyConfirmedTemplate();
  assert.equal(r2.done, false, 'OPの時刻が未登録なら入力画面へ');
  assert.deepEqual(r2.prefill, { start: null, end: H(22) });
  c.tapDate('2026-12-24');
  assert.equal(c.applyConfirmedTemplate(), null, '型のない曜日');
});

test('確定の履歴のピン留め・削除', async () => {
  const c = await ready();
  c.applyConfirmed(makeConfirmed({ start: H(19), end: H(23), breakMinutes: 0 }));
  c.applyConfirmed(makeConfirmed({ start: H(17), end: H(22), breakMinutes: 0 }));
  const old = c.getState().data.confirmedHistory[1];
  c.toggleConfirmedHistoryPin(old.id);
  assert.equal(c.getState().data.confirmedHistory[0].id, old.id);
  c.deleteConfirmedHistory(old.id);
  assert.equal(c.getState().data.confirmedHistory.length, 1);
});
