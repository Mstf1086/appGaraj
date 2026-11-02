import { doc, getDocFromServer, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase.js";
import { signOut } from "firebase/auth";
import { el } from "./dom.js";
import { syncNotifications, getNotifications, resetSeenNotifications } from "./notificationService.js";
import { unregisterPushToken, initForegroundPush, isVapidConfigured } from "./fcmService.js";

// Son bilinen okunmamış bildirim sayısı (modül ömrü boyunca). Sayfa geçişlerinde
// navbar yeniden kurulurken Firebase'e istek atmadan rozetin doğru görünmesini sağlar.
let cachedUnread = null;

// Rol sorgusu için kısa ömürlü önbellek: navbar her sayfa geçişinde yeniden
// kurulurken Firebase'e tekrar istek atılmasını engeller (10 dakika taze).
const ADMIN_ROLE_TTL = 10 * 60 * 1000;
const adminRoleCache = new Map(); // uid -> { isAdmin, at }

// Navbar kurulumları arasındaki "aktif senkron bağlamı" (zamanlayıcı + tazeleme).
// Global dinleyiciler tek sefer bağlanır ve en son kurulan navbar'a işaret eder.
let activeBadgeSync = null;

export async function checkIsAdmin(user) {
  if (!user) return false;
  const cached = adminRoleCache.get(user.uid);
  if (cached && Date.now() - cached.at < ADMIN_ROLE_TTL) return cached.isAdmin;
  try {
    const userRef = doc(db, 'users', user.uid);
    let userSnap;
    try {
      userSnap = await getDocFromServer(userRef);
    } catch (e) {
      console.warn('Rol sunucudan okunamadı, önbellek denenecek:', e);
      userSnap = await getDoc(userRef);
    }
    if (userSnap.exists()) {
      const isAdmin = userSnap.data().role === 'admin';
      adminRoleCache.set(user.uid, { isAdmin, at: Date.now() });
      return isAdmin;
    } else {
      // Firestore kuralı gereği kullanıcı kendi dökümanını kendisi oluşturur
      // (register akışı zaten bunu yapar). Burada yalnızca admin önbelleğini
      // düşür; sessizce setDoc deneme (yetki hatası + istenmeyen yazım olur).
      adminRoleCache.set(user.uid, { isAdmin: false, at: Date.now() });
      return false;
    }
    } catch (err) {
      console.error('Kullanıcı rolü okunamadı:', err);
      return false;
    }
  }

// PWA uygulama rozeti (Badging API): yüklü "Garaj Portal" ikonunda okunmamış sayısı.
// Destek: masaüstü Chrome/Edge, Safari 17+. Chrome Android/Firefox'ta TANIMSIZDIR -
// oralarda ikon sayacı push bildiriminin OS rozetinden gelir (plan.md 0.3).
// Destek yoksa tek seferlik bilgi logu + sessiz geçiş.
let badgeSupportLogged = false;
export function setAppBadge(count) {
  try {
    if (typeof navigator === 'undefined') return;
    if (!('setAppBadge' in navigator)) {
      if (!badgeSupportLogged) {
        badgeSupportLogged = true;
        console.info('[appGaraj] Badging API yok - ikon sayaci push OS rozetinden (plan.md 0.3).');
      }
      return;
    }
    const p = count > 0
      ? navigator.setAppBadge(count)
      : (('clearAppBadge' in navigator) ? navigator.clearAppBadge() : null);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (err) {
    // Badging izni yoksa/kullanıcı engellediyse sessiz geç
  }
}

export function clearAppBadge() {
  setAppBadge(0);
}

// Global bildirim dinleyicileri — modül ömrü boyunca yalnızca BİR KEZ bağlanır.
// Her navbar kurulumunda yeniden bağlanmaz; yalnızca aktif bağlam kullanılır.
let globalNotifListenersBound = false;
// Açık kullanıcı menüsünü dışarı tıklayınca kapat (tek global dinleyici).
function handleGlobalDropdownClose() {
  document.querySelectorAll('.user-dropdown-menu.show').forEach((m) => m.classList.remove('show'));
}
function bindGlobalNotifListeners() {
  if (globalNotifListenersBound) return;
  globalNotifListenersBound = true;
  document.addEventListener('click', handleGlobalDropdownClose);

  // Bildirimler sayfasındaki okundu işlemlerinden sonra rozeti tazele
  document.addEventListener('notifications:updated', async () => {
    if (!activeBadgeSync || !activeBadgeSync.uid) return;
    try {
      const list = await getNotifications(activeBadgeSync.uid);
      const unread = list.filter(n => !n.read).length;
      if (typeof activeBadgeSync.paint === 'function') activeBadgeSync.paint(unread);
    } catch (err) {
      console.error('Bildirim rozeti güncellenemedi:', err);
    }
  });

  // Sekme tekrar görünür olduğunda aktif navbar bağlamını tazele
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && activeBadgeSync) {
      activeBadgeSync.run().finally(activeBadgeSync.schedule);
    }
  });

  // Temizlik: 'unload' Permissions-Policy tarafından engellendiği için 'pagehide' kullanılır
  window.addEventListener('pagehide', () => {
    if (activeBadgeSync) activeBadgeSync.cancel();
  });

  // Kayıt (garaj/araç/alt koleksiyon) ekle-düzenle-sil sonrası anında senkron:
  // görünüm cache'i güncelledikten sonra 'records:changed' yayınlar; debounce'u
  // bypass eden zorunlu tazeleme ile bildirimler hemen yeniden aktifleşir/pop olur.
  document.addEventListener('records:changed', () => {
    if (activeBadgeSync) activeBadgeSync.run({ force: true }).finally(activeBadgeSync.schedule);
  });
}

