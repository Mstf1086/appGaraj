import {
  collection as fsCollection, getDocs as fsGetDocs, doc as fsDoc, getDoc as fsGetDoc,
  setDoc as fsSetDoc, updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc,
  writeBatch as fsWriteBatch
} from "firebase/firestore";
import { db } from "./firebase.js";
import { showNotificationChain } from "./fcmService.js";
import {
  ensureUserData, isCacheReady, getCacheUid,
  getCachedGarages, getCachedVehicles, getCachedRecords
} from "./dataCache.js";

// Tarih bazlı hatırlatıcı izlenen alt koleksiyonlar: bitiş/son geçerlilik/son ödeme
// Bitiş tarihi (endDate) veya son ödeme tarihi (dueDate) olan TÜM kayıtlar izlenir.
const TRACKED_CATEGORIES = [
  { key: 'traffic_insurance', label: 'Trafik Sigortası', dateField: 'endDate' },
  { key: 'casco', label: 'Kasko', dateField: 'endDate' },
  { key: 'vehicle_inspection', label: 'Araç Muayenesi', dateField: 'endDate' },
  { key: 'exhaust_inspection', label: 'Egzoz Muayenesi', dateField: 'endDate' },
  { key: 'traffic_fines', label: 'Trafik Cezası', dateField: 'dueDate' }
];

const EXPIRY_WINDOW_DAYS = 30;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  // 'YYYY-MM-DD' tarihini UTC gün sınırında hesapla — istemci saat diliminden
  // bağımsız (TSİ ± gün kayması engellenir; Worker ile aynı sonuç verir).
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const endUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((endUtc - todayUtc) / 86400000);
}

function expiryLabel(days) {
  if (days < 0) return `Süresi ${Math.abs(days)} gün önce doldu`;
  if (days === 0) return 'Bugün son gün!';
  if (days <= 3) return `${days} gün kaldı (son 3 gün)`;
  if (days <= 7) return `${days} gün kaldı (son 7 gün)`;
  if (days <= 15) return `${days} gün kaldı (son 15 gün)`;
  return `${days} gün kaldı (son 30 gün)`;
}

function levelKey(days) {
  if (days < 0) return 'expired';
  if (days === 0) return '0';
  if (days <= 3) return '3';
  if (days <= 7) return '7';
  if (days <= 15) return '15';
  return '30';
}

// ============================================================================
// Tarayıcı bildirimleri (Browser Notification API)
// ============================================================================

/** Tarayıcı bildirim desteği var mı? */
export function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Mevcut izin durumu: 'granted' | 'denied' | 'default' | 'unsupported' */
export function getNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Tarayıcı bildirim iznini ister. Kullanıcı etkileşimi içinde çağrılmalıdır.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.error('Bildirim izni istenemedi:', err);
    return Notification.permission;
  }
}

// ----------------------------------------------------------------------------
// "Tarayıcıya düşürüldü" bilgisi — sekme oturumu bazlı (sessionStorage).
// Amaç: aynı hatırlatıcının her sayfa yenilemesinde tekrar tekrar pop olmasını
// engellemek; sekme kapanıp açıldığında bekleyen okunmamışlar bir kez daha pop olur.
// ----------------------------------------------------------------------------
const SEEN_STORAGE_PREFIX = 'appgaraj_notif_seen_';
let seenStore = null;      // { uid, map: { [notifId]: updatedAt } }
let seenStoreLoaded = false;

function loadSeenStore(uid) {
  if (seenStoreLoaded && seenStore && seenStore.uid === uid) return seenStore;
  let map = {};
  try {
    const raw = sessionStorage.getItem(SEEN_STORAGE_PREFIX + uid);
    if (raw) map = JSON.parse(raw) || {};
  } catch (err) {
    console.warn('Bildirim görülme bilgisi okunamadı:', err);
  }
  seenStore = { uid, map };
  seenStoreLoaded = true;
  return seenStore;
}

function persistSeenStore(uid) {
  if (!seenStore || seenStore.uid !== uid) return;
  try {
    sessionStorage.setItem(SEEN_STORAGE_PREFIX + uid, JSON.stringify(seenStore.map));
  } catch (err) {
    console.warn('Bildirim görülme bilgisi kaydedilemedi:', err);
  }
}

/** Kullanıcı değiştiğinde (çıkış/giriş) görülenler kümesini sıfırla */
export function resetSeenNotifications() {
  seenStore = null;
  seenStoreLoaded = false;
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(SEEN_STORAGE_PREFIX))
      .forEach(k => sessionStorage.removeItem(k));
  } catch (err) {
    console.warn('Bildirim görülme bilgisi temizlenemedi:', err);
  }
}

