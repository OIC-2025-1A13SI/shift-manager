// 単体テスト（コントローラー＝画面操作のロジック、v2）。実行: npm test
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

/** 端末の日時は 2026-11-27 10:00（日本時間） */
function setup({ storage = createMemoryStorage(), clipboardOk = true, saveResult = 'saved', today = new Date(2026, 10, 27, 10) } = {}) {
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
    now: () => new Date(today.getTime() + n++),
    newId: () => `id${++n}`,
  });
  return { c, storage, clip, files };
}

async function ready(opts) {
  const s = setup(opts);
  await s.c.init();
  return s;
}

test('起動時は今日を選択し今月を表示', async () => {
  const { c } = await ready();
  const s = c.getState();
  assert.equal(s.selected, '2026-11-27');
  assert.deepEqual(s.month, { year: 2026, month: 11 });
  assert.equal(s.tab, 'hope');
});

test('T12 履歴を適用 → 即反映し翌日へ', async () => {
  const { c } = await ready();
  c.tapDate('2026-12-01');
  c.applyHope(r(H(19), H(23)));
  const id = c.getState().data.hopeHistory[0].id;
  c.tapDate('2026-12-05');
  c.applyHopeHistory(id);
  assert.equal(c.getState().data.hopes['2026-12-05'].shift.kind, 'range');
  assert.equal(c.getState().selected, '2026-12-06');
});

test('v2 R12: 月末に入力すると翌月1日へ移り、表示月も変わる', async () => {
  const { c } = await ready();
  c.tapDate('2026-12-31');
  c.applyHope({ kind: 'available' });
  assert.equal(c.getState().selected, '2027-01-01');
  assert.deepEqual(c.getState().month, { year: 2027, month: 1 });
});

test('T14/Q02 一括 → 3日反映、通常モード、最後にタップした日の翌日', async () => {
  const { c } = await ready();
  c.moveMonth(1);
  c.toggleMulti();
  for (const d of ['2026-12-02', '2026-12-08', '2026-12-05']) c.tapDate(d);
  c.tapDate('2027-01-01'); // 表示月以外は選べない
  assert.equal(c.getState().multiSelection.length, 3);
  assert.ok(c.applyHope(r(H(19), H(23))));
  const s = c.getState();
  assert.equal(Object.keys(s.data.hopes).length, 3);
  assert.equal(s.multi, false);
  assert.equal(s.selected, '2026-12-06');
});

test('一括で0件選択は適用不可、不正な時間は適用されない', async () => {
  const { c } = await ready();
  c.toggleMulti();
  assert.equal(c.applyHope({ kind: 'available' }), false);
  assert.equal(c.clearHope(), false);
  c.toggleMulti();
  assert.equal(c.applyHope(r(H(19), H(19))), false);
  assert.deepEqual(c.getState().data.hopes, {});
  assert.equal(c.getState().selected, '2026-11-27');
});

test('T15/T16/Q05 上書き・未入力に戻す（単日は留まる、一括は最後にタップした日）', async () => {
  const { c } = await ready();
  c.tapDate('2026-12-02');
  c.applyHope(r(H(19), H(23)));
  c.tapDate('2026-12-02');
  c.applyHope({ kind: 'unavailable' });
  assert.equal(c.getState().data.hopes['2026-12-02'].shift.kind, 'unavailable');
  c.tapDate('2026-12-02');
  c.clearHope();
  assert.equal(c.getState().selected, '2026-12-02');
  assert.equal(c.previewLines(DEC1)[1].text, '12月2日（水）　×');
  c.toggleMulti();
  c.tapDate('2026-12-03');
  c.tapDate('2026-12-01');
  c.applyHope({ kind: 'available' });
  c.toggleMulti();
  c.tapDate('2026-12-03');
  c.tapDate('2026-12-01');
  c.clearHope();
  assert.deepEqual(c.getState().data.hopes, {});
  assert.equal(c.getState().selected, '2026-12-01');
});

test('○×は履歴に入らない、時間は1分刻みで入る', async () => {
  const { c } = await ready();
  c.applyHope({ kind: 'available' });
  c.applyHope({ kind: 'unavailable' });
  assert.equal(c.getState().data.hopeHistory.length, 0);
  c.applyHope(r(H(18, 45), H(23, 5)));
  assert.equal(c.previewLines(DEC1).length, 15);
  assert.equal(c.getState().data.hopeHistory.length, 1);
});

