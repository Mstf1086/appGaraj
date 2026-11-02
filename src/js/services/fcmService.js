// fcmService.js — FCM istemci kaydı (Spark uyumlu)
// Push GÖNDERİMİ sunucuda değil, Cloudflare Worker'dadır (worker/ klasörü).
// İstemci yalnızca: izin ister → FCM token alır → users/{uid}/fcmTokens altına yazar.
// VAPID anahtarı: Firebase Console > Project settings > Cloud Messaging >
// Web push certificates > Generate key pair → VAPID_KEY'e yapıştır.
import {
  doc as fsDoc, setDoc as fsSetDoc, deleteDoc as fsDeleteDoc
} from "firebase/firestore";
import {
  isSupported as fcmIsSupported, getMessaging as fcmGetMessaging,
  getToken as fcmGetToken, deleteToken as fcmDeleteToken,
  onMessage as fcmOnMessage
} from "firebase/messaging";
import { db } from "./firebase.js";

export const VAPID_KEY = "BMERqM_aQhMDrRXOcbSX_-y-_q1KWdBUDuyHvePW2X-J9Ln4KwKaqDrzfRW8kT_TYOOVGw_hakPYeq-9WxP82KA";

export function isVapidConfigured() {
  return !!VAPID_KEY && VAPID_KEY.indexOf("BURAYA") === -1;
}

const TOKEN_LS_KEY = 'fcm_token';

let messagingPromise = null;
function getMessagingAsync() {
  if (!messagingPromise) {
    messagingPromise = fcmIsSupported()
      .then((ok) => (ok ? fcmGetMessaging() : null))
      .catch(() => null);
  }
  return messagingPromise;
}

/** Bu tarayıcı/cihaz FCM destekliyor mu? */
export async function isPushSupported() {
  return (await getMessagingAsync()) !== null;
}

function detectPlatform() {
  try {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    return 'web';
  } catch (err) {
    return 'web';
  }
}

/** SW kaydının scriptURL'sini al (active/waiting/installing dahil). */
function swScriptUrl(r) {
  try {
    const w = r && (r.active || r.waiting || r.installing);
    return (w && w.scriptURL) || '';
  } catch (err) { return ''; }
}

/** SW registration active olana kadar bekle (timeout ~3sn, sonra yine de dön). */
function waitForActive(reg) {
  try {
    const sw = reg && (reg.installing || reg.waiting);
    if (!sw || sw.state === 'activated') return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated' || sw.state === 'redundant') { clearTimeout(t); resolve(); }
      });
    });
  } catch (err) { return Promise.resolve(); }
}

async function getFcmRegistration() {
  // PWA sw.js (scope /) ile çakışmaması için: önce mevcut kayıtları denetle,
  // FCM SW yalnızca dar scope ile kaydedilir (PWA SW'yi ezmez).
  // v1.4.9: eşleşme installing/waiting dahil; dönüş öncesi active beklenir.
  if (!('serviceWorker' in navigator)) return null;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const existing = regs.find((r) => swScriptUrl(r).indexOf('firebase-messaging-sw') !== -1);
    if (existing) {
      await waitForActive(existing);
      return existing;
    }
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-messaging-sw.js' });
    await waitForActive(reg);
    return reg;
  } catch (err) {
    console.warn('FCM Service Worker kaydı başarısız:', err);
    return null;
  }
}

// Uygulama açıkken gelen push'ları göster (modül ömrü boyunca bir kez bağlanır).
let foregroundBound = false;

/**
 * Bildirimi göster (plan.md 0.3 savunma zinciri): önce `new Notification`;
 * Android'de sayfa bağlamında kurucu fırlattığı için FCM/PWA Service Worker
 * registration `showNotification` halkalarına düşülür (sesli/görüntülü çalışır).
 */
async function showPushNotification(title, body, tag) {
  try {
    const shown = await showNotificationChain(title, body, tag);
    if (!shown) console.warn('Ön plan push bildirimi gösterilemedi (kayıt bulunamadı).');
  } catch (err) {
    console.warn('Ön plan push bildirimi gösterilemedi:', err);
  }
}

/**
 * Ortak gösterim zinciri: `new Notification` -> FCM SW `showNotification` ->
 * `/` scope PWA SW `showNotification` (FCM önce, sonra diğer kayıtlar).
 * notificationService dahil herkes bu fonksiyonu kullanır.
 * @returns {Promise<boolean>} bildirim gösterildiyse true
 */
