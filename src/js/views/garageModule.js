import {
  deleteDoc as fsDeleteDoc,
  doc as fsDoc, updateDoc as fsUpdateDoc
} from "firebase/firestore";
import { db } from "../services/firebase.js";
import { el } from "../services/dom.js";
import { loadVehicles } from "./vehicleModule.js";
import {
  ensureUserData,
  getCachedGarages, getCachedGarage, getCachedVehicles, getCachedRecords,
  cacheSetGarage, cacheDeleteGarage
} from "../services/dataCache.js";

// Garaj listesi Firestore'dan DEĞİL, merkezi önbellekten okunur (istek yok).
// Önbellek henüz yüklenmediyse (ilk açılış) tam yüklemenin bitmesi beklenir —
// bu, app.js'in zaten başlattığı aynı yükleme promise'idir (tek istek turu).
export async function loadGarages(container, userId, navigate) {
  const garagesContainer = container.querySelector('#garages-list-container');
  const globalError = container.querySelector('#dashboard-global-error');

  try {
    await ensureUserData(userId);
    const garages = getCachedGarages();

    if (garages.length === 0) {
      garagesContainer.textContent = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      const h3 = document.createElement('h3');
      h3.textContent = 'Henüz hiç garajınız yok.';
      const p = document.createElement('p');
      p.textContent = '"+ Yeni Garaj Ekle" butonu ile ilk garajınızı oluşturun.';
      emptyDiv.appendChild(h3);
      emptyDiv.appendChild(p);
      garagesContainer.appendChild(emptyDiv);
      return;
    }

    garagesContainer.textContent = '';

    for (const g of garages) {
      const id = g.id;

      const card = document.createElement('div');
      card.className = 'garage-card';

      const header = document.createElement('div');
      header.className = 'garage-header';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'garage-title';
      const h3 = document.createElement('h3');
      h3.textContent = g.name || '';
      titleDiv.appendChild(h3);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'garage-actions';
      const reportBtn = document.createElement('button');
      reportBtn.className = 'btn btn-primary btn-sm';
      reportBtn.setAttribute('data-action', 'garage-report');
      reportBtn.setAttribute('data-id', id);
      reportBtn.textContent = '📊 Rapor';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.setAttribute('data-action', 'edit-garage');
      editBtn.setAttribute('data-id', id);
      editBtn.textContent = 'Düzenle';

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.setAttribute('data-action', 'delete-garage');
      delBtn.setAttribute('data-id', id);
      delBtn.textContent = 'Sil';

      actionsDiv.appendChild(reportBtn);
      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);

      header.appendChild(titleDiv);
      header.appendChild(actionsDiv);
      card.appendChild(header);

      const reportBox = document.createElement('div');
      reportBox.id = `garage-report-box-${id}`;
      reportBox.className = 'inline-form-container garage-report-box';
      card.appendChild(reportBox);

      const editBox = document.createElement('div');
      editBox.id = `edit-garage-box-${id}`;
      editBox.className = 'inline-form-container garage-edit-box';

      const editForm = document.createElement('form');
      editForm.setAttribute('data-form', 'edit-garage');
      editForm.setAttribute('data-id', id);

      const formGroup = document.createElement('div');
      formGroup.className = 'form-group form-group-sm';

      const input = document.createElement('input');
      input.type = 'text';
      input.id = `edit-garage-name-${id}`;
      input.value = g.name || '';
      input.required = true;
      formGroup.appendChild(input);

      const btnContainer = document.createElement('div');
      btnContainer.className = 'btn-row';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.textContent = 'Kaydet';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary btn-sm';
      cancelBtn.setAttribute('data-action', 'cancel-edit-garage');
      cancelBtn.setAttribute('data-id', id);
      cancelBtn.textContent = 'İptal';

      btnContainer.appendChild(saveBtn);
      btnContainer.appendChild(cancelBtn);

      editForm.appendChild(formGroup);
      editForm.appendChild(btnContainer);
      editBox.appendChild(editForm);
      card.appendChild(editBox);

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'garage-body';

      const bodyHeader = document.createElement('div');
      bodyHeader.className = 'garage-body-header';
      const strong = document.createElement('strong');
      strong.textContent = 'Araçlar';
      const addVehicleBtn = document.createElement('button');
      addVehicleBtn.className = 'btn btn-primary btn-sm';
      addVehicleBtn.setAttribute('data-action', 'toggle-add-vehicle');
      addVehicleBtn.setAttribute('data-garage-id', id);
      addVehicleBtn.textContent = '+ Araç Ekle';
      bodyHeader.appendChild(strong);
      bodyHeader.appendChild(addVehicleBtn);

      const addVehicleBox = document.createElement('div');
      addVehicleBox.id = `add-vehicle-box-${id}`;
      addVehicleBox.className = 'inline-form-container garage-add-vehicle-box';

      const addVehicleForm = document.createElement('form');
      addVehicleForm.setAttribute('data-form', 'add-vehicle');
      addVehicleForm.setAttribute('data-garage-id', id);

      [
        { id: `v-brand-${id}`, name: 'brand', ph: 'Marka' },
        { id: `v-model-${id}`, name: 'model', ph: 'Model' },
        { id: `v-plate-${id}`, name: 'plate', ph: 'Plaka' }
      ].forEach(fieldObj => {
        const fg = document.createElement('div');
        fg.className = 'form-group form-group-sm';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = fieldObj.id;
        inp.name = fieldObj.name;
        inp.required = true;
        inp.placeholder = fieldObj.ph;
        if (fieldObj.name === 'plate') {
          inp.classList.add('input-uppercase');
          inp.addEventListener('input', (e) => {
            e.target.value = e.target.value.toLocaleUpperCase('tr-TR');
          });
        }
        fg.appendChild(inp);
        addVehicleForm.appendChild(fg);
      });

      const addBtnContainer = document.createElement('div');
      addBtnContainer.className = 'btn-row';
      const addSubmitBtn = document.createElement('button');
      addSubmitBtn.type = 'submit';
      addSubmitBtn.className = 'btn btn-primary btn-sm';
      addSubmitBtn.textContent = 'Aracı Kaydet';
      const addCancelBtn = document.createElement('button');
      addCancelBtn.type = 'button';
      addCancelBtn.className = 'btn btn-secondary btn-sm';
      addCancelBtn.setAttribute('data-action', 'cancel-add-vehicle');
      addCancelBtn.setAttribute('data-garage-id', id);
      addCancelBtn.textContent = 'İptal';
      addBtnContainer.appendChild(addSubmitBtn);
      addBtnContainer.appendChild(addCancelBtn);
      addVehicleForm.appendChild(addBtnContainer);
      addVehicleBox.appendChild(addVehicleForm);

      const vehiclesList = document.createElement('div');
      vehiclesList.id = `vehicles-list-${id}`;
      vehiclesList.className = 'vehicle-list';
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-text';
      loadingDiv.textContent = 'Yükleniyor...';
      vehiclesList.appendChild(loadingDiv);

      bodyDiv.appendChild(bodyHeader);
      bodyDiv.appendChild(addVehicleBox);
      bodyDiv.appendChild(vehiclesList);
      card.appendChild(bodyDiv);

      garagesContainer.appendChild(card);
      loadVehicles(id, userId, card);
    }
  } catch (err) {
    globalError.textContent = 'Hata: ' + err.message;
    globalError.classList.remove('hidden');
  }
}

