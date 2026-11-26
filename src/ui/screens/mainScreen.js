// @ts-check
/** S02 メイン入力画面（S04 履歴編集はこの画面の編集モード） */
import { el, esc, delegate } from '../dom.js';
import { parseDateKey, weekdayOf, WEEKDAYS } from '../../domain/calendar.js';
import { formatShift, formatDateLabel } from '../../domain/formatter.js';
import { openTimeSheet } from '../components/timeSheet.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/types.js').TimeShift} TimeShift */

/** @param {Controller} c */
export function createMainScreen(c) {
  const root = el(`
    <div class="screen" data-screen="main">
      <header class="navbar">
        <span class="left"><button type="button" class="nav-btn" data-action="back"><span class="chev" aria-hidden="true">‹</span>期間選択</button></span>
        <h1>シフトマネージャー</h1>
        <span class="right"><button type="button" class="nav-btn icon" data-action="settings" aria-label="設定">⚙︎</button></span>
      </header>
      <main class="page main-page"></main>
      <section class="preview-panel" aria-label="提出プレビュー">
        <div class="preview-inner">
          <button type="button" class="preview-head" data-action="toggle-preview" aria-expanded="true">
            <span class="t">提出プレビュー</span><span class="n"></span><span class="arrow" aria-hidden="true">▼</span>
          </button>
          <div class="preview-body" data-testid="preview" tabindex="0" aria-label="提出文章"></div>
          <label class="greet-row"><span>挨拶文を付ける</span><span class="switch"><input type="checkbox" data-testid="greet-toggle"></span></label>
          <button type="button" class="copy-btn" data-action="copy">シフトをコピー</button>
        </div>
      </section>
    </div>`);
  const page = /** @type {HTMLElement} */ (root.querySelector('.page'));
  const panel = /** @type {HTMLElement} */ (root.querySelector('.preview-panel'));
  const previewBody = /** @type {HTMLElement} */ (root.querySelector('.preview-body'));
  const previewCount = /** @type {HTMLElement} */ (root.querySelector('.preview-head .n'));
  const greetToggle = /** @type {HTMLInputElement} */ (root.querySelector('[data-testid="greet-toggle"]'));
  let collapsed = false;

  // 固定プレビューの高さぶん本文に余白を取る
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--panel-h', `${panel.offsetHeight}px`);
    }).observe(panel);
  }

  greetToggle.addEventListener('change', () => c.setGreetingEnabled(greetToggle.checked));

  delegate(root, {
    back: () => c.backToPeriods(),
    settings: () => c.openSettings(),
    date: (t) => c.tapDate(t.dataset.date ?? ''),
    multi: () => c.toggleMulti(),
    history: (t) => {
      const id = t.dataset.id ?? '';
      if (c.getState().historyEditing) c.deleteHistory(id);
      else c.applyHistory(id);
    },
    'history-edit': () => c.toggleHistoryEditing(),
    add: () => openSheet(),
    available: () => c.applyShift({ kind: 'available' }),
    unavailable: () => c.applyShift({ kind: 'unavailable' }),
    clear: () => c.clearSelected(),
    copy: () => c.requestCopy(),
    'toggle-preview': () => {
      collapsed = !collapsed;
      panel.classList.toggle('collapsed', collapsed);
      root.querySelector('.preview-head')?.setAttribute('aria-expanded', String(!collapsed));
    },
  });

  function openSheet() {
    const s = c.getState();
    if (s.multi && s.multiSelection.length === 0) {
      c.notify('日付を選択してください', 'error');
      return;
    }
    // Q11: 選択日の時間 → 直前に使った時間 → 既定値
    /** @type {TimeShift | null} */
    let initial = null;
    if (!s.multi && s.selected) {
      const rec = s.data.requests[s.selected];
      if (rec && rec.shift.kind === 'range') initial = rec.shift;
    }
    if (!initial && s.data.history[0]) initial = s.data.history[0].shift;
    openTimeSheet({ initial, targetLabel: targetLabel(s), onApply: (shift) => c.applyShift(shift) });
  }

  /** @param {State} s */
  function targetLabel(s) {
    if (s.multi) return `一括設定：${s.multiSelection.length}日を選択中`;
    return s.selected ? `${formatDateLabel(s.selected)}を編集中` : '';
  }

  /** @param {State} s */
  function update(s) {
    if (!s.period) return;
    const p = s.period;
    const days = s.dates
      .map((d) => {
        const rec = s.data.requests[d];
        const wd = weekdayOf(d);
        const val = rec ? formatShift(rec.shift) : '未入力';
        const cls = [
          'day',
          wd === 0 ? 'sun' : wd === 6 ? 'sat' : '',
          !rec ? 'missing' : rec.shift.kind === 'unavailable' ? 'unavailable' : 'entered',
          s.multi ? (s.multiSelection.includes(d) ? 'picked' : '') : s.selected === d ? 'selected' : '',
        ].join(' ');
        const pressed = s.multi ? s.multiSelection.includes(d) : s.selected === d;
        const label = `${parseDateKey(d).month}月${parseDateKey(d).day}日 ${WEEKDAYS[wd]}曜日 ${val}`;
        return `<button type="button" class="${cls}" data-action="date" data-date="${d}" aria-pressed="${pressed}" aria-label="${esc(label)}">
            <span class="dnum">${parseDateKey(d).day}<span class="wd">${WEEKDAYS[wd]}</span></span>
            <span class="dval">${esc(val)}</span>
          </button>`;
      })
      .join('');

    const hist = s.data.history
      .map(
        (h) =>
          `<button type="button" class="chip ${s.historyEditing ? 'deleting' : ''}" data-action="history" data-id="${esc(h.id)}"
             aria-label="${esc(formatShift(h.shift))}${s.historyEditing ? 'を削除' : 'を適用'}">${esc(formatShift(h.shift))}</button>`,
      )
      .join('');

    page.innerHTML = `
      ${s.saveError ? `<div class="banner" role="alert" data-testid="save-error">${esc(s.saveError)}</div>` : ''}
      <div class="period-title">${p.year}年${p.month}月<small>${p.half === 'first' ? '前半' : '後半'} ${parseDateKey(s.dates[0]).day}〜${parseDateKey(s.dates[s.dates.length - 1]).day}日</small></div>
      <div class="days" role="group" aria-label="日付">${days}</div>
      <div class="toolbar">
        <span class="editing ${s.multi ? 'multi' : ''}" data-testid="editing">${esc(targetLabel(s))}</span>
        <button type="button" class="pill ${s.multi ? 'on' : ''}" data-action="multi" aria-pressed="${s.multi}">${s.multi ? '複数選択をやめる' : '複数選択'}</button>
      </div>
      <div class="card">
        <div class="card-head">
          <h2>最近使った時間</h2>
          ${s.data.history.length ? `<button type="button" class="text-btn" data-action="history-edit">${s.historyEditing ? '完了' : '編集'}</button>` : ''}
        </div>
        ${s.historyEditing ? `<p class="empty-note">削除する時間をタップしてください。登録済みの希望シフトは変わりません。</p>` : ''}
        ${!s.data.history.length ? `<p class="empty-note">まだ履歴はありません。「＋追加」から時間を登録してください。</p>` : ''}
        <div class="chips">${hist}${s.historyEditing ? '' : `<button type="button" class="chip add" data-action="add">＋追加</button>`}</div>
      </div>
      <div class="big-btns">
        <button type="button" class="big-btn ok" data-action="available">○ 終日可能</button>
        <button type="button" class="big-btn ng" data-action="unavailable">× 勤務不可</button>
      </div>
      <button type="button" class="clear-btn" data-action="clear">未入力に戻す</button>`;

    // プレビュー（スクロール位置を保持して更新）
    const top = previewBody.scrollTop;
    const lines = c.previewLines();
    const st = s.data.settings;
    const greet = (/** @type {string} */ t) =>
      st.greetingEnabled && t.trim() ? `<div class="greet">${esc(t.replace(/^[\r\n]+|[\r\n\s]+$/g, ''))}</div>` : '';
    const highlight = new Set(s.multi ? s.multiSelection : s.selected ? [s.selected] : []);
    previewBody.innerHTML =
      greet(st.greetingPrefix) +
      lines
        .map((l) => `<div class="${[l.missing ? 'missing' : '', highlight.has(l.date) ? 'sel' : ''].join(' ')}">${esc(l.text)}</div>`)
        .join('') +
      greet(st.greetingSuffix);
    previewBody.scrollTop = top;
    const filled = lines.filter((l) => !l.missing).length;
    previewCount.textContent = `${filled}/${lines.length}日入力済み`;
    previewCount.classList.toggle('done', filled === lines.length);
    greetToggle.checked = st.greetingEnabled;
  }

  return {
    el: root,
    update,
    onEnter() {
      previewBody.scrollTop = 0;
      window.scrollTo(0, 0);
    },
  };
}
