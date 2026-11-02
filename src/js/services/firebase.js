// Firebase SDK Entegrasyonu
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, inMemoryPersistence, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Firebase Yapılandırması (Sağlanan gerçek bilgiler)
const firebaseConfig = {
  apiKey: "AIzaSyB-avjlRFAwtUhLicT3f5JwOeCwzUY6NOo",
  authDomain: "garaj-53f16.firebaseapp.com",
  projectId: "garaj-53f16",
  storageBucket: "garaj-53f16.firebasestorage.app",
  messagingSenderId: "385181058461",
  appId: "1:385181058461:web:7a3371d8b1067b4d62db74"
};

// Firebase başlatma
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Browser local persistence failed, falling back to in-memory:", err);
  setPersistence(auth, inMemoryPersistence).catch(e => console.error("In-memory persistence failed:", e));
});

// Emülatör desteği (isteğe bağlı): yalnızca geliştirme modunda ve açıkça istendiğinde bağlanır.
// Kullanım: VITE_USE_FIREBASE_EMULATORS=true npm run dev  (emülatörler: npm run emulators)
// Üretim derlemesinde DEV=false olduğundan bu blok hiçbir zaman çalışmaz.
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info("[firebase] Emülatörlere bağlandı: auth@9099, firestore@8080");
}

