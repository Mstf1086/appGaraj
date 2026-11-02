# appGaraj Push Worker (Cloudflare) — Kurulum

Firebase Cloud Functions YERİNE kullanılır. Firebase planı **Spark** olarak kalır.

## 1. Ön koşullar (bir kez)

1. Cloudflare hesabı açın (ücretsiz plan yeterli).
2. Firebase Console → Project settings → **Cloud Messaging** → Web push
   certificates → **Generate key pair** → VAPID anahtarını kopyalayın.
3. Firebase Console → Project settings → **Service accounts** →
   **Generate new private key** → `service-account.json` dosyasını indirin.
   (Bu dosya GİZLİDİR — repoya commit'lenmez, `.gitignore`'dadır.)

## 2. VAPID anahtarını istemciye yazın

`src/js/services/fcmService.js` → `VAPID_KEY = "..."` içine 2. adımdaki anahtarı
yapıştırın. Bu olmadan Android token alınamaz.

## 3. Worker'ı yayınlayın

```bash
cd worker
npm i -g wrangler
wrangler login
# Service account JSON'unu tek satır secret yapın:
wrangler secret put SERVICE_ACCOUNT_JSON < service-account.json
wrangler secret put TEST_SECRET   # rastgele güçlü bir değer yazın
wrangler deploy
```

Cron `wrangler.toml` içindedir: `0 6 * * *` = her gün 06:00 UTC = **09:00 TSİ**.
Dashboard → Workers → appgaraj-push-worker → Triggers'tan doğrulayın.

## 4. Test

1. Uygulamada Bildirimlerim → **Push Bildirimlerini Etkinleştir** → izin verin.
   `users/{uid}/fcmTokens` altında token belirdiğini Firestore'da doğrulayın.
2. Worker URL ile tek kullanıcıyı tetikleyin (cron beklemeden):

```
https://appgaraj-push-worker.<hesap>.workers.dev/test-push?uid=KULLANICI_UID&secret=TEST_SECRET_DEGERI
```

`{"ok":true,"reminders":N,"pushes":M,"sent":K}` dönmelidir; telefona push düşer.

## Güvenlik notları

- `SERVICE_ACCOUNT_JSON` yalnızca Worker secret'tadır; istemciye sızmaz.
- `/test-push` `TEST_SECRET` olmadan 401 döner.
- FCM token'ları Firestore kurallarıyla sahibi/admin-only'dir.
- VAPID anahtarı herkese açıktır (tasarım gereği); gizli bilgi değildir.
