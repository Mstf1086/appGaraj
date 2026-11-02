import {
  collection as fsCollection, addDoc as fsAddDoc,
  doc as fsDoc, updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc
} from "firebase/firestore";
import { auth, db } from "../services/firebase.js";
import { createNavbar } from "../services/authHelper.js";
import { el } from "../services/dom.js";
import {
  getCachedVehicle, getCachedRecords, ensureUserData,
  cacheSetRecord, cacheDeleteRecord
} from "../services/dataCache.js";

const categories = [
  { key: 'traffic_insurance', title: 'Trafik Sigortası', type: 'insurance' },
  { key: 'casco', title: 'Kasko', type: 'insurance' },
  { key: 'traffic_fines', title: 'Trafik Cezası', type: 'fine' },
  { key: 'maintenance_repair', title: 'Bakım Onarım', type: 'maint' },
  { key: 'periodic_maintenance', title: 'Periyodik Bakım', type: 'periodic' },
  { key: 'vehicle_inspection', title: 'Araç Muayene', type: 'insp' },
  { key: 'exhaust_inspection', title: 'Egzoz Muayene', type: 'insp' }
];

function appendFormFields(form, type, data = {}) {
  const addField = (labelText, inputAttrs) => {
    const fg = document.createElement('div');
    fg.className = 'form-group form-field-sm';
    if (labelText) {
      const lbl = document.createElement('label');
      lbl.className = 'field-label';
      lbl.textContent = labelText;
      fg.appendChild(lbl);
    }
    const inp = document.createElement(inputAttrs.tag || 'input');
    for (const [k, v] of Object.entries(inputAttrs)) {
      if (k === 'tag') continue;
      if (k === 'options') {
        v.forEach(opt => {
          const optEl = document.createElement('option');
          optEl.value = opt.value;
          optEl.textContent = opt.text;
          if (opt.selected) optEl.selected = true;
          inp.appendChild(optEl);
        });
      } else {
        inp[k] = v;
      }
    }
    fg.appendChild(inp);
    form.appendChild(fg);
  };

  if (type === 'insurance') {
    addField(null, { type: 'text', name: 'company', placeholder: 'Sigorta Şirketi', value: data.company || '', required: true });
    addField(null, { type: 'text', name: 'policyNo', placeholder: 'Poliçe No', value: data.policyNo || '', required: true });
    addField('Başlangıç', { type: 'date', name: 'startDate', value: data.startDate || '', required: true });
    addField('Bitiş', { type: 'date', name: 'endDate', value: data.endDate || '', required: true });
    addField(null, { type: 'number', name: 'amount', placeholder: 'Tutar (TL)', value: data.amount || '', required: true });
  } else if (type === 'fine') {
    addField('Cezanın Kesildiği Tarih', { type: 'date', name: 'date', value: data.date || '', required: true });
    addField('Son Ödeme Tarihi', { type: 'date', name: 'dueDate', value: data.dueDate || '', required: false });
    addField(null, { type: 'number', name: 'amount', placeholder: 'Tutar (TL)', value: data.amount || '', required: true });
    addField(null, { type: 'text', name: 'description', placeholder: 'Açıklama / Sebep', value: data.description || '', required: true });
    addField('Durum', {
      tag: 'select',
      name: 'status',
      required: true,
      options: [
        { value: 'Ödenmedi', text: 'Ödenmedi', selected: (data.status || 'Ödenmedi') === 'Ödenmedi' },
        { value: 'Ödendi', text: 'Ödendi', selected: data.status === 'Ödendi' }
      ]
    });
  } else if (type === 'maint') {
    addField('Tarih', { type: 'date', name: 'date', value: data.date || '', required: true });
    addField(null, { type: 'text', name: 'service', placeholder: 'Servis / Tamirhane', value: data.service || '', required: true });
    addField(null, { type: 'number', name: 'amount', placeholder: 'Tutar (TL)', value: data.amount || '', required: true });
    addField(null, { type: 'text', name: 'description', placeholder: 'Yapılan İşlem', value: data.description || '', required: true });
  } else if (type === 'periodic') {
    addField('Tarih', { type: 'date', name: 'date', value: data.date || '', required: true });
    addField(null, { type: 'number', name: 'km', placeholder: 'Kilometre (KM)', value: data.km || '', required: true });
    addField(null, { type: 'number', name: 'amount', placeholder: 'Tutar (TL)', value: data.amount || '', required: true });
    addField(null, { type: 'text', name: 'description', placeholder: 'Açıklama', value: data.description || '', required: true });
  } else if (type === 'insp') {
    addField('Muayene Tarihi', { type: 'date', name: 'date', value: data.date || '', required: true });
    addField('Geçerlilik Bitiş Tarihi', { type: 'date', name: 'endDate', value: data.endDate || '', required: true });
    addField(null, { type: 'number', name: 'amount', placeholder: 'Tutar (TL)', value: data.amount || '', required: true });
    addField(null, { type: 'text', name: 'station', placeholder: 'İstasyon / Notlar', value: data.station || '', required: true });
  }
}

