// @ts-check
/** その他タブ（docs/v2_redesign.md §3.7。段階①：曜日のいつもの（希望）、まとめて入力、挨拶文、バックアップ、情報） */
import { el, esc, delegate } from '../dom.js';
import { WEEKDAYS, periodOptionsAround, periodShortLabel, periodKey, periodRangeLabel } from '../../domain/calendar.js';
import { formatShift } from '../../domain/formatter.js';
import { openAddSheet } from '../components/addSheet.js';
import { openEntryEditor } from '../components/entryEditor.js';
import { createDialog } from '../components/dialogs.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */

/** @param {Controller} c @param {string} version */
export function createOtherScreen(c, version) {
  const root = el(`
    <div class="screen" data-screen="other">
      <header class="navbar"><span class="left"></span><h1>その他</h1><span class="right"></span></header>
      <main class="page settings-page">
        <div class="banners"></div>

        <div class="section-header">曜日のいつもの（希望シフト）</div>
        <div class="group weekday-group"></div>
        <p class="section-footer">日付をタップしたときに、その曜日の時間をワンタップで入れられます。</p>
        <div class="group">
          <button type="button" class="row link" data-action="fill">希望をいつもので埋める…</button>
        </div>
        <p class="section-footer">前半・後半を選ぶと、未入力の日だけを曜日のいつもので埋めます（入力済みの日は変えません）。</p>

        <div class="section-header">挨拶文（LINE提出用コピー）</div>
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
  const weekdayGroup = /** @type {HTMLElement} */ (root.querySelector('.weekday-group'));
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

  /** @param {number} wd */
  function editTemplate(wd) {
    const cur = c.getState().data.weekdayTemplates[String(wd)]?.hope ?? null;
    const name = `${WEEKDAYS[wd]}曜日のいつもの`;
    openAddSheet(c, {
      title: `${name}を登録`,
      template: null,
      clearLabel: cur ? '登録を削除' : null,
      onPick: (shift) => c.setHopeTemplate(wd, shift),
      onClear: () => c.setHopeTemplate(wd, null),
      onNew: () => openEntryEditor({
        title: name,
        targetLabel: `毎週${WEEKDAYS[wd]}曜日の希望`,
        initial: cur && cur.kind === 'range' ? cur : null,
        doneLabel: '登録する',
        onDone: (shift) => c.setHopeTemplate(wd, shift),
      }),
    });
  }

  function chooseFillPeriod() {
    const options = periodOptionsAround(c.getState().month);
    const body = el(`<div class="dialog-choices">${options.map((p) => `
      <button type="button" data-key="${periodKey(p)}">${p.year}年${esc(periodShortLabel(p))}<span>${esc(periodRangeLabel(p))}</span></button>`).join('')}</div>`);
    const dlg = createDialog({
      title: '希望をいつもので埋める',
      message: '未入力の日だけを曜日のいつもので埋めます。',
      body,
      actions: [{ label: 'キャンセル', onClick: () => dlg.remove() }],
    });
    body.addEventListener('click', (ev) => {
      const b = /** @type {HTMLElement} */ (ev.target).closest('button');
      const p = options.find((o) => periodKey(o) === b?.dataset.key);
      if (!p) return;
      dlg.remove();
      c.fillHopesFromTemplates(p);
    });
    document.body.appendChild(dlg);
  }

  delegate(root, {
    template: (t) => editTemplate(Number(t.dataset.wd)),
    fill: () => chooseFillPeriod(),
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
      weekdayGroup.innerHTML = WEEKDAYS.map((w, i) => {
        const t = s.data.weekdayTemplates[String(i)]?.hope;
        return `<button type="button" class="row" data-action="template" data-wd="${i}">
            <span class="grow wd-name ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}曜日</span>
            <span class="sub ${t ? 'set' : ''}">${t ? esc(formatShift(t)) : '未登録'}</span><span class="chev" aria-hidden="true">›</span>
          </button>`;
      }).join('');
      for (const ta of areas) {
        if (document.activeElement !== ta && !timers.has(ta)) ta.value = s.data.settings[/** @type {'greetingPrefix' | 'greetingSuffix'} */ (ta.dataset.field)];
      }
    },
    onLeave: flushAll,
  };
}