export async function createNavbar(user, activeView, navigate) {
  const isAdmin = await checkIsAdmin(user);
  const brandIcon = el('span', { className: 'brand-icon' }, ['🏎️']);
  const navBrand = el('a', { href: '#', className: 'navbar-brand', id: 'nav-brand' }, [
    brandIcon,
    el('span', {}, ['Garaj Portal'])
  ]);

  const menuItems = [];

  if (isAdmin) {
    const navAdmin = el('a', { href: '#', className: `nav-link ${activeView === 'admin' ? 'active' : ''}`, id: 'nav-admin' }, [
      '🛡️ Admin'
    ]);
    menuItems.push(navAdmin);
  }

  const userInitial = (user.email || 'U').charAt(0).toUpperCase();
  const notifBadge = el('span', { className: 'notif-badge hidden', id: 'notif-badge' }, ['0']);
  const userChip = el('div', { className: 'nav-user-chip' }, [
    el('div', { className: 'user-avatar' }, [userInitial, notifBadge]),
    el('span', {}, [user.email ? user.email.split('@')[0] : 'Kullanıcı'])
  ]);

  const profileItem = el('button', { className: 'user-dropdown-item', id: 'dropdown-profile' }, [
    '👤 Profil'
  ]);
  const notifItem = el('button', { className: 'user-dropdown-item', id: 'dropdown-notifications' }, [
    '🔔 Bildirimlerim'
  ]);
  const logoutItem = el('button', { className: 'user-dropdown-item', id: 'dropdown-logout' }, [
    '🚪 Çıkış'
  ]);

  const dropdownMenu = el('div', { className: 'user-dropdown-menu' }, [
    profileItem,
    notifItem,
    el('div', { className: 'user-dropdown-divider' }),
    logoutItem
  ]);

  const userMenuContainer = el('div', { className: 'user-menu-container' }, [
    userChip,
    dropdownMenu
  ]);

  menuItems.push(userMenuContainer);

  const navbar = el('nav', { className: 'navbar' }, [
    navBrand,
    el('div', { className: 'navbar-menu' }, menuItems)
  ]);

  navBrand.addEventListener('click', (e) => { e.preventDefault(); navigate('dashboard'); });
  if (isAdmin) {
    const adminEl = navbar.querySelector('#nav-admin');
    if (adminEl) adminEl.addEventListener('click', (e) => { e.preventDefault(); navigate('admin'); });
  }

  // Bildirimleri senkronize et ve avatar üzerindeki rozeti güncelle.
  // Firebase isteğini azaltmak için: gizli sekmede istek atılmaz; senkron yalnızca
  // sekme görünür olduğunda ve en fazla 5 dakikada bir çalışır (gerçek zamanlı dinleyici yok).
  const badge = notifBadge;
  // Rozet: önce son bilinen değerle doldur (Firebase isteği gerekmeden), sonra senkronize et
  const paintBadge = (unread) => {
    cachedUnread = unread;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);
    setAppBadge(unread); // yüklü "Garaj Portal" ikonundaki sayı
  };
  if (cachedUnread !== null) {
    badge.textContent = cachedUnread > 9 ? '9+' : String(cachedUnread);
    badge.classList.toggle('hidden', cachedUnread === 0);
    setAppBadge(cachedUnread);
  }
  const MIN_REFRESH_MS = 60 * 1000;     // arka arkaya istek atmayı engelle (debounce)
  const MAX_REFRESH_MS = 5 * 60 * 1000; // görünür sekmede senkron sıklığı üst sınırı
  let notifTimer = null;
  let lastSyncAt = 0;
  let lastErrorShown = 0;

  const refreshBadge = async (opts = {}) => {
    if (document.hidden) return; // gizli sekmede Firebase isteği atma
    const now = Date.now();
    // force: kayıt ekle/düzenle/sil sonrası debounce'u bypass eden anında senkron
    if (!opts.force && now - lastSyncAt < MIN_REFRESH_MS) return;
    lastSyncAt = now;
    try {
      const list = await syncNotifications(user.uid);
      const unread = list.filter(n => !n.read).length;
      paintBadge(unread);
    } catch (err) {
      // Hata denetimi: konsola yaz (aynı hatanın tekrarlarını 60 sn'de bir bastır)
      if (now - lastErrorShown > MIN_REFRESH_MS) {
        console.error('Bildirim senkronizasyonu başarısız:', err);
        lastErrorShown = now;
      }
    }
  };

  const scheduleNextSync = () => {
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(refreshBadge, MAX_REFRESH_MS);
  };

  refreshBadge().finally(scheduleNextSync);

  // Global dinleyiciler modül düzeyinde yalnızca BİR KEZ bağlanır; her navbar
  // kurulumunda yalnızca "aktif senkron bağlamı" güncellenir. (Aksi halde her
  // sayfa geçişi dinleyici biriktirir ve sekmeye dönüşte N paralel senkron
  // isteği atılır.)
  bindGlobalNotifListeners();
  if (activeBadgeSync) activeBadgeSync.cancel();
  activeBadgeSync = {
    uid: user.uid,
    paint: paintBadge,
    run: refreshBadge,
    schedule: scheduleNextSync,
    cancel: () => { if (notifTimer) { clearTimeout(notifTimer); notifTimer = null; } }
  };

  notifItem.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropdownMenu.classList.remove('show');
    navigate('notifications');
  });

  // FCM ön plan dinleyicisi (VAPID girilmişse; token kaydı Bildirimlerim sayfasında)
  try {
    if (isVapidConfigured()) initForegroundPush();
  } catch (err) { /* yoksay */ }

  userChip.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });

  dropdownMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  profileItem.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropdownMenu.classList.remove('show');
    navigate('profile');
  });

  logoutItem.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropdownMenu.classList.remove('show');
    resetSeenNotifications();
    cachedUnread = null;
    clearAppBadge();
    try { await unregisterPushToken(user.uid); } catch (err) { /* yoksay */ }
    await signOut(auth);
    navigate('login');
  });

  return navbar;
}
