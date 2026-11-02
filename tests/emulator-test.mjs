#!/usr/bin/env node
// appGaraj Firebase Emulator test paketi — Auth + Firestore kuralları + Hosting + Emulator UI.
// Kullanım: `npm run emulators` (yeni kabuk) ile emülatörleri başlat, sonra `npm run test:emulators`.
// Tüm kontroller PASS ise çıkış kodu 0, aksi halde 1. Veriler yalnızca emülatördedir.
// Not: "Bearer owner" jetonu Firebase emülatörlerinde admin yetkisi verir (konsol benzeri).

const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const UI = 'http://127.0.0.1:4000';
const HOSTING = 'http://127.0.0.1:5000';
const PROJECT = 'garaj-53f16';
const KEY = 'fake-api-key'; // Auth emülatörü her API anahtarını kabul eder

let pass = 0, fail = 0, skip = 0;
const P = (m) => { console.log(`PASS: ${m}`); pass++; };
const F = (m, why) => { console.log(`FAIL: ${m} -- ${why}`); fail++; };
const S = (m) => { console.log(`SKIP: ${m}`); skip++; };

async function rest(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* HTML vb. gövde */ }
  return { status: res.status, json, headers: res.headers };
}

const fsDoc = (fields) => ({
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: String(v) }])),
});
const fsPath = (p) => `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`;
const authRest = (action, body, extra = '') =>
  rest('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=${KEY}${extra}`, { body });

async function check(name, r, okStatus, extra) {
  const ok = r.status === okStatus && (!extra || extra(r));
  ok ? P(name) : F(name, `HTTP ${r.status} (beklenen ${okStatus}) ${JSON.stringify(r.json)?.slice(0, 160) ?? ''}`);
  return r;
}

// Hazırlık: emülatörler ayakta mı? (UI opsiyoneldir; Auth/Firestore zorunludur.)
async function alive(url, opts = {}) {
  try { const r = await fetch(url, opts); return r.ok || r.status < 500; } catch { return false; }
}
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  ready = (await alive(`${AUTH}/`)) && (await alive(`${FS}/`));
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) {
  console.error('Emülatörler kapalı görünüyor (Auth :9099 / Firestore :8080 erişilemedi).');
  console.error('Önce başka bir kabukta: npm run emulators   (veya: npm run test:emulators:exec)');
  process.exit(1);
}

console.log('== [1] Emülatör altyapısı ==');
let uiUp = false;
for (let i = 0; i < 15 && !uiUp; i++) { // UI, auth/firestore'dan sonra biraz geç açılabilir
  uiUp = await alive(`${UI}/`);
  if (!uiUp) await new Promise((r) => setTimeout(r, 1000));
}
uiUp ? P('Emulator UI ayakta (:4000)') : S('Emulator UI çalışmıyor (:4000) — --only modunda normal');
const host = await check('Hosting emülatörü ayakta (:5000)', await rest('GET', `${HOSTING}/`), 200,
  (r) => (r.headers.get('content-type') || '').includes('text/html'));
if (host.status === 200) {
  (host.headers.get('x-frame-options') === 'DENY')
    ? P('Hosting güvenlik başlığı X-Frame-Options: DENY')
    : F('Hosting X-Frame-Options', `bulunan=${host.headers.get('x-frame-options')}`);
}

