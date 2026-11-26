// @ts-check
/** S05 設定画面 */
import { el, esc, delegate } from '../dom.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */

/** @param {Controller} c @param {string} version */
export function createSettingsScreen(c, version) {
  const root = el(`
    <div class="screen" data-screen="settings">
      <header class="navbar">
        <span class="left"><button type="button" class="nav-btn" data-action="back"><span class="chev" aria-hidden="true">‹</span>戻る</button></span>
        <h1>設定</h1>
        <span class="right"></span>
      </header>
      <main class="page">
        <div class="banners"></div>
        <div class="section-header">挨拶文</div>
        <div class="group">
          <label class="row"><span class="grow">挨拶文を付ける</span><span class="switch"><input type="checkbox" data-testid="settings-greet"></span></label>
          <div class="row row-col"><label for="greet-prefix">先頭文</label><textarea id="greet-prefix" data-field="greetingPrefix" rows="2" placeholder="例：お疲れ様です。希望シフトを提出します。"></textarea></div>
          <div class="row row-col"><label for="greet-suffix">末尾文</label><textarea id="greet-suffix" data-field="greetingSuffix" rows="2" placeholder="例：よろしくお願いいたします。"></textarea></div>
        </div>
        <p class="section-footer">ONのとき、先頭文・日程・末尾文を改行でつないでコピーします。空欄の文は出力されません。</p>

        <div class="section-header">バックアップ</div>
        <div class="group">
          <button type="button" class="row link" data-action="export">バックアップを書き出す</button>
          <button type="button" class="row link" data-action="restore">バックアップから復元</button>
        </div>
        <input type="file" accept="application/json,.json" hidden data-testid="restore-file">
        <p class="section-footer">データはこの端末内にのみ保存されます。Safariのデータ削除やアプリの削除で消えることがあるため、定期的に書き出して「ファイル」アプリなどに保存してください。復元すると現在のデータはすべて置き換えられます（復元前に現在のデータを書き出します）。</p>

        <div class="section-header">情報</div>
        <div class="group">
          <div class="row"><span class="grow">バージョン</span><span class="sub">${esc(version)}</span></div>
          <div class="row"><span class="grow">外観</span><span class="sub">端末の設定に連動</span></div>
        </div>
      </main>
    </div>`);

  const banners = /** @type {HTMLElement} */ (root.querySelector('.banners'));
  const toggle = /** @type {HTMLInputElement} */ (root.querySelector('[data-testid="settings-greet"]'));
  const fileInput = /** @type {HTMLInputElement} */ (root.querySelector('input[type=file]'));
  const areas = /** @type {HTMLTextAreaElement[]} */ ([...root.querySelectorAll('textarea')]);
  /** @type {Map<HTMLTextAreaElement, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  /** @param {HTMLTextAreaElement} ta */
  function flush(ta) {
    clearTimeout(timers.get(ta));
    timers.delete(ta);
    const field = /** @type {'greetingPrefix' | 'greetingSuffix'} */ (ta.dataset.field);
    if (c.getState().data.settings[field] !== ta.value) c.setGreetingText(field, ta.value);
  }
  const flushAll = () => areas.forEach(flush);
  for (const ta of areas) {
    ta.addEventListener('input', () => {
      clearTimeout(timers.get(ta));
      timers.set(ta, setTimeout(() => flush(ta), 400));
    });
    ta.addEventListener('blur', () => flush(ta));
  }
  toggle.addEventListener('change', () => c.setGreetingEnabled(toggle.checked));
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      c.prepareRestore(await f.text(), f.size);
    } catch {
      c.notify('ファイルを読み込めませんでした', 'error');
    }
  });

  delegate(root, {
    back: () => {
      flushAll();
      c.closeSettings();
    },
    export: () => {
      flushAll();
      c.exportBackup();
    },
    restore: () => fileInput.click(),
  });

  return {
    el: root,
    /** @param {State} s */
    update(s) {
      toggle.checked = s.data.settings.greetingEnabled;
      banners.innerHTML = [s.loadError, s.saveError]
        .filter(Boolean)
        .map((m) => `<div class="banner" role="alert">${esc(m)}</div>`)
        .join('');
      // 入力中の欄は書き換えない
      for (const ta of areas) {
        if (document.activeElement !== ta && !timers.has(ta)) ta.value = s.data.settings[/** @type {'greetingPrefix' | 'greetingSuffix'} */ (ta.dataset.field)];
      }
    },
    onEnter() {
      window.scrollTo(0, 0);
    },
    onLeave: flushAll,
  };
}
