// Offline cache for the app shell. Patient data is never stored here —
// it lives in localStorage and is not touched by the service worker.
const CACHE = 'wardwork-shell-v4';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

// The text reader used for scanning (large). Cached in the background so
// scanning also works offline, but never blocks the app from installing.
const READER = ['tesseract.min.js', 'worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js', 'lang/tha.traineddata.gz', 'lang/eng.traineddata.gz']
  .map((f) => 'vendor/tesseract/' + f).concat(['vendor/zxing/zxing-reader.js', 'vendor/zxing/zxing_reader.wasm']);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => {
    c.addAll(READER).catch(() => {});
    return c.addAll(SHELL);
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Network first so updates show up immediately; fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
