const APP_VERSION = '1.4.10';

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
    alert(`Uygulama yeni sürüme (v${APP_VERSION}) güncellendi.`);
    localStorage.setItem('app_version', APP_VERSION);
    // v1.4.10: swRegister.js 'controllerchange'de zaten reload yapar; burada çift
    // reload'u önlemek için bayrak + cache silinmesi bitmeden reload YOK.
    if (window.__appVersionReloading) return;
    window.__appVersionReloading = true;
    if ('caches' in window) {
      caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))).catch(() => {}).finally(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }
}
