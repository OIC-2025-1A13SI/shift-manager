// @ts-check
/**
 * アプリ状態管理・操作制御（v2）。
 * UI は状態を読み、操作はすべてこのコントローラー経由で行う。保存・クリップボード・ファイル保存は
 * 依存として注入するため、ブラウザーなしで単体テストできる。
 */

import {
  addDays, getPeriodDates, monthOf, periodKey, periodOf, nextPeriod, todayKey, weekdayOf,
} from '../domain/calendar.js';
import { setShift, clearShift, validateShift } from '../domain/shift.js';
import { touchHistory, removeHistory, togglePin } from '../domain/history.js';
import { buildSubmission, buildLines, countMissing } from '../domain/formatter.js';
import { createDefaultAppData, migrateAppData, validateAppData } from '../domain/appData.js';
import { fillHopesFromTemplates } from '../domain/templates.js';
import {
  validateConfirmed, setConfirmed, clearConfirmed, makeConfirmed, confirmedKey, confirmedTimes,
  hopeToConfirmed, confirmFromHopes, confirmFromTemplates,
} from '../domain/confirmed.js';
import { touchGenericHistory } from '../domain/history.js';
import { isValidMinutes } from '../domain/shift.js';
import { createBackup, parseBackup } from '../infrastructure/backup.js';

/** @typedef {import('../domain/types.js').AppData} AppData */
/** @typedef {import('../domain/types.js').PeriodRef} PeriodRef */
/** @typedef {import('../domain/types.js').MonthRef} MonthRef */
/** @typedef {import('../domain/types.js').DateKey} DateKey */
/** @typedef {import('../domain/types.js').Shift} Shift */
/** @typedef {import('../domain/types.js').TimeShift} TimeShift */
/** @typedef {import('../domain/types.js').ConfirmedShift} ConfirmedShift */
/** @typedef {import('../domain/confirmed.js').ConfirmedTimes} ConfirmedTimes */

/**
 * @typedef {{
 *   storage: { load(): Promise<unknown | null>, save(data: unknown): Promise<void> },
 *   writeClipboard: (text: string) => Promise<boolean>,
 *   saveFile: (filename: string, text: string) => Promise<'saved' | 'cancelled' | 'failed'>,
 *   now?: () => Date,
 *   newId?: () => string,
 * }} Deps
 *
 * @typedef {'hope' | 'confirmed' | 'pay' | 'other'} Tab
 * @typedef {{
 *   ready: boolean,
 *   tab: Tab,
 *   view: 'calendar' | 'list',
 *   month: MonthRef,
 *   payMonth: MonthRef | null,
 *   selected: DateKey,
 *   multi: boolean,
 *   multiSelection: DateKey[],
 *   data: AppData,
 *   loadError: string | null,
 *   saveError: string | null,
 *   copyConfirm: { missing: number, period: PeriodRef } | null,
 *   manualCopyText: string | null,
 *   restorePending: { data: AppData } | null,
 *   message: { id: number, text: string, kind: 'info' | 'error' } | null,
 * }} State
 */

