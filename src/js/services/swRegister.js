// sw-register.js — PWA Service Worker kaydı (Spark: push/FCM YOK, yalnızca kurulum + çevrimdışı)
// v1.4.10: erken kayıt + updateViaCache:'none' (bayat SW betiği yok) + controllerchange
// reload (sürüm karışımı yok) + sekmeye dönüşte reg.update (kurulum denetimi güncel).
if ('serviceWorker' in navigator) {
  const reg = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((r) => {
      try {
        if (r && typeof r.update === 'function') {
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) r.update().catch(() => {});
          });
        }
      } catch (err) { /* yoksay */ }
    }).catch((err) => {
      console.warn('Service Worker kaydı başarısız:', err);
    });
  };
  // Kayıt 'load' beklenmeden hemen yapılır (kurulabilirlik denetimi erken başlasın).
  if (document.readyState === 'complete') reg();
  else window.addEventListener('load', reg);
  // Yeni SW devralınca tek seferlik reload (sürüm karışımı / "başlatılamadı" engellenir).
  try {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  } catch (err) { /* yoksay */ }
}
