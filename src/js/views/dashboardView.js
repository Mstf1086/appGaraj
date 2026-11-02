import { collection as fsCollection, addDoc as fsAddDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase.js";
import { cacheSetGarage } from "../services/dataCache.js";
import { loadGarages, handleGarageAction, handleGarageSubmit } from "./garageModule.js";
import { handleVehicleAction, handleVehicleSubmit } from "./vehicleModule.js";
import { createNavbar } from "../services/authHelper.js";
import { el, clearElement } from "../services/dom.js";

export async function renderDashboardView(container, navigate) {
  const user = auth.currentUser;
  if (!user) {
    navigate('login');
    return;
  }

  clearElement(container);

  const navbar = await createNavbar(user, 'dashboard', navigate);

  const toggleAddGarageBtn = el('button', { id: 'toggle-add-garage-btn', className: 'btn btn-primary btn-sm' }, ['+ Yeni Garaj Ekle']);
  const sectionHeader = el('div', { className: 'section-header' }, [
    el('h1', {}, ['Garajlarım ve Araçlarım']),
    toggleAddGarageBtn
  ]);

  const garageFormError = el('div', { id: 'garage-form-error', className: 'error-message hidden form-error' });
  const garageNameInput = el('input', { type: 'text', id: 'garage-name', required: true, placeholder: 'Örn: Ana Garaj' });
  const cancelAddGarageBtn = el('button', { type: 'button', id: 'cancel-add-garage', className: 'btn btn-secondary btn-sm' }, ['İptal']);

  const addGarageForm = el('form', { id: 'add-garage-form', className: 'stacked-form' }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'garage-name' }, ['Garaj Adı']),
      garageNameInput
    ]),
    el('div', { className: 'btn-row' }, [
      el('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, ['Garajı Kaydet']),
      cancelAddGarageBtn
    ])
  ]);

  const addGarageContainer = el('div', { id: 'add-garage-container', className: 'inline-form-container' }, [
    el('h3', {}, ['Yeni Garaj Oluştur']),
    garageFormError,
    addGarageForm
  ]);

  const globalError = el('div', { id: 'dashboard-global-error', className: 'error-message hidden' });

  const garagesListContainer = el('div', { id: 'garages-list-container', className: 'garage-grid' }, [
    el('div', { className: 'loading-screen loading-screen-tall' }, ['Garajlar yükleniyor...'])
  ]);

  const mainContent = el('div', { className: 'main-content' }, [
    sectionHeader,
    addGarageContainer,
    globalError,
    garagesListContainer
  ]);

  container.appendChild(navbar);
  container.appendChild(mainContent);

  toggleAddGarageBtn.addEventListener('click', () => {
    addGarageContainer.classList.toggle('active');
  });

  cancelAddGarageBtn.addEventListener('click', () => {
    addGarageContainer.classList.remove('active');
    addGarageForm.reset();
    garageFormError.classList.add('hidden');
  });

  garagesListContainer.addEventListener('click', (e) => {
    const target = e.target;
    const actionTarget = target.closest('[data-action]');
    if (!actionTarget) return;

    const action = actionTarget.getAttribute('data-action');
    const id = actionTarget.getAttribute('data-id');

    if (action) {
      if (['edit-vehicle', 'cancel-edit-vehicle', 'delete-vehicle', 'go-vehicle-detail', 'toggle-add-vehicle', 'cancel-add-vehicle'].includes(action)) {
        handleVehicleAction(action, actionTarget, container, user.uid, navigate);
      } else {
        handleGarageAction(action, id, container, user.uid, navigate);
      }
    }
  });

  garagesListContainer.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const formType = form.getAttribute('data-form');
    if (formType === 'edit-garage') {
      handleGarageSubmit(form, container, user.uid, navigate);
    } else if (formType && formType.includes('vehicle')) {
      handleVehicleSubmit(form, container, user.uid, navigate);
    }
  });

  addGarageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    garageFormError.classList.add('hidden');
    const garageName = garageNameInput.value.trim();
    if (!garageName) return;

    try {
      const ref = await fsAddDoc(fsCollection(db, 'garages'), {
        name: garageName,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      cacheSetGarage(ref.id, { name: garageName, userId: user.uid, createdAt: new Date().toISOString() });
      addGarageForm.reset();
      addGarageContainer.classList.remove('active');
      loadGarages(container, user.uid, navigate);
    } catch (err) {
      console.error('Garaj eklenemedi:', err);
      garageFormError.textContent = 'Hata: ' + err.message;
      garageFormError.classList.remove('hidden');
    }
  });

  loadGarages(container, user.uid, navigate);
}
