// @ts-check
/**
 * アプリ状態管理・操作制御（設計書 §6）。
 * UI は状態を読み、操作はすべてこのコントローラー経由で行う。保存・クリップボード・ファイル保存は
 * 依存として注入するため、ブラウザーなしで単体テストできる。
 */

import { getPeriodDates, nextDateInPeriod, periodKey } from '../domain/calendar.js';
import { setShift, clearShift, validateShift } from '../domain/shift.js';
import { touchHistory, removeHistory } from '../domain/history.js';
import { buildSubmission, buildLines, countMissing } from '../domain/formatter.js';
import { createDefaultAppData, migrateAppData } from '../domain/appData.js';
import { createBackup, parseBackup } from '../infrastructure/backup.js';

/** @typedef {import('../domain/types.js').AppData} AppData */
/** @typedef {import('../domain/types.js').PeriodRef} PeriodRef */
/** @typedef {import('../domain/types.js').DateKey} DateKey */
/** @typedef {import('../domain/types.js').Shift} Shift */
/** @typedef {import('../domain/types.js').TimeShift} TimeShift */

/**
 * @typedef {{
 *   storage: { load(): Promise<unknown | null>, save(data: unknown): Promise<void> },
 *   writeClipboard: (text: string) => Promise<boolean>,
 *   saveFile: (filename: string, text: string) => Promise<'saved' | 'cancelled' | 'failed'>,
 *   now?: () => Date,
 *   newId?: () => string,
 * }} Deps
 *
 * @typedef {{
 *   ready: boolean,
 *   screen: 'period' | 'main' | 'settings',
 *   settingsReturn: 'period' | 'main',
 *   period: PeriodRef | null,
 *   dates: DateKey[],
 *   selected: DateKey | null,
 *   multi: boolean,
 *   multiSelection: DateKey[],
 *   historyEditing: boolean,
 *   data: AppData,
 *   loadError: string | null,
 *   saveError: string | null,
 *   copyConfirm: { missing: number } | null,
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

  /** @type {State} */
  let state = {
    ready: false,
    screen: 'period',
    settingsReturn: 'period',
    period: null,
    dates: [],
    selected: null,
    multi: false,
    multiSelection: [],
    historyEditing: false,
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
  /** 保存は直列化する */
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

  function touchPeriod(/** @type {'lastEditedAt' | 'lastCopiedAt'} */ field, /** @type {AppData} */ data) {
    if (!state.period) return data;
    const key = periodKey(state.period);
    return { ...data, periods: { ...data.periods, [key]: { ...data.periods[key], [field]: now().toISOString() } } };
  }

  function targets() {
    if (state.multi) return state.multiSelection;
    return state.selected ? [state.selected] : [];
  }

  const api = {
    getState: () => state,
    /** @param {(s: State) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async init() {
      try {
        const raw = await deps.storage.load();
        if (raw === null) {
          set({ ready: true });
          return;
        }
        const r = migrateAppData(raw);
        if (r.ok) set({ ready: true, data: r.data });
        else {
          storageBlocked = true;
          set({ ready: true, loadError: `保存データが壊れているため読み込めませんでした：${r.errors[0]}` });
        }
      } catch (e) {
        set({ ready: true, loadError: `保存データを読み込めません：${e instanceof Error ? e.message : String(e)}` });
      }
    },

    // ---- 画面遷移 ----
    /** @param {PeriodRef} period */
    openPeriod(period) {
      const dates = getPeriodDates(period);
      set({
        screen: 'main',
        period,
        dates,
        selected: dates[0], // Q03: 常に初日
        multi: false,
        multiSelection: [],
        historyEditing: false,
      });
    },
    backToPeriods() {
      set({ screen: 'period', multi: false, multiSelection: [], historyEditing: false, copyConfirm: null });
    },
    openSettings() {
      set({ screen: 'settings', settingsReturn: state.screen === 'main' ? 'main' : 'period' });
    },
    closeSettings() {
      set({ screen: state.settingsReturn === 'main' && state.period ? 'main' : 'period' });
    },

    // ---- 日付選択 ----
    /** @param {DateKey} date */
    tapDate(date) {
      if (!state.dates.includes(date)) return;
      if (state.multi) {
        const sel = state.multiSelection.includes(date)
          ? state.multiSelection.filter((d) => d !== date)
          : [...state.multiSelection, date];
        set({ multiSelection: sel });
      } else {
        set({ selected: date });
      }
    },
    toggleMulti() {
      if (state.multi) set({ multi: false, multiSelection: [] });
      else set({ multi: true, multiSelection: [], historyEditing: false });
    },

    // ---- 入力 ----
    /**
     * 選択中の日付へ希望を適用する（R12〜R14、Q02、Q04）。
     * @param {Shift} shift
     * @returns {boolean} 適用できたか
     */
    applyShift(shift) {
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
      let data = { ...state.data, requests: setShift(state.data.requests, dates, shift, ts) };
      if (shift.kind === 'range') data.history = touchHistory(data.history, /** @type {TimeShift} */ (shift), ts, newId);
      data = touchPeriod('lastEditedAt', data);

      // Q02: 一括は最後にタップした日の翌日 / Q04: 通常は暦上の翌日 / R12: 末日は留まる
      const base = dates[dates.length - 1];
      const next = nextDateInPeriod(state.dates, base) ?? base;
      set({ multi: false, multiSelection: [], selected: next });
      updateData(data);
      return true;
    },
    /** @param {string} historyId */
    applyHistory(historyId) {
      const h = state.data.history.find((x) => x.id === historyId);
      if (h) api.applyShift(h.shift);
    },
    /** 未入力に戻す（R15、Q05: 一括可・移動しない） */
    clearSelected() {
      const dates = targets();
      if (dates.length === 0) {
        notify('日付を選択してください', 'error');
        return false;
      }
      const data = touchPeriod('lastEditedAt', { ...state.data, requests: clearShift(state.data.requests, dates) });
      set({ multi: false, multiSelection: [], selected: dates[dates.length - 1] });
      updateData(data);
      return true;
    },

    // ---- 履歴 ----
    toggleHistoryEditing() {
      set({ historyEditing: !state.historyEditing });
    },
    /** @param {string} id */
    deleteHistory(id) {
      updateData({ ...state.data, history: removeHistory(state.data.history, id) });
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

    // ---- プレビュー・コピー ----
    previewLines() {
      return buildLines(state.dates, state.data.requests);
    },
    submissionText() {
      return buildSubmission(state.dates, state.data.requests, state.data.settings);
    },
    missingCount() {
      return countMissing(state.dates, state.data.requests);
    },
    /** コピー（R19, R20）。未入力がある場合は確認を出す。 */
    requestCopy() {
      const missing = api.missingCount();
      if (missing > 0) {
        set({ copyConfirm: { missing } });
        return Promise.resolve(false);
      }
      return performCopy();
    },
    confirmCopy() {
      set({ copyConfirm: null });
      return performCopy();
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
    notify,

    // ---- バックアップ ----
    async exportBackup() {
      const { filename, json } = createBackup(state.data, now());
      const r = await deps.saveFile(filename, json);
      if (r === 'saved') notify('バックアップを書き出しました');
      else if (r === 'failed') notify('バックアップを書き出せませんでした', 'error');
      return r;
    },
    /** 復元ファイルを検証し、問題なければ確認待ちにする。不正なら現データは変更しない（T27）。
     * @param {string} text @param {number} size */
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

  /** クリップボード書き込みは await より前に呼ぶ（iOS のユーザー操作要件） */
  function performCopy() {
    const text = api.submissionText();
    const write = deps.writeClipboard(text);
    return write.then(
      (ok) => {
        if (!ok) {
          set({ manualCopyText: text });
          return false;
        }
        notify('コピーしました');
        updateData(touchPeriod('lastCopiedAt', state.data));
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
