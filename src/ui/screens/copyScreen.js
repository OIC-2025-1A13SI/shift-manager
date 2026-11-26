// @ts-check
/** LINE 提出用コピー画面（docs/v2_redesign.md §3.4）。前半・後半を選んでプレビューし、コピーする。 */
import { el, esc } from '../dom.js';
import { periodKey, periodOptionsAround, periodShortLabel, periodRangeLabel } from '../../domain/calendar.js';

/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/types.js').PeriodRef} PeriodRef */

/** @param {Controller} c */
export function openCopyScreen(c) {
  /** @type {PeriodRef} */
  let period = c.defaultCopyPeriod();
  // 候補は「表示中の月の前後」と「初期期間の前後」をあわせた重複なしの一覧
  const seen = new Map();
  for (const p of [...periodOptionsAround(c.getState().month), ...periodOptionsAround(period)]) seen.set(periodKey(p), p);
  const options = [...seen.values()].sort((a, b) => periodKey(a).localeCompare(periodKey(b)));

  const page = el(`
    <div class="page-overlay" role="dialog" aria-modal="true" aria-labelledby="copy-title">
      <header class="navbar">
        <span class="left"><button type="button" class="nav-btn icon close" data-cp="close" aria-label="閉じる">✕</button></span>
        <h1 id="copy-title">LINE提出用コピー</h1>
        <span class="right"></span>
      </header>
      <main class="page form-page"></main>
      <div class="form-footer"><button type="button" class="primary-btn" data-cp="copy">シフトをコピー</button></div>
    </div>`);
  const main = /** @type {HTMLElement} */ (page.querySelector('main'));

  function render() {
    const s = c.getState();
    const lines = c.previewLines(period);
    const filled = lines.filter((l) => !l.missing).length;
    const st = s.data.settings;
    const greet = (/** @type {string} */ t) =>
      st.greetingEnabled && t.trim() ? `<div class="greet">${esc(t.replace(/^[\r\n]+|[\r\n\s]+$/g, ''))}</div>` : '';
    const top = main.querySelector('.preview-box')?.scrollTop ?? 0;
    main.innerHTML = `
      <div class="form-section-title">対象期間 <span class="note">※ 選んだ半月の希望を、LINEに貼る文章にします。</span></div>
      <div class="period-chips" role="radiogroup" aria-label="対象期間">
        ${options.map((p) => `<button type="button" role="radio" class="period-chip" data-cp="period" data-key="${periodKey(p)}"
            aria-checked="${periodKey(p) === periodKey(period)}">${p.year !== c.getState().month.year ? `<small>${p.year}年</small>` : ''}${esc(periodShortLabel(p))}</button>`).join('')}
      </div>
      <div class="form-section-title row-between"><span>プレビュー <span class="note">${esc(`${period.year}年${period.month}月 ${periodRangeLabel(period)}`)}</span></span>
        <span class="count ${filled === lines.length ? 'done' : ''}" data-testid="copy-count">${filled}/${lines.length}日入力済み</span></div>
      <div class="preview-box" data-testid="preview" tabindex="0" aria-label="提出文章">
        ${greet(st.greetingPrefix)}${lines.map((l) => `<div class="${l.missing ? 'missing' : ''}">${esc(l.text)}</div>`).join('')}${greet(st.greetingSuffix)}
      </div>
      <p class="note">薄い色の日は未入力です。コピーするときは「×」になります。</p>
      <div class="form-card"><label class="form-row switch-row"><span>挨拶文を付ける</span>
        <span class="switch"><input type="checkbox" data-testid="greet-toggle" ${st.greetingEnabled ? 'checked' : ''}></span></label></div>
      <p class="note">挨拶文の内容は「その他」タブで編集できます。</p>`;
    const box = main.querySelector('.preview-box');
    if (box) box.scrollTop = top;
  }

  const unsubscribe = c.subscribe(() => render());
  function close() {
    unsubscribe();
    page.remove();
    document.removeEventListener('keydown', onKey);
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape' && !document.querySelector('.dialog')) close();
  }

  page.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target).closest('[data-cp]');
    if (!(t instanceof HTMLElement)) return;
    switch (t.dataset.cp) {
      case 'close':
        close();
        break;
      case 'period':
        period = options.find((p) => periodKey(p) === t.dataset.key) ?? period;
        render();
        break;
      case 'copy':
        c.requestCopy(period);
        break;
    }
  });
  page.addEventListener('change', (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    if (t.dataset.testid === 'greet-toggle') c.setGreetingEnabled(t.checked);
  });
  document.addEventListener('keydown', onKey);
  render();
  document.body.appendChild(page);
  /** @type {HTMLElement} */ (page.querySelector('[data-cp="close"]')).focus({ preventScroll: true });
  return { close };
}
