# Garaj Yönetim Uygulaması - Proje Planı, Teknik Mimari ve Şema

## 1. Genel Bilgiler ve Teknoloji Yığını
- **Ön Yüz (Frontend):** Saf JavaScript (Vanilla JS - ES6+), Vite (Latest Bundler), Modüler SPA Mimarisi.
- **Arka Yüz / Servisler (Backend / BaaS):** Firebase Authentication, Cloud Firestore, Firebase Hosting (`garajportal.web.app`).
- **UI / UX Tasarım İlkeleri:** 
  - **Sıfır Popup / Sıfır Modal:** Uygulama genelinde hiçbir kayan pencere, modal veya popup kullanılmaz. Tüm ekleme, düzenleme ve detay işlemleri sayfa içinde akışkan (inline) ve açılıp kapanan (accordion / expandable) bileşenlerle yönetilir.
  - **Duyarlı Tasarım (Responsive):** Mobil, tablet ve masaüstü ekranlara tam uyumludur; yatay kayma (overflow/taşma) kesinlikle engellenmiştir.
  - **Temiz Raporlama (`@media print`):** Yazdırma ve PDF çıktıları için özel CSS kuralları tanımlanmış, butonlar ve navigasyon gizlenerek yalnızca rapor içerikleri ve tarih damgaları yazdırılabilir hale getirilmiştir.

---

## 2. Veritabanı ve Firestore Koleksiyon Şeması

Uygulama hiyerarşik Firestore koleksiyon yapısını kullanır:

```text
/garages (Koleksiyon)
  ├── {garageId} (Doküman)
  │     ├── name: String (Garaj Adı)
  │     ├── description: String (Açıklama)
  │     ├── createdAt: Timestamp
  │     └── /vehicles (Alt Koleksiyon - Araçlar)
  │           ├── {vehicleId} (Doküman)
  │           │     ├── plate: String (Plaka)
  │           │     ├── brand: String (Marka)
  │           │     ├── model: String (Model)
  │           │     ├── year: Number (Yıl)
  │           │     ├── km: Number (Kilometre)
  │           │     ├── fuelType: String (Yakıt Türü)
  │           │     └── sub-collections (Araç Alt Gider/Bakım Kategorileri):
  │           │           ├── /traffic_insurance (Trafik Sigortası)
  │           │           ├── /casco (Kasko Sigortası)
  │           │           ├── /traffic_fines (Trafik Cezaları - Tutar, Son Ödeme Tarihi, Durum)
  │           │           ├── /maintenance_repair (Bakım & Onarım - Servis, Tutar, Açıklama)
  │           │           ├── /periodic_maintenance (Periyodik Bakım - KM, Tutar, Açıklama)
  │           │           ├── /vehicle_inspection (Araç Muayenesi - Son Geçerlilik, İstasyon, Tutar)
  │           │           └── /exhaust_inspection (Egzoz Muayenesi - Son Geçerlilik, İstasyon, Tutar)

/users (Koleksiyon)
  ├── {uid} (Doküman)
      ├── email: String
      ├── role: String ('admin' | 'user')
      └── status: String ('active' | 'suspended')
```

---

## 3. Güvenlik, Kod Kalitesi ve DOM Kuralları

- **innerHTML / outerHTML Kesin Yasağı:** 
  - Proje genelindeki hiçbir modülde `innerHTML` veya `outerHTML` **kullanılmamaktadır ve yasaktır**.
  - Tüm DOM elemanları `document.createElement`, `textContent`, `setAttribute`, `classList` ve `appendChild` gibi güvenli native DOM API'leri kullanılarak üretilmektedir. Bu sayede XSS ve enjeksiyon zafiyetleri tamamen önlenmektedir.
- **Güvenli Kimlik Doğrulama ve Rol Yönetimi:**
  - Firebase Auth ile oturum yönetimi sağlanırken, kullanıcı rolleri (`admin` / `user`) Firestore üzerinden `{ source: 'server' }` önbelleksiz sorgu stratejisiyle anlık olarak doğrulanır.
- **Veri Koruma:**
  - Garaj silme işleminden önce ilişkili araç kontrolü yapılır; araç barındıran garajların silinmesi engellenir.

---

## 4. Modüler Dosya Yapısı

```text
/
├── package.json                # Vite ve Firebase bağımlılıkları (v1.0.5)
├── vite.config.js              # Vite derleme yapılandırması
├── index.html                  # Ana HTML giriş noktası (SPA container ve global footer)
├── firestore.rules             # Firestore güvenlik kuralları (rekürsif subcollection kuralları)
├── firebase.json               # Firebase Hosting yapılandırması (`garajportal`)
├── plan.md                     # Proje planı ve mimari dökümanı
└── src/
    ├── css/
    │   └── style.css           # Modern, duyarlı, print dostu stil dosyası
    └── js/
        ├── app.js              # Ana yönlendirici (Router) ve Auth durumu dinleyicisi
        ├── services/
        │   ├── firebase.js     # Firebase SDK (Auth ve Firestore) entegrasyonu
        │   ├── authHelper.js   # Kimlik doğrulama ve admin yetki kontrolü
        │   └── version.js      # Sürüm bilgisi yönetimi (v1.0.5)
        └── views/
            ├── loginView.js        # Giriş sayfası modülü
            ├── registerView.js     # Kayıt olma sayfası modülü
            ├── forgotView.js       # Şifremi unuttum sayfası modülü
            ├── dashboardView.js    # Garaj ve araç yönetimi (inline ekleme/düzenleme)
            ├── vehicleDetailView.js# Araç detayları, alt kategori listeleri (satır + detay akordeonu)
            ├── profileView.js      # Profil yönetimi ve şifre değiştirme
            └── adminView.js        # Admin yönetim paneli
```


