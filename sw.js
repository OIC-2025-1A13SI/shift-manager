/* Service Worker：アプリ資産をキャッシュしてオフラインで使えるようにする。
 * 保存データ（IndexedDB）には触れない。ファイルを更新したら CACHE_VERSION を上げること。 */
const CACHE_VERSION = 'shift-manager-v2.1.1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/application/controller.js',
  './src/domain/appData.js',
  './src/domain/calendar.js',
  './src/domain/confirmed.js',
  './src/domain/formatter.js',
  './src/domain/history.js',
  './src/domain/shift.js',
  './src/domain/templates.js',
  './src/domain/types.js',
  './src/infrastructure/backup.js',
  './src/infrastructure/clipboard.js',
  './src/infrastructure/fileSaver.js',
  './src/infrastructure/storage.js',
  './src/main.js',
  './src/styles/app.css',
  './src/ui/app.js',
  './src/ui/components/addSheet.js',
  './src/ui/components/calendarView.js',
  './src/ui/components/confirmedEditor.js',
  './src/ui/components/confirmedSheet.js',
  './src/ui/components/dialogs.js',
  './src/ui/components/entryEditor.js',
  './src/ui/components/periodChooser.js',
  './src/ui/components/timePicker.js',
  './src/ui/components/wheel.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/screens/confirmedScreen.js',
  './src/ui/screens/copyScreen.js',
  './src/ui/screens/hopeScreen.js',
  './src/ui/screens/otherScreen.js',
  './src/ui/screens/placeholderScreen.js',
];

self.addEventListener('install', (event) => {
  // ブラウザーの HTTP キャッシュ（GitHub Pages は10分）に残った古いファイルを取り込まないよう、必ずサーバーから取り直す
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shift-manager-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
