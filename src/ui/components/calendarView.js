// @ts-check
/**
 * 希望シフト・確定シフトで共通の月カレンダー／リスト表示（上部バー、月移動、スワイプ、複数選択の帯）。
 * 各画面はマスの中身と、日付の下に出す欄だけを差し替える。
 */
import { esc, delegate } from '../dom.js';
import { monthGrid, monthDates, parseDateKey, weekdayOf, WEEKDAYS, todayKey } from '../../domain/calendar.js';
import { icons } from '../icons.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/types.js').DateKey} DateKey */

/** "2026年12月25日 (金)" @param {DateKey} d */
export function longDateLabel(d) {
  const { year, month, day } = parseDateKey(d);
  return `${year}年${month}月${day}日 (${WEEKDAYS[weekdayOf(d)]})`;
}
/** "12月25日 (金)" @param {DateKey} d */
export function shortDate(d) {
  return `${parseDateKey(d).month}月${parseDateKey(d).day}日 (${WEEKDAYS[weekdayOf(d)]})`;
}

/**
 * @typedef {{
 *   cell: (date: DateKey) => { html: string, label: string },
 *   row: (date: DateKey) => { html: string, label: string },
 *   panel: (s: State) => string,
 *   leftButtons: string,
 *   addLabel: (s: State) => string,
 * }} CalendarParts
 */

/**
 * @param {HTMLElement} root
 * @param {Controller} c
 * @param {{ onAdd: () => void, onListTap: () => void, handlers: Record<string, (t: HTMLElement, ev: Event) => void> }} opt
 */
export function attachCalendar(root, c, opt) {
  delegate(root, {
    'view-calendar': () => c.setView('calendar'),
    'view-list': () => c.setView('list'),
    prev: () => c.moveMonth(-1),
    next: () => c.moveMonth(1),
    today: () => c.goToday(),
    date: (t) => c.tapDate(t.dataset.date ?? ''),
    'list-date': (t) => {
      c.tapDate(t.dataset.date ?? '');
      if (!c.getState().multi) opt.onListTap();
    },
    multi: () => c.toggleMulti(),
    add: () => opt.onAdd(),
    ...opt.handlers,
  });
  // 左右スワイプで月を移動
  let sx = NaN;
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
}

/**
 * @param {HTMLElement} root @param {State} s @param {Date} now @param {CalendarParts} parts
 */
export function renderCalendar(root, s, now, parts) {
  const { month } = s;
  const today = todayKey(now);
  const header = `
    <header class="topbar">
      <div class="tb-left">
        <div class="view-toggle" role="group" aria-label="表示">
          <button type="button" data-action="view-calendar" aria-pressed="${s.view === 'calendar'}" aria-label="カレンダー表示">${icons.grid}</button>
          <button type="button" data-action="view-list" aria-pressed="${s.view === 'list'}" aria-label="リスト表示">${icons.list}</button>
        </div>
        ${parts.leftButtons}
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
  const band = `<div class="day-band">
      <span>${s.multi ? `<strong class="accent">${s.multiSelection.length}日を選択中</strong>（日付をタップ）` : esc(longDateLabel(s.selected))}</span>
      <button type="button" class="band-btn ${s.multi ? 'on' : ''}" data-action="multi" aria-pressed="${s.multi}">${s.multi ? 'やめる' : '複数選択'}</button>
    </div>`;

  let body;
  if (s.view === 'calendar') {
    const cells = monthGrid(month)
      .map(({ date, inMonth }) => {
        const wd = weekdayOf(date);
        const on = s.multi ? picked.has(date) : s.selected === date;
        const cls = [
          'cal-cell', inMonth ? '' : 'out', wd === 0 ? 'sun' : wd === 6 ? 'sat' : '',
          on ? (s.multi ? 'picked' : 'selected') : '', date === today ? 'today' : '',
        ].join(' ');
        const cell = parts.cell(date);
        return `<button type="button" class="${cls}" data-action="date" data-date="${date}" aria-pressed="${on}"
            aria-label="${esc(`${shortDate(date)} ${cell.label}`)}"><span class="cal-day">${parseDateKey(date).day}</span>${cell.html}</button>`;
      })
      .join('');
    body = `
      <div class="cal-swipe">
        <div class="cal-week" aria-hidden="true">${WEEKDAYS.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
        <div class="cal-grid" role="group" aria-label="${month.month}月の日付">${cells}</div>
      </div>
      ${band}
      <div class="day-panel">${parts.panel(s)}</div>`;
  } else {
    const rows = monthDates(month)
      .map((date) => {
        const wd = weekdayOf(date);
        const sel = s.multi ? picked.has(date) : s.selected === date;
        const row = parts.row(date);
        return `<button type="button" class="list-row ${sel ? 'selected' : ''}" data-action="${s.multi ? 'date' : 'list-date'}" data-date="${date}"
            aria-label="${esc(`${shortDate(date)} ${row.label}`)}">
            <span class="lr-date"><span class="d">${parseDateKey(date).day}</span><span class="w ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">(${WEEKDAYS[wd]})</span></span>
            <span class="lr-body">${row.html}</span>
          </button>`;
      })
      .join('');
    body = `<div class="list-view cal-swipe">${rows}</div>${band}
      <div class="list-add"><button type="button" class="dashed-add" data-action="add">＋ ${esc(parts.addLabel(s))}</button></div>`;
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
