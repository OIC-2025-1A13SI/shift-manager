// @ts-check
/** 希望シフト（カレンダー／リスト）画面（docs/v2_redesign.md §3.1） */
import { el, esc, delegate } from '../dom.js';
import { monthGrid, monthDates, parseDateKey, weekdayOf, WEEKDAYS, todayKey } from '../../domain/calendar.js';
import { formatShift } from '../../domain/formatter.js';
import { minutesToClock } from '../../domain/shift.js';
import { hopeTemplateFor } from '../../domain/templates.js';
import { openAddSheet } from '../components/addSheet.js';
import { openEntryEditor } from '../components/entryEditor.js';
import { openCopyScreen } from './copyScreen.js';
import { icons } from '../icons.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/types.js').Shift} Shift */
/** @typedef {import('../../domain/types.js').TimeShift} TimeShift */
/** @typedef {import('../../domain/types.js').DateKey} DateKey */

/** @param {DateKey} d */
export function longDateLabel(d) {
  const { year, month, day } = parseDateKey(d);
  return `${year}年${month}月${day}日 (${WEEKDAYS[weekdayOf(d)]})`;
}
/** @param {DateKey} d */
const shortDate = (d) => `${parseDateKey(d).month}月${parseDateKey(d).day}日 (${WEEKDAYS[weekdayOf(d)]})`;

