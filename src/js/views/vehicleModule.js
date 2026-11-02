import {
  collection as fsCollection, addDoc as fsAddDoc,
  deleteDoc as fsDeleteDoc,
  doc as fsDoc, updateDoc as fsUpdateDoc
} from "firebase/firestore";
import { db } from "../services/firebase.js";
import { loadGarages } from "./garageModule.js";
import { getCachedVehicles, cacheSetVehicle, cacheDeleteVehicle, hasAnyCachedRecords } from "../services/dataCache.js";

// Araç listesi Firestore'dan DEĞİL, merkezi önbellekten okunur (istek yok).
export async function loadVehicles(garageId, userId, cardEl) {
  const listEl = cardEl.querySelector(`#vehicles-list-${garageId}`);
  const vehicles = getCachedVehicles(garageId).filter(v => !userId || v.userId === userId);

  if (vehicles.length === 0) {
    listEl.textContent = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'vehicle-empty';
    emptyDiv.textContent = 'Araç yok.';
    listEl.appendChild(emptyDiv);
    return;
  }

  listEl.textContent = '';
  vehicles.forEach((v) => {
    const vId = v.id;

      const item = document.createElement('div');
      item.className = 'vehicle-item';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'vehicle-info';
      const h4 = document.createElement('h4');
      h4.textContent = `${v.brand || ''} ${v.model || ''}`;
      const p = document.createElement('p');
      p.textContent = 'Plaka: ';
      const strong = document.createElement('strong');
      strong.textContent = v.plate || '';
      p.appendChild(strong);
      infoDiv.appendChild(h4);
      infoDiv.appendChild(p);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'vehicle-actions vehicle-actions-col';

      const detailBtn = document.createElement('button');
      detailBtn.className = 'btn btn-primary btn-sm';
      detailBtn.setAttribute('data-action', 'go-vehicle-detail');
      detailBtn.setAttribute('data-garage-id', garageId);
      detailBtn.setAttribute('data-vehicle-id', vId);
      detailBtn.textContent = 'Detaylar / Takip';
      detailBtn.classList.add('vehicle-detail-btn');

      const subActionsDiv = document.createElement('div');
      subActionsDiv.className = 'vehicle-sub-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.setAttribute('data-action', 'edit-vehicle');
      editBtn.setAttribute('data-vehicle-id', vId);
      editBtn.textContent = 'Düzenle';
      editBtn.classList.add('vehicle-edit-btn');

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.setAttribute('data-action', 'delete-vehicle');
      delBtn.setAttribute('data-garage-id', garageId);
      delBtn.setAttribute('data-vehicle-id', vId);
      delBtn.textContent = 'Sil';
      delBtn.classList.add('vehicle-delete-btn');

      subActionsDiv.appendChild(editBtn);
      subActionsDiv.appendChild(delBtn);

      actionsDiv.appendChild(detailBtn);
      actionsDiv.appendChild(subActionsDiv);

      const editBox = document.createElement('div');
      editBox.id = `edit-vehicle-box-${vId}`;
      editBox.className = 'inline-form-container vehicle-edit-box';

      const editForm = document.createElement('form');
      editForm.setAttribute('data-form', 'edit-vehicle');
      editForm.setAttribute('data-garage-id', garageId);
      editForm.setAttribute('data-vehicle-id', vId);

      [
        { id: `ev-brand-${vId}`, name: 'brand', val: v.brand, ph: 'Marka' },
        { id: `ev-model-${vId}`, name: 'model', val: v.model, ph: 'Model' },
        { id: `ev-plate-${vId}`, name: 'plate', val: v.plate, ph: 'Plaka' }
      ].forEach(f => {
        const fg = document.createElement('div');
        fg.className = 'form-group form-group-sm';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = f.id;
        inp.name = f.name;
        inp.value = f.val || '';
        inp.required = true;
        inp.placeholder = f.ph;
        if (f.name === 'plate') {
          inp.classList.add('input-uppercase');
          inp.addEventListener('input', (e) => {
            e.target.value = e.target.value.toLocaleUpperCase('tr-TR');
          });
        }
        fg.appendChild(inp);
        editForm.appendChild(fg);
      });

      const btnContainer = document.createElement('div');
      btnContainer.className = 'btn-row';
      const updateBtn = document.createElement('button');
      updateBtn.type = 'submit';
      updateBtn.className = 'btn btn-primary btn-sm';
      updateBtn.textContent = 'Güncelle';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary btn-sm';
      cancelBtn.setAttribute('data-action', 'cancel-edit-vehicle');
      cancelBtn.setAttribute('data-vehicle-id', vId);
      cancelBtn.textContent = 'İptal';
      btnContainer.appendChild(updateBtn);
      btnContainer.appendChild(cancelBtn);
      editForm.appendChild(btnContainer);
      editBox.appendChild(editForm);

      item.appendChild(infoDiv);
      item.appendChild(actionsDiv);
      item.appendChild(editBox);

      listEl.appendChild(item);
  });
}

