# Garaj Yonetim Uygulamasi - Proje Plani, Teknik Mimari ve Sema

> **PROJENIN BEYNI:** Bu dosya projenin tek dogruluk kaynagidir (mimari, veri modeli,
> guvenlik politikasi, bildirim mantigi, plan ksitlari). Kod kararlari buradaki
> sartlara/yapiya gore verilir. Bu dosyayla kullanici istegi celisirse celiski
> belirtilir, buradaki kural esas alinir ve kullanicidan onay istenir. Bu dosyayi
> degistiren her iste ilgili bolum ayni gorevde guncellenir.
>
> **Belge surumu:** v1.4.10 ile senkron (2026-09-29). Kod referanslarindaki satir
> numaralari yaklasiktir; sembol/fonksiyon adlari norma baglayicidir.

## 0. Proje Kisitlari (degistirilemez onay olmadan)

### 0.1 Firebase plani: Spark (ucretsiz)
- **Blaze GEREKTIREN hicbir sey kullanilmaz:** Cloud Functions (Scheduler dahil),
  FCM Admin SDK, sunucu-tarafli VAPID/token altyapisi (Firebase tarafinda) yasaktir.
- FCM gonderimi yalnizca harici **Cloudflare Worker**'dan yapilir (`worker/`, bkz. Bolum 6).
- **KULLANILMAYANLAR:** `onSnapshot` (gercek-zamanli dinleyici), `innerHTML/outerHTML`,
  JS-ici `style` atamasi, `unload` dinleyicisi, istemci-tarafli otomatik rol atama
  ("ilk kullanici admin" mantigi kaldirilmistir).

### 0.2 Arka plan push istisnasi (onayli tek istisna)
- `worker/index.js` (497 satir) Firestore REST + FCM HTTP v1 ile gonderim yapar;
  Firebase tarafi Spark'ta kalir. Kurulum: `worker/README.md`.
- FCM istemci kaydi zorunludur: `fcmService.js` + `public/firebase-messaging-sw.js`
  + `VAPID_KEY` (FCM destegi yoksa uygulama yine de Browser Notification ile calisir).
- **Canli durum:** Worker yayinda
  (`appgaraj-push-worker.m-erguven1086.workers.dev`), cron `0 6 * * *`
  (`worker/wrangler.toml` -> 06:00 UTC = 09:00 TSI); secret'lar (`SERVICE_ACCOUNT_JSON`,
  `TEST_SECRET`) Cloudflare'de tanimli.
- Test sozlesmesi: `GET /test-push?uid=...&secret=...` ->
  `{"ok":true,"reminders":N,"pushes":M,"sent":K}`; secretsiz `401`, `uid`'siz `400`.

### 0.3 Iki katmanli bildirim mimarisi
- Uygulama acikken: istemci-ici senkron (`syncNotifications` -> `users/{uid}/notifications`
  + Browser Notification API + navbar rozeti + Badging API). Bkz. Bolum 5.
- Uygulama kapaliyken: Worker push'u (FCM). Her iki katmanda da tek dogruluk kaynagi
  `users/{uid}/notifications` koleksiyonudur; istemci ve Worker birbirinin kayitlarini
  bozmaz (admin kayitlari her iki tarafta da korunur).
- **Gosterim savunma zinciri (v1.4.9):** on plan gosterimi her yerde uc adimli:
  `new Notification` -> `TypeError` ise FCM SW registration `showNotification` ->
  hala yoksa `/` scope `sw.js` registration `showNotification`. Ortak uygulama:
  `notificationService.showBrowserNotification` + `fcmService.showPushNotification`.
  (Android Chrome'da sayfa-baglami `new Notification` kurucusu firlatir; Firefox'ta
  kurucu calisir - cihazlar arasi farkin tek kaynagi budur.)
- **Badge gercegi (v1.4.9):** Badging API (`setAppBadge`) yalnizca masaustu Chrome/Edge
  ve Safari'de var; **Chrome Android + Firefox'ta `navigator.setAppBadge` TANIMLIDIR**.
  Android'de uygulama ikonundaki sayac push bildiriminin OS rozetinden gelir -> push
  sarttir. tum `setAppBadge` cagrilari `.catch(()=>{})` ile kapatilir (izin reddi async
  patlamaz); destek yoksa tek seferlik `console.info`.

### 0.4 Surum senkronu (4 dosya, birlikte bump edilir)
| # | Dosya | Sembol | Su anki deger |
|---|-------|--------|---------------|
| 1 | `package.json` | `version` | `1.4.10` |
| 2 | `src/js/services/version.js` | `APP_VERSION` | `'1.4.10'` |
| 3 | `index.html` | `#footer-version` | `Surum v1.4.10` |
| 4 | `public/sw.js` | `CACHE_NAME` | `'appgaraj-v1-4-10'` |
- `checkAppVersion()`: footer yazimi + `localStorage:app_version` karsilastirmasi;
  surum degismisse alert + tum cache'lerin silinmesi + reload. Bu dosyadaki `vX.Y.Z`
  ibareleri ayni iste guncellenir. (Eski metindeki "3 dosya" ifadesi hatalidir; dogrusu 4.)

### 0.5 Veri akisi yasagi ve olay veriyolu
- `onSnapshot` hicbir yerde kullanilmaz; veri akisi sunlardir:
  (a) `dataCache.js` tek-gecisli oturum onbellegi (`ensureUserData` + cerrahi
  `cacheSet*/cacheDelete*`), (b) sayfa acilisindaki `getDocs` taramalari,
  (c) belge-ici olay veriyolu: `records:changed` (CRUD sonrasi force rozet senkronu),
  `notifications:updated` (rozet/sayfa tazeleme), `visibilitychange` (sekmeye donus),
  `pagehide` (zamanlayici temizligi). `unload` Permissions-Policy tarafindan
  engellendigi icin YASAKTIR (`authHelper.js`).
---

## 1. Genel Bilgiler ve Teknoloji Yigini

### 1.1 On Yuz (Frontend): Vanilla JS SPA (Vite 8.3.0)
- Saf JavaScript (ES6+), moduler SPA; `src/css/style.css` (~2001 satir) tum bicimlendirme.
- Masaustu icerik kabugu: `.main-content` taban kurali `max-width:1200px; margin:0 auto;
  padding:1.5rem 2rem 3rem` (ortalanmis konteyner + kenar bosluklari); `.section-header`
  taban kurali flex satir. <=768px media query bu degerleri ezer (mobil bosluklar).
- Router (`src/js/app.js`, 116 satir): History API (`pushState`/`popstate`);
  query destegi: `cleanRoute.split('?')` + `URLSearchParams`
  (ornek: `vehicleDetail?garageId=..&vehicleId=..`). Bilinmeyen rota -> `login`.
- Auth guard (`onAuthStateChanged`): girissizken korumali rotalar
  (`dashboard, profile, vehicleDetail, admin, notifications`) -> `login`;
  girisliyken `login/register/forgot` (+ bos path) -> `dashboard`.
  Giriste `ensureUserData(uid)` yangin-ve-unut (fire-and-forget) baslatilir;
  cikista `clearCache()` cagrilir. Hata siniri: try/catch + "Giris Sayfasina Git".
- Rota tablosu (8 gorunum):
| Rota | Dosya | Guard |
|------|-------|-------|
| `login` | `views/loginView.js` (84) | girisliyse dashboard |
| `register` | `views/registerView.js` (84) | girisliyse dashboard |
| `forgot` | `views/forgotView.js` (70) | girisliyse dashboard |
| `dashboard` | `views/dashboardView.js` (125) + `garageModule.js` + `vehicleModule.js` | giris sart |
| `vehicleDetail` | `views/vehicleDetailView.js` (666) | giris sart + query sart |
| `notifications` | `views/notificationsView.js` (205) | giris sart |
| `profile` | `views/profileView.js` (91) | giris sart |
| `admin` | `views/adminView.js` (215) | giris + `checkIsAdmin` sart |

### 1.2 Arka Yuz / Servisler (Backend / BaaS)
- Firebase Auth (e-posta/sifre, `browserLocalPersistence` + `inMemoryPersistence` yedegi),
  Cloud Firestore, Firebase Hosting (`garajportal` sitesi -> `garajportal.web.app`).