export async function renderVehicleDetailView(container, navigate, params) {
  const user = auth.currentUser;
  if (!user) {
    navigate('login');
    return;
  }
  const userId = user.uid;

  const garageId = params.get('garageId');
  const vehicleId = params.get('vehicleId');

  if (!garageId || !vehicleId) {
    navigate('dashboard');
    return;
  }

  container.textContent = '';

  const navbar = await createNavbar(user, 'dashboard', navigate);
  container.appendChild(navbar);

  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';

  const flexDiv = document.createElement('div');
  flexDiv.className = 'detail-header';

  const subDiv = document.createElement('div');
  const backBtn = document.createElement('button');
  backBtn.id = 'back-to-dashboard';
  backBtn.className = 'btn btn-secondary btn-sm detail-back-btn';
  backBtn.textContent = '← Garajlara Dön';
  const h1Title = document.createElement('h1');
  h1Title.id = 'vehicle-title';
  h1Title.className = 'detail-title';
  h1Title.textContent = 'Araç Bilgileri Yükleniyor...';

  subDiv.appendChild(backBtn);
  subDiv.appendChild(h1Title);
  flexDiv.appendChild(subDiv);

  const reportBtn = document.createElement('button');
  reportBtn.id = 'generate-vehicle-report';
  reportBtn.className = 'btn btn-primary btn-sm';
  reportBtn.textContent = '📊 Araç Raporu';
  flexDiv.appendChild(reportBtn);

  mainContent.appendChild(flexDiv);

  const errDiv = document.createElement('div');
  errDiv.id = 'vehicle-detail-error';
  errDiv.className = 'error-message hidden';
  mainContent.appendChild(errDiv);

  const reportContainer = document.createElement('div');
  reportContainer.id = 'vehicle-report-container';
  reportContainer.className = 'inline-form-container detail-report-container';
  mainContent.appendChild(reportContainer);

  const trackerContainer = document.createElement('div');
  trackerContainer.id = 'tracker-sections-container';
  trackerContainer.className = 'tracker-container';
  mainContent.appendChild(trackerContainer);

  container.appendChild(mainContent);

  container.querySelector('#back-to-dashboard').addEventListener('click', (e) => { e.preventDefault(); navigate('dashboard'); });
  container.querySelector('#generate-vehicle-report').addEventListener('click', async () => {
    await generateVehicleReport(garageId, vehicleId, reportContainer);
  });

  try {
    // F5/direkt girişte önbellek boş olabilir → veriyi bekle, sonra çiz.
    // (Önbellek hazırsa ensureUserData ağa gitmeden anında döner.)
    await ensureUserData(user.uid);
    const vehicleData = getCachedVehicle(garageId, vehicleId);

    if (!vehicleData) {
      container.querySelector('#vehicle-detail-error').textContent = 'Araç bulunamadı.';
      container.querySelector('#vehicle-detail-error').classList.remove('hidden');
      return;
    }

    container.querySelector('#vehicle-title').textContent = `${vehicleData.brand} ${vehicleData.model} (${vehicleData.plate})`;

    buildTrackerCategories(container, garageId, vehicleId, user.uid);
  } catch (err) {
    const errEl = container.querySelector('#vehicle-detail-error');
    errEl.textContent = 'Hata: ' + err.message;
    errEl.classList.remove('hidden');
  }
}

