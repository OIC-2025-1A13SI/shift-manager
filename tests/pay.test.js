// 単体テスト（段階③：給料計算）。期待値は docs/v2_redesign.md §4 の規則で手計算したもの。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPay, payPeriod, upcomingPayMonth, summarizePay, formatDuration, formatYen } from '../src/domain/pay.js';
import { createDefaultPay } from '../src/domain/appData.js';
import { makeConfirmed } from '../src/domain/confirmed.js';

const H = (h, m = 0) => h * 60 + m;
const PAY = { ...createDefaultPay(), hourlyWage: 1200, soloBonus: 100, transportPerDay: 420, monthlyTarget: 80000 };
const cf = (s, e, b = 0, extra = {}) => ({ ...makeConfirmed({ start: s, end: e, breakMinutes: b }, extra), updatedAt: 'x' });

test('通常＋深夜（19-23）: 1200×3h ＋ 1500×1h ＝ 5,100円', () => {
  const p = dayPay(cf(H(19), H(23)), PAY);
  assert.deepEqual(p, { wage: 1200, paidMinutes: 240, nightMinutes: 60, base: 4800, nightPremium: 300, soloBonus: 0, total: 5100 });
});

test('休憩は深夜以外から差し引く・一人シフトの加算に深夜割増が掛かる', () => {
  // 18:00-29:00、休憩60分、一人(+100) → 時給1300。通常4h-1h=3h、深夜7h
  // 1300×3 ＋ 1625×7 ＝ 3,900 ＋ 11,375 ＝ 15,275
  const p = dayPay(cf(H(18), H(29), 60, { solo: true }), PAY);
  assert.equal(p.total, 15275);
  assert.equal(p.paidMinutes, 600);
  assert.equal(p.nightMinutes, 420);
  assert.equal(p.nightPremium, 2275);
  assert.equal(p.soloBonus, 1000);
  assert.equal(p.base + p.nightPremium + p.soloBonus, p.total);
});

test('休憩が通常時間より長いと残りは深夜から差し引く', () => {
  // 21:00-25:00、休憩90分 → 通常60分を全部、残り30分を深夜から。深夜150分
  const p = dayPay(cf(H(21), H(25), 90), PAY);
  assert.equal(p.paidMinutes, 150);
  assert.equal(p.nightMinutes, 150);
  assert.equal(p.total, 3750); // 1500×2.5h
});

test('時給の個別設定と、1円未満は日ごとに切り捨て', () => {
  assert.equal(dayPay(cf(H(10), H(15, 30), 30, { hourlyWage: 1100 }), PAY).total, 5500);
  assert.equal(dayPay(cf(H(19), H(19, 7), 0, { hourlyWage: 1111 }), PAY).total, 129); // 129.61…
});

test('深夜の時間帯・割増率は設定で変えられる', () => {
  const p = dayPay(cf(H(19), H(23)), { ...PAY, nightStart: H(22, 30), nightRatePercent: 30 });
  assert.equal(p.total, 1200 * 3.5 + 1560 * 0.5);
});

test('基本時給が未設定で個別設定もないと計算しない', () => {
  assert.equal(dayPay(cf(H(19), H(23)), { ...PAY, hourlyWage: null }), null);
  assert.equal(dayPay(cf(H(19), H(23), 0, { hourlyWage: 1000 }), { ...PAY, hourlyWage: null }).total, 4250);
});

