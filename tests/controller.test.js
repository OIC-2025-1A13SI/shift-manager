// 単体テスト（コントローラー＝画面操作のロジック）。実行: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/application/controller.js';
import { createMemoryStorage } from '../src/infrastructure/storage.js';
import { createBackup } from '../src/infrastructure/backup.js';
import { createDefaultAppData } from '../src/domain/appData.js';

const H = (h, m = 0) => h * 60 + m;
const r = (s, e) => ({ kind: 'range', start: { kind: 'time', minutes: s }, end: { kind: 'time', minutes: e } });
const DEC1 = { year: 2026, month: 12, half: 'first' };
const DEC2 = { year: 2026, month: 12, half: 'second' };
const tick = () => new Promise((res) => setTimeout(res, 0));

function setup({ storage = createMemoryStorage(), clipboardOk = true, saveResult = 'saved' } = {}) {
  const clip = { text: null, calls: 0 };
  const files = [];
  let n = 0;
  const c = createController({
    storage,
    writeClipboard: async (text) => {
      clip.calls++;
      if (!clipboardOk) return false;
      clip.text = text;
      return true;
    },
    saveFile: async (filename, text) => {
      files.push({ filename, text });
      return saveResult;
    },
    now: () => new Date(Date.UTC(2026, 10, 26, 2, 0, n++)),
    newId: () => `id${++n}`,
  });
  return { c, storage, clip, files };
}

test('期間選択で初日を選択（Q03）', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  assert.equal(c.getState().screen, 'main');
  assert.equal(c.getState().selected, '2026-12-01');
  assert.equal(c.getState().dates.length, 15);
});

test('T12 1日に履歴を適用 → 即反映し2日へ', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift(r(H(19), H(23)));
  c.openPeriod(DEC1);
  const id = c.getState().data.history[0].id;
  c.tapDate('2026-12-01');
  c.applyHistory(id);
  assert.equal(c.getState().data.requests['2026-12-01'].shift.kind, 'range');
  assert.equal(c.getState().selected, '2026-12-02');
});

test('Q04 入力済みでも暦上の翌日へ、○×でも移動', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.tapDate('2026-12-03');
  c.applyShift({ kind: 'available' });
  c.tapDate('2026-12-02');
  c.applyShift({ kind: 'unavailable' });
  assert.equal(c.getState().selected, '2026-12-03');
});

test('T13 最終日に適用しても範囲外へ移動しない', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.tapDate('2026-12-15');
  c.applyShift({ kind: 'available' });
  assert.equal(c.getState().selected, '2026-12-15');
  assert.equal(c.getState().screen, 'main');
});

test('T14/Q02 2,5,8日を一括 → 3日反映、通常モード、最後にタップした日の翌日', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.toggleMulti();
  for (const d of ['2026-12-02', '2026-12-05', '2026-12-08']) c.tapDate(d);
  assert.ok(c.applyShift(r(H(19), H(23))));
  const s = c.getState();
  for (const d of ['2026-12-02', '2026-12-05', '2026-12-08']) assert.ok(s.data.requests[d]);
  assert.equal(Object.keys(s.data.requests).length, 3);
  assert.equal(s.multi, false);
  assert.equal(s.selected, '2026-12-09');

  // タップ順が基準：8→2 の順なら 2 の翌日（3日）
  c.toggleMulti();
  c.tapDate('2026-12-08');
  c.tapDate('2026-12-02');
  c.applyShift({ kind: 'available' });
  assert.equal(c.getState().selected, '2026-12-03');

  // 最後にタップした日を外すと、残りのうち最後にタップした日が基準
  c.toggleMulti();
  c.tapDate('2026-12-10');
  c.tapDate('2026-12-04');
  c.tapDate('2026-12-04');
  c.applyShift({ kind: 'available' });
  assert.equal(c.getState().selected, '2026-12-11');
});

test('一括で0件選択は適用不可', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.toggleMulti();
  assert.equal(c.applyShift({ kind: 'available' }), false);
  assert.equal(c.getState().message.kind, 'error');
  assert.equal(c.clearSelected(), false);
});

