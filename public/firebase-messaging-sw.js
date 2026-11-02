// FCM arka plan bildirimleri (klasik script — modül OLMAZ).
// Uygulama kapalıyken bile Android'e push düşer. Gönderim Cloudflare Worker'dan.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB-avjlRFAwtUhLicT3f5JwOeCwzUY6NOo",
  authDomain: "garaj-53f16.firebaseapp.com",
  projectId: "garaj-53f16",
  storageBucket: "garaj-53f16.firebasestorage.app",
  messagingSenderId: "385181058461",
  appId: "1:385181058461:web:7a3371d8b1067b4d62db74"
});

const messaging = firebase.messaging();

// v1.4.10: dar scope'lu FCM SW 'waiting'de asılı kalmasın (tanı temizliği).
// clients.claim YOK - dar scope sayfaları sahiplenmez, ana SW claim yapar.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notif = payload.notification || {};
  const title = notif.title || data.title || 'Garaj Portal';
  const body = notif.body || data.body || '';
  // Yüklü PWA ikonundaki okunmamış sayısını tazele (Badging API; destek yoksa sessiz)
  try {
    const unread = Number(data.unread);
    if (data.unread !== '' && Number.isFinite(unread) && self.navigator && 'setAppBadge' in self.navigator) {
      if (unread > 0) {
        const p = self.navigator.setAppBadge(unread);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else if ('clearAppBadge' in self.navigator) {
        const p = self.navigator.clearAppBadge();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    }
  } catch (err) { /* desteklenmiyorsa yoksay */ }
  self.registration.showNotification(title, {
    body: body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.notifId || payload.messageId,
    renotify: true,
    data: { route: data.route || 'notifications' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf('/notifications') !== -1 && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
