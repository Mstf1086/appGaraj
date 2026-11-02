// Cloudflare Worker — günlük bitiş tarihi push bildirimleri (FCM)
// Firebase Cloud Functions YERİNE kullanılır (Spark planı yeterli).
// Cron: her gün 09:00 TSİ (= 06:00 UTC) → `0 6 * * *`
// Kurulum: worker/README.md
//
// Secret'lar (dashboard veya `wrangler secret put`):
//   SERVICE_ACCOUNT_JSON  → Firebase service account JSON (tek satır)
//   TEST_SECRET           → /test-push uç noktası için rastgele gizli anahtar
//
// Not: FCM sunucu anahtarı (Admin SDK) YOK — Google OAuth2 access token ile
// FCM HTTP v1 + Firestore REST çağrılır.

const PROJECT_ID = 'garaj-53f16';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FCM_SEND_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

// İstemciyle aynı izlenen kategoriler (notificationService.js > TRACKED_CATEGORIES)
const TRACKED_CATEGORIES = [
  { key: 'traffic_insurance', label: 'Trafik Sigortası', dateField: 'endDate' },
  { key: 'casco', label: 'Kasko', dateField: 'endDate' },
  { key: 'vehicle_inspection', label: 'Araç Muayenesi', dateField: 'endDate' },
  { key: 'exhaust_inspection', label: 'Egzoz Muayenesi', dateField: 'endDate' },
  { key: 'traffic_fines', label: 'Trafik Cezası', dateField: 'dueDate' }
];

const EXPIRY_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Yardımcılar: tarih / eşik
// ---------------------------------------------------------------------------
function daysUntil(dateStr) {
  if (!dateStr) return null;
  // 'YYYY-MM-DD' UTC gün sınırında hesaplanır — sunucu saat diliminden
  // bağımsızdır (istemci notificationService.js ile aynı sonuç verir).
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const endUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((endUtc - todayUtc) / 86400000);
}

function expiryLabel(days) {
  if (days < 0) return `Süresi ${Math.abs(days)} gün önce doldu`;
  if (days === 0) return 'Bugün son gün!';
  if (days <= 3) return `${days} gün kaldı (son 3 gün)`;
  if (days <= 7) return `${days} gün kaldı (son 7 gün)`;
  if (days <= 15) return `${days} gün kaldı (son 15 gün)`;
  return `${days} gün kaldı (son 30 gün)`;
}

function levelKey(days) {
  if (days < 0) return 'expired';
  if (days === 0) return '0';
  if (days <= 3) return '3';
  if (days <= 7) return '7';
  if (days <= 15) return '15';
  return '30';
}

// ---------------------------------------------------------------------------
// Google OAuth2: service account JWT → access token (FCM + Firestore için)
function b64url(buf) {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', raw.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const enc = new TextEncoder();
  const unsigned = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claim)))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  if (!res.ok) throw new Error(`OAuth token alınamadı: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Firestore REST (values ↔ JS)
// ---------------------------------------------------------------------------
function fsValToJs(v) {
  if (v == null) return '';
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries((v.mapValue && v.mapValue.fields) || {})) out[k] = fsValToJs(val);
    return out;
  }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fsValToJs);
  return '';
}

function jsToFsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}

function fsDocToObj(doc) {
  const out = {};
  const fields = (doc && doc.fields) || {};
  for (const [k, v] of Object.entries(fields)) out[k] = fsValToJs(v);
  return out;
}

function docIdFromName(name) {
  const parts = String(name || '').split('/');
  return parts[parts.length - 1] || '';
}

async function fsRunQuery(token, structuredQuery) {
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery })
  });
  if (!res.ok) throw new Error(`Firestore runQuery: ${res.status}`);
  const rows = await res.json();
  return (rows || []).filter((r) => r.document).map((r) => ({
    name: r.document.name,
    id: docIdFromName(r.document.name),
    data: fsDocToObj(r.document)
  }));
}

async function fsListCollection(token, path) {
  // path: 'garages' veya 'garages/G1/vehicles/V1/casco'
  const out = [];
  let pageToken = '';
  let attempt = 0;
  const MAX_ATTEMPTS = 5;
  do {
    attempt++;
    const url = new URL(`${FIRESTORE_BASE}/${path}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 404) return out; // Collection yoksa boş dizi döndür
      throw new Error(`Firestore list ${path}: ${res.status}`);
    }
    const data = await res.json();
    for (const d of (data.documents || [])) {
      out.push({ name: d.name, id: docIdFromName(d.name), data: fsDocToObj(d) });
    }
    pageToken = data.nextPageToken || '';
    if (attempt >= MAX_ATTEMPTS) {
      console.warn(`fsListCollection exceeded max attempts for ${path}`);
      break;
    }
  } while (pageToken);
  return out;
}

