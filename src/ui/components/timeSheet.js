// @ts-check
/** S03 勤務時間追加シート */
import { el, esc } from '../dom.js';
import { createWheel } from './wheel.js';
import { timeOptions, minutesToClock, validateShift } from '../../domain/shift.js';
import { formatShift } from '../../domain/formatter.js';

/** @typedef {import('../../domain/types.js').TimeShift} TimeShift */

export const DEFAULT_START = 19 * 60;
export const DEFAULT_END = 23 * 60;

/**
 * @param {{
 *   initial: TimeShift | null,
 *   targetLabel: string,
 *   onApply: (shift: TimeShift) => boolean,
 * }} p
 */
export function openTimeSheet(p) {
  const init = p.initial;
  /** @type {'time' | 'open' | 'none'} */
  let startMode = init ? init.start.kind : 'time';
  /** @type {'time' | 'last' | 'none'} */
  let endMode = init ? init.end.kind : 'time';
  const startInit = init && init.start.kind === 'time' ? init.start.minutes : DEFAULT_START;
  const endInit = init && init.end.kind === 'time' ? init.end.minutes : DEFAULT_END;

  const backdrop = el(`<div class="backdrop"></div>`);
  const sheet = el(`
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <span class="left"><button type="button" class="nav-btn" data-sheet="cancel">キャンセル</button></span>
        <h2 id="sheet-title">勤務時間</h2>
        <span class="right"></span>
      </div>
      <div class="sheet-target">${esc(p.targetLabel)}</div>
      <div class="pickers">
        <div class="picker-col" data-col="start">
          <h3>開始</h3>
          <div class="segmented" role="radiogroup" aria-label="開始の指定">
            <button type="button" role="radio" data-mode="time">時刻</button>
            <button type="button" role="radio" data-mode="open">OP</button>
            <button type="button" role="radio" data-mode="none">指定なし</button>
          </div>
        </div>
        <div class="picker-col" data-col="end">
          <h3>終了</h3>
          <div class="segmented" role="radiogroup" aria-label="終了の指定">
            <button type="button" role="radio" data-mode="time">時刻</button>
            <button type="button" role="radio" data-mode="last">LA</button>
            <button type="button" role="radio" data-mode="none">指定なし</button>
          </div>
        </div>
      </div>
      <div class="sheet-result" aria-live="polite"></div>
      <button type="button" class="copy-btn" data-sheet="apply">追加・適用</button>
    </div>`);

  const opts = timeOptions();
  const startWheel = createWheel({ options: opts, value: startInit, label: '開始時刻', format: minutesToClock, onChange: refresh });
  const endWheel = createWheel({ options: opts, value: endInit, label: '終了時刻', format: minutesToClock, onChange: refresh });
  /** @type {HTMLElement} */ (sheet.querySelector('[data-col="start"]')).appendChild(startWheel.el);
  /** @type {HTMLElement} */ (sheet.querySelector('[data-col="end"]')).appendChild(endWheel.el);
  const result = /** @type {HTMLElement} */ (sheet.querySelector('.sheet-result'));
  const applyBtn = /** @type {HTMLButtonElement} */ (sheet.querySelector('[data-sheet="apply"]'));

  /** @returns {TimeShift} */
  function current() {
    const start = startMode === 'time' ? { kind: 'time', minutes: startWheel.value } : { kind: startMode };
    const end = endMode === 'time' ? { kind: 'time', minutes: endWheel.value } : { kind: endMode };
    return /** @type {TimeShift} */ ({ kind: 'range', start, end });
  }

  function refresh() {
    for (const [col, mode] of /** @type {const} */ ([['start', startMode], ['end', endMode]])) {
      sheet.querySelectorAll(`[data-col="${col}"] [data-mode]`).forEach((b) => {
        b.setAttribute('aria-checked', String(/** @type {HTMLElement} */ (b).dataset.mode === mode));
      });
    }
    startWheel.setSpecial(startMode === 'time' ? null : startMode === 'open' ? 'OP' : '指定なし');
    endWheel.setSpecial(endMode === 'time' ? null : endMode === 'last' ? 'LA' : '指定なし');
    const s = current();
    const v = validateShift(s);
    result.innerHTML = v.ok
      ? `<div class="ex">出力例</div><div class="val" data-testid="sheet-output">${esc(formatShift(s))}</div>`
      : `<div class="ex">出力例</div><div class="err" data-testid="sheet-error">${esc(v.reason)}</div>`;
    applyBtn.disabled = !v.ok;
  }

  function close() {
    backdrop.remove();
    sheet.remove();
    document.removeEventListener('keydown', onKey);
    opener?.focus?.();
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  sheet.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const modeBtn = t.closest('[data-mode]');
    if (modeBtn instanceof HTMLElement) {
      const col = modeBtn.closest('[data-col]')?.getAttribute('data-col');
      if (col === 'start') startMode = /** @type {any} */ (modeBtn.dataset.mode);
      else endMode = /** @type {any} */ (modeBtn.dataset.mode);
      refresh();
      return;
    }
    const act = t.closest('[data-sheet]')?.getAttribute('data-sheet');
    if (act === 'cancel') close();
    if (act === 'apply' && !applyBtn.disabled) {
      if (p.onApply(current())) close();
    }
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  document.body.append(backdrop, sheet);
  startWheel.attach();
  endWheel.attach();
  refresh();
  /** @type {HTMLElement} */ (sheet.querySelector('[data-sheet="cancel"]')).focus({ preventScroll: true });
  return { close };
}
