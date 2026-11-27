// @ts-check
/** 確定シフト（カレンダー／リスト）画面（docs/v2_redesign.md §3.5） */
import { el, esc } from '../dom.js';
import { weekdayOf, WEEKDAYS } from '../../domain/calendar.js';
import { formatShift } from '../../domain/formatter.js';
import { minutesToClock } from '../../domain/shift.js';
import { formatConfirmed, confirmedDetail, hopeToConfirmed } from '../../domain/confirmed.js';
import { attachCalendar, renderCalendar, longDateLabel, shortDate } from '../components/calendarView.js';
import { openConfirmedSheet } from '../components/confirmedSheet.js';
import { openConfirmedEditor } from '../components/confirmedEditor.js';
import { choosePeriod } from '../components/periodChooser.js';
import { createDialog } from '../components/dialogs.js';
import { DEFAULT_START, DEFAULT_END } from '../components/entryEditor.js';
import { icons } from '../icons.js';
import { addMonths, monthOf } from '../../domain/calendar.js';
import { paydayInMonth, summarizePay, formatYen, dayPay } from '../../domain/pay.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */
/** @typedef {import('../../domain/types.js').ConfirmedShift} ConfirmedShift */

/** 確定の欄 @param {ConfirmedShift} c */
export function confirmedEntryHtml(c) {
  const detail = confirmedDetail(c);
  return `<span class="entry cf"><span class="entry-times"><span class="a">${minutesToClock(c.start)}</span><span class="b">${minutesToClock(c.end)}</span></span><span class="entry-bar"></span>
    <span class="entry-text">確定 ${esc(formatConfirmed(c))}${detail || c.memo ? `<small class="entry-sub">${esc([detail, c.memo].filter(Boolean).join('　'))}</small>` : ''}</span></span>`;
}

