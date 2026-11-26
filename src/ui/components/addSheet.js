// @ts-check
/**
 * 追加シート（docs/v2_redesign.md §3.2）。下から出るシートで、
 * 曜日のいつもの → ○/× → 履歴から追加（ピン留め・編集で削除）→ 新規にシフトを入力する、の順に並べる。
 */
import { el, esc } from '../dom.js';
import { formatShift } from '../../domain/formatter.js';
import { minutesToClock } from '../../domain/shift.js';

/** @typedef {import('../../domain/types.js').Shift} Shift */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */

/**
 * @param {Controller} c
 * @param {{
 *   title: string,
 *   template: Shift | null,
 *   templateLabel?: string,
 *   clearLabel: string | null,
 *   onPick: (shift: Shift) => boolean,
 *   onNew: () => void,
 *   onClear: () => void,
 * }} p
 */
export function openAddSheet(c, p) {
  let editing = false;
  const backdrop = el(`<div class="backdrop"></div>`);
  const sheet = el(`<div class="sheet dark" role="dialog" aria-modal="true" aria-label="${esc(p.title)}"></div>`);

  /** @param {Shift} s */
  const timeBlock = (s) => {
    if (s.kind !== 'range') return `<span class="hs-start">${s.kind === 'available' ? '○' : '×'}</span>`;
    const a = s.start.kind === 'time' ? minutesToClock(s.start.minutes) : s.start.kind === 'open' ? 'OP' : '';
    const b = s.end.kind === 'time' ? minutesToClock(s.end.minutes) : s.end.kind === 'last' ? 'LA' : '';
    return `<span class="hs-start">${esc(a || '—')}</span><span class="hs-sep">-</span><span class="hs-end">${esc(b || '—')}</span>`;
  };

  function render() {
    const history = c.getState().data.hopeHistory;
    sheet.innerHTML = `
      <div class="grabber" aria-hidden="true"></div>
      <h2 class="sheet-title">${esc(p.title)}</h2>
      <div class="sheet-scroll">
        ${p.template ? `
          <div class="sheet-label">${esc(p.templateLabel ?? '曜日のいつもの')}</div>
          <button type="button" class="hist-card template" data-sh="template">${timeBlock(p.template)}<span class="hs-name">${esc(formatShift(p.template))}</span></button>` : ''}
        <div class="quick-row">
          <button type="button" class="quick-btn ok" data-sh="available">○ 終日可能</button>
          <button type="button" class="quick-btn ng" data-sh="unavailable">× 勤務不可</button>
        </div>
        <div class="sheet-label row-between"><span>履歴から追加</span>
          ${history.length ? `<button type="button" class="text-btn light" data-sh="edit">${editing ? '完了' : '編集'}</button>` : ''}</div>
        ${history.length ? '' : '<p class="sheet-note">まだ履歴はありません。新規に入力した時間がここに並びます。</p>'}
        <div class="hist-list">
          ${history.map((h) => `
            <div class="hist-card ${h.pinned ? 'pinned' : ''}">
              <button type="button" class="hist-main" data-sh="${editing ? 'delete' : 'history'}" data-id="${esc(h.id)}"
                aria-label="${esc(formatShift(h.shift))}${editing ? 'を履歴から削除' : 'を追加'}">
                ${editing ? '<span class="hs-del" aria-hidden="true">⊖</span>' : ''}${timeBlock(h.shift)}<span class="hs-name">${esc(formatShift(h.shift))}</span>
              </button>
              <button type="button" class="pin-btn" data-sh="pin" data-id="${esc(h.id)}" aria-pressed="${h.pinned}"
                aria-label="${h.pinned ? 'ピン留めを外す' : 'ピン留めする'}">${pinIcon(h.pinned)}</button>
            </div>`).join('')}
        </div>
        ${p.clearLabel ? `<button type="button" class="clear-link" data-sh="clear">${esc(p.clearLabel)}</button>` : ''}
      </div>
      <button type="button" class="primary-btn" data-sh="new">新規にシフトを入力する</button>`;
  }

  const unsubscribe = c.subscribe(() => render());
  function close() {
    unsubscribe();
    backdrop.remove();
    sheet.remove();
    document.removeEventListener('keydown', onKey);
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  /** @param {Shift} s */
  const pick = (s) => {
    if (p.onPick(s)) close();
  };

  sheet.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target).closest('[data-sh]');
    if (!(t instanceof HTMLElement)) return;
    const id = t.dataset.id ?? '';
    switch (t.dataset.sh) {
      case 'template':
        if (p.template) pick(p.template);
        break;
      case 'available':
        pick({ kind: 'available' });
        break;
      case 'unavailable':
        pick({ kind: 'unavailable' });
        break;
      case 'history': {
        const h = c.getState().data.hopeHistory.find((x) => x.id === id);
        if (h) pick(h.shift);
        break;
      }
      case 'pin':
        c.toggleHopeHistoryPin(id);
        break;
      case 'edit':
        editing = !editing;
        render();
        break;
      case 'delete':
        c.deleteHopeHistory(id);
        break;
      case 'clear':
        close();
        p.onClear();
        break;
      case 'new':
        close();
        p.onNew();
        break;
    }
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  render();
  document.body.append(backdrop, sheet);
  /** @type {HTMLElement | null} */ (sheet.querySelector('button'))?.focus({ preventScroll: true });
  return { close };
}

/** @param {boolean} on */
function pinIcon(on) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M14.5 3.5l6 6-2.5 1-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5M9 13l-4-4 1.5-1.5 4 .5L14 4.5z"/></svg>`;
}