function buildTrackerCategories(container, garageId, vehicleId, userId) {
  const sectionsContainer = container.querySelector('#tracker-sections-container');
  sectionsContainer.textContent = '';

  categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'card tracker-card';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'tracker-card-header';
    const h3 = document.createElement('h3');
    h3.className = 'tracker-card-title';
    h3.textContent = cat.title;
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.setAttribute('data-action', 'toggle-add-sub');
    addBtn.setAttribute('data-sub-col', cat.key);
    addBtn.textContent = '+ Ekle';
    cardHeader.appendChild(h3);
    cardHeader.appendChild(addBtn);

    const addSubBox = document.createElement('div');
    addSubBox.id = `add-sub-box-${cat.key}`;
    addSubBox.className = 'inline-form-container add-sub-box';

    const addForm = document.createElement('form');
    addForm.setAttribute('data-form', 'add-sub');
    addForm.setAttribute('data-sub-col', cat.key);
    addForm.setAttribute('data-sub-type', cat.type);

    appendFormFields(addForm, cat.type);

    const formBtns = document.createElement('div');
    formBtns.className = 'form-btns';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = 'Kaydet';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.setAttribute('data-action', 'cancel-add-sub');
    cancelBtn.setAttribute('data-sub-col', cat.key);
    cancelBtn.textContent = 'İptal';
    formBtns.appendChild(saveBtn);
    formBtns.appendChild(cancelBtn);
    addForm.appendChild(formBtns);
    addSubBox.appendChild(addForm);

    const subList = document.createElement('div');
    subList.id = `sub-list-${cat.key}`;
    subList.className = 'sub-list';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-text';
    loadingDiv.textContent = 'Yükleniyor...';
    subList.appendChild(loadingDiv);

    card.appendChild(cardHeader);
    card.appendChild(addSubBox);
    card.appendChild(subList);

    sectionsContainer.appendChild(card);
    loadCategoryRecords(garageId, vehicleId, cat.key, card);
  });

  sectionsContainer.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');
    const subCol = target.getAttribute('data-sub-col');
    const subId = target.getAttribute('data-sub-id');

    if (action === 'toggle-add-sub') {
      container.querySelector(`#add-sub-box-${subCol}`)?.classList.toggle('active');
    }
    if (action === 'cancel-add-sub') {
      const box = container.querySelector(`#add-sub-box-${subCol}`);
      if (box) { box.classList.remove('active'); box.querySelector('form').reset(); }
    }
    if (action === 'cancel-edit-sub') {
      container.querySelector(`#edit-sub-box-${subId}`)?.remove();
    }
    if (action === 'edit-sub') {
      const itemEl = container.querySelector(`#sub-item-${subId}`);
      if (!itemEl) return;
      if (itemEl.querySelector(`#edit-sub-box-${subId}`)) {
        itemEl.querySelector(`#edit-sub-box-${subId}`).remove();
        return;
      }
      const catObj = categories.find(c => c.key === subCol);
      try {
        const recordJson = itemEl.getAttribute('data-record');
        const d = recordJson ? JSON.parse(recordJson) : {};

        const editBox = document.createElement('div');
        editBox.id = `edit-sub-box-${subId}`;
        editBox.className = 'inline-form-container active sub-edit-box';

        const editForm = document.createElement('form');
        editForm.setAttribute('data-form', 'edit-sub');
        editForm.setAttribute('data-sub-col', subCol);
        editForm.setAttribute('data-sub-id', subId);
        editForm.setAttribute('data-sub-type', catObj.type);

        appendFormFields(editForm, catObj.type, d);

        const editBtns = document.createElement('div');
        editBtns.className = 'sub-edit-btns';
        const updateBtn = document.createElement('button');
        updateBtn.type = 'submit';
        updateBtn.className = 'btn btn-primary btn-sm';
        updateBtn.textContent = 'Güncelle';
        const cancelEditBtn = document.createElement('button');
        cancelEditBtn.type = 'button';
        cancelEditBtn.className = 'btn btn-secondary btn-sm';
        cancelEditBtn.setAttribute('data-action', 'cancel-edit-sub');
        cancelEditBtn.setAttribute('data-sub-id', subId);
        cancelEditBtn.textContent = 'İptal';
        editBtns.appendChild(updateBtn);
        editBtns.appendChild(cancelEditBtn);
        editForm.appendChild(editBtns);
        editBox.appendChild(editForm);
        itemEl.appendChild(editBox);
      } catch (err) {
        console.error('Düzenleme formu hazırlanamadı:', err);
        alert('Hata: ' + err.message);
      }
    }
    if (action === 'delete-sub') {
      if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
      try {
        await fsDeleteDoc(fsDoc(db, `garages/${garageId}/vehicles/${vehicleId}/${subCol}`, subId));
        cacheDeleteRecord(garageId, vehicleId, subCol, subId);
        container.querySelector(`#sub-item-${subId}`)?.remove();
        const cardEl = target.closest('.tracker-card');
        if (cardEl) {
          const listContainer = cardEl.querySelector(`#sub-list-${subCol}`);
          if (listContainer && !listContainer.querySelector('[id^="sub-item-"]')) {
            listContainer.textContent = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'sub-empty';
            emptyDiv.textContent = 'Kayıt bulunmuyor.';
            listContainer.appendChild(emptyDiv);
          }
        }
        loadCategoryRecords(garageId, vehicleId, subCol, cardEl);
      } catch (err) {
        console.error('Kayıt silinemedi:', err);
        alert('Hata: ' + err.message);
      }
    }
  });

  sectionsContainer.addEventListener('submit', async (e) => {
    if (!(e.target instanceof HTMLFormElement)) return;
    e.preventDefault();
    const form = e.target;
    const formType = form.getAttribute('data-form');
    if (formType === 'add-sub') {
      const subCol = form.getAttribute('data-sub-col');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      data.userId = userId;
      data.createdAt = new Date().toISOString();
      if (data.amount) data.amount = Number(data.amount);
      if (data.km) data.km = Number(data.km);

      try {
        const ref = await fsAddDoc(fsCollection(db, `garages/${garageId}/vehicles/${vehicleId}/${subCol}`), data);
        cacheSetRecord(garageId, vehicleId, subCol, ref.id, data);
        form.reset();
        container.querySelector(`#add-sub-box-${subCol}`)?.classList.remove('active');
        const cardEl = form.closest('.tracker-card') || form.closest('div[style*="background"]');
        loadCategoryRecords(garageId, vehicleId, subCol, cardEl);
      } catch (err) {
        console.error('Kayıt eklenemedi:', err);
        alert('Hata: ' + err.message);
      }
    }
    if (formType === 'edit-sub') {
      const subCol = form.getAttribute('data-sub-col');
      const subId = form.getAttribute('data-sub-id');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      if (data.amount) data.amount = Number(data.amount);
      if (data.km) data.km = Number(data.km);

      try {
        await fsUpdateDoc(fsDoc(db, `garages/${garageId}/vehicles/${vehicleId}/${subCol}`, subId), data);
        cacheSetRecord(garageId, vehicleId, subCol, subId, data);

        const itemEl = container.querySelector(`#sub-item-${subId}`);
        if (itemEl) {
          itemEl.setAttribute('data-record', JSON.stringify(data));
          const infoDiv = itemEl.firstElementChild;
          if (infoDiv) {
            populateRecordContent(infoDiv, subCol, data);
          }
          itemEl.querySelector(`#edit-sub-box-${subId}`)?.remove();
        }

        const cardEl = form.closest('.tracker-card') || form.closest('div[style*="background"]');
        loadCategoryRecords(garageId, vehicleId, subCol, cardEl);
      } catch (err) {
        console.error('Kayıt güncellenemedi:', err);
        alert('Hata: ' + err.message);
      }
    }
  });
}

