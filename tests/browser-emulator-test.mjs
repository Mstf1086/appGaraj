// appGaraj tarayıcı üzerinden emülatör E2E testi (puppeteer-core + sistem chromium).
// Amaç: uygulamanın emülatörlere bağlandığını, üretim Firebase uç noktalarına gitmediğini
// ve kayıt/giriş akışının emülatör Auth üzerinde çalıştığını doğrulamak.
// Kullanım:
//   npm run emulators                                  (başka kabukta)
//   VITE_USE_FIREBASE_EMULATORS=true npm run dev       (başka kabukta)
//   npm run test:emulators:browser
// Not: puppeteer-core devDependency olarak eklenmistir (Chromium sistemde kurulu: /usr/bin/chromium).
import puppeteer from 'puppeteer-core';

const APP = process.env.APP_URL || 'http://127.0.0.1:3000';
const AUTH = 'http://127.0.0.1:9099';
// Yalnızca ÜRETİM Firebase servis uç noktaları kaçak sayılır (localhost emülatör ve statik fontlar hariç).
const PROD = /^https?:\/\/(?!127\.0\.0\.1|localhost)[^/]*(identitytoolkit|securetoken|firestore|firebaseinstallations|fcm|firebaseio|firebaseapp)\.[^/]+/i;

let pass = 0, fail = 0;
const P = (m) => { console.log(`PASS: ${m}`); pass++; };
const F = (m, why) => { console.log(`FAIL: ${m} -- ${why}`); fail++; };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const page = await browser.newPage();
const consoleLogs = [];
const prodRequests = [];
const errors = [];
page.on('console', (m) => consoleLogs.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (PROD.test(r.url())) prodRequests.push(r.url()); });

// Uygulama (vite dev) ve emulatorler ayakta mi?
for (const [url, label] of [[`${APP}/login`, 'vite dev sunucusu'], [AUTH, 'Auth emülatörü']]) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`${label} erişilemedi: ${url}`);
    console.error(label === 'vite dev sunucusu'
      ? 'Önce: VITE_USE_FIREBASE_EMULATORS=true npm run dev'
      : 'Önce: npm run emulators');
    await browser.close();
    process.exit(1);
  }
}

try {
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  P('Uygulama login sayfasını yükledi');

  const emuLog = consoleLogs.find((l) => l.includes('Emülatörlere bağlandı'));
  emuLog ? P('Konsol: emülatörlere bağlandı') : F('Emülatör bağlantı mesajı', consoleLogs.slice(-5).join(' | '));

  // Kayıt ekranına git ve emülatörde hesap oluştur
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#reg-email', { timeout: 15000 });
  const email = `e2e${Date.now()}@test.local`;
  await page.type('#reg-email', email);
  await page.type('#reg-password', 'Test1234!');
  await Promise.all([
    page.click('form button[type="submit"], button[type="submit"]'),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  P(`Kayıt formu dolduruldu ve gönderildi (${email})`);

  // Auth emülatöründe hesabın oluştuğunu doğrula
  const q = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/garaj-53f16:queryAccounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({}),
  });
  const list = (await q.json())?.userInfo ?? [];
  list.some((u) => u.email === email)
    ? P(`Auth emülatöründe hesap oluştu: ${email}`)
    : F('Auth emülatörü kayıt', `hesap bulunamadı: ${email}`);

  // Üretim Firebase uç noktalarına istek atılmadı
  prodRequests.length === 0
    ? P('Üretim Firebase uç noktalarına istek yok (tamamen emülatör)')
    : F('Üretim uç nokta kaçağı', prodRequests.slice(0, 5).join(', '));

  errors.length === 0
    ? P('Sayfada JS hatası yok')
    : F('JS hata', errors.slice(0, 3).join(' | '));

  // Kayıt sonrası oturum açık olur: uygulama login yerine dashboard'a yönlenir.
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#app', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));
  const hasLoginForm = await page.$('input[type="email"], input[type="password"]');
  const bodyText = await page.evaluate(() => document.body.innerText);
  const loggedIn = !hasLoginForm && /dashboard|garaj|çıkış|Çıkış/i.test(bodyText);
  loggedIn
    ? P('Kayıt sonrası oturum açık, dashboard yönlendirmesi çalıştı')
    : F('Yönlendirme', `login formu=${!!hasLoginForm}, gövde="${bodyText.slice(0, 120)}"`);
} catch (e) {
  F('E2E çalıştırma', e.message);
} finally {
  await browser.close();
}

console.log('------------------------------');
console.log(`SONUC: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
