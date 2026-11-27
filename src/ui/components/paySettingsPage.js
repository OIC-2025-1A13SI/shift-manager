// @ts-check
/** 給料の設定（全画面、docs/v2_redesign.md §3.7） */
import { el } from '../dom.js';
import { createTimePicker } from './timePicker.js';
import { minutesToClock } from '../../domain/shift.js';

/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */

const dayOptions = (/** @type {number} */ cur) => [0, ...Array.from({ length: 28 }, (_, i) => i + 1)]
  .map((d) => `<option value="${d}" ${d === cur ? 'selected' : ''}>${d === 0 ? '末日' : `${d}日`}</option>`).join('');

/** @param {Controller} c */
export function openPaySettings(c) {
  const p = c.getState().data.pay;
  const night = { start: p.nightStart, end: p.nightEnd };
  /** @type {'start' | 'end' | null} */
  let open = null;
  const num = (/** @type {number | null} */ v) => (v === null || v === 0 ? '' : String(v));

  const page = el(`
    <div class="page-overlay" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <header class="navbar">
        <span class="left"><button type="button" class="nav-btn icon close" data-ps="close" aria-label="閉じる">✕</button></span>
        <h1 id="pay-title">給料の設定</h1>
        <span class="right"></span>
      </header>
      <main class="page form-page">
        <div class="form-card">
          <label class="form-row"><span class="form-label wide">基本時給</span>
            <input class="text-input" type="number" inputmode="numeric" min="0" max="100000" data-ps-f="hourlyWage" value="${p.hourlyWage ?? ''}" placeholder="未設定"><span class="unit">円</span></label>
          <label class="form-row"><span class="form-label wide">一人シフト加算</span>
            <input class="text-input" type="number" inputmode="numeric" min="0" max="100000" data-ps-f="soloBonus" value="${num(p.soloBonus)}" placeholder="0"><span class="unit">円/時</span></label>
          <label class="form-row"><span class="form-label wide">交通費</span>
            <input class="text-input" type="number" inputmode="numeric" min="0" max="100000" data-ps-f="transportPerDay" value="${num(p.transportPerDay)}" placeholder="0"><span class="unit">円/日</span></label>
        </div>
        <p class="note">一人シフト加算は、確定シフトで「一人シフト」をONにした日の時給に足します。交通費は確定シフトがある日ごとに足します。</p>

        <div class="form-section-title">深夜割増</div>
        <div class="form-card">
          <div class="form-row"><span class="form-label wide">始まり</span><button type="button" class="chip-btn" data-ps="chip" data-key="start"></button></div>
          <div class="picker-slot" data-slot="start"></div>
          <div class="form-row"><span class="form-label wide">終わり</span><button type="button" class="chip-btn" data-ps="chip" data-key="end"></button></div>
          <div class="picker-slot" data-slot="end"></div>
          <label class="form-row"><span class="form-label wide">割増率</span>
            <input class="text-input" type="number" inputmode="numeric" min="0" max="200" data-ps-f="nightRatePercent" value="${p.nightRatePercent}"><span class="unit">%</span></label>
        </div>
        <p class="note">初期値は 22:00〜29:00（翌5:00）、25%。休憩は深夜以外の時間から先に差し引きます。</p>

        <div class="form-section-title">締め日・給料日</div>
        <div class="form-card">
          <label class="form-row"><span class="form-label wide">締め日</span>
            <select class="select-input" data-ps-f="closingDay">${dayOptions(p.closingDay)}</select></label>
          <div class="form-row"><span class="form-label wide">給料日</span>
            <select class="select-input" data-ps-f="payMonthOffset" aria-label="給料日の月">
              ${['当月', '翌月', '翌々月'].map((t, i) => `<option value="${i}" ${i === p.payMonthOffset ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <select class="select-input" data-ps-f="payDay" aria-label="給料日の日">${dayOptions(p.payDay)}</select></div>
          <label class="form-row"><span class="form-label wide">目標額</span>
            <input class="text-input" type="number" inputmode="numeric" min="0" max="100000000" data-ps-f="monthlyTarget" value="${num(p.monthlyTarget)}" placeholder="なし"><span class="unit">円/月</span></label>
        </div>
        <p class="note" data-testid="ps-example"></p>
      </main>
      <div class="form-footer"><button type="button" class="primary-btn" data-ps="save">保存する</button></div>
    </div>`);

  /** @param {string} f */
  const field = (f) => /** @type {HTMLInputElement | HTMLSelectElement} */ (page.querySelector(`[data-ps-f="${f}"]`));

  function refresh() {
    for (const key of /** @type {const} */ (['start', 'end'])) {
      const chip = /** @type {HTMLButtonElement} */ (page.querySelector(`[data-ps="chip"][data-key="${key}"]`));
      chip.textContent = minutesToClock(night[key]);
      chip.classList.toggle('active', open === key);
    }
    const close = Number(field('closingDay').value);
    const off = Number(field('payMonthOffset').value);
    const day = Number(field('payDay').value);
    /** @type {HTMLElement} */ (page.querySelector('[data-testid="ps-example"]')).textContent =
      `${close === 0 ? '末日' : `${close}日`}締め、${['当月', '翌月', '翌々月'][off]}${day === 0 ? '末日' : `${day}日`}払い。`;
  }

  /** @param {'start' | 'end' | null} key */
  function setOpen(key) {
    open = key;
    page.querySelectorAll('.picker-slot').forEach((s) => s.replaceChildren());
    if (key) {
      const picker = createTimePicker({ value: night[key], label: key === 'start' ? '深夜の始まり' : '深夜の終わり', onChange: (v) => { night[key] = v; refresh(); } });
      /** @type {HTMLElement} */ (page.querySelector(`[data-slot="${key}"]`)).appendChild(picker.el);
      picker.attach();
    }
    refresh();
  }

  function close() {
    page.remove();
    document.removeEventListener('keydown', onKey);
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  const intOr = (/** @type {string} */ f, /** @type {number | null} */ empty) => {
    const v = field(f).value.trim();
    return v === '' ? empty : Number(v);
  };

  page.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target).closest('[data-ps]');
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.ps === 'close') close();
    if (t.dataset.ps === 'chip') setOpen(open === t.dataset.key ? null : /** @type {'start' | 'end'} */ (t.dataset.key));
    if (t.dataset.ps === 'save') {
      const ok = c.setPay({
        hourlyWage: intOr('hourlyWage', null),
        soloBonus: /** @type {number} */ (intOr('soloBonus', 0)),
        transportPerDay: /** @type {number} */ (intOr('transportPerDay', 0)),
        nightStart: night.start,
        nightEnd: night.end,
        nightRatePercent: /** @type {number} */ (intOr('nightRatePercent', 0)),
        closingDay: Number(field('closingDay').value),
        payMonthOffset: Number(field('payMonthOffset').value),
        payDay: Number(field('payDay').value),
        monthlyTarget: /** @type {number} */ (intOr('monthlyTarget', 0)),
      });
      if (ok) close();
    }
  });
  page.addEventListener('change', refresh);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(page);
  refresh();
  /** @type {HTMLElement} */ (page.querySelector('[data-ps="close"]')).focus({ preventScroll: true });
  return { close };
}
