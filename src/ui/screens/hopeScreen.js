// @ts-check
/** 希望シフト（カレンダー／リスト）画面（docs/v2_redesign.md §3.1） */
import { el, esc } from '../dom.js';
import { weekdayOf, WEEKDAYS } from '../../domain/calendar.js';
import { formatShift } from '../../domain/formatter.js';
import { minutesToClock } from '../../domain/shift.js';
import { hopeTemplateFor } from '../../domain/templates.js';
import { openAddSheet } from '../components/addSheet.js';
import { openEntryEditor } from '../components/entryEditor.js';
import { attachCalendar, renderCalendar, longDateLabel, shortDate } from '../components/calendarView.js';
import { openCopyScreen } from './copyScreen.js';
import { choosePeriod } from '../components/periodChooser.js';
import { icons } from '../icons.js';

export { longDateLabel };

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/types.js').Shift} Shift */
/** @typedef {import('../../domain/types.js').TimeShift} TimeShift */

/** @param {Shift} s */
export function shiftClass(s) {
  return s.kind === 'unavailable' ? 'ng' : s.kind === 'available' ? 'ok' : 'tm';
}

/** 希望の欄（開始・終了の縦並び＋縦線＋文字） @param {Shift} shift @param {string} [prefix] */
export function hopeEntryHtml(shift, prefix = '希望') {
  if (shift.kind !== 'range') {
    return `<span class="entry ${shiftClass(shift)}"><span class="entry-times one">${shift.kind === 'available' ? '○' : '×'}</span><span class="entry-bar"></span><span class="entry-text">${prefix ? `${prefix} ` : ''}${shift.kind === 'available' ? '終日可能' : '勤務不可'}</span></span>`;
  }
  const a = shift.start.kind === 'time' ? minutesToClock(shift.start.minutes) : shift.start.kind === 'open' ? 'OP' : '—';
  const b = shift.end.kind === 'time' ? minutesToClock(shift.end.minutes) : shift.end.kind === 'last' ? 'LA' : '—';
  return `<span class="entry tm"><span class="entry-times"><span class="a">${esc(a)}</span><span class="b">${esc(b)}</span></span><span class="entry-bar"></span><span class="entry-text">${prefix ? `${prefix} ` : ''}${esc(formatShift(shift))}</span></span>`;
}

/** @param {Controller} c @param {() => Date} now */
export function createHopeScreen(c, now) {
  const root = el(`<div class="screen hope-screen" data-screen="hope"></div>`);

  function openSheet() {
    const s = c.getState();
    const targets = c.targets();
    if (targets.length === 0) {
      c.notify('日付を選択してください', 'error');
      return;
    }
    const single = !s.multi;
    const template = single ? hopeTemplateFor(s.data.weekdayTemplates, s.selected) : null;
    const hasValue = targets.some((d) => s.data.hopes[d]);
    openAddSheet(c, {
      title: single ? `${shortDate(s.selected)} にシフト追加` : `${targets.length}日にまとめて追加`,
      template,
      templateLabel: single ? `${WEEKDAYS[weekdayOf(s.selected)]}曜日のいつもの` : undefined,
      clearLabel: hasValue ? (single ? '未入力に戻す' : '選んだ日を未入力に戻す') : null,
      onPick: (shift) => c.applyHope(shift),
      onNew: () => openEditor(),
      onClear: () => c.clearHope(),
    });
  }

  function openEditor() {
    const s = c.getState();
    const targets = c.targets();
    // Q11: 選択日の時間 → 曜日のいつもの → 最後に使った時間 → 既定値
    /** @type {TimeShift | null} */
    let initial = null;
    if (!s.multi) {
      const rec = s.data.hopes[s.selected];
      if (rec && rec.shift.kind === 'range') initial = rec.shift;
      const t = hopeTemplateFor(s.data.weekdayTemplates, s.selected);
      if (!initial && t && t.kind === 'range') initial = t;
    }
    // ピン留めが先頭に並ぶため、最後に使った日時で探す
    const latest = [...s.data.hopeHistory].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
    if (!initial && latest) initial = latest.shift;
    const editing = !s.multi && !!s.data.hopes[s.selected];
    openEntryEditor({
      title: editing ? 'シフトの編集' : 'シフトの追加',
      targetLabel: s.multi ? `${targets.length}日にまとめて入力` : longDateLabel(s.selected),
      initial,
      onDone: (shift) => c.applyHope(shift),
    });
  }

  attachCalendar(root, c, {
    onAdd: openSheet,
    onListTap: openSheet,
    handlers: {
      copy: () => openCopyScreen(c),
      edit: () => openEditor(),
      // ゴミ箱：確認なしで削除（2026-11-27）
      delete: () => {
        if (c.clearHope()) c.notify('希望シフトを削除しました');
      },
      // 曜日のいつもので未入力の日を埋める（2026-11-27 その他から移動）
      fill: () => choosePeriod({
        title: 'いつもので埋める',
        message: '未入力の日だけを曜日のいつもので埋めます（入力済みの日は変えません）。',
        around: c.getState().month,
        onPick: (p) => c.fillHopesFromTemplates(p),
      }),
    },
  });

  /** @param {State} s */
  function update(s) {
    const hopes = s.data.hopes;
    renderCalendar(root, s, now(), {
      leftButtons: `<button type="button" class="icon-btn" data-action="copy" aria-label="LINE提出用コピー">${icons.share}</button>`,
      rightButtons: `<button type="button" class="tb-pill" data-action="fill">いつもので<br>埋める</button>`,
      cell: (date) => {
        const rec = hopes[date];
        if (!rec) return { html: '', label: '未入力' };
        const val = formatShift(rec.shift);
        return { html: `<span class="cal-val ${shiftClass(rec.shift)}">${esc(val)}</span>`, label: val };
      },
      row: (date) => {
        const rec = hopes[date];
        return rec ? { html: hopeEntryHtml(rec.shift), label: formatShift(rec.shift) } : { html: '', label: '未入力' };
      },
      addLabel: (st) => (st.multi ? `${st.multiSelection.length}日にまとめて追加` : 'シフトを追加'),
      panel: (st) => {
        const rec = !st.multi ? hopes[st.selected] : null;
        return `${rec ? `<div class="day-entry-row">
            <button type="button" class="day-entry" data-action="edit" aria-label="${esc(`${shortDate(st.selected)}の希望 ${formatShift(rec.shift)} を編集`)}">${hopeEntryHtml(rec.shift)}</button>
            <button type="button" class="trash-btn" data-action="delete" aria-label="この日の希望シフトを削除">${icons.trash}</button>
          </div>` : ''}
          <button type="button" class="dashed-add" data-action="add">＋ ${st.multi ? `${st.multiSelection.length}日にまとめて追加` : rec ? 'シフトを変更' : 'シフトを追加'}</button>`;
      },
    });
  }

  return { el: root, update };
}
