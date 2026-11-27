// @ts-check
/** エントリーポイント：依存を組み立てて起動する */
import { createController } from './application/controller.js';
import { createIndexedDbStorage } from './infrastructure/storage.js';
import { writeClipboard } from './infrastructure/clipboard.js';
import { saveTextFile } from './infrastructure/fileSaver.js';
import { mountApp } from './ui/app.js';

export const APP_VERSION = '2.2.0';

const now = () => new Date();
const controller = createController({
  storage: createIndexedDbStorage(),
  writeClipboard,
  saveFile: saveTextFile,
  now,
});

mountApp(/** @type {HTMLElement} */ (document.getElementById('app')), controller, { now, version: APP_VERSION });
controller.init();

// オフライン利用（R03, T29）。Service Worker の更新では IndexedDB のデータは消さない。
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // 新しい版が有効になったら1回だけ読み込み直す（入力は操作ごとに保存済みなので失われない）
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
