// @ts-check
/** iOS 風アラートダイアログ（S06 コピー確認、手動コピー、復元確認） */
import { el, esc } from '../dom.js';

/**
 * @param {{
 *   title: string,
 *   message?: string,
 *   body?: HTMLElement,
 *   wide?: boolean,
 *   actions: { label: string, style?: 'strong' | 'destructive', testid?: string, onClick: () => void }[],
 * }} p
 * @returns {HTMLElement} 閉じるときは remove() する
 */
export function createDialog(p) {
  const wrap = el(`<div class="dialog-layer"></div>`);
  const backdrop = el(`<div class="backdrop dim"></div>`);
  const box = el(`
    <div class="dialog ${p.wide ? 'wide' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
      <div class="dialog-body">
        <h2 id="dlg-title">${esc(p.title)}</h2>
        ${p.message ? `<p>${esc(p.message)}</p>` : ''}
      </div>
      <div class="dialog-actions"></div>
    </div>`);
  if (p.body) /** @type {HTMLElement} */ (box.querySelector('.dialog-body')).appendChild(p.body);
  const actions = /** @type {HTMLElement} */ (box.querySelector('.dialog-actions'));
  for (const a of p.actions) {
    const b = el(`<button type="button" class="${a.style ?? ''}" ${a.testid ? `data-testid="${a.testid}"` : ''}>${esc(a.label)}</button>`);
    b.addEventListener('click', a.onClick);
    actions.appendChild(b);
  }
  wrap.append(backdrop, box);
  queueMicrotask(() => /** @type {HTMLElement | null} */ (actions.querySelector('button:last-child'))?.focus({ preventScroll: true }));
  return wrap;
}