test('履歴のピン留め・削除（シフトは残る）', async () => {
  const { c } = await ready();
  c.applyHope(r(H(19), H(23)));
  c.applyHope(r(H(17), H(22)));
  const old = c.getState().data.hopeHistory[1];
  c.toggleHopeHistoryPin(old.id);
  assert.equal(c.getState().data.hopeHistory[0].id, old.id);
  c.deleteHopeHistory(old.id);
  assert.equal(c.getState().data.hopeHistory.length, 1);
  assert.equal(c.getState().data.hopes['2026-11-27'].shift.start.minutes, H(19));
});

test('曜日のいつもの: 登録・適用・まとめて入力（未入力の日だけ）', async () => {
  const { c } = await ready();
  c.setHopeTemplate(2, r(H(19), H(23))); // 火曜
  c.setHopeTemplate(6, { kind: 'unavailable' }); // 土曜
  c.tapDate('2026-12-01'); // 火
  assert.ok(c.applyHopeTemplate());
  assert.equal(c.getState().selected, '2026-12-02');
  assert.equal(c.applyHopeTemplate(), false, '水曜は未登録');
  c.tapDate('2026-12-08');
  c.applyHope({ kind: 'available' }); // 入力済みの火曜
  assert.equal(c.fillHopesFromTemplates(DEC1), 3); // 12/5(土) 12/12(土) 12/15(火)
  const h = c.getState().data.hopes;
  assert.equal(h['2026-12-08'].shift.kind, 'available');
  assert.equal(h['2026-12-15'].shift.kind, 'range');
  assert.equal(h['2026-12-12'].shift.kind, 'unavailable');
  assert.equal(c.fillHopesFromTemplates(DEC1), 0);
  c.setHopeTemplate(2, null);
  c.setHopeTemplate(6, null);
  assert.deepEqual(c.getState().data.weekdayTemplates, {});
  assert.equal(c.setHopeTemplate(1, r(H(19), H(19))), false);
});

test('コピー画面の初期期間は「今日の次の半月」', async () => {
  const { c } = await ready();
  assert.deepEqual(c.defaultCopyPeriod(), DEC1);
  const b = await ready({ today: new Date(2026, 11, 3) });
  assert.deepEqual(b.c.defaultCopyPeriod(), DEC2);
  const y = await ready({ today: new Date(2026, 11, 20) });
  assert.deepEqual(y.c.defaultCopyPeriod(), { year: 2027, month: 1, half: 'first' });
});

test('T20 未入力ありでコピー → 取消でクリップボード変更なし', async () => {
  const { c, clip } = await ready();
  c.tapDate('2026-12-01');
  c.applyHope({ kind: 'available' });
  await c.requestCopy(DEC1);
  assert.deepEqual(c.getState().copyConfirm, { missing: 14, period: DEC1 });
  c.cancelCopy();
  assert.equal(clip.calls, 0);
});

test('T21 承認で×に変換してコピー、内部は未入力のまま', async () => {
  const { c, clip } = await ready();
  c.tapDate('2026-12-01');
  c.applyHope(r(H(18, 30), H(23)));
  await c.requestCopy(DEC1);
  assert.equal(await c.confirmCopy(), true);
  const lines = clip.text.split('\n');
  assert.equal(lines.length, 15);
  assert.equal(lines[0], '12月1日（火）　18:30-23');
  assert.equal(lines[1], '12月2日（水）　×');
  assert.equal(Object.keys(c.getState().data.hopes).length, 1);
  assert.ok(c.getState().data.periods['2026-12-first'].lastCopiedAt);
});

test('T22 挨拶文ON: プレビューとコピーが一致', async () => {
  const { c, clip } = await ready();
  c.setGreetingEnabled(true);
  c.setGreetingText('greetingPrefix', 'お疲れ様です。');
  const preview = c.submissionText(DEC2);
  await c.requestCopy(DEC2);
  await c.confirmCopy();
  assert.equal(clip.text, preview);
  assert.ok(clip.text.startsWith('お疲れ様です。\n12月16日'));
  assert.equal(clip.text.split('\n').length, 17);
});

test('T23/T24 再起動後に保存内容が復元される', async () => {
  const storage = createMemoryStorage();
  const a = await ready({ storage });
  a.c.tapDate('2026-12-01');
  a.c.applyHope(r(H(19), H(23)));
  a.c.setHopeTemplate(0, { kind: 'unavailable' });
  await tick();
  const b = await ready({ storage });
  assert.equal(b.c.previewLines(DEC1)[0].text, '12月1日（火）　19-23');
  assert.equal(b.c.getState().data.hopeHistory.length, 1);
  assert.equal(b.c.getState().data.weekdayTemplates[0].hope.kind, 'unavailable');
});