function populateRecordContent(infoDiv, subCol, d) {
  infoDiv.textContent = '';
  infoDiv.className = 'record-info';

  const formatMoney = (val) => {
    if (val === undefined || val === null || val === '') return '0,00 TL';
    const num = Number(val);
    return isNaN(num) ? val + ' TL' : num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  };

  const metaRow = document.createElement('div');
  metaRow.className = 'record-meta';

  if (subCol === 'traffic_insurance' || subCol === 'casco') {
    const p0 = document.createElement('div');
    const s0 = document.createElement('strong');
    s0.textContent = 'Şirket: ';
    p0.appendChild(s0);
    p0.appendChild(document.createTextNode(d.company || '-'));

    const p1 = document.createElement('div');
    const s1 = document.createElement('strong');
    s1.textContent = 'Poliçe No: ';
    p1.appendChild(s1);
    p1.appendChild(document.createTextNode(d.policyNo || '-'));

    const p2 = document.createElement('div');
    p2.textContent = `Başlangıç Tarihi: ${d.startDate || '-'}`;
    const p3 = document.createElement('div');
    p3.textContent = `Bitiş Tarihi: ${d.endDate || '-'}`;
    const p4 = document.createElement('div');
    p4.textContent = `Tutar: ${formatMoney(d.amount)}`;

    metaRow.appendChild(p0);
    metaRow.appendChild(p1);
    metaRow.appendChild(p2);
    metaRow.appendChild(p3);
    metaRow.appendChild(p4);

  } else if (subCol === 'traffic_fines') {
    const p1 = document.createElement('div');
    p1.textContent = `Tarih: ${d.date || '-'}`;
    const p2 = document.createElement('div');
    p2.textContent = `Son Ödeme: ${d.dueDate || '-'}`;
    const p3 = document.createElement('div');
    p3.textContent = `Tutar: ${formatMoney(d.amount)}`;
    const p4 = document.createElement('div');
    const statusSpan = document.createElement('span');
    statusSpan.className = 'status-badge ' + (d.status === 'Ödendi' ? 'status-badge-paid' : 'status-badge-unpaid');
    statusSpan.textContent = d.status || 'Bekliyor';
    p4.appendChild(statusSpan);

    metaRow.appendChild(p1);
    metaRow.appendChild(p2);
    metaRow.appendChild(p3);
    metaRow.appendChild(p4);

  } else if (subCol === 'maintenance_repair') {
    const p0 = document.createElement('div');
    const s0 = document.createElement('strong');
    s0.textContent = 'Servis: ';
    p0.appendChild(s0);
    p0.appendChild(document.createTextNode(d.service || '-'));

    const p1 = document.createElement('div');
    p1.textContent = `Tarih: ${d.date || '-'}`;
    const p2 = document.createElement('div');
    p2.textContent = `Tutar: ${formatMoney(d.amount)}`;

    metaRow.appendChild(p0);
    metaRow.appendChild(p1);
    metaRow.appendChild(p2);

  } else if (subCol === 'periodic_maintenance') {
    const p1 = document.createElement('div');
    p1.textContent = `KM: ${d.km ? Number(d.km).toLocaleString('tr-TR') + ' KM' : '-'}`;
    const p2 = document.createElement('div');
    p2.textContent = `Tarih: ${d.date || '-'}`;
    const p3 = document.createElement('div');
    p3.textContent = `Tutar: ${formatMoney(d.amount)}`;

    metaRow.appendChild(p1);
    metaRow.appendChild(p2);
    metaRow.appendChild(p3);

  } else if (subCol === 'vehicle_inspection' || subCol === 'exhaust_inspection') {
    const p1 = document.createElement('div');
    p1.textContent = `Tarih: ${d.date || '-'}`;
    const p2 = document.createElement('div');
    p2.textContent = `Son Geçerlilik: ${d.endDate || '-'}`;
    const p3 = document.createElement('div');
    p3.textContent = `İstasyon: ${d.station || '-'}`;
    const p4 = document.createElement('div');
    p4.textContent = `Tutar: ${formatMoney(d.amount)}`;

    metaRow.appendChild(p1);
    metaRow.appendChild(p2);
    metaRow.appendChild(p3);
    metaRow.appendChild(p4);
  }

  infoDiv.appendChild(metaRow);

  if (d.description) {
    const descDiv = document.createElement('div');
    descDiv.className = 'record-desc';
    descDiv.textContent = `Açıklama: ${d.description}`;
    infoDiv.appendChild(descDiv);
  }
}