export async function showNotificationChain(title, body, tag) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body: body,
        tag: tag,
        icon: '/icons/icon-192.png',
        data: { route: 'notifications' }
      });
      n.onclick = () => {
        try { window.focus(); } catch (err) { /* yoksay */ }
        n.close();
        window.location.pathname = '/notifications';
      };
      return true;
    } catch (err) { /* Android: kurucu fırlatır -> SW halkalarına geç */ }
  }
  if (!('serviceWorker' in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const ordered = regs.slice().sort((a, b) => {
      const fa = swScriptUrl(a).indexOf('firebase-messaging-sw') !== -1 ? 0 : 1;
      const fb = swScriptUrl(b).indexOf('firebase-messaging-sw') !== -1 ? 0 : 1;
      return fa - fb;
    });
    for (const reg of ordered) {
      try {
        await reg.showNotification(title, {
          body: body,
          tag: tag,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          renotify: true,
          data: { route: 'notifications' }
        });
        return true;
      } catch (err) { /* sonraki kayda geç */ }
    }
  } catch (err) { /* yoksay */ }
  return false;
}

/** FCM data.unread -> yüklü uygulama ikon rozeti (anında, senkron beklemeden). */
let badgeSupportLogged = false;
function paintUnreadBadge(unreadRaw) {
  try {
    const unread = Number(unreadRaw);
    if (unreadRaw === undefined || unreadRaw === '' || !Number.isFinite(unread)) return;
    if (unread > 0 && 'setAppBadge' in navigator) {
      const p = navigator.setAppBadge(unread);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else if (unread === 0 && 'clearAppBadge' in navigator) {
      const p = navigator.clearAppBadge();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else if (!badgeSupportLogged && !('setAppBadge' in navigator)) {
      badgeSupportLogged = true;
      console.info('[appGaraj] Badging API yok - ikon sayaci push OS rozetinden (plan.md 0.3).');
    }
  } catch (err) { /* destek yoksa sessiz */ }
}

export function initForegroundPush() {
  if (foregroundBound) return;
  foregroundBound = true;
  getMessagingAsync().then((m) => {
    if (!m) return;
    fcmOnMessage(m, (payload) => {
      const data = payload.data || {};
      const notif = payload.notification || {};
      const title = notif.title || data.title || 'Garaj Portal';
      const body = notif.body || data.body || '';
      paintUnreadBadge(data.unread);
      showPushNotification(title, body, payload.messageId);
      document.dispatchEvent(new CustomEvent('notifications:updated'));
    });
  });
}

/**
 * Push izni ister, FCM token alıp users/{uid}/fcmTokens altına kaydeder.
 * Kullanıcı etkileşimi (buton) içinden çağrılmalıdır.
 */
export async function registerPushToken(uid) {
  const m = await getMessagingAsync();
  if (!m) return { ok: false, reason: 'unsupported' };
  if (!isVapidConfigured()) {
    return { ok: false, reason: 'no-vapid' };
  }
  if (typeof Notification === 'undefined') return { ok: false, reason: 'unsupported' };
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm };
  }
  const reg = await getFcmRegistration();
  if (!reg) return { ok: false, reason: 'no-sw' };
  const token = await fcmGetToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) return { ok: false, reason: 'no-token' };
  try {
    localStorage.setItem(TOKEN_LS_KEY, token);
  } catch (err) { /* yoksay */ }
  await fsSetDoc(fsDoc(db, 'users', uid, 'fcmTokens', token), {
    token: token,
    platform: detectPlatform(),
    enabled: true,
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }, { merge: true });
  return { ok: true, token: token };
}

/** Çıkışta token'ı sil (başarısızlık sessiz geçilir). */
export async function unregisterPushToken(uid) {
  try {
    const m = await getMessagingAsync();
    if (m) {
      try { await fcmDeleteToken(m); } catch (err) { /* yoksay */ }
    }
  } catch (err) { /* yoksay */ }
  try {
    const token = localStorage.getItem(TOKEN_LS_KEY);
    localStorage.removeItem(TOKEN_LS_KEY);
    if (token && uid) {
      await fsDeleteDoc(fsDoc(db, 'users', uid, 'fcmTokens', token));
    }
  } catch (err) { /* yoksay */ }
}