/** @param {Shift} s */
function shiftClass(s) {
  return s.kind === 'unavailable' ? 'ng' : s.kind === 'available' ? 'ok' : 'tm';
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
    // Q11: 選択日の時間 → 曜日のいつもの → 直前に使った時間 → 既定値
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

  delegate(root, {
    'view-calendar': () => c.setView('calendar'),
    'view-list': () => c.setView('list'),
    copy: () => openCopyScreen(c),
    prev: () => c.moveMonth(-1),
    next: () => c.moveMonth(1),
    today: () => c.goToday(),
    date: (t) => c.tapDate(t.dataset.date ?? ''),
    'list-date': (t) => {
      c.tapDate(t.dataset.date ?? '');
      if (!c.getState().multi) openSheet();
    },
    multi: () => c.toggleMulti(),
    add: () => openSheet(),
    edit: () => openEditor(),
  });

  // 左右スワイプで月を移動
  let sx = 0;
  let sy = 0;
  root.addEventListener('touchstart', (e) => {
    if (!(/** @type {HTMLElement} */ (e.target).closest('.cal-swipe'))) { sx = NaN; return; }
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (Number.isNaN(sx)) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) c.moveMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  /** @param {State} s */
  function update(s) {
    const { month } = s;
    const today = todayKey(now());
    const header = `
      <header class="topbar">
        <div class="tb-left">
          <div class="view-toggle" role="group" aria-label="表示">
            <button type="button" data-action="view-calendar" aria-pressed="${s.view === 'calendar'}" aria-label="カレンダー表示">${icons.grid}</button>
            <button type="button" data-action="view-list" aria-pressed="${s.view === 'list'}" aria-label="リスト表示">${icons.list}</button>
          </div>
          <button type="button" class="icon-btn" data-action="copy" aria-label="LINE提出用コピー">${icons.share}</button>
        </div>
        <div class="tb-center">
          <button type="button" class="month-arrow" data-action="prev" aria-label="前の月">‹</button>
          <button type="button" class="month-title" data-action="today" aria-label="${month.year}年${month.month}月（タップで今日へ）">
            <span class="y">${month.year}</span><span class="u">年</span><span class="m">${month.month}</span><span class="u">月</span>
          </button>
          <button type="button" class="month-arrow" data-action="next" aria-label="次の月">›</button>
        </div>
        <div class="tb-right"></div>
      </header>`;
    const banners = [s.loadError, s.saveError]
      .filter(Boolean)
      .map((m) => `<div class="banner" role="alert" data-testid="save-error">${esc(m)}</div>`)
      .join('');

    const picked = new Set(s.multiSelection);
    let body;
    if (s.view === 'calendar') {
      const cells = monthGrid(month)
        .map(({ date, inMonth }) => {
          const rec = s.data.hopes[date];
          const wd = weekdayOf(date);
          const cls = [
            'cal-cell',
            inMonth ? '' : 'out',
            wd === 0 ? 'sun' : wd === 6 ? 'sat' : '',
            s.multi ? (picked.has(date) ? 'picked' : '') : s.selected === date ? 'selected' : '',
            date === today ? 'today' : '',
          ].join(' ');
          const val = rec ? formatShift(rec.shift) : '';
          return `<button type="button" class="${cls}" data-action="date" data-date="${date}"
              aria-pressed="${s.multi ? picked.has(date) : s.selected === date}"
              aria-label="${esc(`${shortDate(date)} ${val || '未入力'}`)}">
              <span class="cal-day">${parseDateKey(date).day}</span>
              ${rec ? `<span class="cal-val ${shiftClass(rec.shift)}">${esc(val)}</span>` : ''}
            </button>`;
        })
        .join('');
      body = `
        <div class="cal-swipe">
          <div class="cal-week" aria-hidden="true">${WEEKDAYS.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
          <div class="cal-grid" role="group" aria-label="${month.month}月の日付">${cells}</div>
        </div>
        ${dayPanel(s)}`;
    } else {
      const rows = monthDates(month)
        .map((date) => {
          const rec = s.data.hopes[date];
          const wd = weekdayOf(date);
          const sel = s.multi ? picked.has(date) : s.selected === date;
          return `<button type="button" class="list-row ${sel ? 'selected' : ''}" data-action="${s.multi ? 'date' : 'list-date'}" data-date="${date}"
              aria-label="${esc(`${shortDate(date)} ${rec ? formatShift(rec.shift) : '未入力'}`)}">
              <span class="lr-date"><span class="d">${parseDateKey(date).day}</span><span class="w ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">(${WEEKDAYS[wd]})</span></span>
              <span class="lr-body">${rec ? shiftEntry(rec.shift) : ''}</span>
            </button>`;
        })
        .join('');
      body = `<div class="list-view cal-swipe">${rows}</div>${multiBar(s)}
        <div class="list-add"><button type="button" class="dashed-add" data-action="add">＋ ${s.multi ? `${s.multiSelection.length}日にまとめて追加` : 'シフトを追加'}</button></div>`;
    }
    const scroller = root.querySelector('.list-view');
    const keepTop = scroller ? scroller.scrollTop : null;
    root.innerHTML = `${header}<main class="hope-body">${banners}${body}</main>`;
    if (keepTop !== null) {
      const sc = root.querySelector('.list-view');
      if (sc) sc.scrollTop = keepTop;
    } else if (s.view === 'list') {
      root.querySelector(`.list-row[data-date="${s.selected}"]`)?.scrollIntoView({ block: 'center' });
    }
  }

  /** @param {Shift} shift */
  function shiftEntry(shift) {
    if (shift.kind !== 'range') {
      return `<span class="entry ${shiftClass(shift)}"><span class="entry-times one">${shift.kind === 'available' ? '○' : '×'}</span><span class="entry-bar"></span><span class="entry-text">${shift.kind === 'available' ? '終日可能' : '勤務不可'}</span></span>`;
    }
    const a = shift.start.kind === 'time' ? minutesToClock(shift.start.minutes) : shift.start.kind === 'open' ? 'OP' : '—';
    const b = shift.end.kind === 'time' ? minutesToClock(shift.end.minutes) : shift.end.kind === 'last' ? 'LA' : '—';
    return `<span class="entry tm"><span class="entry-times"><span class="a">${esc(a)}</span><span class="b">${esc(b)}</span></span><span class="entry-bar"></span><span class="entry-text">希望 ${esc(formatShift(shift))}</span></span>`;
  }

  /** @param {State} s */
  function multiBar(s) {
    return `<div class="day-band">
        <span>${s.multi ? `<strong class="accent">${s.multiSelection.length}日を選択中</strong>（日付をタップ）` : esc(longDateLabel(s.selected))}</span>
        <button type="button" class="band-btn ${s.multi ? 'on' : ''}" data-action="multi" aria-pressed="${s.multi}">${s.multi ? 'やめる' : '複数選択'}</button>
      </div>`;
  }

  /** @param {State} s */
  function dayPanel(s) {
    const rec = !s.multi ? s.data.hopes[s.selected] : null;
    return `${multiBar(s)}
      <div class="day-panel">
        ${rec ? `<button type="button" class="day-entry" data-action="edit" aria-label="${esc(`${shortDate(s.selected)}の希望 ${formatShift(rec.shift)} を編集`)}">${shiftEntry(rec.shift)}<span class="chev" aria-hidden="true">›</span></button>` : ''}
        <button type="button" class="dashed-add" data-action="add">＋ ${s.multi ? `${s.multiSelection.length}日にまとめて追加` : rec ? 'シフトを変更' : 'シフトを追加'}</button>
      </div>`;
  }

  return { el: root, update };
}