async function loadCategoryRecords(garageId, vehicleId, subCol, cardEl) {
  const listContainer = cardEl.querySelector(`#sub-list-${subCol}`);
  // Kayıtlar Firestore'dan DEĞİL, merkezi önbellekten okunur (istek yok).
  const records = getCachedRecords(garageId, vehicleId, subCol);
  if (records.length === 0) {
      listContainer.textContent = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'sub-empty';
      emptyDiv.textContent = 'Kayıt bulunmuyor.';
      listContainer.appendChild(emptyDiv);
      return;
    }

    listContainer.textContent = '';
    records.forEach((d) => {
      const subId = d.id;

      const item = document.createElement('div');
      item.id = `sub-item-${subId}`;
      item.setAttribute('data-record', JSON.stringify(d));
      item.className = 'sub-item';

      const infoDiv = document.createElement('div');
      populateRecordContent(infoDiv, subCol, d);

      const actionBtnsDiv = document.createElement('div');
      actionBtnsDiv.className = 'sub-actions';

      const editSubBtn = document.createElement('button');
      editSubBtn.className = 'btn btn-secondary btn-sm sub-edit-btn';
      editSubBtn.setAttribute('data-action', 'edit-sub');
      editSubBtn.setAttribute('data-sub-col', subCol);
      editSubBtn.setAttribute('data-sub-id', subId);
      editSubBtn.textContent = 'Düzenle';

      const delSubBtn = document.createElement('button');
      delSubBtn.className = 'btn btn-danger btn-sm sub-delete-btn';
      delSubBtn.setAttribute('data-action', 'delete-sub');
      delSubBtn.setAttribute('data-sub-col', subCol);
      delSubBtn.setAttribute('data-sub-id', subId);
      delSubBtn.textContent = 'Sil';

      actionBtnsDiv.appendChild(editSubBtn);
      actionBtnsDiv.appendChild(delSubBtn);

      item.appendChild(infoDiv);
      item.appendChild(actionBtnsDiv);
      listContainer.appendChild(item);
    });
}