export async function handleGarageAction(action, id, container, userId, navigate) {
  if (action === 'edit-garage') container.querySelector(`#edit-garage-box-${id}`)?.classList.toggle('active');
  if (action === 'cancel-edit-garage') container.querySelector(`#edit-garage-box-${id}`)?.classList.remove('active');
  if (action === 'garage-report') {
    await generateGarageReport(id, userId, container);
  }
  if (action === 'delete-garage') {
    if (!confirm('Garajı silmek istediğinize emin misiniz?')) return;
    try {
      const hasVehicle = getCachedVehicles(id).length > 0;
      if (hasVehicle) {
        alert('Bu garajda araç var! Önce araçları silmelisiniz.');
        return;
      }
      await fsDeleteDoc(fsDoc(db, 'garages', id));
      cacheDeleteGarage(id);
      loadGarages(container, userId, navigate);
    } catch (err) {
      console.error('Garaj silinemedi:', err);
      alert('Hata: ' + err.message);
    }
  }
  if (action === 'toggle-add-vehicle') container.querySelector(`#add-vehicle-box-${id}`)?.classList.toggle('active');
  if (action === 'cancel-add-vehicle') {
    const box = container.querySelector(`#add-vehicle-box-${id}`);
    if (box) { box.classList.remove('active'); box.querySelector('form').reset(); }
  }
}

export async function handleGarageSubmit(form, container, userId, navigate) {
  const id = form.getAttribute('data-id');
  const name = container.querySelector(`#edit-garage-name-${id}`).value.trim();
  if (!name) return;
  try {
    await fsUpdateDoc(fsDoc(db, 'garages', id), { name });
    cacheSetGarage(id, { name });
    loadGarages(container, userId, navigate);
  } catch (err) {
    console.error('Garaj güncellenemedi:', err);
    alert('Hata: ' + err.message);
  }
}