async function fsGetDoc(token, path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${path}: ${res.status}`);
  const d = await res.json();
  return { name: d.name, id: docIdFromName(d.name), data: fsDocToObj(d) };
}

async function fsWrite(token, writes) {
  // writes: [{ update: { name, fields }, updateMask } | { delete }]
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const res = await fetch(`${FIRESTORE_BASE}:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: writes.slice(i, i + CHUNK) })
    });
    if (!res.ok) throw new Error(`Firestore commit: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

function docPathToName(path) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

function setWrite(path, obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = jsToFsVal(v);
  return { update: { name: docPathToName(path), fields } };
}

function deleteWrite(path) {
  return { delete: docPathToName(path) };
}

// Alan bazlı yama (update + updateMask): mühür backfill ve admin duyurusu işaretlerinde kullanılır.
function patchWrite(path, obj, fieldPaths) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = jsToFsVal(v);
  return {
    update: { name: docPathToName(path), fields },
    updateMask: { fieldPaths: fieldPaths && fieldPaths.length ? fieldPaths : Object.keys(obj) }
  };
}

// ---------------------------------------------------------------------------
// FCM HTTP v1 gönderimi (Admin SDK YOK — access token ile REST)
async function sendFcm(token, fcmToken, title, body, data) {
  const res = await fetch(FCM_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: {
          title: String(title || '').slice(0, 100),
          body: String(body || '').slice(0, 200),
          route: 'notifications',
          garageId: String((data && data.garageId) || ''),
          vehicleId: String((data && data.vehicleId) || ''),
          notifId: String((data && data.id) || ''),
          // Okunmamış toplam: SW ikon rozetini (Badging API) guncellemek icin (0 -> '0'; '' yasak)
          unread: (data && data.unread !== undefined && data.unread !== null && data.unread !== '') ? String(data.unread) : ''
        }
      }
    })
  });
  if (res.ok) return { ok: true };
  const text = await res.text();
  // Invalid token tespiti için daha geniş kontrol
  const invalidErrors = ['UNREGISTERED', 'INVALID_ARGUMENT', 'INVALID_TOKEN', 'TOKEN_MISMATCH'];
  const invalid = invalidErrors.some(err => text.includes(err));
  const gone = res.status === 404 || invalid;
  return { ok: false, invalidToken: gone, status: res.status };
}
// Kullanıcı senkronu: kayıtları tara → eşik geçişinde push + notifications yaz
async function syncUser(token, uid) {
  const tokenDocs = await fsListCollection(token, `users/${uid}/fcmTokens`);
  // Silme muhurleri (seviye/tarih kapsamli) desired kurulmadan once okunur
  let dismissedMap = new Map();
  try {
    const dDocs = await fsListCollection(token, `users/${uid}/dismissedNotifications`);
    dismissedMap = new Map(dDocs.map((d) => [d.id, d.data || {}]));
  } catch (err) { /* koleksiyon yoksa sorun degil */ }
  const fcmTokens = tokenDocs
    .map((d) => d.data && d.data.token)
    .filter((t) => !!t);

  const garages = await fsRunQuery(token, {
    from: [{ collectionId: 'garages' }],
    where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: uid } } }
  });

  const desired = new Map();
  for (const g of garages) {
    const gid = g.id;
    // Service account kurallara takılmaz: garaj altı araçları doğrudan listele
    const vDocs = await fsListCollection(token, `garages/${gid}/vehicles`);
    for (const v of vDocs) {
      if (v.data.userId !== uid) continue;
      const vid = v.id;
      const plate = v.data.plate || '';
      const catResults = await Promise.all(TRACKED_CATEGORIES.map(async (cat) => ({
        cat,
        recs: await fsListCollection(token, `garages/${gid}/vehicles/${vid}/${cat.key}`)
      })));
      for (const { cat, recs } of catResults) {
        for (const r of recs) {
          if (cat.key === 'traffic_fines' && (r.data.status === 'Ödendi' || r.data.paid === true)) continue;
          const days = daysUntil(r.data[cat.dateField]);
          if (days === null || days > EXPIRY_WINDOW_DAYS) continue;
          const id = `${vid}_${cat.key}_${r.id}`;
          desired.set(id, {
            id, userId: uid,
            category: cat.key, categoryLabel: cat.label,
            garageId: gid, vehicleId: vid, recordId: r.id,
            endDate: r.data[cat.dateField] || '',
            daysLeft: days, level: levelKey(days),
            title: `${cat.label} — ${plate}`,
            message: expiryLabel(days),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
  }
  const existingDocs = await fsListCollection(token, `users/${uid}/notifications`);
  const existing = new Map(existingDocs.map((d) => [d.id, d.data]));

  const pushes = [];
  const writes = [];
  const nowIso = new Date().toISOString();
  // Okunmamis toplam: push payload'indaki `unread` alanina yazilir (SW rozet)
  let unreadCount = 0;

  for (const [id, data] of desired) {
    const prev = existing.get(id);
    const path = `users/${uid}/notifications/${id}`;
    if (!prev) {
      const seal = dismissedMap.get(id);
      const sealPath = `users/${uid}/dismissedNotifications/${id}`;
      if (seal) {
        if (seal.level === undefined || seal.level === null) {
          // Eski (alanasiz) muhur: bulundugu esige backfill edilir, susturulmaya devam eder.
          writes.push(patchWrite(sealPath,
            { level: data.level, endDate: data.endDate || '' },
            ['level', 'endDate']));
          continue;
        }
        if (seal.level === data.level && (seal.endDate || '') === (data.endDate || '')) continue;
        // Esik veya bitis tarihi degisti -> muhur kaldirilir, bildirim yeniden uretilir
        writes.push(deleteWrite(sealPath));
      }
      unreadCount++;
      if (fcmTokens.length > 0) pushes.push(data);
      writes.push(setWrite(path, { ...data, read: false, sentLevel: data.level, pushSentAt: nowIso, createdAt: nowIso }));
      continue;
    }
    const levelChanged = prev.level !== data.level;
    const dateChanged = (prev.endDate || '') !== (data.endDate || '');
    const daysChanged = (prev.daysLeft ?? null) !== (data.daysLeft ?? null);
    const nowRead = prev.read === true && !(levelChanged || dateChanged);
    if (!nowRead) unreadCount++;
    if (levelChanged || dateChanged) {
      const patch = { ...data, sentLevel: data.level, pushSentAt: nowIso, updatedAt: data.updatedAt };
      if (prev.read === true) patch.read = false;
      patch.createdAt = prev.createdAt || nowIso;
      const notSentBefore = prev.sentLevel !== data.level;
      if (fcmTokens.length > 0 && (levelChanged || notSentBefore)) pushes.push(data);
      writes.push(setWrite(path, patch));
    } else if (daysChanged) {
      writes.push({
        update: {
          name: docPathToName(path),
          fields: { daysLeft: jsToFsVal(data.daysLeft), message: jsToFsVal(data.message) }
        },
        updateMask: { fieldPaths: ['daysLeft', 'message'] }
      });
    }
  }

  // (silme islemi admin dongusu icinde yapilir — admin duyurulari korunur)

  // Admin duyurulari: syncNotifications ile ayni kural — korunur, okunmamislar
  // tek seferlik push listesine eklenir (gonderim basarili olunca sentLevel='admin').
  for (const d of existingDocs) {
    if (desired.has(d.id)) continue;
    const dd = d.data || {};
    if (dd.category !== 'admin_message') {
      writes.push(deleteWrite(`users/${uid}/notifications/${d.id}`));
      continue;
    }
    if (dd.read === true) continue;
    unreadCount++; // okunmamis admin duyurusu da rozete girer
    const prevLevel = dd.sentLevel || '';
    const title = dd.title || 'Garaj Portal';
    const message = dd.message || '';
    if (!message) continue;
    if (prevLevel !== 'admin') {
      writes.push(patchWrite(`users/${uid}/notifications/${d.id}`,
        { sentLevel: 'admin', pushSentAt: new Date().toISOString() },
        ['sentLevel', 'pushSentAt']));
      pushes.push({ id: d.id, title, message, garageId: '', vehicleId: '', category: 'admin_message', level: 'admin' });
    }
  }

  // Push gönder (geçersiz token'ları topla, sonra sil)
  let sent = 0;
  const sentIds = new Set();
  const invalidTokens = new Set();
  for (const p of pushes) p.unread = unreadCount;
  for (const p of pushes) {
    for (const t of fcmTokens) {
      if (invalidTokens.has(t)) continue;
      try {
        const r = await sendFcm(token, t, p.title, p.message, p);
        if (r.ok) {
          sent++;
          sentIds.add(p.id);
        } else if (r.invalidToken) {
          invalidTokens.add(t);
        }
      } catch (err) {
        console.error(`Push hatası (${uid}/${p.id}):`, err && err.message);
      }
    }
  }
  for (const t of invalidTokens) {
    writes.push(deleteWrite(`users/${uid}/fcmTokens/${t}`));
  }

  // Gönderilemeyenlerin sentLevel işaretini geri al (sonraki turda tekrar dene)
  const finalWrites = writes.map((w) => {
    if (!w.update || !w.update.fields || !w.update.fields.sentLevel) return w;
    const nid = docIdFromName(w.update.name);
    const wanted = pushes.some((p) => p.id === nid);
    if (wanted && !sentIds.has(nid)) {
      const fields = { ...w.update.fields };
      delete fields.sentLevel;
      delete fields.pushSentAt;
      const out = { update: { name: w.update.name, fields } };
      if (w.updateMask && w.updateMask.fieldPaths) {
        const fps = w.updateMask.fieldPaths.filter((f) => f !== 'sentLevel' && f !== 'pushSentAt');
        if (fps.length) out.updateMask = { fieldPaths: fps };
      }
      return out;
    }
    return w;
  });

  for (let i = 0; i < finalWrites.length; i += 400) {
    await fsWrite(token, finalWrites.slice(i, i + 400));
  }
  return { reminders: desired.size, pushes: pushes.length, sent };
}

async function syncAllUsers(token) {
  const users = await fsListCollection(token, 'users');
  let uCount = 0, reminders = 0, sent = 0;
  for (const u of users) {
    try {
      const r = await syncUser(token, u.id);
      uCount++;
      reminders += r.reminders;
      sent += r.sent;
    } catch (err) {
      console.error(`Kullanıcı senkronu başarısız (${u.id}):`, err && err.message);
    }
  }
  return { users: uCount, reminders, sent };
}

async function handleScheduled(env) {
  const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON);
  const token = await getAccessToken(sa);
  const r = await syncAllUsers(token);
  console.log('[appGaraj] Worker cron tamamlandi.');
  return r;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/test-push') {
      if (!env.TEST_SECRET || url.searchParams.get('secret') !== env.TEST_SECRET) {
        return new Response('yetkisiz', { status: 401 });
      }
      const uid = url.searchParams.get('uid');
      if (!uid) return new Response('uid gerekli', { status: 400 });
      try {
        const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON);
        const token = await getAccessToken(sa);
        const r = await syncUser(token, uid);
        return Response.json({ ok: true, ...r });
      } catch (err) {
        return Response.json({ ok: false, error: String((err && err.message) || err) }, { status: 500 });
      }
    }
    return new Response('appGaraj push worker aktif', { status: 200 });
  }
};