async function generateVehicleReport(garageId, vehicleId, container) {
  container.classList.toggle('active');
  if (!container.classList.contains('active')) return;

  container.replaceChildren(
    el('div', { className: 'report-loading' }, ['Araç raporu hazırlanıyor...'])
  );

  try {
    const vehicle = getCachedVehicle(garageId, vehicleId) || {};

    let totalExpense = 0;
    const categorySummaries = [];

    for (const cat of categories) {
      const recs = getCachedRecords(garageId, vehicleId, cat.key);
      let catTotal = 0;
      const count = recs.length;
      const records = [];
      recs.forEach(d => {
        const amt = Number(d.amount) || 0;
        catTotal += amt;
        records.push({ ...d });
      });
      totalExpense += catTotal;
      categorySummaries.push({ title: cat.title, count, total: catTotal, records });
    }

    container.textContent = '';
    const headerDiv = document.createElement('div');
    headerDiv.className = 'report-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'report-title';
    titleEl.textContent = `Araç Raporu: ${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.plate || ''})`;

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
    closeBtn.onclick = () => container.classList.remove('active');

    actionBtns.appendChild(printBtn);
    actionBtns.appendChild(closeBtn);
    headerDiv.appendChild(titleEl);
    headerDiv.appendChild(actionBtns);
    container.appendChild(headerDiv);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'report-meta';
    metaDiv.textContent = `Rapor Oluşturma Tarihi: ${new Date().toLocaleString('tr-TR')}`;
    container.appendChild(metaDiv);

    const summaryBox = document.createElement('div');
    summaryBox.className = 'report-summary';

    const totalCard = el('div', { className: 'summary-card' }, [
      el('div', { className: 'summary-card-label' }, ['Toplam Masraf']),
      el('div', { className: 'summary-card-value summary-card-value-primary' }, [
        `${totalExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      ])
    ]);
    summaryBox.appendChild(totalCard);
    container.appendChild(summaryBox);

    const detailsTitle = document.createElement('h4');
    detailsTitle.className = 'report-details-title';
    detailsTitle.textContent = 'Kategori Bazlı Detaylar';
    container.appendChild(detailsTitle);

    categorySummaries.forEach(cat => {
      const catDiv = el('div', { className: 'report-cat-block' }, [
        el('div', { className: 'report-cat-header' }, [
          el('span', {}, [`${cat.title} (${cat.count} kayıt)`]),
          el('span', { className: 'report-cat-total' }, [
            `${cat.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
          ])
        ])
      ]);
      
      if (cat.records.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'report-record-list';
        cat.records.forEach(r => {
          const li = document.createElement('li');
          const dateStr = r.date || r.startDate || 'Tarihsiz';
          const amtStr = r.amount ? ` - ${Number(r.amount).toLocaleString('tr-TR')} TL` : '';
          const descStr = r.description || r.company || r.policyNo || r.station || '';
          li.textContent = `${dateStr}${descStr ? ' | ' + descStr : ''}${amtStr}`;
          ul.appendChild(li);
        });
        catDiv.appendChild(ul);
      }
      container.appendChild(catDiv);
    });

  } catch (err) {
    container.replaceChildren(
      el('div', { className: 'error-message' }, ['Araç raporu oluşturulurken hata: ' + err.message])
    );
  }
}