test('給料日と対象期間（末日締め翌月15日払い、15日締め当月25日払い、末日払い）', () => {
  assert.deepEqual(payPeriod({ year: 2026, month: 12 }, PAY), { payday: '2026-12-15', from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(payPeriod({ year: 2027, month: 3 }, PAY), { payday: '2027-03-15', from: '2027-02-01', to: '2027-02-28' });
  const p2 = { ...PAY, closingDay: 15, payMonthOffset: 0, payDay: 25 };
  assert.deepEqual(payPeriod({ year: 2027, month: 1 }, p2), { payday: '2027-01-25', from: '2026-12-16', to: '2027-01-15' });
  const p3 = { ...PAY, closingDay: 20, payMonthOffset: 1, payDay: 0 };
  assert.deepEqual(payPeriod({ year: 2027, month: 2 }, p3), { payday: '2027-02-28', from: '2026-12-21', to: '2027-01-20' });
});

test('次の給料日の月', () => {
  assert.deepEqual(upcomingPayMonth('2026-11-27', PAY), { year: 2026, month: 12 });
  assert.deepEqual(upcomingPayMonth('2026-12-15', PAY), { year: 2026, month: 12 });
  assert.deepEqual(upcomingPayMonth('2026-12-16', PAY), { year: 2027, month: 1 });
});

test('給料日ごとの集計（対象期間外・希望ベースの見込みを分ける）', () => {
  const confirmed = {
    '2026-11-02': cf(H(19), H(23)),
    '2026-11-03': cf(H(18), H(29), 60, { solo: true }),
    '2026-11-04': cf(H(10), H(15, 30), 30, { hourlyWage: 1100 }),
    '2026-11-06': cf(H(19), H(19, 7), 0, { hourlyWage: 1111 }),
    '2026-12-01': cf(H(19), H(23)), // 1月15日払い
  };
  const hopes = {
    '2026-11-10': { shift: { kind: 'range', start: { kind: 'time', minutes: H(19) }, end: { kind: 'time', minutes: H(23) } }, updatedAt: 'x' },
    '2026-11-11': { shift: { kind: 'range', start: { kind: 'open' }, end: { kind: 'last' } }, updatedAt: 'x' }, // OP/LA 未登録
    '2026-11-12': { shift: { kind: 'unavailable' }, updatedAt: 'x' },
    '2026-11-02': { shift: { kind: 'available' }, updatedAt: 'x' }, // 確定済みの日は数えない
  };
  const r = summarizePay({ year: 2026, month: 12 }, confirmed, hopes, PAY);
  assert.equal(r.sum.days, 4);
  assert.equal(r.sum.transport, 1680);
  assert.equal(r.sum.total, 5100 + 15275 + 5500 + 129 + 1680);
  assert.equal(r.sum.total, 27684);
  assert.equal(r.sum.paidMinutes, 240 + 600 + 300 + 7);
  assert.equal(formatDuration(r.sum.paidMinutes), '19時間7分');
  assert.deepEqual([formatDuration(7), formatDuration(0), formatDuration(600)], ['7分', '0分', '10時間']);
  assert.equal(r.sum.nightPremium, 300 + 2275);
  assert.equal(r.sum.soloBonus, 1000);
  assert.equal(r.computable, true);
  assert.deepEqual(r.hope, { days: 1, total: 5100 + 420, unknown: 1 });
  assert.equal(formatYen(r.sum.total), '¥27,684');
  const none = summarizePay({ year: 2026, month: 12 }, confirmed, {}, { ...PAY, hourlyWage: null });
  assert.equal(none.computable, false);
});

test('給料の設定を保存（不正値は拒否）', async () => {
  const { createController } = await import('../src/application/controller.js');
  const { createMemoryStorage } = await import('../src/infrastructure/storage.js');
  const c = createController({ storage: createMemoryStorage(), writeClipboard: async () => true, saveFile: async () => 'saved' });
  await c.init();
  assert.ok(c.setPay({ hourlyWage: 1200, transportPerDay: 420 }));
  assert.equal(c.getState().data.pay.hourlyWage, 1200);
  assert.equal(c.setPay({ hourlyWage: 1200.5 }), false);
  assert.equal(c.setPay({ nightStart: H(23), nightEnd: H(22) }), false);
  assert.equal(c.setPay({ closingDay: 31 }), false);
  assert.equal(c.getState().data.pay.closingDay, 0);
});
