// @ts-check
/** 画面の切り替え、ダイアログ、トーストの描画（状態 → DOM） */
import { el, esc } from './dom.js';
import { createPeriodScreen } from './screens/periodScreen.js';
import { createMainScreen } from './screens/mainScreen.js';
import { createSettingsScreen } from './screens/settingsScreen.js';
import { createDialog } from './components/dialogs.js';

/** @typedef {import('../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../application/controller.js').createController>} Controller */

/**
 * @param {HTMLElement} mount
 * @param {Controller} c
 * @param {{ now: () => Date, version: string }} opts
 */
export function mountApp(mount, c, opts) {
  /** @type {Record<State['screen'], { el: HTMLElement, update: (s: State) => void, onEnter?: () => void, onLeave?: () => void }>} */
  const screens = {
    period: createPeriodScreen(c, opts.now),
    main: createMainScreen(c),
    settings: createSettingsScreen(c, opts.version),
  };
  /** @type {State['screen'] | null} */
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
    if (current !== s.screen) {
      if (current) screens[current].onLeave?.();
      mount.replaceChildren(screens[s.screen].el);
      current = s.screen;
      screens[s.screen].update(s);
      screens[s.screen].onEnter?.();
    } else {
      screens[s.screen].update(s);
    }
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
      const n = Object.keys(s.restorePending.data.requests).length;
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
