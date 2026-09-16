// Firebase SDK Entegrasyonu
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, inMemoryPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

