// @ts-check
/**
 * 確定シフトの追加シート（docs/v2_redesign.md §3.5）。
 * 希望どおり → 曜日のいつもの（確定）→ 確定の履歴（ピン留め・編集で削除）→ 新規に入力する。
 */
import { el, esc } from '../dom.js';
import { minutesToClock } from '../../domain/shift.js';
import { formatConfirmed, confirmedDetail } from '../../domain/confirmed.js';

/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/confirmed.js').ConfirmedTimes} ConfirmedTimes */

/**
 * @param {Controller} c
 * @param {{
 *   title: string,
 *   hopeLabel: string | null,
 *   asHopeLabel: string | null,
 *   template: ConfirmedTimes | null,
 *   templateLabel?: string,
 *   clearLabel: string | null,
 *   onAsHope: () => void,
 *   onTemplate: () => boolean,
 *   onHistory: (id: string) => boolean,
 *   onNew: () => void,
 *   onClear: () => void,
 * }} p
 */
export function openConfirmedSheet(c, p) {
  let editing = false;
  const backdrop = el(`<div class="backdrop"></div>`);
  const sheet = el(`<div class="sheet dark" role="dialog" aria-modal="true" aria-label="${esc(p.title)}"></div>`);

  /** @param {ConfirmedTimes} t */
  const timeBlock = (t) => `<span class="hs-start">${minutesToClock(t.start)}</span><span class="hs-sep">-</span><span class="hs-end">${minutesToClock(t.end)}</span>`;

  function render() {
    const history = c.getState().data.confirmedHistory;
    sheet.innerHTML = `
      <div class="grabber" aria-hidden="true"></div>
      <h2 class="sheet-title">${esc(p.title)}</h2>
      <div class="sheet-scroll">
        ${p.hopeLabel !== null ? `<p class="sheet-ref" data-testid="sheet-hope">希望：<strong>${esc(p.hopeLabel)}</strong></p>` : ''}
        ${p.asHopeLabel ? `<button type="button" class="quick-btn wide ok" data-cs="ashope">${esc(p.asHopeLabel)}</button>` : ''}
        ${p.template ? `
          <div class="sheet-label">${esc(p.templateLabel ?? '曜日のいつもの')}</div>
          <button type="button" class="hist-card template" data-cs="template">${timeBlock(p.template)}<span class="hs-name">${esc([formatConfirmed(p.template), confirmedDetail(p.template)].filter(Boolean).join(' '))}</span></button>` : ''}
        <div class="sheet-label row-between"><span>確定の履歴</span>
          ${history.length ? `<button type="button" class="text-btn light" data-cs="edit">${editing ? '完了' : '編集'}</button>` : ''}</div>
        ${history.length ? '' : '<p class="sheet-note">まだ履歴はありません。確定した時間がここに並びます。</p>'}
        <div class="hist-list">
          ${history.map((h) => `
            <div class="hist-card ${h.pinned ? 'pinned' : ''}">
              <button type="button" class="hist-main" data-cs="${editing ? 'delete' : 'history'}" data-id="${esc(h.id)}"
                aria-label="${esc(formatConfirmed(h.shift))}${editing ? 'を履歴から削除' : 'で確定'}">
                ${editing ? '<span class="hs-del" aria-hidden="true">⊖</span>' : ''}${timeBlock(h.shift)}<span class="hs-name">${esc(confirmedDetail(h.shift) || formatConfirmed(h.shift))}</span>
              </button>
              <button type="button" class="pin-btn" data-cs="pin" data-id="${esc(h.id)}" aria-pressed="${h.pinned}"
                aria-label="${h.pinned ? 'ピン留めを外す' : 'ピン留めする'}">${pinIcon(h.pinned)}</button>
            </div>`).join('')}
        </div>
        ${p.clearLabel ? `<button type="button" class="clear-link" data-cs="clear">${esc(p.clearLabel)}</button>` : ''}
      </div>
      <button type="button" class="primary-btn" data-cs="new">新規に入力する</button>`;
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

  sheet.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target).closest('[data-cs]');
    if (!(t instanceof HTMLElement)) return;
    const id = t.dataset.id ?? '';
    switch (t.dataset.cs) {
      case 'ashope':
        close();
        p.onAsHope();
        break;
      case 'template':
        if (p.onTemplate()) close();
        break;
      case 'history':
        if (p.onHistory(id)) close();
        break;
      case 'pin':
        c.toggleConfirmedHistoryPin(id);
        break;
      case 'edit':
        editing = !editing;
        render();
        break;
      case 'delete':
        c.deleteConfirmedHistory(id);
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
