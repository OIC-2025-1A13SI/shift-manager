// @ts-check
/**
 * iOS 風スクロールホイール（R09）。scroll-snap で1項目ずつ止まる。
 * キーボード（↑↓）でも操作でき、role="slider" で読み上げに値を伝える。
 */
import { el } from '../dom.js';

const ITEM_H = 40;

/**
 * @param {{ options: number[], value: number, label: string, format: (v: number) => string, onChange: (v: number) => void }} p
 */
export function createWheel(p) {
  const root = el(`<div class="wheel"></div>`);
  const vp = el(
    `<div class="wheel-vp" tabindex="0" role="slider" aria-label="${p.label}" aria-valuemin="0" aria-valuemax="${p.options.length - 1}"></div>`,
  );
  vp.appendChild(el(`<div class="wheel-pad" aria-hidden="true"></div>`));
  const items = p.options.map((v, i) => {
    const it = el(`<div class="wheel-item" data-i="${i}" aria-hidden="true">${p.format(v)}</div>`);
    vp.appendChild(it);
    return it;
  });
  vp.appendChild(el(`<div class="wheel-pad" aria-hidden="true"></div>`));
  const special = el(`<div class="special-label" aria-hidden="true" hidden></div>`);
  root.append(vp, special);

  let index = Math.max(0, p.options.indexOf(p.value));
  let disabled = false;

  function mark(i) {
    items.forEach((it, j) => it.classList.toggle('cur', i === j));
    vp.setAttribute('aria-valuenow', String(i));
    vp.setAttribute('aria-valuetext', p.format(p.options[i]));
  }
  /** @param {number} i @param {boolean} smooth */
  function scrollToIndex(i, smooth) {
    vp.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
  }
  /** @param {number} i */
  function commit(i) {
    const c = Math.min(Math.max(i, 0), p.options.length - 1);
    if (c === index) return;
    index = c;
    mark(c);
    p.onChange(p.options[c]);
  }

  vp.addEventListener('scroll', () => commit(Math.round(vp.scrollTop / ITEM_H)), { passive: true });
  vp.addEventListener('click', (ev) => {
    const it = /** @type {HTMLElement} */ (ev.target).closest('.wheel-item');
    if (it instanceof HTMLElement && !disabled) scrollToIndex(Number(it.dataset.i), true);
  });
  vp.addEventListener('keydown', (ev) => {
    if (disabled) return;
    const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    ev.preventDefault();
    const next = Math.min(Math.max(index + step, 0), p.options.length - 1);
    scrollToIndex(next, false);
    commit(next);
  });
  mark(index);

  return {
    el: root,
    /** DOM へ追加した後に呼ぶ（初期位置の反映） */
    attach() {
      scrollToIndex(index, false);
    },
    get value() {
      return p.options[index];
    },
    /** 特殊指定中はホイールを隠して OP/LA/指定なし を表示 @param {string | null} label */
    setSpecial(label) {
      const wasDisabled = disabled;
      disabled = label !== null;
      special.textContent = label ?? '';
      if (wasDisabled === disabled) return;
      root.classList.toggle('has-special', disabled);
      special.hidden = !disabled;
      vp.tabIndex = disabled ? -1 : 0;
      vp.setAttribute('aria-disabled', String(disabled));
      if (!disabled) requestAnimationFrame(() => scrollToIndex(index, false));
    },
  };
}