/**
 * Tarayıcı bildirimi göster (plan.md 0.3 savunma zinciri): önce `new Notification`;
 * Android Chrome'da sayfa-bağlamı kurucusu fırlattığı için SW `showNotification`
 * halkalarına düşülür. İzin yoksa sessizce yoksay.
 * Tıklandığında Bildirimlerim sayfasına yönlendirir.
 */
async function showBrowserNotification(notif) {
  if (!isBrowserNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const shown = await showNotificationChain(
      notif.title || 'appGaraj Hatırlatıcı',
      notif.message || '',
      notif.id
    );
    if (!shown) console.warn('Tarayıcı bildirimi gösterilemedi (kayıt bulunamadı).');
  } catch (err) {
    console.error('Tarayıcı bildirimi gösterilemedi:', err);
  }
}

/**
 * Senkronizasyon sonucunda yeni oluşan (önceki turda olmayan) bildirimleri
 * tarayıcı bildirimi olarak göster.
 */
function notifyNewNotifications(list, uid) {
  const store = loadSeenStore(uid);
  const canPop = isBrowserNotificationSupported() && Notification.permission === 'granted';
  let changed = false;
  list.forEach(n => {
    if (store.map[n.id] === n.updatedAt) return; // bu sürüm zaten düşürüldü
    if (canPop && n.read !== true) showBrowserNotification(n);
    store.map[n.id] = n.updatedAt;
    changed = true;
  });
  if (changed) persistSeenStore(uid);
}

/**
 * Verilen listedeki OKUNMAMIŞ bildirimleri hemen masaüstüne düşürür (izin
 * verilmişse). İzin verildikten hemen sonra bekleyenleri senkron beklemeden
 * göstermek için Bildirimlerim sayfasından çağrılır.
 */
export function popUnreadBrowserNotifications(list, uid) {
  if (!isBrowserNotificationSupported() || Notification.permission !== 'granted') return;
  const store = loadSeenStore(uid);
  let changed = false;
  list.forEach(n => {
    if (n.read === true || store.map[n.id] === n.updatedAt) return;
    showBrowserNotification(n);
    store.map[n.id] = n.updatedAt;
    changed = true;
  });
  if (changed) persistSeenStore(uid);
}

// ============================================================================
// Ana senkronizasyon
// ============================================================================

/**
 * Kullanıcının araç kayıtlarını tarar, son 30 gün içinde bitenleri
 * users/{uid}/notifications altında deterministik ID ile senkronlar.
 * Okunma durumu (read) korunur; kayıt silinirse veya tarih 30 gün ötesine
 * alınırsa bildirim temizlenir. Güncel bildirim listesini döndürür.
 */
