// @ts-check
/** まだ作っていないタブ（確定シフト・給料計算）の案内画面 */
import { el, esc } from '../dom.js';

/** @param {string} title @param {string} body */
export function createPlaceholderScreen(title, body) {
  const root = el(`
    <div class="screen" data-screen="placeholder">
      <header class="navbar"><span class="left"></span><h1>${esc(title)}</h1><span class="right"></span></header>
      <main class="page"><div class="empty-state"><p class="empty-title">準備中</p><p>${esc(body)}</p></div></main>
    </div>`);
  return { el: root, update() {} };
}
