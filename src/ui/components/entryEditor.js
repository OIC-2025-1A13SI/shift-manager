// @ts-check
/**
 * シフトの入力画面（全画面、docs/v2_redesign.md §3.3）。
 * 開始［時刻 / OP / 指定なし］、終了［時刻 / LA / 指定なし］。時刻チップを押すとその下に2列ホイールが開く。
 */
import { el, esc } from '../dom.js';
import { createTimePicker } from './timePicker.js';
import { minutesToClock, validateShift } from '../../domain/shift.js';
import { formatShift } from '../../domain/formatter.js';

/** @typedef {import('../../domain/types.js').TimeShift} TimeShift */

export const DEFAULT_START = 19 * 60;
export const DEFAULT_END = 23 * 60;

/**
 * @param {{
 *   title: string,
 *   targetLabel: string,
 *   initial: TimeShift | null,
 *   doneLabel?: string,
 *   onDone: (shift: TimeShift) => boolean,
 * }} p
 */
export function openEntryEditor(p) {
  const init = p.initial;
  /** @type {{ start: { mode: 'time' | 'open' | 'none', minutes: number }, end: { mode: 'time' | 'last' | 'none', minutes: number } }} */
  const st = {
    start: { mode: init ? init.start.kind : 'time', minutes: init && init.start.kind === 'time' ? init.start.minutes : DEFAULT_START },
    end: { mode: init ? init.end.kind : 'time', minutes: init && init.end.kind === 'time' ? init.end.minutes : DEFAULT_END },
  };
  /** @type {'start' | 'end' | null} */
  let open = null;

  const page = el(`
    <div class="page-overlay" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header class="navbar">
        <span class="left"><button type="button" class="nav-btn icon close" data-ed="close" aria-label="閉じる">✕</button></span>
        <h1 id="editor-title">${esc(p.title)}</h1>
        <span class="right"></span>
      </header>
      <main class="page form-page">
        <p class="form-target">${esc(p.targetLabel)}</p>
        <div class="form-card">
          ${side('start', '開始', [['time', '時刻'], ['open', 'OP'], ['none', '指定なし']])}
          ${side('end', '終了', [['time', '時刻'], ['last', 'LA'], ['none', '指定なし']])}
        </div>
        <div class="form-result" aria-live="polite"></div>
      </main>
      <div class="form-footer"><button type="button" class="primary-btn" data-ed="done">${esc(p.doneLabel ?? '完了する')}</button></div>
    </div>`);

  /** @param {'start' | 'end'} key @param {string} label @param {[string, string][]} modes */
  function side(key, label, modes) {
    return `
      <div class="form-row" data-side="${key}">
        <span class="form-label">${label}</span>
        <button type="button" class="chip-btn" data-ed="chip" data-key="${key}" aria-expanded="false"></button>
        <div class="segmented small" role="radiogroup" aria-label="${label}の指定">
          ${modes.map(([m, t]) => `<button type="button" role="radio" data-ed="mode" data-key="${key}" data-mode="${m}">${t}</button>`).join('')}
        </div>
      </div>
      <div class="picker-slot" data-slot="${key}"></div>`;
  }

  const result = /** @type {HTMLElement} */ (page.querySelector('.form-result'));
  const doneBtn = /** @type {HTMLButtonElement} */ (page.querySelector('[data-ed="done"]'));

  /** @returns {TimeShift} */
  function current() {
    const start = st.start.mode === 'time' ? { kind: 'time', minutes: st.start.minutes } : { kind: st.start.mode };
    const end = st.end.mode === 'time' ? { kind: 'time', minutes: st.end.minutes } : { kind: st.end.mode };
    return /** @type {TimeShift} */ ({ kind: 'range', start, end });
  }

  function refresh() {
    for (const key of /** @type {const} */ (['start', 'end'])) {
      const s = st[key];
      const chip = /** @type {HTMLButtonElement} */ (page.querySelector(`[data-ed="chip"][data-key="${key}"]`));
      chip.textContent = s.mode === 'time' ? minutesToClock(s.minutes) : s.mode === 'open' ? 'OP' : s.mode === 'last' ? 'LA' : '指定なし';
      chip.disabled = s.mode !== 'time';
      chip.classList.toggle('active', open === key);
      chip.setAttribute('aria-expanded', String(open === key));
      chip.setAttribute('aria-label', `${key === 'start' ? '開始' : '終了'} ${chip.textContent}`);
      page.querySelectorAll(`[data-ed="mode"][data-key="${key}"]`).forEach((b) => {
        b.setAttribute('aria-checked', String(/** @type {HTMLElement} */ (b).dataset.mode === s.mode));
      });
    }
    const s = current();
    const v = validateShift(s);
    result.innerHTML = v.ok
      ? `<span class="ex">出力例</span><span class="val" data-testid="editor-output">${esc(formatShift(s))}</span>`
      : `<span class="ex">出力例</span><span class="err" data-testid="editor-error">${esc(v.reason)}</span>`;
    doneBtn.disabled = !v.ok;
  }

  /** @param {'start' | 'end' | null} key */
  function setOpen(key) {
    open = key;
    page.querySelectorAll('.picker-slot').forEach((slot) => slot.replaceChildren());
    if (key) {
      const picker = createTimePicker({
        value: st[key].minutes,
        label: key === 'start' ? '開始時刻' : '終了時刻',
        onChange: (v) => { st[key].minutes = v; refresh(); },
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
    const t = /** @type {HTMLElement} */ (ev.target).closest('[data-ed]');
    if (!(t instanceof HTMLElement)) return;
    const key = /** @type {'start' | 'end'} */ (t.dataset.key);
    switch (t.dataset.ed) {
      case 'close':
        close();
        break;
      case 'chip':
        setOpen(open === key ? null : key);
        break;
      case 'mode':
        /** @type {any} */ (st[key]).mode = t.dataset.mode;
        setOpen(t.dataset.mode === 'time' ? key : open === key ? null : open);
        break;
      case 'done':
        if (!doneBtn.disabled && p.onDone(current())) close();
        break;
    }
  });
  document.addEventListener('keydown', onKey);

  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  document.body.appendChild(page);
  refresh();
  /** @type {HTMLElement} */ (page.querySelector('[data-ed="close"]')).focus({ preventScroll: true });
  return { close };
}
