import { 
  collection as fsCollection, addDoc as fsAddDoc, getDocs as fsGetDocs, 
  query as fsQuery, where as fsWhere, deleteDoc as fsDeleteDoc, 
  doc as fsDoc, updateDoc as fsUpdateDoc, getDoc as fsGetDoc 
} from "firebase/firestore";
import { db } from "../services/firebase.js";
import { el } from "../services/dom.js";
import { loadVehicles } from "./vehicleModule.js";

export async function loadGarages(container, userId, navigate) {
  const garagesContainer = container.querySelector('#garages-list-container');
  const globalError = container.querySelector('#dashboard-global-error');

  try {
    const q = fsQuery(fsCollection(db, 'garages'), fsWhere('userId', '==', userId));
    const snap = await fsGetDocs(q);

    if (snap.empty) {
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
    
    for (const d of snap.docs) {
      const g = d.data();
      const id = d.id;

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
      reportBox.className = 'inline-form-container';
      reportBox.style.cssText = 'padding: 1.5rem; margin-top: 0.5rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius);';
      card.appendChild(reportBox);

      const editBox = document.createElement('div');
      editBox.id = `edit-garage-box-${id}`;
      editBox.className = 'inline-form-container';
      editBox.style.cssText = 'padding: 1rem; margin-top: 0.5rem;';

      const editForm = document.createElement('form');
      editForm.setAttribute('data-form', 'edit-garage');
      editForm.setAttribute('data-id', id);

      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      formGroup.style.marginBottom = '0.5rem';

      const input = document.createElement('input');
      input.type = 'text';
      input.id = `edit-garage-name-${id}`;
      input.value = g.name || '';
      input.required = true;
      formGroup.appendChild(input);

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display: flex; gap: 0.5rem;';

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
      bodyHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;';
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
      addVehicleBox.className = 'inline-form-container';
      addVehicleBox.style.cssText = 'padding: 1rem; margin-bottom: 0.75rem;';

      const addVehicleForm = document.createElement('form');
      addVehicleForm.setAttribute('data-form', 'add-vehicle');
      addVehicleForm.setAttribute('data-garage-id', id);

      [
        { id: `v-brand-${id}`, name: 'brand', ph: 'Marka' },
        { id: `v-model-${id}`, name: 'model', ph: 'Model' },
        { id: `v-plate-${id}`, name: 'plate', ph: 'Plaka' }
      ].forEach(fieldObj => {
        const fg = document.createElement('div');
        fg.className = 'form-group';
        fg.style.marginBottom = '0.5rem';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = fieldObj.id;
        inp.name = fieldObj.name;
        inp.required = true;
        inp.placeholder = fieldObj.ph;
        if (fieldObj.name === 'plate') {
          inp.style.textTransform = 'uppercase';
          inp.addEventListener('input', (e) => {
            e.target.value = e.target.value.toLocaleUpperCase('tr-TR');
          });
        }
        fg.appendChild(inp);
        addVehicleForm.appendChild(fg);
      });

      const addBtnContainer = document.createElement('div');
      addBtnContainer.style.cssText = 'display: flex; gap: 0.5rem;';
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
      loadingDiv.style.cssText = 'font-size: 0.875rem; color: var(--text-muted);';
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
    globalError.style.display = 'block';
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
      const snap = await fsGetDocs(fsQuery(fsCollection(db, `garages/${id}/vehicles`), fsWhere('userId', '==', userId)));
      if (!snap.empty) {
        alert('Bu garajda araç var! Önce araçları silmelisiniz.');
        return;
      }
      await fsDeleteDoc(fsDoc(db, 'garages', id));
      loadGarages(container, userId, navigate);
    } catch (err) {
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
    loadGarages(container, userId, navigate);
  } catch (err) {
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
    el('div', { style: { fontSize: '0.9rem', color: 'var(--text-muted)' } }, ['Garaj raporu hazırlanıyor...'])
  );

  try {
    const garageDoc = await fsGetDoc(fsDoc(db, 'garages', garageId));
    const garageName = garageDoc.exists() ? garageDoc.data().name : 'Garaj';

    const vehiclesSnap = await fsGetDocs(fsQuery(fsCollection(db, `garages/${garageId}/vehicles`), fsWhere('userId', '==', userId)));
    
    let totalGarageExpense = 0;
    let totalVehicleCount = vehiclesSnap.size;
    const vehicleSummaries = [];

    for (const vDoc of vehiclesSnap.docs) {
      const vData = vDoc.data();
      const vId = vDoc.id;
      let vTotal = 0;
      let vRecordsCount = 0;

      for (const cat of garageReportCategories) {
        const subSnap = await fsGetDocs(fsCollection(db, `garages/${garageId}/vehicles/${vId}/${cat.key}`));
        vRecordsCount += subSnap.size;
        subSnap.forEach(sDoc => {
          vTotal += Number(sDoc.data().amount) || 0;
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
    headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;';
    
    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'font-size: 1.3rem; font-weight: 700; color: var(--text-main);';
    titleEl.textContent = `Garaj Raporu: ${garageName}`;

    const actionBtns = document.createElement('div');
    actionBtns.className = 'report-actions';
    actionBtns.style.cssText = 'display: flex; gap: 0.5rem;';
    
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
    metaDiv.style.cssText = 'font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;';
    metaDiv.textContent = `Rapor Oluşturma Tarihi: ${new Date().toLocaleString('tr-TR')}`;
    reportBox.appendChild(metaDiv);

    const summaryBox = document.createElement('div');
    summaryBox.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;';
    
    const totalCard = el('div', { style: { background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' } }, [
      el('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, ['Toplam Garaj Masrafı']),
      el('div', { style: { fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary)', marginTop: '0.25rem' } }, [
        `${totalGarageExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      ])
    ]);

    const countCard = el('div', { style: { background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' } }, [
      el('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, ['Toplam Araç Sayısı']),
      el('div', { style: { fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' } }, [String(totalVehicleCount)])
    ]);

    summaryBox.appendChild(totalCard);
    summaryBox.appendChild(countCard);
    reportBox.appendChild(summaryBox);

    const detailsTitle = document.createElement('h4');
    detailsTitle.style.cssText = 'font-size: 1.1rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-main);';
    detailsTitle.textContent = 'Araç Bazlı Masraf Dağılımı';
    reportBox.appendChild(detailsTitle);

    if (vehicleSummaries.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.style.cssText = 'font-size: 0.9rem; color: var(--text-muted);';
      emptyP.textContent = 'Bu garajda kayıtlı araç bulunmuyor.';
      reportBox.appendChild(emptyP);
    } else {
      vehicleSummaries.forEach(v => {
        const vDiv = el('div', { style: { marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          el('div', {}, [
            el('strong', {}, [`${v.brand} ${v.model}`]),
            ` (${v.plate}) `,
            el('span', { style: { fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' } }, [`(${v.recordsCount} kayıt)`])
          ]),
          el('div', { style: { fontWeight: '700', color: 'var(--primary)' } }, [
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

