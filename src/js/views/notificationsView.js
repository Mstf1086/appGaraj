import { auth } from "../services/firebase.js";
import { createNavbar } from "../services/authHelper.js";
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
  isBrowserNotificationSupported, getNotificationPermission, requestNotificationPermission,
  popUnreadBrowserNotifications
} from "../services/notificationService.js";
import {
  isPushSupported, isVapidConfigured, registerPushToken, initForegroundPush
} from "../services/fcmService.js";
import { el, clearElement } from "../services/dom.js";

export async function renderNotificationsView(container, navigate) {
  const user = auth.currentUser;
  if (!user) {
    navigate('login');
    return;
  }

  clearElement(container);

  const navbar = await createNavbar(user, 'notifications', navigate);

  const sectionHeader = el('div', { className: 'section-header' }, [
    el('h1', {}, ['Bildirimlerim'])
  ]);

  const globalError = el('div', { className: 'error-message hidden' });

  const listContainer = el('div', { id: 'notifications-list-container', className: 'notif-page-list' }, [
    el('div', { className: 'loading-screen loading-screen-short' }, ['Bildirimler yükleniyor...'])
  ]);

  // Tarayıcı bildirimi izin durumu kutusu
  let latestList = null; // son yüklenen bildirim listesi (izin verilince anında pop için)
  const permBanner = el('div', { id: 'notif-perm-banner', className: 'notif-perm-banner' });

  const renderPermBanner = () => {
    permBanner.replaceChildren();
    // VAPID henüz girilmediyse: kurulum bekleniyor (worker/README.md adım 2)
    const vapidOk = isVapidConfigured();
    const perm = getNotificationPermission();
    if (!isBrowserNotificationSupported()) {
      permBanner.className = 'notif-perm-banner notif-perm-unsupported';
      permBanner.appendChild(el('span', {}, ['Bu tarayıcı bildirimleri desteklemiyor.']));
      return;
    }
    if (perm === 'granted') {
      permBanner.className = 'notif-perm-banner notif-perm-granted';
      permBanner.appendChild(el('span', {}, [
        vapidOk
          ? '✅ Bildirimler açık — hatırlatıcılar bu cihazda ve (kayıtlıysa) telefonunuzda gösterilecek.'
          : '✅ Tarayıcı bildirimleri açık — hatırlatıcılar bu cihazda gösterilecek. (Uygulama açıkken)'
      ]));
      // Token yeniden kaydı (plan.md 5.3): çıkışta token silinir; izin önceden
      // verilmişse push kaydı düşmemiş olabilir — tek giriş noktası bu butondur.
      if (vapidOk) {
        let hasToken = false;
        try { hasToken = !!localStorage.getItem('fcm_token'); } catch (err) { /* yoksay */ }
        permBanner.appendChild(el('span', {}, [
          hasToken ? 'Push kaydı aktif.' : 'Push kaydı yok — arka plan bildirimi için kaydı yenileyin.'
        ]));
        const reBtn = el('button', { className: 'btn btn-secondary btn-sm' }, ['Push kaydını yenile']);
        reBtn.addEventListener('click', async () => {
          reBtn.disabled = true;
          try {
            if (await isPushSupported()) {
              const res = await registerPushToken(user.uid);
              if (res.ok) {
                initForegroundPush();
                renderPermBanner();
                if (latestList && latestList.length > 0) popUnreadBrowserNotifications(latestList, user.uid);
                return;
              }
              globalError.textContent = 'Push kaydı başarısız (' + (res.reason || 'bilinmiyor') + ').';
              globalError.classList.remove('hidden');
            } else {
              globalError.textContent = 'Bu tarayıcı push desteklemiyor.';
              globalError.classList.remove('hidden');
            }
          } catch (err) {
            console.warn('Push kaydı yenilenemedi:', err);
          } finally {
            reBtn.disabled = false;
          }
        });
        permBanner.appendChild(reBtn);
      }
      return;
    }
    if (perm === 'denied') {
      permBanner.className = 'notif-perm-banner notif-perm-denied';
      permBanner.appendChild(el('span', {}, [
        '⛔ Bildirimler engellendi. Açmak için tarayıcı adres çubuğundaki kilit/ayarlar menüsünden bildirim iznini "İzin ver" yapın.'
      ]));
      return;
    }
    // 'default' → izin henüz istenmemiş
    permBanner.className = 'notif-perm-banner notif-perm-default';
    const info = el('span', {}, [
      vapidOk ? 'Telefonunuza da hatırlatıcı bildirimi almak ister misiniz?'
              : 'Bu cihazda hatırlatıcı bildirimi almak ister misiniz?'
    ]);
    const btn = el('button', { className: 'btn btn-primary btn-sm' }, ['Bildirimleri Etkinleştir']);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      let pushTried = false;
      try {
        if (vapidOk && await isPushSupported()) {
          pushTried = true;
          const res = await registerPushToken(user.uid);
          if (res.ok) initForegroundPush();
          if (!res.ok && res.reason && res.reason !== 'default') {
            globalError.textContent = 'Push kaydı başarısız (' + res.reason + '); tarayıcı bildirimi deneniyor.';
            globalError.classList.remove('hidden');
          }
        }
      } catch (err) {
        console.warn('Push kaydı atlandı, tarayıcı bildirimi kullanılacak:', err);
      }
      // registerPushToken izni KENDİSİ ister; push denendiyse ikinci istek gesture
      // tüketir (plan.md 5.3). Yalnızca push yolu denenmediyse doğrudan izin iste.
      const result = pushTried ? getNotificationPermission() : await requestNotificationPermission();
      renderPermBanner();
      if (result === 'granted') {
        // İzin yeni verildi: bekleyen okunmamış hatırlatıcıları anında düşür
        if (latestList && latestList.length > 0) {
          popUnreadBrowserNotifications(latestList, user.uid);
        }
      }
    });
    permBanner.appendChild(info);
    permBanner.appendChild(btn);
  };
  renderPermBanner();

  const mainContent = el('div', { className: 'main-content' }, [
    sectionHeader,
    permBanner,
    globalError,
    listContainer
  ]);

  container.appendChild(navbar);
  container.appendChild(mainContent);

  const refresh = async () => {
    try {
      const list = await getNotifications(user.uid);
      latestList = list;
      listContainer.replaceChildren();
      renderNotifList(listContainer, list, user.uid, refresh, navigate);
    } catch (err) {
      globalError.textContent = 'Bildirimler yüklenirken hata oluştu: ' + err.message;
      globalError.classList.remove('hidden');
    }
  };

  await refresh();

  // İzin zaten verilmişse: açılışta bekleyen okunmamışları (bu sekme oturumunda
  // henüz düşürülmemiş olanları) anında masaüstüne düşür — senkron beklemeden.
  if (isBrowserNotificationSupported() && getNotificationPermission() === 'granted' && latestList) {
    popUnreadBrowserNotifications(latestList, user.uid);
  }
}