test('不正な時間範囲は適用されない', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  assert.equal(c.applyShift(r(H(19), H(19))), false);
  assert.deepEqual(c.getState().data.requests, {});
  assert.equal(c.getState().selected, '2026-12-01');
});

test('T16/Q05 未入力に戻す（単日は留まる、一括は通常モードへ）', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.toggleMulti();
  ['2026-12-01', '2026-12-02', '2026-12-03'].forEach(c.tapDate);
  c.applyShift({ kind: 'unavailable' });
  c.tapDate('2026-12-02');
  c.clearSelected();
  assert.equal(c.getState().selected, '2026-12-02');
  assert.equal('2026-12-02' in c.getState().data.requests, false);
  assert.equal(c.previewLines()[1].text, '12月2日（水）　×');
  c.toggleMulti();
  c.tapDate('2026-12-03');
  c.tapDate('2026-12-01');
  c.clearSelected();
  assert.deepEqual(c.getState().data.requests, {});
  assert.equal(c.getState().multi, false);
  assert.equal(c.getState().selected, '2026-12-01');
});

test('○×は履歴に入らない', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift({ kind: 'available' });
  c.applyShift({ kind: 'unavailable' });
  assert.equal(c.getState().data.history.length, 0);
});

test('T20 未入力ありでコピー → 取消でクリップボード変更なし', async () => {
  const { c, clip } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift({ kind: 'available' });
  await c.requestCopy();
  assert.deepEqual(c.getState().copyConfirm, { missing: 14 });
  c.cancelCopy();
  assert.equal(clip.calls, 0);
  assert.equal(c.getState().copyConfirm, null);
});

test('T21 未入力ありでコピー → 承認で×に変換、内部は未入力のまま', async () => {
  const { c, clip } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift({ kind: 'available' });
  await c.requestCopy();
  assert.equal(await c.confirmCopy(), true);
  const lines = clip.text.split('\n');
  assert.equal(lines.length, 15);
  assert.equal(lines[0], '12月1日（火）　○');
  assert.equal(lines[1], '12月2日（水）　×');
  assert.equal(Object.keys(c.getState().data.requests).length, 1);
  assert.equal(c.getState().message.text, 'コピーしました');
  assert.ok(c.getState().data.periods['2026-12-first'].lastCopiedAt);
});

test('未入力なしなら確認なしでコピー', async () => {
  const { c, clip } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.toggleMulti();
  c.getState().dates.forEach(c.tapDate);
  c.applyShift({ kind: 'available' });
  assert.equal(await c.requestCopy(), true);
  assert.equal(c.getState().copyConfirm, null);
  assert.equal(clip.text.split('\n').length, 15);
});

test('T22 プレビューとコピー結果が一致（挨拶文ON）', async () => {
  const { c, clip } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.setGreetingEnabled(true);
  c.setGreetingText('greetingPrefix', 'お疲れ様です。');
  c.setGreetingText('greetingSuffix', 'よろしくお願いします。');
  const preview = c.submissionText();
  await c.requestCopy();
  await c.confirmCopy();
  assert.equal(clip.text, preview);
  assert.ok(clip.text.startsWith('お疲れ様です。\n12月1日'));
});

test('T23/T24 再起動後に保存内容が復元される（コピー後も残る）', async () => {
  const storage = createMemoryStorage();
  const a = setup({ storage });
  await a.c.init();
  a.c.openPeriod(DEC1);
  a.c.applyShift(r(H(19), H(23)));
  await a.c.requestCopy();
  await a.c.confirmCopy();
  await tick();
  const b = setup({ storage });
  await b.c.init();
  b.c.openPeriod(DEC1);
  assert.equal(b.c.previewLines()[0].text, '12月1日（火）　19-23');
  assert.equal(b.c.getState().data.history.length, 1);
});

test('T25 月・半月切替で他期間のデータが混在しない', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift({ kind: 'available' });
  c.backToPeriods();
  c.openPeriod(DEC2);
  assert.equal(c.missingCount(), 16);
  assert.ok(c.previewLines().every((l) => l.missing));
  c.openPeriod({ year: 2027, month: 1, half: 'first' });
  assert.equal(c.previewLines()[0].text, '1月1日（金）　×');
});