export async function handleVehicleAction(action, target, container, userId, navigate) {
  const vehicleId = target.getAttribute('data-vehicle-id');
  const garageId = target.getAttribute('data-garage-id');

  if (action === 'toggle-add-vehicle') {
    container.querySelector(`#add-vehicle-box-${garageId}`)?.classList.toggle('active');
  }
  if (action === 'cancel-add-vehicle') {
    const box = container.querySelector(`#add-vehicle-box-${garageId}`);
    box?.classList.remove('active');
    box?.querySelector('form')?.reset();
  }
  if (action === 'edit-vehicle') {
    container.querySelector(`#edit-vehicle-box-${vehicleId}`)?.classList.toggle('active');
  }
  if (action === 'cancel-edit-vehicle') {
    container.querySelector(`#edit-vehicle-box-${vehicleId}`)?.classList.remove('active');
  }
  if (action === 'go-vehicle-detail') {
    navigate(`vehicleDetail?garageId=${garageId}&vehicleId=${vehicleId}`);
    return;
  }
  if (action === 'delete-vehicle') {
    // Araca eklenen kayıt (sigorta, muayene, ceza, bakım vb.) varsa silmeye izin verme
    if (hasAnyCachedRecords(garageId, vehicleId)) {
      alert('Bu araç silinemez: araca eklenmiş kayıtlar var. Önce araç detayından tüm kayıtları silin.');
      return;
    }
    if (!confirm('Aracı silmek istediğinize emin misiniz?')) return;
    try {
      await fsDeleteDoc(fsDoc(db, `garages/${garageId}/vehicles`, vehicleId));
      cacheDeleteVehicle(garageId, vehicleId);
      loadGarages(container, userId, navigate);
    } catch (err) {
      console.error('Araç silinemedi:', err);
      alert('Hata: ' + err.message);
    }
  }
}

export async function handleVehicleSubmit(form, container, userId, navigate) {
  const formType = form.getAttribute('data-form');

  if (formType === 'add-vehicle') {
    const garageId = form.getAttribute('data-garage-id');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const brand = (data.brand || '').trim();
    const model = (data.model || '').trim();
    const plate = (data.plate || '').trim().toLocaleUpperCase('tr-TR');
    if (!brand || !model || !plate) return;

    try {
      const ref = await fsAddDoc(fsCollection(db, `garages/${garageId}/vehicles`), {
        brand, model, plate, userId, createdAt: new Date().toISOString()
      });
      cacheSetVehicle(garageId, ref.id, { brand, model, plate, userId, createdAt: new Date().toISOString() });
      loadGarages(container, userId, navigate);
    } catch (err) {
      console.error('Araç eklenemedi:', err);
      alert('Hata: ' + err.message);
    }
  }

  if (formType === 'edit-vehicle') {
    const garageId = form.getAttribute('data-garage-id');
    const vehicleId = form.getAttribute('data-vehicle-id');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const brand = (data.brand || '').trim();
    const model = (data.model || '').trim();
    const plate = (data.plate || '').trim().toLocaleUpperCase('tr-TR');
    if (!brand || !model || !plate) return;

    try {
      await fsUpdateDoc(fsDoc(db, `garages/${garageId}/vehicles`, vehicleId), { brand, model, plate });
      cacheSetVehicle(garageId, vehicleId, { brand, model, plate });
      loadGarages(container, userId, navigate);
    } catch (err) {
      console.error('Araç güncellenemedi:', err);
      alert('Hata: ' + err.message);
    }
  }
}