export async function syncNotifications(uid) {
  // Kayıt taraması Firestore'a DEĞİL, merkezi önbelleğe yapılır (dataCache).
  // Önbellek hazırsa burada hiçbir okuma isteği atılmaz; tek istek yalnızca
  // users/{uid}/notifications okumasıdır.
  if (!isCacheReady() || getCacheUid() !== uid) {
    try {
      await ensureUserData(uid);
    } catch (err) {
      console.error('Bildirim taraması için veri önbelleği yüklenemedi:', err);
      throw err; // arayan taraf (refreshBadge) yakalayıp konsola yazar
    }
  }

  const desired = new Map();

  for (const g of getCachedGarages()) {
    for (const v of getCachedVehicles(g.id)) {
      const plate = v.plate || '';
      for (const cat of TRACKED_CATEGORIES) {
        for (const r of getCachedRecords(g.id, v.id, cat.key)) {
          // Ödenmiş trafik cezası hatırlatılmaz
          if (cat.key === 'traffic_fines' && (r.status === 'Ödendi' || r.paid === true)) continue;
          const days = daysUntil(r[cat.dateField]);
          if (days === null || days > EXPIRY_WINDOW_DAYS) continue;
          const id = `${v.id}_${cat.key}_${r.id}`;
          desired.set(id, {
            id,
            userId: uid,
            category: cat.key,
            categoryLabel: cat.label,
            garageId: g.id,
            vehicleId: v.id,
            recordId: r.id,
            endDate: r[cat.dateField] || '',
            daysLeft: days,
            level: levelKey(days),
            title: `${cat.label} — ${plate}`,
            message: expiryLabel(days),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
  }

  const col = fsCollection(db, 'users', uid, 'notifications');
  const existingSnap = await fsGetDocs(col);
  // Kullanıcının sildiği hatırlatıcılar: mühür SEVİYE/TARİH kapsamlıdır.
  // Aynı eşik + aynı bitiş susturulur; eşik ya da tarih değiştiyse mühür
  // kaldırılır ve bildirim yeniden üretilir (eski alanasız mühürler önce
  // bulundukları eşike backfill edilir).
  let dismissedMap = new Map();
  try {
    const dismissedSnap = await fsGetDocs(fsCollection(db, 'users', uid, 'dismissedNotifications'));
    dismissedSnap.docs.forEach(d => dismissedMap.set(d.id, d.data() || {}));
  } catch (err) { /* koleksiyon yoksa sorun degil */ }
  const existingIds = new Set();
  const result = [];
  // Admin duyurulari senkrona dokunulmaz: korunur, okunmamislar sonuca eklenir
  // (yonetim notificationsView + adminView uzerinden yapilir).
  for (const ed of existingSnap.docs) {
    const pd = ed.data() || {};
    if (pd.category === 'admin_message' && !desired.has(ed.id)) {
      existingIds.add(ed.id);
      if (pd.read !== true) result.push({ id: ed.id, ...pd, read: false });
    }
  }

  // Tüm yazımlar (silme/güncelleme/ekleme) tek writeBatch ile gönderilir:
  // N ayrı istek yerine 1 istek (Firebase istek hacmini düşük tutar).
  const batch = fsWriteBatch(db);
  let batchOps = 0;

  for (const ed of existingSnap.docs) {
    if (existingIds.has(ed.id)) continue;
    existingIds.add(ed.id);
    const data = desired.get(ed.id);
    if (!data) {
      // Kayıt silindi veya tarih 30 gün ötesine alındı → bildirim temizle
      batch.delete(ed.ref);
      batchOps++;
      continue;
    }
    const prev = ed.data();
    // Eşik geçişi (30→15→7→3→0→expired) veya kullanıcı tarih değişikliği
    // (bitiş / son geçerlilik / son ödeme): bildirim yeniden aktifleşir —
    // okundu sıfırlanır, updatedAt tazelenir → yeni eşikte tekrar pop.
    // Aynı eşik içinde gün sayacı değişirse (örn. 15→14) sadece sayaç/mesaj
    // sessizce tazelenir; okundu durumu ve updatedAt korunur → tekrar pop YOK.
    const levelChanged = prev.level !== data.level;
    const dateChanged = (prev.endDate || '') !== (data.endDate || '');
    const daysChanged = (prev.daysLeft ?? null) !== (data.daysLeft ?? null);
    const reactivated = (levelChanged || dateChanged) && prev.read === true;
    if (levelChanged || dateChanged) {
      batch.update(ed.ref, {
        daysLeft: data.daysLeft,
        level: data.level,
        message: data.message,
        endDate: data.endDate,
        updatedAt: data.updatedAt,
        ...(reactivated ? { read: false } : {})
      });
      batchOps++;
    } else if (daysChanged) {
      // Eşik değişmedi: sayaç/metni güncel tut, bildirimi tekrar aktif etme.
      batch.update(ed.ref, {
        daysLeft: data.daysLeft,
        message: data.message
      });
      batchOps++;
    }
    // result öğesinde depolanan alanlar korunur; updatedAt yalnızca gerçekten
    // değişince yenilenir (aksi halde her turda tekrar pop tetiklenir)
    const significantChange = levelChanged || dateChanged;
    result.push({
      ...data,
      read: reactivated ? false : (prev.read === true),
      createdAt: prev.createdAt,
      updatedAt: significantChange ? data.updatedAt : prev.updatedAt
    });
  }

  for (const [id, data] of desired) {
    if (existingIds.has(id)) continue;
    const seal = dismissedMap.get(id);
    if (seal) {
      if (seal.level === undefined || seal.level === null) {
        // Eski (alanasız) mühür: bulunduğu eşike backfill edilir, bu tur susturulur.
        batch.update(fsDoc(db, 'users', uid, 'dismissedNotifications', id), {
          level: data.level,
          endDate: data.endDate || ''
        });
        batchOps++;
        continue;
      }
      const sameSeal = seal.level === data.level && (seal.endDate || '') === (data.endDate || '');
      if (sameSeal) continue; // kullanici bu esikte sildi -> yeniden uretme
      // Esik veya bitiş tarihi değişti -> mühür kaldırılır, bildirim yeniden gelir
      batch.delete(fsDoc(db, 'users', uid, 'dismissedNotifications', id));
      batchOps++;
    }
    batch.set(fsDoc(db, 'users', uid, 'notifications', id), {
      ...data,
      read: false,
      createdAt: new Date().toISOString()
    });
    batchOps++;
    result.push({ ...data, read: false });
  }

  if (batchOps > 0) await batch.commit();

  result.sort((a, b) => a.daysLeft - b.daysLeft);
  // Teşhis: taramanın çalıştığını ve ne bulduğunu konsolda göster
  console.info(`[appGaraj] Bildirim taraması: ${result.length} hatırlatıcı (${result.filter(n => !n.read).length} okunmamış).`);
  notifyNewNotifications(result, uid);
  return result;
}

export async function getNotifications(uid) {
  const snap = await fsGetDocs(fsCollection(db, 'users', uid, 'notifications'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  return list;
}

export async function markNotificationRead(uid, notifId) {
  await fsUpdateDoc(fsDoc(db, 'users', uid, 'notifications', notifId), { read: true });
}

export async function markAllNotificationsRead(uid) {
  const snap = await fsGetDocs(fsCollection(db, 'users', uid, 'notifications'));
  const unread = snap.docs.filter(d => d.data().read !== true);
  if (unread.length === 0) return; // yazılacak değişiklik yok → istek atma
  const batch = fsWriteBatch(db); // tek istek (ayrı updateDoc'lar yerine)
  unread.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}

/**
 * Tek bildirimi siler. Silinen hatırlatıcı bir sonraki senkron turunda
 * yeniden üretilmemesi için `dismissedNotifications/{id}` altına mühürlenir;
 * admin duyuruları (`admin_message`) için mühür gerekmez (kaynaktan türemez).
 * Firestore kurali: notifications altinda delete sahibi/admin serbest.
 */
export async function deleteNotification(uid, notifId) {
  if (!uid || !notifId) throw new Error('Kullanıcı ve bildirim zorunludur.');
  const ref = fsDoc(db, 'users', uid, 'notifications', notifId);
  let data = null;
  try {
    // Tek belge okuma: koleksiyon taramasi YOK (onceki tam getDocs yerine getDoc).
    const snap = await fsGetDoc(ref);
    if (snap.exists()) data = snap.data();
  } catch (err) { /* okuma basarisizsa yine de silmeyi dene */ }
  await fsDeleteDoc(ref);
  if (data && data.category !== 'admin_message') {
    try {
      // Mühür seviye/tarih kapsamlıdır: aynı eşik+bitiş için susturur; eşik
      // değişince (15/7/3 gün) veya tarih yenilenince bildirim yeniden gelir.
      await fsSetDoc(fsDoc(db, 'users', uid, 'dismissedNotifications', notifId), {
        dismissedAt: new Date().toISOString(),
        category: data.category || null,
        level: data.level ?? null,
        endDate: data.endDate || null
      }, { merge: true });
    } catch (err) {
      console.warn('Silme mühürü yazılamadı:', err);
    }
  }
  document.dispatchEvent(new CustomEvent('notifications:updated'));
}

/**
 * Admin duyurusu gonderir: users/{uid}/notifications altina `admin_message`
 * kategorili kayit yazar. Okunmamis kayit rozette/sayfada gorunur; uygulama
 * kapaliyken Cloudflare Worker bunu FCM push olarak gonderir.
 * Firestore kurali: create admin ise serbest (isAdmin).
 */
export async function sendAdminMessage(uid, title, message) {
  const cleanTitle = String(title || '').trim().slice(0, 80);
  const cleanMsg = String(message || '').trim().slice(0, 500);
  if (!uid || !cleanTitle || !cleanMsg) throw new Error('Alici, baslik ve mesaj zorunludur.');
  const now = new Date().toISOString();
  const id = `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await fsSetDoc(fsDoc(db, 'users', uid, 'notifications', id), {
    userId: uid,
    category: 'admin_message',
    title: cleanTitle,
    message: cleanMsg,
    level: '30',
    daysLeft: null,
    endDate: now.slice(0, 10),
    garageId: null,
    vehicleId: null,
    plate: null,
    read: false,
    updatedAt: now,
    createdAt: now
  });
  document.dispatchEvent(new CustomEvent('notifications:updated'));
  return id;
}
