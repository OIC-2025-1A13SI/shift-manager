// @ts-check
/** タブの切り替え、ダイアログ、トーストの描画（状態 → DOM） */
import { el, esc } from './dom.js';
import { createHopeScreen } from './screens/hopeScreen.js';
import { createOtherScreen } from './screens/otherScreen.js';
import { createPlaceholderScreen } from './screens/placeholderScreen.js';
import { createDialog } from './components/dialogs.js';
import { icons } from './icons.js';

/** @typedef {import('../application/controller.js').State} State */
/** @typedef {import('../application/controller.js').Tab} Tab */
/** @typedef {ReturnType<typeof import('../application/controller.js').createController>} Controller */

/**
 * @param {HTMLElement} mount
 * @param {Controller} c
 * @param {{ now: () => Date, version: string }} opts
 */
export function mountApp(mount, c, opts) {
  /** @type {Record<Tab, { el: HTMLElement, update: (s: State) => void, onLeave?: () => void }>} */
  const screens = {
    hope: createHopeScreen(c, opts.now),
    confirmed: createPlaceholderScreen('確定シフト', '確定シフトの入力は次の更新で使えるようになります。希望シフトを見ながら「希望どおり」ボタンなどで入力できるようにする予定です。'),
    pay: createPlaceholderScreen('給料計算', '給料計算は確定シフトのあとに追加します。'),
    other: createOtherScreen(c, opts.version),
  };
  /** @type {[Tab, string, string][]} */
  const tabs = [
    ['hope', '希望シフト', icons.tabHope],
    ['confirmed', '確定シフト', icons.tabConfirmed],
    ['pay', '給料計算', icons.tabPay],
    ['other', 'その他', icons.tabOther],
  ];
  const content = el(`<div class="app-content"></div>`);
  const tabbar = el(`<nav class="tabbar" aria-label="タブ">${tabs
    .map(([id, label, icon]) => `<button type="button" data-tab="${id}" aria-label="${label}">${icon}<span>${label}</span></button>`)
    .join('')}</nav>`);
  tabbar.addEventListener('click', (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('[data-tab]');
    if (b instanceof HTMLElement) c.setTab(/** @type {Tab} */ (b.dataset.tab));
  });
  mount.replaceChildren(content, tabbar);

  /** @type {Tab | null} */
  let current = null;
  /** @type {HTMLElement | null} */
  let dialog = null;
  /** @type {unknown} */
  let dialogKey = null;
  /** @type {HTMLElement | null} */
  let toast = null;
  let toastId = 0;

  /** @param {State} s */
  function render(s) {
    if (!s.ready) return;
    if (current !== s.tab) {
      if (current) screens[current].onLeave?.();
      content.replaceChildren(screens[s.tab].el);
      current = s.tab;
      window.scrollTo(0, 0);
      tabbar.querySelectorAll('[data-tab]').forEach((b) => {
        const on = /** @type {HTMLElement} */ (b).dataset.tab === s.tab;
        b.classList.toggle('on', on);
        if (on) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
    }
    screens[s.tab].update(s);
    renderDialog(s);
    renderToast(s);
  }

  /** @param {State} s */
  function renderDialog(s) {
    const key = s.copyConfirm ?? s.manualCopyText ?? s.restorePending ?? null;
    if (key === dialogKey) return;
    dialogKey = key;
    dialog?.remove();
    dialog = null;
    if (s.copyConfirm) {
      dialog = createDialog({
        title: `未入力の日付が${s.copyConfirm.missing}日あります`,
        message: '×としてコピーしますか？',
        actions: [
          { label: 'キャンセル', testid: 'copy-cancel', onClick: () => c.cancelCopy() },
          { label: 'コピー', style: 'strong', testid: 'copy-confirm', onClick: () => c.confirmCopy() },
        ],
      });
    } else if (s.manualCopyText !== null) {
      const ta = /** @type {HTMLTextAreaElement} */ (el(`<textarea readonly data-testid="manual-copy">${esc(s.manualCopyText)}</textarea>`));
      ta.addEventListener('focus', () => ta.setSelectionRange(0, ta.value.length));
      dialog = createDialog({
        title: 'コピーできませんでした',
        message: '下の文章を長押しして「すべてを選択」→「コピー」してください。',
        body: ta,
        wide: true,
        actions: [{ label: '閉じる', style: 'strong', onClick: () => c.closeManualCopy() }],
      });
    } else if (s.restorePending) {
      const n = Object.keys(s.restorePending.data.hopes).length;
      dialog = createDialog({
        title: 'バックアップから復元しますか？',
        message: `現在のデータはすべて置き換えられます（希望シフト${n}日分を含むバックアップ）。復元の前に、現在のデータを書き出します。`,
        actions: [
          { label: 'キャンセル', onClick: () => c.cancelRestore() },
          { label: '書き出して復元', style: 'destructive', testid: 'restore-confirm', onClick: () => c.confirmRestore() },
        ],
      });
    }
    if (dialog) document.body.appendChild(dialog);
  }

  /** @param {State} s */
  function renderToast(s) {
    const m = s.message;
    if (!m) {
      toast?.remove();
      toast = null;
      return;
    }
    if (m.id === toastId) return;
    toastId = m.id;
    toast?.remove();
    toast = el(`<div class="toast ${m.kind === 'error' ? 'error' : ''}" role="${m.kind === 'error' ? 'alert' : 'status'}" data-testid="toast">${esc(m.text)}</div>`);
    document.body.appendChild(toast);
    const id = m.id;
    setTimeout(() => {
      if (c.getState().message?.id === id) c.dismissMessage();
    }, m.kind === 'error' ? 4000 : 2000);
  }

  c.subscribe(render);
  render(c.getState());
}
