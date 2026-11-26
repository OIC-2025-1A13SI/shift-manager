// @ts-check
/**
 * 永続化。IndexedDB に AppData を1レコードとして保存する（書き込みが原子的になる）。
 * Phase 2 で確定シフトを追加する場合も AppData の別領域としてここを通す。
 */

/** @typedef {{ load(): Promise<unknown | null>, save(data: unknown): Promise<void> }} Storage */

const DB_NAME = 'shift-manager';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'appData';

/** @returns {Storage} */
export function createIndexedDbStorage() {
  /** @type {Promise<IDBDatabase> | null} */
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('この環境ではIndexedDBが使えません'));
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('データベースを開けません'));
        req.onblocked = () => reject(new Error('データベースが他のタブで使用中です'));
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  };
  return {
    async load() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error ?? new Error('読み込みに失敗しました'));
      });
    },
    async save(data) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('保存に失敗しました'));
        tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました'));
      });
    },
  };
}

/** テスト・検証用のメモリ保存。failSave を true にすると保存失敗を再現できる。 */
export function createMemoryStorage(initial = null) {
  let stored = initial === null ? null : structuredClone(initial);
  const s = {
    failSave: false,
    saveCount: 0,
    async load() {
      return stored === null ? null : structuredClone(stored);
    },
    /** @param {unknown} data */
    async save(data) {
      if (s.failSave) throw new Error('保存に失敗しました（テスト）');
      stored = structuredClone(data);
      s.saveCount++;
    },
    peek() {
      return stored;
    },
  };
  return s;
}