function renderNotifList(container, list, uid, refresh, navigate) {
  const headerBar = el('div', { className: 'notif-page-header' }, [
    el('span', { className: 'notif-page-summary' }, [
      `${list.length} bildirim • ${list.filter(n => !n.read).length} okunmamış`
    ]),
    el('button', { className: 'btn btn-secondary btn-sm' }, ['Tümünü okundu işaretle'])
  ]);
  container.appendChild(headerBar);

  headerBar.querySelector('button').addEventListener('click', async () => {
    await markAllNotificationsRead(uid);
    document.dispatchEvent(new CustomEvent('notifications:updated'));
    await refresh();
  });

  if (list.length === 0) {
    container.appendChild(el('div', { className: 'empty-state' }, [
      el('h3', {}, ['Bildirim bulunmuyor.']),
      el('p', {}, ['Son 30 gün içinde biten sigorta veya muayene kaydınız yok.'])
    ]));
    return;
  }

  list.forEach(n => {
    const item = el('div', {
      className: `notif-item notif-level-${n.level} ${n.read ? 'notif-read' : 'notif-unread'}`,
      dataset: { id: n.id }
    }, [
      el('div', { className: 'notif-item-top' }, [
        el('strong', { className: 'notif-item-title' }, [n.title || 'Hatırlatıcı']),
        n.read ? null : el('span', { className: 'notif-unread-dot' })
      ]),
      el('div', { className: 'notif-item-msg' }, [n.message || '']),
      el('div', { className: 'notif-item-date' }, [`Bitiş: ${n.endDate || '-'}`]),
      el('div', { className: 'btn-row notif-item-actions' }, [
        n.category === 'admin_message' ? null
          : el('button', { className: 'notif-item-goto btn btn-primary btn-sm' }, ['→ Araç Detayına Git']),
        n.read ? null : el('button', { className: 'notif-item-read btn btn-secondary btn-sm' }, ['Okundu işaretle']),
        el('button', { className: 'notif-item-delete btn btn-danger btn-sm' }, ['Sil'])
      ])
    ]);
    container.appendChild(item);

    item.querySelector('.notif-item-goto')?.addEventListener('click', async () => {
      if (!n.read) {
        try {
          await markNotificationRead(uid, n.id);
        } catch (err) {
          console.error('Bildirim okundu olarak işaretlenemedi:', err);
        }
        document.dispatchEvent(new CustomEvent('notifications:updated'));
      }
      navigate(`vehicleDetail?garageId=${n.garageId}&vehicleId=${n.vehicleId}`);
    });

    const readBtn = item.querySelector('.notif-item-read');
    if (readBtn) {
      readBtn.addEventListener('click', async () => {
        await markNotificationRead(uid, n.id);
        document.dispatchEvent(new CustomEvent('notifications:updated'));
        await refresh();
      });
    }

    item.querySelector('.notif-item-delete').addEventListener('click', async () => {
      if (!confirm('Bu bildirimi silmek istediğinize emin misiniz?')) return;
      try {
        await deleteNotification(uid, n.id);
      } catch (err) {
        alert('Bildirim silinemedi: ' + err.message);
        return;
      }
      document.dispatchEvent(new CustomEvent('notifications:updated'));
      await refresh();
    });
  });
}