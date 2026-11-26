// @ts-check
/** S01 期間選択画面 */
import { el, esc, delegate } from '../dom.js';
import { getPeriodCandidates, getPeriodDates, periodKey, periodRangeLabel, parsePeriodKey } from '../../domain/calendar.js';
import { countMissing } from '../../domain/formatter.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */

/** @param {Controller} c @param {() => Date} now */
export function createPeriodScreen(c, now) {
  const root = el(`<div class="screen" data-screen="period"></div>`);
  delegate(root, {
    period: (t) => {
      const p = parsePeriodKey(t.dataset.key ?? '');
      if (p) c.openPeriod(p);
    },
    settings: () => c.openSettings(),
  });

  /** @param {State} s */
  function update(s) {
    const candidates = getPeriodCandidates(now());
    const groups = [candidates.slice(0, 2), candidates.slice(2, 4)];
    const html = groups
      .map((g, gi) => {
        const head = `${gi === 0 ? '今月' : '翌月'}　${g[0].year}年${g[0].month}月`;
        const rows = g
          .map((p) => {
            const dates = getPeriodDates(p);
            const filled = dates.length - countMissing(dates, s.data.requests);
            const status =
              filled === 0
                ? `<span class="period-count">未入力</span>`
                : `<span class="period-count ${filled === dates.length ? 'done' : ''}">${filled}/${dates.length}日入力済み</span>`;
            return `<button type="button" class="row" data-action="period" data-key="${periodKey(p)}">
                <span class="grow">${esc(periodRangeLabel(p))}</span>${status}<span class="chev" aria-hidden="true">›</span>
              </button>`;
          })
          .join('');
        return `<div class="section-header">${esc(head)}</div><div class="group">${rows}</div>`;
      })
      .join('');
    root.innerHTML = `
      <header class="navbar">
        <span class="left"></span>
        <h1>シフトマネージャー</h1>
        <span class="right"><button type="button" class="nav-btn icon" data-action="settings" aria-label="設定">⚙︎</button></span>
      </header>
      <main class="page">
        ${s.loadError ? `<div class="banner" role="alert">${esc(s.loadError)}</div>` : ''}
        ${s.saveError ? `<div class="banner" role="alert">${esc(s.saveError)}</div>` : ''}
        <div class="large-title">期間を選択</div>
        ${html}
        <p class="section-footer">データはこの端末内にのみ保存されます。定期的に設定画面からバックアップしてください。</p>
      </main>`;
  }

  return { el: root, update };
}