/** @param {Deps} deps */
export function createController(deps) {
  const now = deps.now ?? (() => new Date());
  const newId =
    deps.newId ?? (() => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));

  const today = todayKey(now());
  /** @type {State} */
  let state = {
    ready: false,
    tab: 'hope',
    view: 'calendar',
    month: monthOf(today),
    payMonth: null,
    selected: today,
    multi: false,
    multiSelection: [],
    data: createDefaultAppData(),
    loadError: null,
    saveError: null,
    copyConfirm: null,
    manualCopyText: null,
    restorePending: null,
    message: null,
  };
  /** @type {Set<(s: State) => void>} */
  const listeners = new Set();
  let messageSeq = 0;
  /** 読み込みに失敗した保存データを上書きしないためのフラグ */
  let storageBlocked = false;
  let saveChain = Promise.resolve(true);

  /** @param {Partial<State>} patch */
  function set(patch) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  }
  /** @param {string} text @param {'info' | 'error'} [kind] */
  function notify(text, kind = 'info') {
    set({ message: { id: ++messageSeq, text, kind } });
  }

  /** 現在の data を保存する。失敗は隠さず saveError に残す（§7.2, T31）。 @returns {Promise<boolean>} */
  function persist() {
    const snapshot = structuredClone(state.data);
    saveChain = saveChain.then(async () => {
      if (storageBlocked) {
        set({ saveError: '保存データを読み込めなかったため、上書きを防ぐために保存を停止しています。バックアップから復元してください。' });
        return false;
      }
      try {
        await deps.storage.save(snapshot);
        if (state.saveError) set({ saveError: null });
        return true;
      } catch (e) {
        set({ saveError: `保存に失敗しました。入力内容はまだ保存されていません。（${e instanceof Error ? e.message : String(e)}）` });
        return false;
      }
    });
    return saveChain;
  }

  /** @param {AppData} data */
  function updateData(data) {
    set({ data });
    return persist();
  }

  /** @param {AppData} data @param {DateKey[]} dates @param {'lastEditedAt' | 'lastCopiedAt'} field */
  function touchPeriods(data, dates, field) {
    const keys = new Set(dates.map((d) => periodKey(periodOf(d))));
    const periods = { ...data.periods };
    const ts = now().toISOString();
    for (const k of keys) periods[k] = { ...periods[k], [field]: ts };
    return { ...data, periods };
  }

  /** 入力対象の日付（複数選択中は選んだ日、タップ順） */
  function targets() {
    return state.multi ? state.multiSelection : [state.selected];
  }

  /** @param {DateKey} date */
  function selectAndShow(date) {
    return { selected: date, month: monthOf(date) };
  }

  const api = {
    getState: () => state,
    /** @param {(s: State) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify,

    async init() {
      try {
        const raw = await deps.storage.load();
        if (raw === null) {
          set({ ready: true });
          return;
        }
        const r = migrateAppData(raw);
        if (r.ok) {
          set({ ready: true, data: r.data });
          if (r.migratedFrom) persist(); // 新しい形式で保存し直す
        } else {
          storageBlocked = true;
          set({ ready: true, loadError: `保存データが壊れているため読み込めませんでした：${r.errors[0]}` });
        }
      } catch (e) {
        set({ ready: true, loadError: `保存データを読み込めません：${e instanceof Error ? e.message : String(e)}` });
      }
    },

    // ---- 画面 ----
    /** @param {Tab} tab */
    setTab(tab) {
      set({ tab, multi: false, multiSelection: [] });
    },
    /** @param {'calendar' | 'list'} view */
    setView(view) {
      set({ view });
    },
    /** @param {number} n 表示月を n か月ずらす */
    moveMonth(n) {
      const idx = state.month.year * 12 + state.month.month - 1 + n;
      set({ month: { year: Math.floor(idx / 12), month: (idx % 12) + 1 } });
    },
    /** 給料計算タブで表示する給料日の月（null は次の給料日） @param {MonthRef | null} m */
    setPayMonth(m) {
      set({ payMonth: m });
    },
    goToday() {
      set(selectAndShow(todayKey(now())));
    },

    // ---- 日付選択 ----
    /** @param {DateKey} date */
    tapDate(date) {
      if (state.multi) {
        if (monthOf(date).month !== state.month.month || monthOf(date).year !== state.month.year) return;
        const sel = state.multiSelection.includes(date)
          ? state.multiSelection.filter((d) => d !== date)
          : [...state.multiSelection, date];
        set({ multiSelection: sel });
      } else {
        set(selectAndShow(date));
      }
    },
    toggleMulti() {
      if (state.multi) set({ multi: false, multiSelection: [] });
      else set({ multi: true, multiSelection: [] });
    },
    targets,

    // ---- 希望シフトの入力 ----
    /**
     * 選択中の日付へ希望を適用する（R12〜R14、Q02）。適用後は暦上の翌日へ移る（月をまたげば表示月も移る）。
     * 一括のときは最後にタップした日の翌日。
     * @param {Shift} shift
     * @returns {boolean}
     */
    applyHope(shift) {
      const v = validateShift(shift);
      if (!v.ok) {
        notify(v.reason, 'error');
        return false;
      }
      const dates = targets();
      if (dates.length === 0) {
        notify('日付を選択してください', 'error');
        return false;
      }
      const ts = now().toISOString();
      let data = { ...state.data, hopes: setShift(state.data.hopes, dates, shift, ts) };
      if (shift.kind === 'range') data.hopeHistory = touchHistory(data.hopeHistory, /** @type {TimeShift} */ (shift), ts, newId);
      data = touchPeriods(data, dates, 'lastEditedAt');
      set({ multi: false, multiSelection: [], ...selectAndShow(addDays(dates[dates.length - 1], 1)) });
      updateData(data);
      return true;
    },
    /** @param {string} historyId */
    applyHopeHistory(historyId) {
      const h = state.data.hopeHistory.find((x) => x.id === historyId);
      return h ? api.applyHope(h.shift) : false;
    },
    /** 曜日のいつものを適用（選択日の曜日の型） */
    applyHopeTemplate() {
      const t = state.data.weekdayTemplates[String(weekdayOf(state.selected))]?.hope;
      return t ? api.applyHope(t) : false;
    },
    /** 未入力に戻す（R15、Q05: 一括可・移動しない） */
    clearHope() {
      const dates = targets();
      if (dates.length === 0) {
        notify('日付を選択してください', 'error');
        return false;
      }
      const data = touchPeriods({ ...state.data, hopes: clearShift(state.data.hopes, dates) }, dates, 'lastEditedAt');
      set({ multi: false, multiSelection: [], ...selectAndShow(dates[dates.length - 1]) });
      updateData(data);
      return true;
    },

    // ---- 履歴 ----
    /** @param {string} id */
    deleteHopeHistory(id) {
      updateData({ ...state.data, hopeHistory: removeHistory(state.data.hopeHistory, id) });
    },
    /** @param {string} id */
    toggleHopeHistoryPin(id) {
      updateData({ ...state.data, hopeHistory: togglePin(state.data.hopeHistory, id) });
    },

    // ---- 曜日のいつもの ----
    /** @param {number} weekday 0=日 @param {Shift | null} shift */
    setHopeTemplate(weekday, shift) {
      if (shift && !validateShift(shift).ok) {
        notify(/** @type {any} */ (validateShift(shift)).reason, 'error');
        return false;
      }
      const key = String(weekday);
      const templates = { ...state.data.weekdayTemplates };
      const cur = { ...templates[key] };
      if (shift) cur.hope = shift;
      else delete cur.hope;
      if (Object.keys(cur).length) templates[key] = cur;
      else delete templates[key];
      updateData({ ...state.data, weekdayTemplates: templates });
      return true;
    },
    /** 期間の未入力の日を曜日のいつもので埋める @param {PeriodRef} period @returns {number} 埋めた日数 */
    fillHopesFromTemplates(period) {
      const dates = getPeriodDates(period);
      const r = fillHopesFromTemplates(dates, state.data.hopes, state.data.weekdayTemplates, now().toISOString());
      if (r.filled.length === 0) {
        notify('埋められる日がありませんでした（未入力の日がないか、曜日のいつものが未登録です）');
        return 0;
      }
      updateData(touchPeriods({ ...state.data, hopes: r.hopes }, r.filled, 'lastEditedAt'));
      notify(`${r.filled.length}日を入力しました`);
      return r.filled.length;
    },

    // ---- 確定シフト（docs/v2_redesign.md §3.5） ----
    /**
     * 選択中の日付へ確定シフトを適用する。適用後は翌日へ移る（希望と同じ動き）。
     * 既に確定がある日に時刻だけ変える場合でも、渡された内容で置き換える。
     * @param {ConfirmedShift} cs
     * @param {{ history?: boolean }} [opt]
     */
    applyConfirmed(cs, opt = {}) {
      const v = validateConfirmed(cs);
      if (!v.ok) {
        notify(v.reason, 'error');
        return false;
      }
      const dates = targets();
      if (dates.length === 0) {
        notify('日付を選択してください', 'error');
        return false;
      }
      const ts = now().toISOString();
      const data = { ...state.data, confirmed: setConfirmed(state.data.confirmed, dates, cs, ts) };
      if (opt.history !== false) {
        data.confirmedHistory = touchGenericHistory(
          data.confirmedHistory, confirmedTimes(cs), ts, newId, confirmedKey, confirmedTimes,
        );
      }
      set({ multi: false, multiSelection: [], ...selectAndShow(addDays(dates[dates.length - 1], 1)) });
      updateData(data);
      return true;
    },
    /** 確定の履歴から（休憩も含めて適用。一人・時給・メモは既存の確定があれば引き継ぐ） @param {string} id */
    applyConfirmedHistory(id) {
      const h = state.data.confirmedHistory.find((x) => x.id === id);
      if (!h) return false;
      const prev = !state.multi ? state.data.confirmed[state.selected] : undefined;
      return api.applyConfirmed(makeConfirmed(h.shift, prev ?? {}));
    },
    /** 曜日のいつもの（確定） */
    applyConfirmedTemplate() {
      const t = state.data.weekdayTemplates[String(weekdayOf(state.selected))]?.confirmed;
      if (!t) return false;
      const prev = state.data.confirmed[state.selected];
      return api.applyConfirmed(makeConfirmed(t, prev ?? {}));
    },
    /**
     * 「希望どおり」。単日：時刻が決まれば確定し true、決まらなければ入力画面の初期値を返す。
     * 複数選択：決まる日だけ確定し、決まらない日の数を知らせる。
     * @returns {{ done: true } | { done: false, prefill: { start: number | null, end: number | null }, reason: string } | null}
     */
    confirmAsHope() {
      const pay = state.data.pay;
      if (state.multi) {
        const dates = state.multiSelection;
        if (dates.length === 0) {
          notify('日付を選択してください', 'error');
          return null;
        }
        const ts = now().toISOString();
        const confirmed = { ...state.data.confirmed };
        let filled = 0;
        let skipped = 0;
        for (const d of dates) {
          const r = hopeToConfirmed(state.data.hopes[d]?.shift, pay);
          if (!r || !r.ok) { skipped++; continue; }
          confirmed[d] = { ...makeConfirmed({ start: r.start, end: r.end, breakMinutes: 0 }, confirmed[d] ?? {}), updatedAt: ts };
          filled++;
        }
        set({ multi: false, multiSelection: [], ...selectAndShow(dates[dates.length - 1]) });
        if (filled) updateData({ ...state.data, confirmed });
        notify(skipped ? `${filled}日を確定しました（${skipped}日は時間が決まらないため入力してください）` : `${filled}日を確定しました`);
        return { done: true };
      }
      const r = hopeToConfirmed(state.data.hopes[state.selected]?.shift, pay);
      if (!r) {
        notify('この日の希望がありません', 'error');
        return null;
      }
      if (!r.ok) return { done: false, prefill: { start: r.start, end: r.end }, reason: r.reason };
      const prev = state.data.confirmed[state.selected];
      api.applyConfirmed(makeConfirmed({ start: r.start, end: r.end, breakMinutes: prev?.breakMinutes ?? 0 }, prev ?? {}));
      return { done: true };
    },
    /** 確定を取り消す（移動しない） */
    clearConfirmed() {
      const dates = targets();
      if (dates.length === 0) {
        notify('日付を選択してください', 'error');
        return false;
      }
      set({ multi: false, multiSelection: [], ...selectAndShow(dates[dates.length - 1]) });
      updateData({ ...state.data, confirmed: clearConfirmed(state.data.confirmed, dates) });
      return true;
    },
    /** @param {string} id */
    deleteConfirmedHistory(id) {
      updateData({ ...state.data, confirmedHistory: removeHistory(state.data.confirmedHistory, id) });
    },
    /** @param {string} id */
    toggleConfirmedHistoryPin(id) {
      updateData({ ...state.data, confirmedHistory: togglePin(state.data.confirmedHistory, id) });
    },
    /** @param {number} weekday @param {ConfirmedTimes | null} t */
    setConfirmedTemplate(weekday, t) {
      if (t) {
        const v = validateConfirmed(makeConfirmed(t));
        if (!v.ok) {
          notify(v.reason, 'error');
          return false;
        }
      }
      const key = String(weekday);
      const templates = { ...state.data.weekdayTemplates };
      const cur = { ...templates[key] };
      if (t) cur.confirmed = confirmedTimes(t);
      else delete cur.confirmed;
      if (Object.keys(cur).length) templates[key] = cur;
      else delete templates[key];
      updateData({ ...state.data, weekdayTemplates: templates });
      return true;
    },
    /** 期間をまとめて確定 @param {PeriodRef} period */
    confirmPeriodFromHopes(period) {
      const r = confirmFromHopes(getPeriodDates(period), state.data.confirmed, state.data.hopes, state.data.pay, now().toISOString());
      if (r.filled.length) updateData({ ...state.data, confirmed: r.confirmed });
      const skip = r.skipped.length ? `（${r.skipped.length}日は時間が決まらないためスキップ）` : '';
      notify(r.filled.length || r.skipped.length ? `${r.filled.length}日を確定しました${skip}` : '確定できる日がありませんでした（未確定で希望がある日がありません）');
      return r;
    },
    /** 曜日のいつもので確定を埋める @param {PeriodRef} period */
    confirmPeriodFromTemplates(period) {
      const r = confirmFromTemplates(getPeriodDates(period), state.data.confirmed, state.data.weekdayTemplates, now().toISOString());
      if (r.filled.length) updateData({ ...state.data, confirmed: r.confirmed });
      notify(r.filled.length ? `${r.filled.length}日を確定しました` : '埋められる日がありませんでした（未確定の日がないか、曜日のいつもの（確定）が未登録です）');
      return r;
    },
    /** オープン・ラストの時刻 @param {'openTime' | 'lastTime'} field @param {number | null} minutes */
    setOpenLastTime(field, minutes) {
      if (minutes !== null && !isValidMinutes(minutes)) {
        notify('時刻が範囲外です', 'error');
        return false;
      }
      updateData({ ...state.data, pay: { ...state.data.pay, [field]: minutes } });
      return true;
    },

    // ---- 給料の設定（docs/v2_redesign.md §3.7） ----
    /** @param {Partial<import('../domain/types.js').PaySettings>} patch */
    setPay(patch) {
      const pay = { ...state.data.pay, ...patch };
      if (pay.nightEnd <= pay.nightStart) {
        notify('深夜の終わりは始まりより後にしてください', 'error');
        return false;
      }
      const v = validateAppData({ ...state.data, pay });
      if (!v.ok) {
        notify('給料の設定に不正な値があります（金額は0以上の整数で入力してください）', 'error');
        return false;
      }
      updateData({ ...state.data, pay });
      notify('給料の設定を保存しました');
      return true;
    },

    // ---- 設定 ----
    /** @param {boolean} enabled */
    setGreetingEnabled(enabled) {
      updateData({ ...state.data, settings: { ...state.data.settings, greetingEnabled: enabled } });
    },
    /** @param {'greetingPrefix' | 'greetingSuffix'} field @param {string} text */
    setGreetingText(field, text) {
      updateData({ ...state.data, settings: { ...state.data.settings, [field]: text } });
    },

    // ---- LINE 提出用コピー ----
    /** コピー画面の初期期間：今日を含む半月の次（提出先の期間） */
    defaultCopyPeriod() {
      return nextPeriod(periodOf(todayKey(now())));
    },
    /** @param {PeriodRef} period */
    previewLines(period) {
      return buildLines(getPeriodDates(period), state.data.hopes);
    },
    /** @param {PeriodRef} period */
    submissionText(period) {
      return buildSubmission(getPeriodDates(period), state.data.hopes, state.data.settings);
    },
    /** @param {PeriodRef} period */
    missingCount(period) {
      return countMissing(getPeriodDates(period), state.data.hopes);
    },
    /** コピー（R19, R20）。未入力がある場合は確認を出す。 @param {PeriodRef} period */
    requestCopy(period) {
      const missing = api.missingCount(period);
      if (missing > 0) {
        set({ copyConfirm: { missing, period } });
        return Promise.resolve(false);
      }
      return performCopy(period);
    },
    confirmCopy() {
      const c = state.copyConfirm;
      set({ copyConfirm: null });
      return c ? performCopy(c.period) : Promise.resolve(false);
    },
    cancelCopy() {
      set({ copyConfirm: null });
    },
    closeManualCopy() {
      set({ manualCopyText: null });
    },
    dismissMessage() {
      set({ message: null });
    },

    // ---- バックアップ ----
    async exportBackup() {
      const { filename, json } = createBackup(state.data, now());
      const r = await deps.saveFile(filename, json);
      if (r === 'saved') notify('バックアップを書き出しました');
      else if (r === 'failed') notify('バックアップを書き出せませんでした', 'error');
      return r;
    },
    /** @param {string} text @param {number} size */
    prepareRestore(text, size) {
      const r = parseBackup(text, size);
      if (!r.ok) {
        notify(`復元できません：${r.errors.slice(0, 3).join(' / ')}`, 'error');
        return false;
      }
      set({ restorePending: { data: r.data } });
      return true;
    },
    cancelRestore() {
      set({ restorePending: null });
    },
    /** Q10: 全置換。復元前に現在のデータを書き出し、書き出せなかった場合は中止する。 */
    async confirmRestore() {
      const pending = state.restorePending;
      if (!pending) return false;
      const { filename, json } = createBackup(state.data, now());
      const r = await deps.saveFile(filename.replace('backup', 'before-restore'), json);
      if (r !== 'saved') {
        set({ restorePending: null });
        notify('現在のデータを書き出せなかったため、復元を中止しました', 'error');
        return false;
      }
      storageBlocked = false;
      set({ restorePending: null, loadError: null, data: structuredClone(pending.data) });
      const ok = await persist();
      notify(ok ? '復元しました' : '復元したデータを保存できませんでした', ok ? 'info' : 'error');
      return ok;
    },
  };

  /** クリップボード書き込みは await より前に呼ぶ（iOS のユーザー操作要件） @param {PeriodRef} period */
  function performCopy(period) {
    const text = api.submissionText(period);
    const write = deps.writeClipboard(text);
    return write.then(
      (ok) => {
        if (!ok) {
          set({ manualCopyText: text });
          return false;
        }
        notify('コピーしました');
        updateData(touchPeriods(state.data, [getPeriodDates(period)[0]], 'lastCopiedAt'));
        return true;
      },
      () => {
        set({ manualCopyText: text });
        return false;
      },
    );
  }

  return api;
}
