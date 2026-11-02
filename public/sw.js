// PWA çevrimdışı Service Worker — Spark uyumlu: yalnızca statik önbellek,
// push/FCM YOK. Chrome "yükle/kısayol" için SW kaydı + fetch handler şart.
// NOT: FCM arka plan için ayrı firebase-messaging-sw.js kullanılır;
// bu dosya onu ezmemeli (FCM kaydi fcmService.js ile '/firebase-messaging-sw.js' uzerinden, dar scope ile yapilir).
const CACHE_NAME = 'appgaraj-v1-4-10';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(CORE_ASSETS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

// Gezinmeler: ağ-öncelikli, çevrimdışıyken önbellekteki sayfa (kurulabilirlik
// denetimi için start_url mutlaka çevrimdışı da sunulmalı)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // v1.4.10: hata sayfası (!ok) önbelleği zehirlemez; '/' + '/index.html' birlikte tazelenir
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => {
              c.put('/index.html', copy.clone()).catch(() => {});
              c.put('/', copy).catch(() => {});
            }).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => {
      const net = fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
