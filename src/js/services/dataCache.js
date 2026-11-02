// ============================================================================
// dataCache.js — Merkezi oturum veri önbelleği
// ============================================================================
// Amaç: Sayfa ilk yüklendiğinde kullanıcının TÜM verilerini (garajlar, araçlar,
// 7 alt koleksiyon kaydı) tek geçişte çekip tarayıcı belleğinde tutmak.
// Tüm görünümler bu önbellekten okur; yazma işlemlerinden sonra önbellek
// cerrahi olarak güncellenir (tekrar tam tarama YOK) → gereksiz Firestore
// isteği atılmaz. Gerçek zamanlı dinleyici (onSnapshot) KULLANILMAZ.
// ============================================================================

import {
  collection as fsCollection, getDocs as fsGetDocs,
  query as fsQuery, where as fsWhere
} from "firebase/firestore";
import { db } from "./firebase.js";

// Alt koleksiyon kategorileri (vehicleDetailView ile aynı liste)
const SUBCOLLECTIONS = [
  'traffic_insurance', 'casco', 'traffic_fines', 'maintenance_repair',
  'periodic_maintenance', 'vehicle_inspection', 'exhaust_inspection'
];

const state = {
  uid: null,
  garages: new Map(),   // garageId -> { id, name, userId, createdAt }
  vehicles: new Map(),  // garageId -> Map(vehicleId -> { id, brand, model, plate, ... })
  records: new Map(),   // `${garageId}/${vehicleId}/${cat}` -> Map(recId -> { id, ...data })
  loadedAt: 0,
  loadingPromise: null
};

export function clearCache() {
  state.garages.clear();
  state.vehicles.clear();
  state.records.clear();
  state.uid = null;
  state.loadedAt = 0;
}

export function isCacheReady() {
  return state.loadedAt > 0;
}

export function getCacheUid() {
  return state.uid;
}

/**
 * Kullanıcının tüm verilerini yükler (yalnızca ilk çağrıda / zorlanırsa ağa gider).
 * Sonraki çağrılar önbellek hazırsa ağ isteği ATMAZ.
 */
export function ensureUserData(uid, { force = false } = {}) {
  if (state.uid !== uid) {
    clearCache();
    state.uid = uid;
  }
  if (state.loadingPromise) return state.loadingPromise;
  if (state.loadedAt && !force) return Promise.resolve();

  const load = async () => {
    state.garages.clear();
    state.vehicles.clear();
    state.records.clear();

    const gSnap = await fsGetDocs(fsQuery(fsCollection(db, 'garages'), fsWhere('userId', '==', uid)));
    gSnap.forEach(d => state.garages.set(d.id, { id: d.id, ...d.data() }));

    for (const gid of state.garages.keys()) {
      const vSnap = await fsGetDocs(fsQuery(fsCollection(db, `garages/${gid}/vehicles`), fsWhere('userId', '==', uid)));
      const vMap = new Map();
      vSnap.forEach(d => vMap.set(d.id, { id: d.id, ...d.data() }));
      state.vehicles.set(gid, vMap);

      for (const vid of vMap.keys()) {
        for (const cat of SUBCOLLECTIONS) {
          const rSnap = await fsGetDocs(fsCollection(db, `garages/${gid}/vehicles/${vid}/${cat}`));
          const rMap = new Map();
          rSnap.forEach(d => rMap.set(d.id, { id: d.id, ...d.data() }));
          state.records.set(`${gid}/${vid}/${cat}`, rMap);
        }
      }
    }
    state.loadedAt = Date.now();
  };

  state.loadingPromise = load().finally(() => { state.loadingPromise = null; });
  return state.loadingPromise;
}

// --- Salt okuma erişimcileri (ağ isteği ATMAZ) -------------------------------

export function getCachedGarages() {
  return [...state.garages.values()];
}

export function getCachedGarage(garageId) {
  return state.garages.get(garageId) || null;
}

export function getCachedVehicles(garageId) {
  return [...(state.vehicles.get(garageId)?.values() || [])];
}

export function getCachedVehicle(garageId, vehicleId) {
  return state.vehicles.get(garageId)?.get(vehicleId) || null;
}

/** Kayıtları { id, ...data } dizisi olarak döndürür (ağ isteği ATMAZ). */
export function getCachedRecords(garageId, vehicleId, cat) {
  return [...(state.records.get(`${garageId}/${vehicleId}/${cat}`)?.values() || [])];
}

// --- Cerrahi önbellek güncelleme (yazma sonrası ağ isteği YOK) ---------------

export function cacheSetGarage(garageId, data) {
  const prev = state.garages.get(garageId) || {};
  state.garages.set(garageId, { ...prev, ...data, id: garageId });
}

export function cacheDeleteGarage(garageId) {
  state.garages.delete(garageId);
  state.vehicles.delete(garageId);
  for (const key of state.records.keys()) {
    if (key.startsWith(`${garageId}/`)) state.records.delete(key);
  }
}

export function cacheSetVehicle(garageId, vehicleId, data) {
  if (!state.vehicles.has(garageId)) state.vehicles.set(garageId, new Map());
  const prev = state.vehicles.get(garageId).get(vehicleId) || {};
  state.vehicles.get(garageId).set(vehicleId, { ...prev, ...data, id: vehicleId });
}

export function cacheDeleteVehicle(garageId, vehicleId) {
  state.vehicles.get(garageId)?.delete(vehicleId);
  for (const key of state.records.keys()) {
    if (key.startsWith(`${garageId}/${vehicleId}/`)) state.records.delete(key);
  }
}

export function cacheSetRecord(garageId, vehicleId, cat, recordId, data) {
  const key = `${garageId}/${vehicleId}/${cat}`;
  if (!state.records.has(key)) state.records.set(key, new Map());
  const prev = state.records.get(key).get(recordId) || {};
  state.records.get(key).set(recordId, { ...prev, ...data, id: recordId });
}

export function cacheDeleteRecord(garageId, vehicleId, cat, recordId) {
  state.records.get(`${garageId}/${vehicleId}/${cat}`)?.delete(recordId);
}

/** Araçta herhangi bir kategoride kayıt var mı? (ağ isteği ATMAZ) */
export function hasAnyCachedRecords(garageId, vehicleId) {
  const prefix = `${garageId}/${vehicleId}/`;
  for (const [key, map] of state.records.entries()) {
    if (key.startsWith(prefix) && map.size > 0) return true;
  }
  return false;
}