test('T26 バックアップ書き出し → 復元（全置換、事前書き出し）', async () => {
  const src = setup();
  await src.c.init();
  src.c.openPeriod(DEC1);
  src.c.applyShift(r(H(18, 30), H(23)));
  src.c.setGreetingEnabled(true);
  await src.c.exportBackup();
  const backup = src.files[0];

  const dst = setup();
  await dst.c.init();
  dst.c.openPeriod(DEC2);
  dst.c.applyShift({ kind: 'unavailable' });
  assert.ok(dst.c.prepareRestore(backup.text, backup.text.length));
  assert.ok(await dst.c.confirmRestore());
  assert.match(dst.files[0].filename, /before-restore/);
  const s = dst.c.getState().data;
  assert.deepEqual(s, src.c.getState().data);
  assert.equal('2026-12-16' in s.requests, false);
  assert.deepEqual(dst.storage.peek(), s);
});

test('Q10 事前書き出しがキャンセルされたら復元を中止', async () => {
  const dst = setup({ saveResult: 'cancelled' });
  await dst.c.init();
  dst.c.openPeriod(DEC1);
  dst.c.applyShift({ kind: 'available' });
  const { json } = createBackup(createDefaultAppData(), new Date());
  dst.c.prepareRestore(json, json.length);
  assert.equal(await dst.c.confirmRestore(), false);
  assert.equal(Object.keys(dst.c.getState().data.requests).length, 1);
});

test('T27 壊れたファイルの復元はエラー表示、現データ保持', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift({ kind: 'available' });
  const before = structuredClone(c.getState().data);
  assert.equal(c.prepareRestore('{broken', 7), false);
  assert.equal(c.getState().message.kind, 'error');
  const v2 = JSON.stringify({ app: 'shift-manager', format: 1, data: { ...createDefaultAppData(), schemaVersion: 99 } });
  assert.equal(c.prepareRestore(v2, v2.length), false);
  assert.match(c.getState().message.text, /未対応のデータバージョン/);
  assert.deepEqual(c.getState().data, before);
  assert.equal(c.getState().restorePending, null);
});

test('T30 コピーAPI失敗 → 成功表示なし、手動コピー手段を提示', async () => {
  const { c } = setup({ clipboardOk: false });
  await c.init();
  c.openPeriod(DEC1);
  c.toggleMulti();
  c.getState().dates.forEach(c.tapDate);
  c.applyShift({ kind: 'available' });
  c.dismissMessage();
  assert.equal(await c.requestCopy(), false);
  assert.equal(c.getState().message, null);
  assert.ok(c.getState().manualCopyText.startsWith('12月1日'));
  assert.equal(c.getState().data.periods['2026-12-first'].lastCopiedAt, undefined);
});

test('T31 保存失敗を通知し、成功時に解除', async () => {
  const storage = createMemoryStorage();
  const { c } = setup({ storage });
  await c.init();
  c.openPeriod(DEC1);
  storage.failSave = true;
  c.applyShift({ kind: 'available' });
  await tick();
  assert.match(c.getState().saveError, /保存に失敗しました/);
  assert.equal(storage.peek(), null);
  storage.failSave = false;
  c.applyShift({ kind: 'available' });
  await tick();
  assert.equal(c.getState().saveError, null);
  assert.ok(storage.peek());
});

test('壊れた保存データは上書きしない', async () => {
  const storage = createMemoryStorage({ schemaVersion: 1, requests: 'broken' });
  const { c } = setup({ storage });
  await c.init();
  assert.ok(c.getState().loadError);
  c.openPeriod(DEC1);
  c.applyShift({ kind: 'available' });
  await tick();
  assert.ok(c.getState().saveError);
  assert.deepEqual(storage.peek(), { schemaVersion: 1, requests: 'broken' });
});

test('T19 履歴削除で登録済みシフトは変わらない', async () => {
  const { c } = setup();
  await c.init();
  c.openPeriod(DEC1);
  c.applyShift(r(H(19), H(23)));
  c.deleteHistory(c.getState().data.history[0].id);
  assert.equal(c.getState().data.history.length, 0);
  assert.equal(c.previewLines()[0].text, '12月1日（火）　19-23');
});
