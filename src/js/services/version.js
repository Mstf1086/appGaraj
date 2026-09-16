const APP_VERSION = '1.0.11';

function clearAllCookies() {
  const cookies = document.cookie.split(";");
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const eqPos = cookie.indexOf("=");
    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
  }
}

export function checkAppVersion() {
  const footerEl = document.getElementById('footer-version');
  if (footerEl) {
    footerEl.textContent = `Sürüm v${APP_VERSION}`;
  }

  const storedVersion = localStorage.getItem('app_version');
  if (!storedVersion) {
    localStorage.setItem('app_version', APP_VERSION);
    return;
  }
  if (storedVersion !== APP_VERSION) {
    alert(`Uygulama yeni sürüme (v${APP_VERSION}) güncellendi. Site belleği, çerezler ve önbellek temizlenerek sayfa yenileniyor.`);
    const firebaseAuthKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('firebase:') || key.includes('firebase'))) {
        firebaseAuthKeys.push({ key, value: localStorage.getItem(key) });
      }
    }

    localStorage.clear();
    sessionStorage.clear();
    clearAllCookies();

    firebaseAuthKeys.forEach(item => {
      localStorage.setItem(item.key, item.value);
    });

    localStorage.setItem('app_version', APP_VERSION);

    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }

    window.location.reload();
  }
}