test('v1 の保存データを読み込むと v2 で保存し直す', async () => {
  const v1 = {
    schemaVersion: 1,
    requests: { '2026-12-01': { shift: r(H(19), H(23)), updatedAt: '2026-11-26T00:00:00.000Z' } },
    history: [], periods: {}, settings: { greetingEnabled: false, greetingPrefix: '', greetingSuffix: '' },
  };
  const storage = createMemoryStorage(v1);
  const { c } = await ready({ storage });
  await tick();
  assert.equal(c.getState().data.hopes['2026-12-01'].shift.kind, 'range');
  assert.equal(storage.peek().schemaVersion, 2);
});

test('T26 バックアップ書き出し → 復元（全置換、事前書き出し）', async () => {
  const src = await ready();
  src.c.applyHope(r(H(18, 30), H(23)));
  src.c.setHopeTemplate(3, { kind: 'available' });
  await src.c.exportBackup();
  const backup = src.files[0];
  const dst = await ready();
  dst.c.tapDate('2026-12-20');
  dst.c.applyHope({ kind: 'unavailable' });
  assert.ok(dst.c.prepareRestore(backup.text, backup.text.length));
  assert.ok(await dst.c.confirmRestore());
  assert.match(dst.files[0].filename, /before-restore/);
  assert.deepEqual(dst.c.getState().data, src.c.getState().data);
  assert.deepEqual(dst.storage.peek(), dst.c.getState().data);
});

test('Q10 事前書き出しがキャンセルされたら復元を中止', async () => {
  const dst = await ready({ saveResult: 'cancelled' });
  dst.c.applyHope({ kind: 'available' });
  const { json } = createBackup(createDefaultAppData(), new Date());
  dst.c.prepareRestore(json, json.length);
  assert.equal(await dst.c.confirmRestore(), false);
  assert.equal(Object.keys(dst.c.getState().data.hopes).length, 1);
});

test('T27 壊れたファイル・未対応バージョンはエラー、現データ保持', async () => {
  const { c } = await ready();
  c.applyHope({ kind: 'available' });
  const before = structuredClone(c.getState().data);
  assert.equal(c.prepareRestore('{broken', 7), false);
  const v9 = JSON.stringify({ app: 'shift-manager', format: 1, data: { ...createDefaultAppData(), schemaVersion: 9 } });
  assert.equal(c.prepareRestore(v9, v9.length), false);
  assert.match(c.getState().message.text, /未対応のデータバージョン/);
  assert.deepEqual(c.getState().data, before);
});

test('T30 コピーAPI失敗 → 成功表示なし、手動コピー手段を提示', async () => {
  const { c } = await ready({ clipboardOk: false });
  c.dismissMessage();
  await c.requestCopy(DEC1);
  await c.confirmCopy();
  assert.equal(c.getState().message, null);
  assert.ok(c.getState().manualCopyText.startsWith('12月1日'));
});

test('T31 保存失敗を通知し、成功時に解除', async () => {
  const storage = createMemoryStorage();
  const { c } = await ready({ storage });
  storage.failSave = true;
  c.applyHope({ kind: 'available' });
  await tick();
  assert.match(c.getState().saveError, /保存に失敗しました/);
  storage.failSave = false;
  c.applyHope({ kind: 'available' });
  await tick();
  assert.equal(c.getState().saveError, null);
});

test('壊れた保存データは上書きしない', async () => {
  const storage = createMemoryStorage({ schemaVersion: 2, hopes: 'broken' });
  const { c } = await ready({ storage });
  assert.ok(c.getState().loadError);
  c.applyHope({ kind: 'available' });
  await tick();
  assert.ok(c.getState().saveError);
  assert.deepEqual(storage.peek(), { schemaVersion: 2, hopes: 'broken' });
});

test('月の移動・今日へ戻る・タブ切替', async () => {
  const { c } = await ready();
  c.moveMonth(2);
  assert.deepEqual(c.getState().month, { year: 2027, month: 1 });
  c.moveMonth(-13);
  assert.deepEqual(c.getState().month, { year: 2025, month: 12 });
  c.goToday();
  assert.deepEqual(c.getState().month, { year: 2026, month: 11 });
  c.toggleMulti();
  c.setTab('other');
  assert.equal(c.getState().multi, false);
});
