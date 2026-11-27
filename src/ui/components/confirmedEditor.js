// @ts-check
/**
 * 確定シフトの入力画面（全画面、docs/v2_redesign.md §3.5）。
 * 開始・終了（時刻のみ、2列ホイール）、休憩（分）、一人シフト、時給の個別設定、メモ。
 * 曜日のいつもの（確定）の登録にも使う（timesOnly: 休憩までを入力）。
 */
import { el, esc } from '../dom.js';
import { createTimePicker } from './timePicker.js';
import { minutesToClock } from '../../domain/shift.js';
import { validateConfirmed, formatConfirmed, confirmedDetail, makeConfirmed } from '../../domain/confirmed.js';

/** @typedef {import('../../domain/types.js').ConfirmedShift} ConfirmedShift */

const BREAK_PRESETS = [0, 15, 30, 45, 60, 90];

/**
 * @param {{
 *   title: string,
 *   targetLabel: string,
 *   hopeLabel?: string | null,
 *   note?: string | null,
 *   initial: { start: number, end: number, breakMinutes: number, solo: boolean, hourlyWage: number | null, memo: string },
 *   timesOnly?: boolean,
 *   doneLabel?: string,
 *   onDone: (c: ConfirmedShift) => boolean,
 * }} p
 */
export function openConfirmedEditor(p) {
  const st = { ...p.initial };
  /** @type {'start' | 'end' | null} */
  let open = null;

  const page = el(`
    <div class="page-overlay" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <header class="navbar">
        <span class="left"><button type="button" class="nav-btn icon close" data-cf="close" aria-label="閉じる">✕</button></span>
        <h1 id="cf-title">${esc(p.title)}</h1>
        <span class="right"></span>
      </header>
      <main class="page form-page">
        <p class="form-target">${esc(p.targetLabel)}</p>
        ${p.hopeLabel ? `<p class="ref-line" data-testid="cf-hope">希望：<strong>${esc(p.hopeLabel)}</strong></p>` : ''}
        ${p.note ? `<p class="note warn" data-testid="cf-note">${esc(p.note)}</p>` : ''}
        <div class="form-card">
          <div class="form-row"><span class="form-label">開始</span><button type="button" class="chip-btn" data-cf="chip" data-key="start" aria-expanded="false"></button></div>
          <div class="picker-slot" data-slot="start"></div>
          <div class="form-row"><span class="form-label">終了</span><button type="button" class="chip-btn" data-cf="chip" data-key="end" aria-expanded="false"></button></div>
          <div class="picker-slot" data-slot="end"></div>
          <div class="form-row wrap"><span class="form-label">休憩</span>
            <div class="break-chips" role="radiogroup" aria-label="休憩時間">
              ${BREAK_PRESETS.map((m) => `<button type="button" role="radio" data-cf="break" data-min="${m}">${m === 0 ? 'なし' : `${m}分`}</button>`).join('')}
            </div>
            <label class="break-input"><input type="number" inputmode="numeric" min="0" max="600" step="1" data-testid="cf-break" aria-label="休憩（分）">分</label>
          </div>
        </div>
        ${p.timesOnly ? '' : `
        <div class="form-card">
          <label class="form-row switch-row"><span>一人シフト<small class="row-note">ONで設定の「一人シフト加算」を時給に足します</small></span>
            <span class="switch"><input type="checkbox" data-testid="cf-solo"></span></label>
          <label class="form-row"><span class="form-label wide">時給の個別設定</span>
            <input class="text-input" type="number" inputmode="numeric" min="0" max="100000" data-testid="cf-wage" placeholder="空欄なら基本時給"><span class="unit">円</span></label>
          <label class="form-row"><span class="form-label">メモ</span>
            <input class="text-input" type="text" maxlength="200" data-testid="cf-memo" placeholder="未入力"></label>
        </div>`}
        <div class="form-result" aria-live="polite"></div>
      </main>
      <div class="form-footer"><button type="button" class="primary-btn" data-cf="done">${esc(p.doneLabel ?? '完了する')}</button></div>
    </div>`);

  const result = /** @type {HTMLElement} */ (page.querySelector('.form-result'));
  const doneBtn = /** @type {HTMLButtonElement} */ (page.querySelector('[data-cf="done"]'));
  const breakInput = /** @type {HTMLInputElement} */ (page.querySelector('[data-testid="cf-break"]'));
  const solo = /** @type {HTMLInputElement | null} */ (page.querySelector('[data-testid="cf-solo"]'));
  const wage = /** @type {HTMLInputElement | null} */ (page.querySelector('[data-testid="cf-wage"]'));
  const memo = /** @type {HTMLInputElement | null} */ (page.querySelector('[data-testid="cf-memo"]'));
  breakInput.value = String(st.breakMinutes);
  if (solo) solo.checked = st.solo;
  if (wage) wage.value = st.hourlyWage === null ? '' : String(st.hourlyWage);
  if (memo) memo.value = st.memo;

  /** @returns {ConfirmedShift} */
  function current() {
    const b = breakInput.value.trim() === '' ? 0 : Number(breakInput.value);
    const w = wage && wage.value.trim() !== '' ? Number(wage.value) : null;
    return makeConfirmed({ start: st.start, end: st.end, breakMinutes: b }, {
      solo: solo ? solo.checked : false, hourlyWage: w, memo: memo ? memo.value : '',
    });
  }

  function refresh() {
    for (const key of /** @type {const} */ (['start', 'end'])) {
      const chip = /** @type {HTMLButtonElement} */ (page.querySelector(`[data-cf="chip"][data-key="${key}"]`));
      chip.textContent = minutesToClock(st[key]);
      chip.classList.toggle('active', open === key);
      chip.setAttribute('aria-expanded', String(open === key));
      chip.setAttribute('aria-label', `${key === 'start' ? '開始' : '終了'} ${chip.textContent}`);
    }
    const cur = current();
    page.querySelectorAll('[data-cf="break"]').forEach((b) => {
      b.setAttribute('aria-checked', String(Number(/** @type {HTMLElement} */ (b).dataset.min) === cur.breakMinutes));
    });
    const v = validateConfirmed(cur);
    const detail = confirmedDetail(cur);
    result.innerHTML = v.ok
      ? `<span class="ex">確定</span><span class="val" data-testid="cf-output">${esc(formatConfirmed(cur))}</span>${detail ? `<span class="ex" data-testid="cf-detail">${esc(detail)}</span>` : ''}`
      : `<span class="ex">確定</span><span class="err" data-testid="cf-error">${esc(v.reason)}</span>`;
    doneBtn.disabled = !v.ok;
  }

  /** @param {'start' | 'end' | null} key */
  function setOpen(key) {
    open = key;
    page.querySelectorAll('.picker-slot').forEach((slot) => slot.replaceChildren());
    if (key) {
      const picker = createTimePicker({
        value: st[key],
        label: key === 'start' ? '開始時刻' : '終了時刻',
        onChange: (v) => { st[key] = v; refresh(); },
      });
      /** @type {HTMLElement} */ (page.querySelector(`[data-slot="${key}"]`)).appendChild(picker.el);
      picker.attach();
    }
    refresh();
  }

  function close() {
    page.remove();
    document.removeEventListener('keydown', onKey);
    opener?.focus?.({ preventScroll: true });
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  page.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target).closest('[data-cf]');
    if (!(t instanceof HTMLElement)) return;
    switch (t.dataset.cf) {
      case 'close':
        close();
        break;
      case 'chip': {
        const key = /** @type {'start' | 'end'} */ (t.dataset.key);
        setOpen(open === key ? null : key);
        break;
      }
      case 'break':
        breakInput.value = t.dataset.min ?? '0';
        refresh();
        break;
      case 'done':
        if (!doneBtn.disabled && p.onDone(current())) close();
        break;
    }
  });
  page.addEventListener('input', refresh);
  page.addEventListener('change', refresh);
  document.addEventListener('keydown', onKey);

  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  document.body.appendChild(page);
  refresh();
  /** @type {HTMLElement} */ (page.querySelector('[data-cf="close"]')).focus({ preventScroll: true });
  return { close };
}