- Firebase JS SDK v10.14.1 (moduler import; compat yalnizca FCM SW'de).
  `services/firebase.js` (25 satir): tekil `auth`, `db` export'u.
- Proje kimligi: `projectId='garaj-53f16'`, `messagingSenderId='385181058461'`
  (istemci config + FCM SW + Worker `PROJECT_ID` ile ayni olmalidir).

### 1.3 Derleme ve dagitim (`vite.config.js`, `firebase.json`)
- `outDir: dist`, `sourcemap: false` (uretimde kapali, guvenlik geregi acilmaz),
  `copyPublicDir: true` (`public/` -> `dist` koku), `server/preview.port: 3000`.
- `manualChunks`: `node_modules/firebase` ayri chunk (~346 kB).
- `firebase.json`: `site='garajportal'`, `public='dist'`; rewrite SIRASI kritiktir:
  1. `/sw.js` -> `/sw.js`, 2. `/firebase-messaging-sw.js` -> ayni dosya,
  3. `**` -> `/index.html` (SPA catch-all). Ilk iki kural sondan once MUTLAKA tutulur,
  yoksa SW dosyalari `index.html` olarak sunulur ve kayit bozulur.
- Guvenlik basliklari (`**`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`, CSP:
  `default-src 'self'; script-src 'self' https://www.gstatic.com; worker-src 'self' blob:;`
  `style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;`
  `img-src 'self' data:;` Firebase/FCM/Installations/`securetoken` connect-src izinleri;
  `object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Bunlar kaldirilmaz (Bolum 3).

### 1.3.1 Firebase Emulator ortami (yerel test)
- `firebase.json > emulators`: auth `:9099`, firestore `:8080`, hosting `:5000`, ui `:4000`,
  `singleProjectMode: true`. `.firebaserc` varsayilan proje `garaj-53f16`.
- Firestore emulatoru `firestore.rules` dosyasini OTOMATIK yukler (kurallar emulatore
  gonderilir; degisiklik sonrasi emulatoru yeniden baslatmak yeterlidir).
- **`src/js/services/firebase.js`** emulator baglantisi yalnizca `import.meta.env.DEV`
  ve `VITE_USE_FIREBASE_EMULATORS=true` ikiside saglandiginda devreye girer
  (`connectAuthEmulator` -> `http://127.0.0.1:9099`, `connectFirestoreEmulator` ->
  `127.0.0.1:8080`). Uretim derlemesinde bu blok tree-shake edilir (bundle'da
  `connectAuthEmulator`/emulator mesaji YOK); gercek projeye (garaj-53f16) hicbir
  istek gitmez. Emulator modunda da `apiKey` gercek degerini kullanir (emulator her
  anahtari kabul eder) ama istekler `127.0.0.1` adresine gider.
- Komutlar:
  - `npm run emulators` -> tum emulatorler (UI dahil) arka planda; UI: `http://127.0.0.1:4000`
  - `npm run test:emulators` -> Auth + Firestore kurallari + Hosting testi (41 kontrol)
  - `npm run test:emulators:exec --ui` -> tek komut: emulatorlari baslat, test et, kapat
  - `npm run test:emulators:browser` -> puppeteer-core ile tarayici E2E (opsiyonel;
    `npm i -D puppeteer-core` gerekir, sistem chromium `/usr/bin/chromium`)
- Geliştirme: `VITE_USE_FIREBASE_EMULATORS=true npm run dev` -> uygulama emulatore baglanir.
- Emulator kurallari `firestore.rules` ile AYNI dosyadan okunur; testler kurallari
  gevsetmeden IDOR/rol-yukseltme senaryolarini dogrular (A/B/C kullanici, admin atamasi
  `Bearer owner` jetonu ile yapilir - gercekte Firebase Console).
- `tests/emulator-test.mjs` test oncesi Auth hesaplarini ve `users/` + `garages/`
  koleksiyonlarini temizler (yalnzca emulator verisi; `Bearer owner` jetonu ile).

### 1.4 PWA mimarisi (cift Service Worker)
- `public/manifest.webmanifest`: `name='Garaj Portal'`, `id/scope/start_url='/'`,
  `display='standalone'`, `orientation='portrait'`, ikonlar 192/512/maskable.
- `public/sw.js` (61 satir): yalnizca statik onbellek, surumlu `CACHE_NAME`
  (`appgaraj-v1-4-10`); push/FCM YOK. Strateji: navigate -> ag-oncelikli
  (`/index.html` + `/` birlikte tazelenir, YALNIZCA `res.ok` ise - hata sayfasi
  onbellegi zehirlemez; cevrimdisiysa onbellek); diger GET -> onbellek + arka-plan tazeleme.
- `public/firebase-messaging-sw.js` (62 satir): FCM arka plan SW (compat importScripts
  10.14.1); `onBackgroundMessage` -> `showNotification(title,{body,icon,badge,tag,data.route})`;
  `notificationclick` -> `/notifications` odaga alinir/acilir.
- Kayitlar cakismaz: `swRegister.js` PWA'yi `scope:'/'` + `updateViaCache:'none'` ile
  kaydeder; `visibilitychange`'de (gorunur) `reg.update()`; yeni SW devralinca
  `controllerchange` -> tek seferlik reload (surum karisimi yok). v1.4.10;
  `fcmService.js > getFcmRegistration()` once mevcut `firebase-messaging-sw` kaydini arar,
  yoksa dar scope (`'/firebase-messaging-sw.js'`) ile kaydeder (PWA SW'yi ezmez).
  v1.4.9: esleme `installing` registration'lari da kapsar; `getToken` oncesi kayit
  `active` olana kadar beklenir (aksi halde ilk acilista token alinamiyordu).
  FCM SW `install`'da `skipWaiting` yapar (`clients.claim` YOK - dar scope sayfalari
  sahiplenmez; ana SW claim yapar).

### 1.5 UI/UX ilkeleri
- **Sifir Popup / Sifir Modal:** kayan pencere/modal yok; ekleme/duzenleme/detay sayfa-ici
  inline form + akordeon (`inline-form-container`, `.active` ile acilir) ile yurutulur.
- **Duyarli tasarim:** mobil/tablet/masaustu uyumu; yatay tasma (overflow) engellenir.
- **Temiz raporlama (`@media print`):** yazdirma/PDF'te buton/navigasyon gizlenir;
  yalnizca rapor icerigi + `Rapor Olusturma Tarihi: tr-TR` damgasi cikar.
  Garaj raporu (`garageModule.js`) + arac raporu (`vehicleDetailView.js`) `window.print()` ile.
---

## 2. Veritabani ve Firestore Koleksiyon Semasi

```text
/garages
  {garageId}
    name: String (trim'li; bos ise yazilmaz)
    userId: String (sahip UID - sahiplik buradan dogrulanir)
    createdAt: String (ISO)
    /vehicles
      {vehicleId}
        brand, model: String (trim'li)
        plate: String (trim + toLocaleUpperCase('tr-TR'))
        userId: String (yazanin UID'si - IDOR kontrolu)
        createdAt: String (ISO)
        /{subcol} (7 KATEGORI - vehicleDetailView.js > categories[])
          traffic_insurance    (insurance: company*, policyNo*, startDate*, endDate*, amount*)
          casco                (insurance: ayni alanlar)
          traffic_fines        (fine: date*, dueDate, amount*, description*, status*)
          maintenance_repair   (maint: date*, service*, amount*, description*)
          periodic_maintenance (periodic: date*, km*, amount*, description*)
          vehicle_inspection   (insp: date*, endDate*, amount*, station*)
          exhaust_inspection   (insp: ayni alanlar)
          (* = formda required/zorunlu; bildirim izlemesine giren tarih alani icin Bolum 5)

/users
  {uid}  (Auth UID ile ayni ID; register akisinda setDoc ile olusturulur)
    email: String
    role: 'user' | 'admin'  (istemci yalnizca 'user' ile create edebilir; bkz. Bolum 3)
    createdAt: String (ISO)
    /notifications/{notifId}
      userId, category, categoryLabel, title, message
      level: '30'|'15'|'7'|'3'|'0'|'expired' (hatirlatici) | 'admin' (duyuru, Worker yazar)
      daysLeft: Number|null (admin'de null), endDate: String
      garageId, vehicleId, recordId, plate (admin'de null)
      read: Boolean, createdAt, updatedAt: String (ISO)
      sentLevel, pushSentAt: String (YALNIZCA Worker yazar - push tekrarini onler)
    /dismissedNotifications/{notifId}  (silme muhru: { dismissedAt: ISO, category,
      level, endDate } — seviye/tarih kapsamli; ayni esikte susturur, esik/tarih
      degisince yeniden hatirlatir; eski alanasiz muhurler sync'te backfill edilir)
    /fcmTokens/{token}  ({ token, platform: android|ios|web, enabled, lastSeenAt, createdAt })
```

### 2.1 Form semalari (vehicleDetailView.js > appendFormFields, ~75-129)
| Tip | Kategori | Alanlar (hepsi required belirtilmedikce) |
|-----|----------|------------------------------------------|
| `insurance` | traffic_insurance, casco | company(text), policyNo(text), startDate(date), endDate(date), amount(number) |
| `fine` | traffic_fines | date(kesilme, date), dueDate(son odeme, date, opsiyonel), amount(number), description(text), status(select: Odenmedi/Odendi) |
| `maint` | maintenance_repair | date(date), service(text), amount(number), description(text) — hepsi required |
| `periodic` | periodic_maintenance | date(date), km(number), amount(number), description(text) — hepsi required; `nextDate` YOK |
| `insp` | vehicle_inspection, exhaust_inspection | date(date), endDate(date), amount(number), station(text) — hepsi required |
- Kayit CRUD: `appendCategorySection`, `handleAddRecordSubmit` (addDoc + cacheSetRecord +
  `records:changed` dagitimi), `handleEditRecordSubmit` (updateDoc + cache + ayni olay),
  `handleDeleteRecord` (confirm + deleteDoc + cache + ayni olay).
- Dinleyiciler `sectionsContainer` uzerinde tek noktada (delegasyon); container sizintisi yok.
- Kategori basligi yalnizca ad (`cat.title`); `(N)` rozeti YOK. Bos listede
  `.sub-empty` + metin `Kayit bulunmuyor.`. Kayit adedi yalnizca arac raporunda:
  `${cat.title} (${cat.count} kayit)`.

### 2.2 Bildirim ID sozlesmesi (deterministik)
- Hatirlatici: `{vehicleId}_{kategoriKey}_{recordId}` - ayni kayit her turda ayni ID'yi
  uretir, `read` durumu korunur; kayit silinip YENIDEN eklenirse yeni `recordId` -> yeni ID.
- Admin duyurusu: `admin-{Date.now().toString(36)}-{rand36(6)}` - kaynaga bagli degil;
  istemci/Worker senkronu uretmez/silmez (korunur), yalnizca kullanici silebilir (muhursuz).
- `traffic_fines` + `status==='Odendi'` (veya `paid===true`) -> hatirlatilmaz (istemci + Worker
  ortak kurali; `syncUser` ic filtre + istemci `continue` ayni sarti uygular).

### 2.3 Firestore kurallari ozeti (firestore.rules, 86 satir; gevsetmek YASAK)
- `isAdmin()`: `users/{auth.uid}` var + `data.role == 'admin'` (cift exists/get okumasi).
- `users/{userId}`: read = sahip|admin (liste sizmaz); create = (sahip + kendi userId'si +
  `resource.role=='user'`) | admin; update/delete = yalnizca admin. "Ilk kullanici admin"
  mantigi YOK - admin Console'dan elle atanir.
- `notifications/{notifId}`: read/update/delete = sahip|admin; create = (sahip + `userId==userId`)
  | admin. `dismissedNotifications/{dismissId}`: read/create/delete = sahip|admin,
  **update = sahip|admin** (yalnizca muhurun `level`/`endDate` backfill'i; baskasi degistiremez).
  `fcmTokens/{tokenId}`: read/create/update/delete = sahip|admin.
- `garages/{garageId}`: read/update/delete = sahip (`resource.userId`) | admin;
  create = `auth.uid == resource.userId`. `vehicles/{vehicleId}`: read/update/delete =
  sahip|admin; create'te garaj sahipligi `get(garages/{garageId}).userId == auth.uid`
  + `resource.userId == auth.uid` (cift IDOR kontrolu).
  `/{subcol=**}` (7 alt koleksiyon): garaj sahibi | admin.
---

## 3. Guvenlik Politikasi (firestore.rules - 86 satir; gevsetmek YASAK)

### 3.1 XSS ve DOM guvenligi (mutlak yasaklar)
- `innerHTML / outerHTML` proje genelinde KULLANILMAMAKTADIR ve YASAKTIR
  (dogrulama: `grep -rn innerHTML src/` bos doner). Tum DOM uretimi guvenli native
  API'lerle: `document.createElement`, `textContent`, `setAttribute`, `classList`,
  `appendChild`/`replaceChildren` (`dom.js > el()`, `clearElement()`).
- `dom.js > el(tag, attrs, children)`: `className/dataset/on*/value` ozel islenir;
  `false/null/undefined` attribute yazilmaz (oz. `selected:false` bug onlenir);
  `true` icin attribute + property esitlenir; string/number cocuklar `createTextNode`.
- JS-ici stil YASAKTIR: `element.style.*` ve inline `style` attribute kullanilmaz
  (dogrulama: `grep -rn "\.style\." src/` yalnizca yorum satirinda gecer);
  bicimlendirme yalnizca `class/id/data-*` seciciler + `src/css/style.css` uzerinden.

### 3.2 Kimlik dogrulama ve rol yonetimi
- Firebase Auth oturum: `setPersistence(browserLocalPersistence)`, duserse
  `inMemoryPersistence` yedegi (`firebase.js`). E-posta/sifre disi saglayici yok.
- Rol dogrulama sunucu-oncelikli: `authHelper.js > checkIsAdmin(user)` once
  `getDocFromServer(users/{uid})`, duserse `getDoc` (onbellek) dener; sonuc 10 dk
  `adminRoleCache`'de tutulur (`ADMIN_ROLE_TTL = 10*60*1000`). Rol istemcide KARAR
  degil GORUNUM filtresidir; gercek yetki HER ISTEKTE `firestore.rules` ile zorlanir.
- Kayit akisi (`registerView.js`): `createUserWithEmailAndPassword` ->
  `sendEmailVerification()` (ALINIRSA KALDIRILMAZ - Bolum 0 kisiti) ->
  `getIdToken(true)` (auth yenileme) -> `setDoc(users/{uid},{email,role:'user',createdAt})`.
  Kural `role=='user'` disinda create'i reddeder (privilege escalation kapali).
- Sifre degisimi (`profileView.js`): `updatePassword` (min 6 karakter Firebase zorlar);
  rol salt-okunur gosterilir (`Standart Kullanici` / `Admin (Yonetici)`).
  Sifirlamada `sendPasswordResetEmail` (`forgotView.js`).
- Admin atama: SADECE Firebase Console'dan elle (`users/{uid}.role='admin'`);
  istemci kodu rol yazamaz (update/delete admin-only).

### 3.3 Veri koruma (uygulama + kural cift kati)
- Garaj silme: once `getCachedVehicles(gid).length` kontrolu; aracli garaj silinemez
  (`garageModule.js > delete-garage`); onbellek `cacheDeleteGarage` ile kaskad temizlenir.
- Arac silme: 7 kategoride kayit varsa silinemez
  (`vehicleModule.js > delete-vehicle` + `dataCache.js > hasAnyCachedRecords()`);
  once detaydan kayitlar silinmelidir. Onay `confirm()` ile alinir.
- IDOR: arac create kuralda garaj sahipligi `get()` ile dogrulanir; alt koleksiyonlarda
  her islemde garaj sahibi kontrolu vardir (`/{subcol=**}`).
- Liste gizliligi: `users` koleksiyon okumasi sahip|admin (toplu `getDocs(users)` SADECE
  admin ekraninda basarili olur; normal kullanicida kural reddeder).

### 3.4 Hosting ve derleme guvenligi
- Uretim sourcemap kapali (`sourcemap:false`) - acilmaz (Bolum 0).
- `firebase.json` basliklari kaldirilmaz: CSP/HSTS/X-Frame-Options/nosniff/
  Referrer/Permissions-Policy (bkz. 1.3). `SERVICE_ACCOUNT_JSON` repoya commitlenmez
  (`.gitignore`), yalnizca Worker secret'indadir; `/test-push` `TEST_SECRET` olmadan `401`.
- VAPID anahtari herkese aciktir (tasarim geregi, gizli degil); FCM token'lari
  kurallarla sahip/admin-only'dir; cikista `unregisterPushToken` token'i siler.
---

## 4. Moduler Dosya Yapisi (v1.4.10 snapshot)

```text
appGaraj/
  index.html                     # SPA kabugu; #app, footer#footer-version, /src/js/app.js
  vite.config.js                 # outDir:dist, sourcemap:false, manualChunks:firebase
  firebase.json                  # hosting garajportal + rewrite sirasi + guvenlik basliklari
  firestore.rules (86)           # Bolum 3; gevsetmek YASAK
  package.json (v1.4.10)         # firebase ^10.14.1, vite 8.3.0
  public/
    sw.js (61)                   # PWA onbellek SW; CACHE_NAME='appgaraj-v1-4-10'; push YOK;
                                 # navigate: yalnizca res.ok + '/'+'/index.html' ikili taze
    firebase-messaging-sw.js(62) # FCM arka plan SW (compat); tag'li showNotification +
                                 # renotify:true + data.unread -> setAppBadge (.catch) +
                                 # install skipWaiting
    manifest.webmanifest         # Garaj Portal; standalone; 192/512/maskable
    icons/                       # icon-192/512, maskable-512
  src/
    css/style.css (~2001)        # tek stil kaynagi; masaustu .main-content konteyneri +
                                 # responsive + @media print
    js/
      app.js (116)               # Router + guard + ensureUserData/clearCache + popstate
      services/
        firebase.js (25)         # tekil auth,db; persistence zinciri
        dataCache.js (159)       # SUBCOLLECTIONS[7]; Map garages/vehicles/records;
                                 # ensureUserData/getCached*/cacheSet*/cacheDelete*/hasAnyCachedRecords
        dom.js (39)              # el(tag,attrs,children), clearElement (replaceChildren)
        authHelper.js (285)      # checkIsAdmin(TTL 10dk) + createNavbar(rozet/badging/dropdown/
                                 # global tekil dinleyiciler + MIN 60sn/MAX 5dk senkron + cikis temizligi;
                                 # setAppBadge: desteksizde tek seferlik log + .catch)
        notificationService.js (435) # Bolum 5 (5 kategori + admin korumasi + tek writeBatch +
                                 # seviye/tarih kapsamli silme muhuru + savunma zinciri
                                 # (showNotificationChain) + tag+sessionStorage + CRUD yardimcilari)
        fcmService.js (241)      # VAPID_KEY; getMessagingAsync; isPushSupported;
                                 # getFcmRegistration(dar scope + installing eslesme +
                                 # active bekleme); register/unregisterPushToken;
                                 # initForegroundPush (tekil onMessage + Android icin SW
                                 # showNotification yedegi + data.unread rozet boya (.catch))
        swRegister.js (30)       # PWA SW kaydi scope '/'+updateViaCache none;
                                 # visibilitychange reg.update + controllerchange reload
        version.js (40)          # APP_VERSION + checkAppVersion (alert+flush+reload);
                                 # clearAllCookies() TANIMLI ama CAGRILMIYOR (cookie silinmez)
      views/
        loginView.js (84)        # signInWithEmailAndPassword; TR hata mesajlari
        registerView.js (84)     # createUser + sendEmailVerification + role:'user' setDoc
        forgotView.js (70)       # sendPasswordResetEmail; success/error kutulari
        dashboardView.js (125)   # garaj listesi kabugu; inline ekleme; loadGarages tetikler
        garageModule.js (394)    # garaj CRUD + rapor (toplam + arac dagilimi + print)
        vehicleModule.js (220)   # arac CRUD; kayitli arac silinemez; plaka upper-TR
        vehicleDetailView.js (666) # 7 kategori akordeon; form semalari; kayit CRUD; arac raporu
        notificationsView.js (243) # izin banner (granted/denied/default/unsupported +
                                 # VAPID dali + granted'da token durumu/yenile butonu);
                                 # liste (goto/read/delete); tumunu-okundu
        profileView.js (91)      # e-posta/rol salt-okunur; updatePassword
        adminView.js (215)       # rol kapisi; kullanici listesi (email+role update/delete);
                                 # duyuru paneli (alici select + 80/500 limit + ok/N ilerleme)
  worker/
    index.js (497)               # Bolum 6; PROJECT_ID='garaj-53f16'; scheduled+fetch
    wrangler.toml (7)            # name=appgaraj-push-worker; crons=['0 6 * * *']
    README.md                    # VAPID + service-account + wrangler secret + test adimlari
```

### 4.1 Merkezi onbellek (dataCache.js) - tek gecis + cerrahi guncelleme
- `state = { uid, garages:Map, vehicles:Map(gid->Map), records:Map(key->Map),
  loadedAt, loadingPromise }`; `SUBCOLLECTIONS` 7'li liste vehicleDetail ile aynidir.
- `ensureUserData(uid,{force})`: uid degismisse `clearCache`; `loadingPromise` varsa ayni
  promise paylasilir (cift tarama yok); `loadedAt` + `!force` ise ag'a gidilmez.
  Yukleme sirasi: `garages(userId==uid)` -> her garaj `vehicles(userId==uid)` ->
  her arac x 7 kategori `getDocs` (sirali; yazma sonrasi TAM TARAMA YOK).
- Salt-okuma: `getCachedGarages/Garage/Vehicles/Vehicle/Records`, `isCacheReady`,
  `getCacheUid`, `hasAnyCachedRecords` - hicbiri ag'a gitmez.
- Cerrahi yazma: `cacheSetGarage/DeleteGarage` (kaskad), `cacheSetVehicle/DeleteVehicle`,
  `cacheSetRecord/DeleteRecord` - gorunumler Firestore yazimindan HEMEN SONRA cagirir,
  ardindan `document.dispatchEvent(new CustomEvent('records:changed'))` dagitilir.

### 4.2 Navbar ve rozet dongusu (authHelper.js)
- `createNavbar(user, activePage, navigate)`: marka + admin linki (sarti `checkIsAdmin`) +
  avatar+rozet (`notif-badge`, `9+` tavan) + Bildirimlerim/Profil/Cikis dropdown.
- Global dinleyiciler modul omru boyunca BIR KEZ (`globalNotifListenersBound`):
  dis-tik dropdown kapatma; `notifications:updated` -> aktif rozet tazeleme;
  `visibilitychange` (gorunur + aktif baglam + ayni uid -> `run()`);
  `pagehide` -> zamanlayici iptali; `records:changed` -> `run({force:true})`.
- Rozet senkronu: `cachedUnread` ile aninda boya (isteksiz) -> `syncNotifications(uid)` ->
  `unread` say -> `paintBadge` + `setAppBadge` (Badging API; `.catch(()=>{})` - destek/izin
  yoksa sessiz; Bolum 0.3 badge gercegi: Android ikon sayaci push bildiriminin OS rozetinden).
  Debounce: `MIN_REFRESH_MS=60sn` (force bypass eder), `MAX_REFRESH_MS=5dk` (gorunur sekme
  ust siniri), `document.hidden` iken istek YOK, hata logu 60sn'de bir bastirilir.
- Tek aktif baglam (`activeBadgeSync = {uid,paint,run,schedule,cancel}`): her navbar
  kurulumunda onceki iptal edilir (dinleyici/paralel senkron birikmez).
- Cikis: `resetSeenNotifications()` + `cachedUnread=null` + `clearAppBadge()` +
  `unregisterPushToken(uid)` (sessiz) + `signOut` -> `login`. Token silme sarti
  KORUNUR (Bolum 0.2 temizlik); yeniden kayit Bolum 5.3'teki `granted` dalindaki
  "Push kaydini (yenile)" butonundan yapilir.
---

## 5. Bildirim Mantigi (iki katman, tek dogruluk kaynagi: users/{uid}/notifications)

### 5.1 Izlenen kategoriler ve esikler
| # | key | Etiket | Tarih alani | Ozel kural |
|---|-----|--------|-------------|------------|
| 1 | `traffic_insurance` | Trafik Sigortasi | `endDate` | - |
| 2 | `casco` | Kasko | `endDate` | - |
| 3 | `vehicle_inspection` | Arac Muayenesi | `endDate` | - |
| 4 | `exhaust_inspection` | Egzoz Muayenesi | `endDate` | - |
| 5 | `traffic_fines` | Trafik Cezasi | `dueDate` | `status==='Odendi'` veya `paid===true` ise ATLA |
- Izlenmeyenler: `maintenance_repair`, `periodic_maintenance` (tarihi gecse de hatirlatilmaz;
  yalnizca rapor/maliyet hesabina girer).
- Pencere: `EXPIRY_WINDOW_DAYS = 30` - `daysUntil > 30` veya tarih yok/bozuk (`null`) ise
  uretilmez. Esik anahtari `levelKey(days)`: `<0 -> 'expired'`, `0 -> '0'`,
  `<=3 -> '3'`, `<=7 -> '7'`, `<=15 -> '15'`, else `'30'`. Mesaj `expiryLabel(days)`:
  `expired -> 'Suresi N gun once doldu'`, `0 -> 'Bugun son gun!'`,
  `<=3/7/15 -> 'N gun kaldi (son 3/7/15 gun)'`, else `'N gun kaldi (son 30 gun)'`.
- Gun matematigi (istemci + Worker AYNI sonucu verir): `'YYYY-MM-DD'` ilk 10 karakter
  `Date.UTC(y,m-1,d)`; bugun UTC gece-yarisi cikarilir, `floor(fark/86400000)`.
  Istemci `new Date()` + yerel `getFullYear/getMonth/getDate` -> `Date.UTC`;
  Worker `getUTCFullYear/getUTCMonth/getUTCDate` -> `Date.UTC` (UTC-saf).
  Saat-dilimi kaymasi (TSI +-1 gun) boylece engellenir.

### 5.2 Istemci senkronu (notificationService.js > syncNotifications(uid))
1. `!isCacheReady() || getCacheUid()!==uid` ise `ensureUserData(uid)` (tek gecis;
   hazirsa SIFIR kayit-tarama istegi - yalnizca `notifications` + `dismissed` okunur).
2. Onbellekten `desired: Map<deterministikID, {...}>` kurulur (odenmis ceza / 30gun-disi
   / bozuk tarih atlanir; baslik `${label} — ${plate}`, uzun tire).
3. `dismissedNotifications` muhurleri okunur (yoksa bos `Map()`); muhur SEVYE/
   TARIH kapsamlidir (`{dismissedAt,category,level,endDate}`) ve diff'te (adim 5)
   degerlendirilir; okuma basarisizsa sorun degil sayilir.
4. Mevcut `notifications` okunur: `category==='admin_message'` kayitlar korunur
   (okunmamissa sonuca eklenir, `read:false` normalizasyonu ile); ASLA silinmez/uretilmez.
5. Diff tek `writeBatch` ile (N istek yerine 1): istenmeyene `batch.delete`; esik/tarih
   degisene `batch.update({daysLeft,level,message,endDate,updatedAt[,read:false]})`;
   sayac-sadece degisene (`daysLeft` farkli, esik ayni) `batch.update({daysLeft,message})`
   (okundu + `updatedAt` korunur -> tekrar pop YOK); var olmayan (yeni) muhur
   denetiminden gecer: ayni `level`+`endDate` muhru icindeyse sustur; farkliysa
   muhuru `batch.delete` + `batch.set({...data,read:false,createdAt})` (yeniden gelir);
   `level`/`endDate`siz eski muhuru `batch.update(muhur,{level,endDate})` backfill +
   bu tur sustur. `batchOps>0` ise `commit()`.
6. Yeniden-aktivasyon: `levelChanged || dateChanged` + `prev.read===true` ise `read:false`
   + `updatedAt` tazelenir -> yeni esikte tekrar pop; sonuc sirali (`daysLeft` artan),
   konsola `[appGaraj] Bildirim taramasi: N hatirlatici (M okunmamis).`,
   ardindan `notifyNewNotifications(result, uid)`.
7. Tetikleme: navbar rozet dongusu (60sn debounce, 5dk ust sinir, gizli sekmede istek yok),
   `records:changed` (CRUD sonrasi `force:true`), `visibilitychange` (sekmeye donus).
8. Rozet: `syncNotifications` sonucu okunmamis sayisi avatar rozeti +
   `setAppBadge()` (`.catch(()=>{})`; Bolum 0.3 badge gercegi);
   `notifications:updated` olayiyla tazelenir. `markNotificationRead/markAllNotificationsRead`
   (tek batch) ve `getNotifications()` (okuma + `daysLeft` sirali) sayfa tarafindadir.

### 5.3 Tarayici bildirimi (Browser Notification API, sekme-oturumu korumali)
- `isBrowserNotificationSupported/getNotificationPermission/requestNotificationPermission`
  (kullanim `notificationsView.js` izin banner'indadir; istek kullanici tiklamasi icinde).
- `shouldPopNotification(n, uid)`: `Notification.permission==='granted'` +
  `!n.read` + `category!=='admin_message'` + `sessionStorage:seen_notifs_{uid}`'de
  `{id:updatedAt}` eslesmiyorsa (yeni/esik-degismis) `true`.
- `notifyNewNotifications(list, uid)`: uygunlara `showBrowserNotification` (Bolum 0.3
  savunma zinciri: `new Notification` -> TypeError -> FCM SW reg -> `sw.js` reg;
  `tag` ayni ID'nin ust uste yigilmasini onler); tiklama -> `focus()` + `/notifications`;
  basarili/engelli her deneme `popped_notifs_{uid}`'ye islenir (sekme oturumunda tekrar YOK;
  sekme kapaninca sifirlanir -> bekleyenler yeni oturumda tekrar duser).
  `popUnreadBrowserNotifications()`: izin yeni verildiyse bekleyenleri aninda dusurur.
- FCM on-plan (`fcmService.js > initForegroundPush`, tekil): `onMessage` ->
  `data.unread` -> `setAppBadge` (ikon sayisi aninda) + bildirim gosterimi:
  once `new Notification(title,{body,tag:messageId,icon})`; Android'de kurucu
  firlatirsa FCM SW registration `showNotification` yedegi (renotify:true -> sesli);
  tiklama -> `/notifications`; her alimda `notifications:updated` dagitilir.
  Arka plan SW (`firebase-messaging-sw.js`): `data.unread` -> `self.navigator.setAppBadge`
  (yuklu uygulama ikon rozeti) + `showNotification(...,renotify:true)` (varsayilan ses).
  Izin/banner akisi `notificationsView.js`: `unsupported/denied/granted/default`
  dallari + VAPID dali; `default` -> `registerPushToken` (izin istegini KENDISI yapar;
  ikinci `requestNotificationPermission` cagrisi KALDIRILDI - gesture tuketme riski);
  `granted` -> token durumu (`localStorage:fcm_token`) + "Push kaydini (yenile)"
  butonu (`registerPushToken` + `initForegroundPush`): cikistan sonra yeniden
  kayidin TEK giris noktasi (Bolum 4.2 cikis sartiyla uyumlu).

### 5.4 Admin duyurulari (adminView.js + notificationService.js > sendAdminMessage)
- UI: alici select (tek kullanici + `Tum kullanicilar`, `loadUsers()` donusunden beslenir),
  baslik (maxLength 80, slice 80) / mesaj (rows 3, maxLength 500, slice 500) inputlari,
  ilerleme durumu (`ok/N`,tum-secimde hata paylasimli sayac; kismi basari `alert`).
  Yazma yetkisi kuraldan gelir: admin `users/*/notifications` altina `create` serbesttir.
- Kayit (`sendAdminMessage`): `{userId, category:'admin_message', title, message,
  level:'30', daysLeft:null, endDate: bugun YYYY-MM-DD, garageId/vehicleId/plate: null,
  read:false, createdAt, updatedAt}`. `recordId` ve `categoryLabel` YAZILMAZ.
  Ardindan `notifications:updated` dagitilir. Gorunurluk: admin kaydinda "Arac Detayina Git" gizlenir
  (null id'ler), "Okundu isaretle" + "Sil" aynen calisir.
- Senkron korumasi: istemci (4. adim) ve Worker (Bolum 6 admin dongusu) admin kayitlarini
  ASLA silmez/uretmez; okunmamis admin duyurusu Worker'da tek seferlik push'a girer
  (`sentLevel:'admin'` + `pushSentAt`), okununca push listesinden duser.

### 5.5 Silme semantigi ve muhur yasam dongusu
- Kullanici HER bildirimi silebilir (confirm'li "Sil"): `deleteNotification(uid,notifId)`
  once mevcut listeden kategori/esik/tarihi okur, `deleteDoc` uygular, hatirlaticiysa
  `setDoc(dismissedNotifications/{ayniID},{dismissedAt:ISO,category,level,endDate},
  {merge:true})` muhru yazar (okuma/silme basarisizsa yine de silmeyi dener;
  muhur yazilamazsa `console.warn`).
- Muhur SEVYE/TARIH KAPSAMLI (v1.4.8; onceki "kalici muhur" kurali kaldirildi):
  - Ayni `level` + ayni `endDate` -> susturulur (yeniden uretilmez; istenen davranis).
  - Esik degisti (30->15->7->3->0->expired) VEYA bitis tarihi degistigi (yenileme)
    -> muhur kaldirilir, bildirim yeniden uretilir + pop/push yapilir ("silince
    bir daha gelmiyor" sorunuun cozumu).
  - Eski (alanasiz) muhurler ilk senkronda bulundukari esike `level/endDate`
    backfill edilir ve o esikte susturulmaya devam eder.
  - `dismissedNotifications` `update` izni sahip|admin (kural degisikligi; mühur
    yalnizca sahibi/admin tarafindan guncellenebilir; baska kullanici dokunamaz).
- Kayit silinip yeniden eklenirse YENI `recordId` -> yeni deterministik ID ->
  yeniden hatirlatilir. Admin duyurusu muhursuz silinir. Her silme/duyuru/okundu-akisi
  sonunda ilgili olay dagitilir (`notifications:updated` veya `records:changed` tetikli rozet).
---

## 6. Cloudflare Worker (worker/index.js - 497 satir, Spark istisnasi)

### 6.1 Kimlik ve sabitler
- `PROJECT_ID='garaj-53f16'`; `FIRESTORE_BASE` + `FCM_SEND_URL` (HTTP v1) bu ID'den turetilir.
- `TRACKED_CATEGORIES[5]` + `EXPIRY_WINDOW_DAYS=30` + `daysUntil/expiryLabel/levelKey`
  istemciyle ayni semantiktir (gun matematigi UTC-saf; karsilastirma tablosu Bolum 5.1).
- OAuth: `getAccessToken(sa)` - service-account JWT (`RSASSA-PKCS1-v1_5/SHA-256`,
  `crypto.subtle` imza, `b64url` kodlama) -> `oauth2.googleapis.com/token` ->
  access token (FCM + Firestore REST ortak). `importPrivateKey` PEM'i pkcs8 olarak alir.
- `sendFcm(token, fcmToken, title, body, p)`: FCM HTTP v1 `message:{token,
  notification:{title,body}, data:{title,body,route:'notifications',garageId,vehicleId,
  notifId,unread}}` (`unread` = kullanici basina okunmamis toplam; SW `setAppBadge`
  -> yuklu uygulama ikon sayisi + one plan rozet). v1.4.9: `unread` null/undefined
  disinda sayiya cevrilir (0 -> `'0'`; bos string `''` YASAK - SW badge sifirlayamiyordu).
  Basarisiz token tespiti: `UNREGISTERED|INVALID_ARGUMENT|INVALID_TOKEN|TOKEN_MISMATCH`
  veya HTTP `404` (`invalidToken:true` -> `fcmTokens/{t}` silinir; daraltma YASAK).
  `INVALID_REGISTRATION` kodda YOK.

### 6.2 Giris noktalari (export default { scheduled, fetch })
- `scheduled(event,env,ctx)` -> `ctx.waitUntil(handleScheduled(env))` ->
  `syncAllUsers(token)`: tum `users` taranir (`fsListCollection`), kullanici basina
  `syncUser(token,uid)`, hata izole (`console.error` + devam; tek kullanici cron'u bozmaz).
- `fetch`: `GET /test-push?uid&secret` - `env.TEST_SECRET` eslesmezse `401 'yetkisiz'`,
  `uid` yoksa `400 'uid gerekli'`; basarida `Response.json({ok:true,...syncUser})`,
  hatada `{ok:false,error} (500)`. Diger yollar `200 'appGaraj push worker aktif'`.
- Deploy: `wrangler deploy` (OAuth `wrangler login`, localhost:8976 callback; alternatif
  "Edit Cloudflare Workers" API token sablonu). Secret'lar:
  `wrangler secret put SERVICE_ACCOUNT_JSON` (+ `< service-account.json`) ve
  `wrangler secret put TEST_SECRET`. Cron `wrangler.toml` icindedir.
### 6.3 REST yardimcilari (Firestore Admin REST esdegeri)
- `fsRunQuery(token, collectionId, filters[])`: `runQuery` + structuredQuery (fieldFilter
  AND); donus `document[]` (js obje; `jsToFsVal/fsValToJs` tip donusumuyle).
- `fsListCollection(token, path, pageSize=300)`: sayfali list (5 deneme siniri;
  404 -> `[]`; bos sayfa normal bitis). `fsGetDoc(token, path)` (404 -> null),
  `fsWrite(token, writes)`: commit + ic chunk 400 (tek commit 500 write sinirina takilmaz).
- Yazim kuruculari: `setWrite(path,obj)` (tam belge, `update` alani, maskesiz),
  `patchWrite(path,obj,fieldPaths)` (update + updateMask; muhur backfill ve admin
  isareti icin — v1.4.8'de TANIMLI), `deleteWrite(path)`; `docIdFromName(name)`
  sondan ID alir. Gun-sayaci guncellemesi maskeyi yerinde kurar (`daysLeft`, `message`).
- Karsilik tablosu: istemci `writeBatch` <-> Worker `fsWrite`; istemci `getDocs` <->
  `fsListCollection/fsRunQuery`; istemci `setDoc/updateDoc/deleteDoc` <-> `set/patch/deleteWrite`.

### 6.4 syncUser akisi (kullanici basina 7 adim)
1. Oku: `fcmTokens` (token listesi; yoksa push atlanir ama `notifications` senkronu SURER)
   + `dismissedNotifications` muhurleri. Mevcut `notifications` belgeleri tarama
   bittikten SONRA okunur (adim 4 oncesi).
2. Tara: garajlari `runQuery(garages, userId==uid)` ile bul -> her garajin `vehicles`
   listesi tam `fsListCollection`, sonra JS'te `userId===uid` suzulur (sorgu filtresi degil)
   -> 5 izlenen kategori `Promise.all` ile paralel listelenir (bakim/periyodik IZLENMEZ).
3. Filtrele: odenmis ceza + `daysUntil(dateField)>30`/`null` atlanir; `desired: Map`
   kurulur (alanlar istemciyle aynidir; baslik `${label} — ${plate}`). Muhur
   denetimi DIFF adiminda yapilir (adim 4).
4. Diff (`setWrite`): yeni belge ONCE muhur denetiminden gecer: muhur ayni
   `level` + `endDate` icindeyse susturulur (yazim/push YOK); esik veya tarih
   farkliysa muhur `deleteWrite` ile kaldirilir; `level`/`endDate`siz eski muhur
   `patchWrite(['level','endDate'])` ile backfill edilir ve bu tur susturulur.
   Sonra `setWrite({...data, read:false, sentLevel:data.level, pushSentAt, createdAt})`;
   token varsa `pushes`'a girer. Mevcut belgede esik veya tarih degisince yine tam `setWrite`
   (`sentLevel`, `pushSentAt`, `updatedAt`; `prev.read===true` ise `read:false`);
   push, esik degistiyse veya `prev.sentLevel !== data.level` ise. Yalnizca gun sayaci
   degisince maskeli guncelleme: `daysLeft` + `message` (okundu korunur).
5. Admin dongusu (koru + tek-seferlik push): `desired`'da olmayan ve
   `category!=='admin_message'` kayitlar `deleteWrite`. Admin kaydi korunur;
   `read!==true`, mesaj dolu ve `sentLevel!=='admin'` ise `patchWrite({sentLevel:'admin',
   pushSentAt}, ['sentLevel','pushSentAt'])` calisir (v1.4.8: `patchWrite` TANIMLI;
   eski surumde bu dal `ReferenceError` ile kullanicinin TUM senkronunu iptal ederdi)
   ve `pushes[]`'e `{id,title,message,garageId:'',vehicleId:'',category:'admin_message',level:'admin'}` eklenir.
6. Push: adim 4/5'te hesaplanan `unreadCount` (yeni + okunmamis mevcut + okunmamis
   admin) her `pushes` kaydina `p.unread` olarak yazilir -> FCM `data.unread`;
   `pushes x fcmTokens` FCM HTTP v1 gonderimi; her basarida `sent++` +
   `sentIds.add(id)`; `invalidToken` ise `invalidTokens.add(t)` -> `deleteWrite(fcmTokens/{t})`.
7. Geri-alma + commit: `update.fields.sentLevel` tasiyan ve push'u gitmeyen yazilardan
   `sentLevel`/`pushSentAt` silinir (maske varsa bu iki yol maskeden de cikar; `setWrite`
   maskesizdir). `finalWrites` 400'luk parcalarla `fsWrite`. Donus `{reminders:desired.size,
   pushes:pushes.length,sent}`. `syncAllUsers` toplami `{users,reminders,sent}`.
---

## 7. Operasyon (build -> deploy -> test)

### 7.1 Zincir (3 komut, sira onemli)
```bash
npm run build                                    # vite -> dist/ (firebase chunk ~346 kB)
firebase deploy --only hosting,firestore:rules   # garajportal.web.app + kurallar (86 satir)
cd worker && wrangler deploy                     # push worker + cron (0 6 * * * = 09:00 TSI)
```
- `npm run build` oncesi kirilma kontrolu: `grep -rn "innerHTML\|outerHTML" src/` bos,
  `grep -rn "\.style\." src/` yalnizca yorum, `grep -rn onSnapshot src/` yalnizca yorum olmalidir.
- Kural degisikligi her deploy'da dahildir (`firestore:rules`); yalnizca hosting
  degisikliginde bile ayni komut calisir (kurallar suruklenmez/eskimez).

### 7.2 Test matrisi (uc tan uca)
| # | Senaryo | Beklenen |
|---|---------|----------|
| T1 | Admin -> duyuru (tek + tum) | `ok/N` ilerleme; Bildirimlerim'de admin kaydi (goto gizli) |
| T2 | `/test-push?uid&secret` | `{ok:true,reminders,pushes,sent}` + telefona push |
| T3 | Secretsiz `/test-push` | `401 'yetkisiz'` |
| T4 | Bildirim izni `granted` + sayfa acilis | bekleyen okunmamislar masaustune pop (sekmede 1 kez) |
| T5 | Esik gecisi (orn. 16->15 gun) | `read:false` + `updatedAt` taze + tekrar pop |
| T6 | Sayac degisimi (15->14, esik ayni) | `daysLeft/message` sessiz guncel; pop YOK |
| T7 | Hatirlatici Sil (ayni esik) | muhur (`level`+`endDate`) yazilir; sonraki senkronlarda uretilmez |
| T8 | Kayit sil+YENIDEN ekle | yeni recordId -> yeni ID ile yeniden hatirlatilir |
| T9 | Cikis | token silinir, rozet sifirlanir, onbellek temizlenir |
| T10 | Sil + esik degisimi (orn. 30->15 gun) | muhur kaldirinir; bildirim yeniden uretilir + pop/push |
| T11 | Sil + tarih yenileme (bitis degisti) | muhur kaldirinir; yeni tarih icin yeniden hatirlatilir |
| T12 | Yuklu PWA'ya push (arka plan) | ikonda okunmamis sayac (setAppBadge) + sesli bildirim |
| T13 | Okunmamis admin duyurusu olan kullaniciya cron | `patchWrite` calisir (ReferenceError YOK); hatirlatici push'lari gonderilir |
| T14 | Cikis -> giris (veya izin onceden `granted`) | banner `granted` dalinda "Push kaydini yenile" butonu; tiklaninca `fcmTokens` yazilir + push tekrar calisir |
| T15 | Android Chrome kurulu PWA'ya `/test-push` | bildirim + ses (SW `showNotification` zinciri) + OS rozetinde ikon sayaci |
| T16 | `new Notification` firlatan ortamda senkron pop | zincir ile SW yedegi gosterir; konsolda hata YOK |
| T17 | Yeni SW deploy sonrasi kurulu PWA acilisi | `controllerchange` tek reload; eski HTML+yeni SW karisimi YOK; `start_url='/'` tutarli acilir (onbellek zehirlenmesi YOK) |
- Uctan uca: Admin paneli -> duyuru gonder -> test-push URL'si -> push +
  Bildirimlerim sayfasi + rozet. Cron dogrulama: Cloudflare Dashboard ->
  Workers -> appgaraj-push-worker -> Triggers.

### 7.3 Surum bump checklist (4 dosya + bu belge)
1. `package.json:version`, 2. `version.js:APP_VERSION`, 3. `index.html#footer-version`,
   4. `sw.js:CACHE_NAME` (`appgaraj-vX-Y-Z` formatinda) birlikte guncellenir.
2. Bu dosyadaki `vX.Y.Z` / `CACHE_NAME` ibareleri + Bolum 4 satir-sayim snapshot'i ayni iste tazelenir.
3. `npm run build` + deploy; `checkAppVersion` eski istemcileri otomatik gocurur
   (alert + cache-flush BEKLENIR + reload; `__appVersionReloading` bayragi ile cift
   reload engellenir; `controllerchange` reload ile cakisma yok). SW betikleri icin
   EXTRA header YOK - `updateViaCache:'none'` kayit secenegi bayat betik sorununu cozer.
---

## 8. Hata ve Cevrimdisi Matrisi

| Durum | Davranis | Kod |
|-------|----------|-----|
| Rol sunucudan okunamaz | onbellek `getDoc` yedegi; o da yoksa `isAdmin=false` (guvenli varsayilan) | `authHelper.checkIsAdmin`, `profileView` |
| Onbellek yuklenemez (bildirim taramasi) | `throw` -> `refreshBadge` yakalar, 60sn bastirmali `console.error` | `notificationService.syncNotifications` |
| Sayfa hatasi (router) | `.app-error-message` + "Giris Sayfasina Git" butonu | `app.js > navigate` |
| Giris/hatali kimlik | TR dostu mesaj (`invalid-credential` -> "E-posta veya sifre hatali") | `login/register/forgotView` |
| Gizli sekme | rozet senkronu ATLANIR (istek yok) | `refreshBadge: document.hidden` |
| Yeni SW devraldi | tek seferlik reload (eski HTML+yeni SW karisimi YOK) | `swRegister controllerchange` |
| SW betigi bayat | `updateViaCache:'none'` + sekmeye donuste `reg.update()` | `swRegister` kayit |
| Hata sayfasi onbellege yazildi | YALNIZCA `res.ok` onbellegi tazeler; `'/'`+`'/index.html'` birlikte | `sw.js navigate` |
| Surum gocu sirasinda reload | cache-flush bitmeden reload YOK; cift reload bayragi | `version.js __appVersionReloading` |
| Cevrimdisi navigasyon | onbellekteki `/index.html` sunulur (PWA kurulabilirlik korunur) | `sw.js fetch` |
| `dismissed` okunamaz | bos `Map()` sayilir (muhursuz devam) | istemci adim 3 |
| Android'de `new Notification` firlatir | savunma zinciri: FCM SW -> `sw.js` reg `showNotification` (sesli) + `data.unread` rozeti | `fcmService.showPushNotification`, `notificationService.showBrowserNotification` |
| Badging API yok (Chrome Android / Firefox) | sessiz gec + tek seferlik log; ikon sayaci push bildiriminin OS rozetinden gelir | tum `setAppBadge` cagrilari `.catch(()=>{})` |
| Worker kullanici hatasi | izole edilir, cron devam eder | `syncAllUsers try/catch` |
| Gecersiz FCM token | `UNREGISTERED` / `INVALID_ARGUMENT` / `INVALID_TOKEN` / `TOKEN_MISMATCH` veya HTTP 404 ile silinir (`fcmTokens/{t}`) | `sendFcm invalidToken` |
| Gonderilemeyen push | `sentLevel/pushSentAt` geri alinir, sonraki tur dener | `syncUser` adim 7 |
| VAPID yok | Browser Notification yedegiyle devam (push telefona gitmez) | `notificationsView` dali |
| Bildirim izni `denied` | adres-cubugu kilit/ayar yonergesi gosterilir | `notificationsView` banner |

---

## 9. Performans ve Kota Notlari (Spark dostu)

- Giris sonrasi tek-gecis yukleme: `1 (garages) + G (vehicles/garaj) + G*V*7 (kayit)` okuma;
  sonrasi tum gorunumler sifir-okuma (onbellek) + cerrahi yazma (tek belge).
- Rozet dongusu: gorunur sekmede en fazla 60sn'de 1 senkron (`MIN_REFRESH`), zamanlayici
  5dk'da 1 (`MAX_REFRESH`); kayit CRUD sonrasi `force:true` tek seferlik.
- Bildirim senkronu yazimlari tek `writeBatch` (istemci) / 400'luk `fsWrite` (Worker);
  `markAllRead` tek batch; degismeyen turde `batchOps=0` -> `commit()` YOK (istek yok).
- Rol sorgusu 10dk TTL onbellekte; rozet once `cachedUnread` ile isteksiz boyanir.
- Worker taramasi gunluk 1 cron; kategori listeleri `Promise.all` paralel (5 kol);
  `fsListCollection` 300'luk sayfalar, 404 toleransli.
- Yasak-maliyet kalemleri: `onSnapshot` (surekli okuma), `isAdmin` cift-okumasi sik
  cagrilirsa (TTL ile dengelenir), rewrite-sirasiz SW (kurulabilirlik kaybi).

---

## 10. Degisiklik Gunlugu (belge surumu)

- **v1.4.10 (2026-09-29):** Chrome "zaten yuklu" + "baslatilamadi" onarimi (PWA
  guncelleme hatti): (1) `swRegister.js` erken kayit + `updateViaCache:'none'` +
  sekmeye donuste `reg.update()` + yeni SW devralinca `controllerchange` tek reload
  (surum karisimi yok). (2) `sw.js` navigate: yalnizca `res.ok` onbellegi tazeler
  (hata sayfasi zehirlemez) + `'/'` ve `'/index.html'` ikili taze (`start_url='/'`
  tutarli). (3) `firebase-messaging-sw.js` `install` skipWaiting. (4) `version.js`
  guvenli goc: cache-flush BEKLENIR + `__appVersionReloading` ile cift reload yok.
  Test matrisine T17 eklendi. 4-dosya surum bump TAMAMLANDI (1.4.9->1.4.10).
- **v1.4.9 (2026-09-29):** bildirim revizyonu (5 kok; analiz: Chrome-vs-Firefox PWA):
  (1) Badging API Chrome Android/Firefox'ta YOK - tum `setAppBadge` cagrilari
  `.catch(()=>{})`; Android ikon sayaci push bildiriminin OS rozetinden gelir (push sart).
  (2) `showBrowserNotification` 3 adimli savunma zinciri (Android Chrome'da sayfa-baglami
  `new Notification` firlatiyordu -> bildirim/ses hic dusmuyordu; Firefox'ta kurucu
  calisiyordu -> cihazlar arasi fark buydu). (3) Token yeniden kayidi: banner `granted`
  dalina "Push kaydini (yenile)" butonu + `fcm_token` durumu (cikista token silme sarti
  KORUNUR); `default` dalinda ikinci izin istegi kaldirildi. (4) `getFcmRegistration`:
  `installing` dahil eslesme + `getToken` oncesi `active` bekleme. (5) Worker `unread`
  0 -> `'0'` (bos string `''` SW badge sifirlamasini engelliyordu). Test matrisine
  T14-T16 eklendi. 4-dosya surum bump TAMAMLANDI (1.4.8->1.4.9).
- **v1.4.8 (2026-09-29):** masaustu kenar bosluklari: `.main-content`/`.section-header`
  taban kurallari eklendi (`max-width:1200px; margin:0 auto; padding:1.5rem 2rem 3rem` —
  media query'den once yoktu, icerik kenara yapisikti). Silme muhuru seviye/tarih
  kapsamli hale getirildi (esik/tarih degisince bildirim yeniden gelir; eski alanasiz
  muhurler backfill) + `firestore.rules` dismissed `update` = sahip|admin (83->86 satir).
  Worker `patchWrite` tanimi eklendi (okunmamis admin duyurusunda `ReferenceError` ile
  kullanici basina TUM senkron/push iptali kaldirildi). Push'a `data.unread` (okunmamis
  toplam) eklendi; `firebase-messaging-sw.js` + one plan `fcmService` -> `setAppBadge`
  (yuklu uygulama ikon sayisi), Android icin SW `showNotification` yedegi + `renotify:true`
  (ses). 4-dosya surum bump (1.4.7->1.4.8); `.clinerules`'a token ekonomisi kurali eklendi.
- **v1.4.7 denetim (2026-09-29):** belge kodla karsilastirildi. Surum ve satir sayilari ayni. Duzeltilen sapmalar: periyodik alan `km` (`nextDate` yok); bakim/periyodik/muayene form alanlari zorunlu; bos kategori `.sub-empty` (baslikta `(N)` yok); Worker'da tanimsiz `patchWrite` bilinen kusur olarak islendi; gecersiz token dizisi + FCM `data` (`garageId`, `vehicleId`); hatirlatici yazimi `setWrite` + `sentLevel`/`pushSentAt`; admin duyurusunda `recordId`/`categoryLabel` yazilmaz; `clearAllCookies` tanimli ama cagrilmiyor. (Bu denetimde kod surumu 1.4.7'de kalmisti; `patchWrite` kusuru v1.4.8'de giderildi.)
- **v1.4.7 (2026-09-22):** revizyon - `deleteNotification` koleksiyon taramasi kaldirildi (tek `getDoc`); 4-dosya surum bump (1.4.6->1.4.7); `npm run build` dogrulandi (41 modul, firebase ~346 kB); kurallar degisikligi YOK (83 satir aynen deploy edilir).
- **v1.4.6 (2026-09-22):** plan.md teknik revizyon - Bolum 0 daraltildi (5 alt-bolum),
  Bolum 1'e rota/CSP/cift-SW tablolari, Bolum 2'ye form semalari + ID sozlesmesi,
  Bolum 3'e DOM/grepler + rol TTL + kayit akisi, Bolum 4'e dosya agaci + onbellek sozlesmesi,
  Bolum 5'e UTC-kanit + batch-diff + sessionStorage anahtarlari, Bolum 6'ya REST karsilik +
  7-adimli syncUser, Bolum 7'ye T1-T9 test matrisi eklendi; yeni Bolum 8/9/10 acildi.
  Kod snapshot: `src` ~3.9k satir (19 dosya), `worker` 465, `rules` 83, `style` ~1978.
  Bilinen duzeltme: eski "3 dosya senkronu" ifadesi 4 olarak duzeltildi; Bolum 0'daki
  `records:changed` capraz referansi Bolum 4.2/5.2 olarak duzeltildi (eski metin Bolum 5 diyordu).
