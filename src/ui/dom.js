// @ts-check
/** UI 共通ヘルパー */

/** HTML エスケープ @param {unknown} s */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** @param {string} html @returns {HTMLElement} */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return /** @type {HTMLElement} */ (t.content.firstElementChild);
}

/**
 * data-action 属性によるイベント委譲
 * @param {HTMLElement} root
 * @param {Record<string, (target: HTMLElement, ev: Event) => void>} handlers
 */
export function delegate(root, handlers) {
  root.addEventListener('click', (ev) => {
    const target = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (ev.target)).closest('[data-action]'));
    if (!target || !root.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    const fn = handlers[target.dataset.action ?? ''];
    if (fn) fn(target, ev);
  });
}