/** @param {Controller} c @param {() => Date} now */
export function createConfirmedScreen(c, now) {
  const root = el(`<div class="screen confirmed-screen" data-screen="confirmed"></div>`);

  /**
   * @param {{ start: number | null, end: number | null } | null} [prefill] 希望・曜日のいつものから決まった時刻（確定済みの時刻より優先）
   * @param {string | null} [note]
   * @param {string} [title]
   */
  function openEditor(prefill = null, note = null, title = '') {
    const s = c.getState();
    const targets = c.targets();
    const existing = !s.multi ? s.data.confirmed[s.selected] : undefined;
    const latest = [...s.data.confirmedHistory].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]?.shift;
    const tplR = !s.multi ? hopeToConfirmed(s.data.weekdayTemplates[String(weekdayOf(s.selected))]?.hope, s.data.pay) : null;
    const tpl = tplR && tplR.ok ? { start: tplR.start, end: tplR.end, breakMinutes: 0 } : undefined;
    // 初期値：確定済みの値 → 希望から決まった時刻 → 曜日のいつもの → 最後に使った確定 → 19:00〜23:00
    const base = existing ?? tpl ?? latest ?? null;
    const hope = !s.multi ? s.data.hopes[s.selected]?.shift : undefined;
    let pf = prefill;
    if (!existing && !pf && hope) {
      const r = hopeToConfirmed(hope, s.data.pay);
      if (r) pf = { start: r.start, end: r.end };
    }
    const start = (prefill ? pf?.start : existing?.start) ?? existing?.start ?? pf?.start ?? base?.start ?? DEFAULT_START;
    let end = (prefill ? pf?.end : existing?.end) ?? existing?.end ?? pf?.end ?? base?.end ?? DEFAULT_END;
    if (end <= start) end = Math.min(start + 240, 1800);
    openConfirmedEditor({
      title: title || (existing ? '確定シフトの編集' : '確定シフトの入力'),
      targetLabel: s.multi ? `${targets.length}日にまとめて入力` : longDateLabel(s.selected),
      hopeLabel: null,
      pay: s.data.pay,
      note,
      initial: {
        start, end,
        breakMinutes: existing?.breakMinutes ?? base?.breakMinutes ?? 0,
        solo: existing?.solo ?? false,
        hourlyWage: existing?.hourlyWage ?? null,
        memo: existing?.memo ?? '',
      },
      onDone: (cs) => c.applyConfirmed(cs),
    });
  }

  /** 希望をもとに確定（単日）：希望の時間を入れた入力画面を開き、その場で直せるようにする（2026-11-27 変更） */
  function fromHope() {
    const s = c.getState();
    const r = hopeToConfirmed(s.data.hopes[s.selected]?.shift, s.data.pay);
    if (!r) return;
    const note = r.ok ? null : `${r.reason}。${r.reason === 'オープン・ラストの時刻が未設定です'
      ? '「その他」タブでオープン・ラストの時刻を登録すると、次からは自動で入ります。' : '時間を選んでください。'}`;
    openEditor({ start: r.start, end: r.end }, note, '希望をもとに確定');
  }

  /** 曜日のいつもの（希望と共通）。時刻が決まれば1タップで確定、決まらなければ入力画面へ */
  function fromTemplate() {
    const r = c.applyConfirmedTemplate();
    if (r && !r.done) openEditor(r.prefill, `${r.reason}。時間を選んでください。`, '曜日のいつもので確定');
  }

  function openSheet() {
    const s = c.getState();
    const targets = c.targets();
    if (targets.length === 0) {
      c.notify('日付を選択してください', 'error');
      return;
    }
    const single = !s.multi;
    const hope = single ? s.data.hopes[s.selected]?.shift : undefined;
    let asHopeLabel = null;
    if (!single) asHopeLabel = '選んだ日を希望どおりに確定';
    else if (hope && hope.kind !== 'unavailable') asHopeLabel = '希望をもとに確定';
    const tplShift = single ? s.data.weekdayTemplates[String(weekdayOf(s.selected))]?.hope : undefined;
    const tplR = hopeToConfirmed(tplShift, s.data.pay);
    const tpl = tplR ? (tplR.ok ? formatConfirmed({ start: tplR.start, end: tplR.end, breakMinutes: 0 }) : `${formatShift(/** @type {any} */ (tplShift))}（時間を選ぶ）`) : null;
    const hasValue = targets.some((d) => s.data.confirmed[d]);
    openConfirmedSheet(c, {
      title: single ? `${shortDate(s.selected)} の確定シフト` : `${targets.length}日の確定シフト`,
      hopeLabel: null,
      asHopeLabel,
      template: tpl,
      templateLabel: single ? `${WEEKDAYS[weekdayOf(s.selected)]}曜日のいつもの` : undefined,
      clearLabel: hasValue ? (single ? '確定を取り消す' : '選んだ日の確定を取り消す') : null,
      onAsHope: () => (single ? fromHope() : c.confirmAsHope()),
      onTemplate: fromTemplate,
      onHistory: (id) => c.applyConfirmedHistory(id),
      onNew: () => openEditor(),
      onClear: () => c.clearConfirmed(),
    });
  }

  function openBulkMenu() {
    const around = c.getState().month;
    const body = el(`<div class="dialog-choices one">
        <button type="button" data-k="hope">希望どおりにまとめて確定<span>未確定の日に希望を写します</span></button>
        <button type="button" data-k="tpl">曜日のいつもので埋める<span>未確定の日を曜日のいつもので埋めます</span></button>
      </div>`);
    const dlg = createDialog({ title: 'まとめて確定', message: '確定済みの日は変えません。', body, actions: [{ label: 'キャンセル', onClick: () => dlg.remove() }] });
    body.addEventListener('click', (ev) => {
      const k = /** @type {HTMLElement} */ (ev.target).closest('button')?.dataset.k;
      if (!k) return;
      dlg.remove();
      choosePeriod({
        title: k === 'hope' ? '希望どおりにまとめて確定' : '曜日のいつもので埋める',
        message: '期間を選んでください。',
        around,
        onPick: (p) => (k === 'hope' ? c.confirmPeriodFromHopes(p) : c.confirmPeriodFromTemplates(p)),
      });
    });
    document.body.appendChild(dlg);
  }

  attachCalendar(root, c, {
    onAdd: openSheet,
    onListTap: openSheet,
    handlers: {
      bulk: () => openBulkMenu(),
      edit: () => openEditor(),
      delete: () => {
        if (c.clearConfirmed()) c.notify('確定シフトを削除しました');
      },
      payday: () => {
        c.setPayMonth(monthOf(c.getState().selected));
        c.setTab('pay');
      },
    },
  });

  /** @param {State} s */
  function update(s) {
    const { confirmed, hopes, pay } = s.data;
    // 給料日（表示中の月とその前後）。¥ 印と金額の表示に使う
    const paydays = new Set([-1, 0, 1].map((n) => paydayInMonth(addMonths(s.month, n), pay)));
    const payBadge = (/** @type {string} */ d) => (paydays.has(d) ? '<span class="pay-badge" aria-hidden="true">¥</span>' : '');
    const paydayLine = (/** @type {string} */ d) => {
      if (!paydays.has(d)) return '';
      const r = summarizePay(monthOf(d), confirmed, hopes, pay);
      return `<button type="button" class="payday-line" data-action="payday" data-testid="payday-line">
          <span class="pd-label">給料日</span><span class="pd-yen">${esc(formatYen(r.sum.total))}</span><span class="chev" aria-hidden="true">›</span></button>`;
    };
    renderCalendar(root, s, now(), {
      leftButtons: `<button type="button" class="icon-btn" data-action="bulk" aria-label="まとめて確定">${icons.stack}</button>`,
      cell: (date) => {
        const cf = confirmed[date];
        const badge = payBadge(date);
        const pd = badge ? '（給料日）' : '';
        if (cf) return { html: `${badge}<span class="cal-val cf">${esc(formatConfirmed(cf))}</span>`, label: `確定 ${formatConfirmed(cf)}${pd}` };
        return { html: badge, label: `未確定${pd}` };
      },
      row: (date) => {
        const cf = confirmed[date];
        return cf ? { html: confirmedEntryHtml(cf), label: `確定 ${formatConfirmed(cf)}` } : { html: '', label: '未確定' };
      },
      addLabel: (st) => (st.multi ? `${st.multiSelection.length}日にまとめて確定` : '確定を入力'),
      panel: (st) => {
        if (st.multi) return `<button type="button" class="dashed-add" data-action="add">＋ ${st.multiSelection.length}日にまとめて確定</button>`;
        const cf = confirmed[st.selected];
        const dp = cf ? dayPay(cf, pay) : null;
        return `${paydayLine(st.selected)}
          ${cf ? `<div class="day-entry-row">
              <button type="button" class="day-entry" data-action="edit" aria-label="${esc(`${shortDate(st.selected)}の確定 ${formatConfirmed(cf)} を編集`)}">${confirmedEntryHtml(cf)}${dp ? `<span class="entry-yen" data-testid="panel-pay">${esc(formatYen(dp.total))}</span>` : ''}</button>
              <button type="button" class="trash-btn" data-action="delete" aria-label="この日の確定シフトを削除">${icons.trash}</button>
            </div>` : ''}
          <button type="button" class="dashed-add" data-action="add">＋ ${cf ? '確定を変更' : '確定を入力'}</button>`;
      },
    });
  }

  return { el: root, update };
}
