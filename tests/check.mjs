// appGaraj entegrasyon tutarlilik kontrolleri (node tests/check.mjs, repo kokunden).
// Bump sonrasi beklenti: 4 dosya surumu 1.4.10. Cikis: FAIL=0 ise 0, degilse 1.
import { readFileSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
const P = (m) => { console.log(`PASS: ${m}`); pass++; };
const F = (m, why) => { console.log(`FAIL: ${m} -- ${why}`); fail++; };
const read = (p) => readFileSync(p, 'utf8');
const EXP = '1.4.10', EXP_CACHE = 'appgaraj-v1-4-10';

// 1. surum 4'lu senkron (check.sh'e yedek)
try {
  const pkg = JSON.parse(read('package.json')).version;
  pkg === EXP ? P(`package.json version=${pkg}`) : F('package.json version', `bulunan=${pkg} beklenen=${EXP}`);
} catch (e) { F('package.json version', e.message); }
read('src/js/services/version.js').includes(`'${EXP}'`) ? P('version.js APP_VERSION') : F('version.js APP_VERSION', '1.4.10 yok');
read('index.html').includes('Sürüm v1.4.10') ? P('index.html footer') : F('index.html footer', 'Sürüm v1.4.10 yok');
read('public/sw.js').includes(`'${EXP_CACHE}'`) ? P('sw.js CACHE_NAME') : F('sw.js CACHE_NAME', EXP_CACHE + ' yok');

// 2. manifest/SW tutarliligi
try {
  const man = JSON.parse(read('public/manifest.webmanifest'));
  (man.start_url === '/' && man.scope === '/') ? P('manifest start_url/scope=/') : F('manifest start_url/scope', `${man.start_url}/${man.scope}`);
  const icons = (man.icons || []).map(i => i.sizes).join(',');
  (icons.includes('192x192') && icons.includes('512x512')) ? P(`manifest icons (${icons})`) : F('manifest icons', icons || 'bos');
} catch (e) { F('manifest parse', e.message); }
const sw = read('public/sw.js');
sw.includes(EXP_CACHE) && sw.includes("'/index.html'") ? P('sw.js CORE_ASSETS + CACHE_NAME') : F('sw.js CORE_ASSETS', 'beklenen cache/asset yok');
sw.includes('res.ok') ? P('sw.js navigate res.ok') : F('sw.js navigate res.ok', 'res.ok yok');
const swCode = sw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
swCode.includes('firebase-messaging') ? F('sw.js push YOK', 'FCM bulasmis') : P('sw.js push YOK (PWA-only, yorum haric)');
const fmsw = read('public/firebase-messaging-sw.js');
fmsw.includes('onBackgroundMessage') && fmsw.includes('renotify') ? P('firebase-messaging-sw.js onBackgroundMessage+renotify') : F('firebase-messaging-sw.js', 'onBackgroundMessage/renotify eksik');
fmsw.includes('importScripts') && !fmsw.match(/^import /m) ? P('firebase-messaging-sw.js klasik script') : F('firebase-messaging-sw.js klasik', 'modul sozdizimi suphesi');

// 3. rozet+bildirim entegrasyonu
const fcm = read('src/js/services/fcmService.js');
fcm.includes('showNotificationChain') && read('src/js/services/notificationService.js').includes('showNotificationChain')
  ? P('rozet+bildirim zinciri iki serviste bagli') : F('zincir baglantisi', 'import/kullanim eksik');
const auth = read('src/js/services/authHelper.js');
(auth.includes('setAppBadge') && auth.includes('clearAppBadge') && auth.includes('p.catch'))
  ? P('authHelper badge set/clear + catch') : F('authHelper badge', 'set/clear/catch eksik');

// 4. ikon dosyalari
['public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/maskable-512.png'].forEach(p =>
  existsSync(p) ? P(`${p} var`) : F(`${p} var`, 'dosya yok'));

console.log('------------------------------');
console.log(`SONUC: PASS=${pass} FAIL=${fail}`);
console.log(fail === 0 ? 'HATASIZ' : 'HATA LISTESI yukaridaki FAIL satirlaridir.');
process.exit(fail === 0 ? 0 : 1);
