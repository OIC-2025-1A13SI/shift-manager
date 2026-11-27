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

  /** @param {{ start: number | null, end: number | null } | null} [prefill] @param {string | null} [note] */
  function openEditor(prefill = null, note = null) {
    const s = c.getState();
    const targets = c.targets();
    const existing = !s.multi ? s.data.confirmed[s.selected] : undefined;
    const latest = [...s.data.confirmedHistory].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]?.shift;
    const tpl = !s.multi ? s.data.weekdayTemplates[String(weekdayOf(s.selected))]?.confirmed : undefined;
    // 初期値：確定済みの値 → 希望から決まった時刻 → 曜日のいつもの → 最後に使った確定 → 19:00〜23:00
    const base = existing ?? tpl ?? latest ?? null;
    const hope = !s.multi ? s.data.hopes[s.selected]?.shift : undefined;
    let pf = prefill;
    if (!existing && !pf && hope) {
      const r = hopeToConfirmed(hope, s.data.pay);
      if (r) pf = { start: r.start, end: r.end };
    }
    const start = existing?.start ?? pf?.start ?? base?.start ?? DEFAULT_START;
    let end = existing?.end ?? pf?.end ?? base?.end ?? DEFAULT_END;
    if (end <= start) end = Math.min(start + 240, 1800);
    openConfirmedEditor({
      title: existing ? '確定シフトの編集' : '確定シフトの入力',
      targetLabel: s.multi ? `${targets.length}日にまとめて入力` : longDateLabel(s.selected),
      hopeLabel: hope ? formatShift(hope) : null,
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

  function asHope() {
    const r = c.confirmAsHope();
    if (r && !r.done) {
      const hint = r.reason === 'オープン・ラストの時刻が未設定です'
        ? '「その他」タブでオープン・ラストの時刻を登録すると、次からは1タップで確定できます。' : '時間を選んで確定してください。';
      openEditor(r.prefill, `${r.reason}。${hint}`);
    }
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
    else if (hope && hope.kind !== 'unavailable') {
      const r = hopeToConfirmed(hope, s.data.pay);
      asHopeLabel = r && r.ok ? `希望どおりに確定（${formatConfirmed({ start: r.start, end: r.end, breakMinutes: 0 })}）` : '希望をもとに確定…';
    }
    const tpl = single ? s.data.weekdayTemplates[String(weekdayOf(s.selected))]?.confirmed ?? null : null;
    const hasValue = targets.some((d) => s.data.confirmed[d]);
    openConfirmedSheet(c, {
      title: single ? `${shortDate(s.selected)} の確定シフト` : `${targets.length}日の確定シフト`,
      hopeLabel: single ? (hope ? formatShift(hope) : 'なし') : null,
      asHopeLabel,
      template: tpl,
      templateLabel: single ? `${WEEKDAYS[weekdayOf(s.selected)]}曜日のいつもの（確定）` : undefined,
      clearLabel: hasValue ? (single ? '確定を取り消す' : '選んだ日の確定を取り消す') : null,
      onAsHope: asHope,
      onTemplate: () => c.applyConfirmedTemplate(),
      onHistory: (id) => c.applyConfirmedHistory(id),
      onNew: () => openEditor(),
      onClear: () => c.clearConfirmed(),
    });
  }

  function openBulkMenu() {
    const around = c.getState().month;
    const body = el(`<div class="dialog-choices one">
        <button type="button" data-k="hope">希望どおりにまとめて確定<span>未確定の日に希望を写します</span></button>
        <button type="button" data-k="tpl">曜日のいつもので埋める<span>未確定の日を曜日のいつもの（確定）で埋めます</span></button>
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
    handlers: { bulk: () => openBulkMenu(), edit: () => openEditor() },
  });

  /** @param {State} s */
  function update(s) {
    const { confirmed, hopes } = s.data;
    renderCalendar(root, s, now(), {
      leftButtons: `<button type="button" class="icon-btn" data-action="bulk" aria-label="まとめて確定">${icons.stack}</button>`,
      cell: (date) => {
        const cf = confirmed[date];
        if (cf) return { html: `<span class="cal-val cf">${esc(formatConfirmed(cf))}</span>`, label: `確定 ${formatConfirmed(cf)}` };
        const h = hopes[date];
        if (h) return { html: `<span class="cal-val ref ${h.shift.kind === 'unavailable' ? 'ng' : ''}">${esc(formatShift(h.shift))}</span>`, label: `未確定（希望 ${formatShift(h.shift)}）` };
        return { html: '', label: '未確定' };
      },
      row: (date) => {
        const cf = confirmed[date];
        if (cf) return { html: confirmedEntryHtml(cf), label: `確定 ${formatConfirmed(cf)}` };
        const h = hopes[date];
        return h
          ? { html: `<span class="entry ref"><span class="entry-text small">希望 ${esc(formatShift(h.shift))}（未確定）</span></span>`, label: `未確定（希望 ${formatShift(h.shift)}）` }
          : { html: '', label: '未確定' };
      },
      addLabel: (st) => (st.multi ? `${st.multiSelection.length}日にまとめて確定` : '確定を入力'),
      panel: (st) => {
        if (st.multi) return `<button type="button" class="dashed-add" data-action="add">＋ ${st.multiSelection.length}日にまとめて確定</button>`;
        const cf = confirmed[st.selected];
        const h = hopes[st.selected];
        return `<p class="ref-line" data-testid="panel-hope">希望：<strong>${h ? esc(formatShift(h.shift)) : 'なし'}</strong></p>
          ${cf ? `<button type="button" class="day-entry" data-action="edit" aria-label="${esc(`${shortDate(st.selected)}の確定 ${formatConfirmed(cf)} を編集`)}">${confirmedEntryHtml(cf)}<span class="chev" aria-hidden="true">›</span></button>` : ''}
          <button type="button" class="dashed-add" data-action="add">＋ ${cf ? '確定を変更' : '確定を入力'}</button>`;
      },
    });
  }

  return { el: root, update };
}