// --- Temizlik: test her çalıştırmada aynı ortamdan başlasın (yalnızca emülatör verisi) ---
// Not: Firestore kuralları jetonsuz silmeyi engeller; temizlik "Bearer owner" (emülatör admin) ile yapılır.
async function clearFirestoreCollection(path) {
  const list = await rest('GET', `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=500`, { token: 'owner' });
  const docs = list.json?.documents ?? [];
  for (const d of docs) {
    const rel = d.name.split('/documents/')[1];
    const parts = rel.split('/');
    // önce alt koleksiyonları (users/{id}/notifications, garages/{id}/vehicles ...)
    for (let i = 2; i < parts.length; i += 2) {
      await clearFirestoreCollection(`${parts.slice(0, i).join('/')}/${parts[i]}/${parts[i + 1]}`);
    }
    await rest('DELETE', `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${rel}`, { token: 'owner' });
  }
  return docs.length;
}
const authReset = await rest('DELETE', `${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { token: 'owner' });
(authReset.status === 200) ? P('Auth emülatörü hesapları temizlendi') : F('Auth temizliği', `HTTP ${authReset.status}`);
const cleared = (await clearFirestoreCollection('users')) + (await clearFirestoreCollection('garages'));
P(`Firestore emülatörü verileri temizlendi (${cleared} doküman)`);

console.log('== [2] Auth emülatörü (kayıt/giriş) ==');
const A = await check('Kullanıcı A kaydı (signUp)', await authRest('signUp', { email: 'a@test.local', password: 'Test1234!', returnSecureToken: true }), 200,
  (r) => !!(r.json?.idToken && r.json?.localId));
const B = await check('Kullanıcı B kaydı (signUp)', await authRest('signUp', { email: 'b@test.local', password: 'Test1234!', returnSecureToken: true }), 200,
  (r) => !!(r.json?.idToken && r.json?.localId));
const C = await check('Kullanıcı C kaydı (signUp)', await authRest('signUp', { email: 'c@test.local', password: 'Test1234!', returnSecureToken: true }), 200,
  (r) => !!(r.json?.idToken && r.json?.localId));
await check('Mevcut e-posta ile tekrar kayıt reddedilir (400 EMAIL_EXISTS)', await authRest('signUp', { email: 'a@test.local', password: 'Test1234!', returnSecureToken: true }), 400);
await check('A doğru şifreyle giriş yapar (signInWithPassword)', await authRest('signInWithPassword', { email: 'a@test.local', password: 'Test1234!', returnSecureToken: true }), 200,
  (r) => !!r.json?.idToken);
await check('Yanlış şifre reddedilir (400)', await authRest('signInWithPassword', { email: 'a@test.local', password: 'Yanlis123!', returnSecureToken: true }), 400);
const accounts = await check('Emülatör hesap listesi (Bearer owner, :queryAccounts)', await rest('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}:queryAccounts`, { token: 'owner', body: {} }), 200);
if (accounts.status === 200) {
  const list = accounts.json?.userInfo ?? [];
  (list.length >= 3)
    ? P(`Hesap listesi >= 3 (bulunan: ${list.length})`)
    : F('Hesap listesi', `beklenen >= 3, bulunan ${list.length}`);
}

if (!(A.json?.idToken && B.json?.idToken && C.json?.idToken)) {
  console.error('Kullanıcı jetonları alınamadı; Firestore kuralları test edilemiyor.');
  console.log('------------------------------');
  console.log(`SONUC: PASS=${pass} FAIL=${fail} SKIP=${skip}`);
  process.exit(1);
}
const a = A.json, b = B.json, c = C.json;
const rulesDenied = (r) => JSON.stringify(r.json)?.includes('PERMISSION_DENIED');

