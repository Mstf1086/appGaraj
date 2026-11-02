#!/usr/bin/env bash
# appGaraj test paketi v1.4.10 (bump sonrasi: 4 dosya surumu 1.4.10'da kilitli).
# Kullanim: repo kokunden `bash tests/check.sh`. Tumu PASS ise cikis 0, degilse 1.
set -u
cd "$(dirname "$0")/.." || exit 1
PASS=0; FAIL=0
pass(){ echo "PASS: $1"; PASS=$((PASS+1)); }
fail(){ echo "FAIL: $1 -- $2"; FAIL=$((FAIL+1)); }

echo "== [a] JS sozdizimi =="
shopt -s globstar nullglob
JS_FILES=(src/**/*.js)
if [ ${#JS_FILES[@]} -eq 0 ]; then fail "src/**/*.js bulundu" "dosya yok"; else
  for f in "${JS_FILES[@]}"; do
    if node --check "$f" 2>/tmp/ag_check_err.txt; then pass "node --check $f";
    else fail "node --check $f" "$(cat /tmp/ag_check_err.txt)"; fi
  done
fi
for f in public/sw.js public/firebase-messaging-sw.js; do
  if [ -f "$f" ]; then
    if node --check "$f" 2>/tmp/ag_check_err.txt; then pass "node --check $f";
    else fail "node --check $f" "$(cat /tmp/ag_check_err.txt)"; fi
  else fail "$f var" "dosya yok"; fi
done
if [ -f worker/index.js ]; then
  if node --input-type=module --check < worker/index.js 2>/tmp/ag_check_err.txt; then pass "worker/index.js (module) syntax";
  else fail "worker/index.js (module) syntax" "$(cat /tmp/ag_check_err.txt)"; fi
else fail "worker/index.js var" "dosya yok"; fi

echo "== [b] plan.md 7.1 hijyen =="
if grep -rn "innerHTML\|outerHTML" src/ 2>/dev/null | grep -q .; then
  fail "src/ innerHTML|outerHTML bos" "$(grep -rn 'innerHTML\|outerHTML' src/ | head -5)"
else pass "src/ innerHTML|outerHTML bos"; fi
STYLE_HITS=$(grep -rn "\.style\." src/ 2>/dev/null || true)
if [ -z "$STYLE_HITS" ]; then pass "src/ .style. yok (yorum da yok)";
else
  NONCOMMENT=$(echo "$STYLE_HITS" | grep -v "^\S*:[0-9]*:\s*//" | grep -v "\* " || true)
  if [ -z "$NONCOMMENT" ]; then pass "src/ .style. yalnizca yorum";
  else fail "src/ .style. yalnizca yorum" "$(echo "$NONCOMMENT" | head -5)"; fi
fi
SNAP_HITS=$(grep -rn "onSnapshot" src/ 2>/dev/null || true)
if [ -z "$SNAP_HITS" ]; then pass "src/ onSnapshot yok (yorum da yok)";
else
  NONCOMMENT_S=$(echo "$SNAP_HITS" | grep -v "^\S*:[0-9]*:\s*//" | grep -v "\* " || true)
  if [ -z "$NONCOMMENT_S" ]; then pass "src/ onSnapshot yalnizca yorum";
  else fail "src/ onSnapshot yalnizca yorum" "$(echo "$NONCOMMENT_S" | head -5)"; fi
fi

echo "== [c] fonksiyonel statik iddialar (v1.4.10 revizyonu) =="
grep -q "export async function showNotificationChain" src/js/services/fcmService.js \
  && pass "fcmService showNotificationChain export" \
  || fail "fcmService showNotificationChain export" "bulunamadi"
grep -q "showNotificationChain" src/js/services/notificationService.js \
  && pass "notificationService zincir kullanimi" \
  || fail "notificationService zincir kullanimi" "import/kullanim yok"
grep -q "function swScriptUrl" src/js/services/fcmService.js \
  && grep -q "function waitForActive" src/js/services/fcmService.js \
  && grep -q "waitForActive(existing)" src/js/services/fcmService.js \
  && pass "getFcmRegistration installing+active bekleme" \
  || fail "getFcmRegistration installing+active bekleme" "swScriptUrl/waitForActive eksik"
grep -q "Push kaydını yenile" src/js/views/notificationsView.js \
  && grep -q "localStorage.getItem('fcm_token')" src/js/views/notificationsView.js \
  && pass "granted dali yenile butonu + token durumu" \
  || fail "granted dali yenile butonu + token durumu" "buton/durum eksik"
REQ_COUNT=$(grep -c "requestNotificationPermission(" src/js/views/notificationsView.js || true)
if [ "$REQ_COUNT" -le 1 ]; then pass "default dali tek izin istegi (cagri=$REQ_COUNT)";
else fail "default dali tek izin istegi" "cagri sayisi=$REQ_COUNT"; fi
grep -q "data.unread !== undefined" worker/index.js \
  && ! grep -q "String((data && data.unread) || '')" worker/index.js \
  && pass "worker unread 0->'0' duzeltmesi" \
  || fail "worker unread 0->'0' duzeltmesi" "eski ifade duruyor veya yeni yok"
grep -q "p.catch" src/js/services/authHelper.js \
  && grep -q "p.catch" src/js/services/fcmService.js \
  && grep -q "p.catch" public/firebase-messaging-sw.js \
  && pass "setAppBadge/clearAppBadge .catch (3 dosya)" \
  || fail "setAppBadge/clearAppBadge .catch (3 dosya)" "bir dosyada p.catch yok"
grep -q "| T14 |" plan.md && grep -q "| T15 |" plan.md && grep -q "| T16 |" plan.md \
  && pass "plan.md T14-T16" \
  || fail "plan.md T14-T16" "satir eksik"
grep -q "updateViaCache" src/js/services/swRegister.js \
  && grep -q "controllerchange" src/js/services/swRegister.js \
  && grep -q "reg.update" src/js/services/swRegister.js \
  && pass "swRegister guncelleme hatti" \
  || fail "swRegister guncelleme hatti" "updateViaCache/controllerchange/reg.update eksik"
grep -q "res.ok" public/sw.js \
  && grep -q "c.put('/', copy" public/sw.js \
  && pass "sw.js navigate res.ok + ikili taze" \
  || fail "sw.js navigate res.ok + ikili taze" "res.ok/c.put ikili taze eksik"
grep -q "skipWaiting" public/firebase-messaging-sw.js \
  && pass "FCM SW skipWaiting" \
  || fail "FCM SW skipWaiting" "skipWaiting yok"
grep -q "__appVersionReloading" src/js/services/version.js \
  && pass "version.js guvenli goc" \
  || fail "version.js guvenli goc" "__appVersionReloading yok"
grep -q "v1.4.9" plan.md \
  && pass "plan.md v1.4.9 girdisi" \
  || fail "plan.md v1.4.9 girdisi" "yok"

grep -q "| T17 |" plan.md \
  && grep -q "v1.4.10" plan.md \
  && pass "plan.md T17 + v1.4.10" \
  || fail "plan.md T17 + v1.4.10" "T17/v1.4.10 eksik (bump adiminda eklenecek)"

echo "== [d] 4 dosya surum senkronu (beklenen: 1.4.10) =="
PKG_V=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)" 2>/dev/null || echo "?")
[ "$PKG_V" = "1.4.10" ] && pass "package.json version=1.4.10" || fail "package.json version" "bulunan=$PKG_V"
grep -q "'1.4.10'" src/js/services/version.js && pass "version.js APP_VERSION" || fail "version.js APP_VERSION" "1.4.10 yok"
grep -q "Sürüm v1.4.10" index.html && pass "index.html footer" || fail "index.html footer" "Surum v1.4.10 yok"
grep -q "'appgaraj-v1-4-10'" public/sw.js && pass "sw.js CACHE_NAME" || fail "sw.js CACHE_NAME" "appgaraj-v1-4-10 yok"

echo "------------------------------"
echo "SONUC: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "HATASIZ" || echo "HATA LISTESI yukaridaki FAIL satirlaridir."
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