const garageReportCategories = [
  { key: 'traffic_insurance', title: 'Trafik Sigortası' },
  { key: 'casco', title: 'Kasko' },
  { key: 'traffic_fines', title: 'Trafik Cezası' },
  { key: 'maintenance_repair', title: 'Bakım Onarım' },
  { key: 'periodic_maintenance', title: 'Periyodik Bakım' },
  { key: 'vehicle_inspection', title: 'Araç Muayene' },
  { key: 'exhaust_inspection', title: 'Egzoz Muayene' }
];

async function generateGarageReport(garageId, userId, container) {
  const reportBox = container.querySelector(`#garage-report-box-${garageId}`);
  if (!reportBox) return;
  reportBox.classList.toggle('active');
  if (!reportBox.classList.contains('active')) return;

  reportBox.replaceChildren(
    el('div', { className: 'report-loading' }, ['Garaj raporu hazırlanıyor...'])
  );

  try {
    const garageName = getCachedGarage(garageId)?.name || 'Garaj';

    const vehicles = getCachedVehicles(garageId);

    let totalGarageExpense = 0;
    let totalVehicleCount = vehicles.length;
    const vehicleSummaries = [];

    for (const vData of vehicles) {
      const vId = vData.id;
      let vTotal = 0;
      let vRecordsCount = 0;

      for (const cat of garageReportCategories) {
        const records = getCachedRecords(garageId, vId, cat.key);
        vRecordsCount += records.length;
        records.forEach(r => {
          vTotal += Number(r.amount) || 0;
        });
      }

      totalGarageExpense += vTotal;
      vehicleSummaries.push({
        brand: vData.brand || '',
        model: vData.model || '',
        plate: vData.plate || '',
        total: vTotal,
        recordsCount: vRecordsCount
      });
    }

    reportBox.textContent = '';
    const headerDiv = document.createElement('div');
    headerDiv.className = 'report-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'report-title';
    titleEl.textContent = `Garaj Raporu: ${garageName}`;

    const actionBtns = document.createElement('div');
    actionBtns.className = 'report-actions';
    actionBtns.classList.add('btn-row');
    
    const printBtn = document.createElement('button');
    printBtn.className = 'btn btn-secondary btn-sm';
    printBtn.textContent = 'Yazdır';
    printBtn.onclick = () => window.print();

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-danger btn-sm';
    closeBtn.textContent = 'Kapat';
    closeBtn.onclick = () => reportBox.classList.remove('active');

    actionBtns.appendChild(printBtn);
    actionBtns.appendChild(closeBtn);
    headerDiv.appendChild(titleEl);
    headerDiv.appendChild(actionBtns);
    reportBox.appendChild(headerDiv);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'report-meta';
    metaDiv.textContent = `Rapor Oluşturma Tarihi: ${new Date().toLocaleString('tr-TR')}`;
    reportBox.appendChild(metaDiv);

    const summaryBox = document.createElement('div');
    summaryBox.className = 'report-summary';

    const totalCard = el('div', { className: 'summary-card' }, [
      el('div', { className: 'summary-card-label' }, ['Toplam Garaj Masrafı']),
      el('div', { className: 'summary-card-value summary-card-value-primary' }, [
        `${totalGarageExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      ])
    ]);

    const countCard = el('div', { className: 'summary-card' }, [
      el('div', { className: 'summary-card-label' }, ['Toplam Araç Sayısı']),
      el('div', { className: 'summary-card-value' }, [String(totalVehicleCount)])
    ]);

    summaryBox.appendChild(totalCard);
    summaryBox.appendChild(countCard);
    reportBox.appendChild(summaryBox);

    const detailsTitle = document.createElement('h4');
    detailsTitle.className = 'report-details-title';
    detailsTitle.textContent = 'Araç Bazlı Masraf Dağılımı';
    reportBox.appendChild(detailsTitle);

    if (vehicleSummaries.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.className = 'report-empty';
      emptyP.textContent = 'Bu garajda kayıtlı araç bulunmuyor.';
      reportBox.appendChild(emptyP);
    } else {
      vehicleSummaries.forEach(v => {
        const vDiv = el('div', { className: 'report-vehicle-item' }, [
          el('div', {}, [
            el('strong', {}, [`${v.brand} ${v.model}`]),
            ` (${v.plate}) `,
            el('span', { className: 'report-vehicle-count' }, [`(${v.recordsCount} kayıt)`])
          ]),
          el('div', { className: 'report-vehicle-cost' }, [
            `${v.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
          ])
        ]);
        reportBox.appendChild(vDiv);
      });
    }

  } catch (err) {
    reportBox.replaceChildren(
      el('div', { className: 'error-message' }, ['Garaj raporu oluşturulurken hata: ' + err.message])
    );
  }
}

