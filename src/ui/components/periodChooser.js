// @ts-check
/** 前半・後半を選ぶダイアログ（まとめて入力・まとめて確定で共通） */
import { el, esc } from '../dom.js';
import { createDialog } from './dialogs.js';
import { periodOptionsAround, periodShortLabel, periodKey, periodRangeLabel } from '../../domain/calendar.js';

/** @typedef {import('../../domain/types.js').PeriodRef} PeriodRef */
/** @typedef {import('../../domain/types.js').MonthRef} MonthRef */

/**
 * @param {{ title: string, message: string, around: MonthRef, onPick: (p: PeriodRef) => void }} p
 */
export function choosePeriod(p) {
  const options = periodOptionsAround(p.around);
  const body = el(`<div class="dialog-choices">${options.map((o) => `
    <button type="button" data-key="${periodKey(o)}">${o.year}年${esc(periodShortLabel(o))}<span>${esc(periodRangeLabel(o))}</span></button>`).join('')}</div>`);
  const dlg = createDialog({
    title: p.title,
    message: p.message,
    body,
    actions: [{ label: 'キャンセル', onClick: () => dlg.remove() }],
  });
  body.addEventListener('click', (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('button');
    const o = options.find((x) => periodKey(x) === b?.dataset.key);
    if (!o) return;
    dlg.remove();
    p.onPick(o);
  });
  document.body.appendChild(dlg);
  return dlg;
}