console.log('== [3] Firestore kuralları — normal kullanıcı akışı ==');
await check('A kendi users/{A} dokümanını oluşturur (role:user)', await rest('PATCH', fsPath(`users/${a.localId}`), { token: a.idToken, body: fsDoc({ role: 'user' }) }), 200);
await check('B kendi users/{B} dokümanını oluşturur (role:user)', await rest('PATCH', fsPath(`users/${b.localId}`), { token: b.idToken, body: fsDoc({ role: 'user' }) }), 200);
await check('C role:admin ile kayıt oluşturamaz (rol yükseltme engeli)', await rest('PATCH', fsPath(`users/${c.localId}`), { token: c.idToken, body: fsDoc({ role: 'admin' }) }), 403, rulesDenied);
await check('C role:user ile kendi dokümanını oluşturur', await rest('PATCH', fsPath(`users/${c.localId}`), { token: c.idToken, body: fsDoc({ role: 'user' }) }), 200);
await check('A kendi rolünü admin yapamaz (update yalnızca admin)', await rest('PATCH', fsPath(`users/${a.localId}`), { token: a.idToken, body: fsDoc({ role: 'admin' }) }), 403, rulesDenied);
await check('A, B kullanıcı dokümanını okuyamaz', await rest('GET', fsPath(`users/${b.localId}`), { token: a.idToken }), 403, rulesDenied);
await check('B, A kullanıcı dokümanını okuyamaz', await rest('GET', fsPath(`users/${a.localId}`), { token: b.idToken }), 403, rulesDenied);
await check('A kendi kullanıcı dokümanını okur', await rest('GET', fsPath(`users/${a.localId}`), { token: a.idToken }), 200);
await check('A kendi garajını oluşturur', await rest('PATCH', fsPath('garages/gA'), { token: a.idToken, body: fsDoc({ userId: a.localId, name: 'A Garajı' }) }), 200);
await check('B, A adına garaj oluşturamaz', await rest('PATCH', fsPath('garages/gBfake'), { token: b.idToken, body: fsDoc({ userId: a.localId, name: 'Sahte' }) }), 403, rulesDenied);
await check('B, A kullanıcısına garajı okuyamaz', await rest('GET', fsPath('garages/gA'), { token: b.idToken }), 403, rulesDenied);
await check('A kendi garajına araç ekler', await rest('PATCH', fsPath('garages/gA/vehicles/vA'), { token: a.idToken, body: fsDoc({ userId: a.localId, plate: '06ABC123' }) }), 200);
await check('B, A garajına araç ekleyemez (IDOR koruması)', await rest('PATCH', fsPath('garages/gA/vehicles/vBfake'), { token: b.idToken, body: fsDoc({ userId: b.localId, plate: '06XYZ789' }) }), 403, rulesDenied);
await check('B, A aracını okuyamaz (alt koleksiyon)', await rest('GET', fsPath('garages/gA/vehicles/vA'), { token: b.idToken }), 403, rulesDenied);
await check('B, A garajını güncelleyemez', await rest('PATCH', fsPath('garages/gA'), { token: b.idToken, body: fsDoc({ name: 'Hack' }) }), 403, rulesDenied);
await check('A kendi hatırlatıcısını oluşturur (notifications)', await rest('PATCH', fsPath(`users/${a.localId}/notifications/nA`), { token: a.idToken, body: fsDoc({ userId: a.localId, title: 'Muayene' }) }), 200);
await check('B, A adına hatırlatıcı oluşturamaz', await rest('PATCH', fsPath(`users/${a.localId}/notifications/nBfake`), { token: b.idToken, body: fsDoc({ userId: b.localId, title: 'Sahte' }) }), 403, rulesDenied);
await check('B, A hatırlatıcısını okuyamaz', await rest('GET', fsPath(`users/${a.localId}/notifications/nA`), { token: b.idToken }), 403, rulesDenied);
await check('A kendi FCM tokenını kaydeder', await rest('PATCH', fsPath(`users/${a.localId}/fcmTokens/tA`), { token: a.idToken, body: fsDoc({ token: 'tok-A' }) }), 200);
await check('B, A FCM tokenını okuyamaz', await rest('GET', fsPath(`users/${a.localId}/fcmTokens/tA`), { token: b.idToken }), 403, rulesDenied);
await check('Kimlik doğrulamasız istek reddedilir (401/403)', await rest('GET', fsPath(`users/${a.localId}`), {}), 403);

console.log('== [4] Firestore kuralları — admin akışı (konsol benzeri atama) ==');
// Emülatörde admin ataması "Bearer owner" ile yapılır (gerçekte: Firebase Console).
await check('Admin ataması: A rolü owner (admin) ile güncellenir', await rest('PATCH', fsPath(`users/${a.localId}`), { token: 'owner', body: fsDoc({ role: 'admin' }) }), 200);
await check('A (admin) B dokümanını okuyabilir', await rest('GET', fsPath(`users/${b.localId}`), { token: a.idToken }), 200);
await check('A (admin) B dokümanını güncelleyebilir', await rest('PATCH', fsPath(`users/${b.localId}`), { token: a.idToken, body: fsDoc({ role: 'user', status: 'aktif' }) }), 200);
await check('A (admin) başka kullanıcıya doküman oluşturabilir', await rest('PATCH', fsPath('users/uye-manuel'), { token: a.idToken, body: fsDoc({ role: 'user' }) }), 200);
await check('A (admin) B FCM tokenını okuyabilir', await rest('GET', fsPath(`users/${a.localId}/fcmTokens/tA`), { token: a.idToken }), 200);
await check('A (admin) C dokümanını silebilir', await rest('DELETE', fsPath(`users/${c.localId}`), { token: a.idToken }), 200);
await check('B (admin olmayan) A garajını silemez', await rest('DELETE', fsPath('garages/gA'), { token: b.idToken }), 403, rulesDenied);

console.log('------------------------------');
console.log(`SONUC: PASS=${pass} FAIL=${fail} SKIP=${skip}`);
console.log(fail === 0 ? 'HATASIZ — emülatörler ve güvenlik kuralları çalışıyor.' : 'HATA LISTESI yukaridaki FAIL satirlaridir.');
process.exit(fail === 0 ? 0 : 1);
