import { 
  collection as fsCollection, doc as fsDoc, getDocs as fsGetDocs, 
  getDoc as fsGetDoc, setDoc as fsSetDoc, addDoc as fsAddDoc, 
  updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc 
} from "firebase/firestore";
import { auth, db } from "../services/firebase.js";
import { createNavbar } from "../services/authHelper.js";
import { el, clearElement } from "../services/dom.js";

export async function renderAdminView(container, navigate) {
  const user = auth.currentUser;
  if (!user) {
    navigate('login');
    return;
  }

  clearElement(container);

  const userRef = fsDoc(db, 'users', user.uid);
  let userSnap;
  try {
    userSnap = await fsGetDoc(userRef, { source: 'server' });
  } catch (e) {
    userSnap = await fsGetDoc(userRef);
  }
  let isAdmin = false;
  if (userSnap.exists()) {
    isAdmin = userSnap.data().role === 'admin';
  } else {
    const usersSnap = await fsGetDocs(fsCollection(db, 'users'));
    const role = usersSnap.empty ? 'admin' : 'user';
    await fsSetDoc(userRef, {
      email: user.email,
      role: role,
      createdAt: new Date().toISOString()
    });
    isAdmin = role === 'admin';
  }

  if (!isAdmin) {
    navigate('dashboard');
    return;
  }

  const navBrand = el('a', { href: '#', className: 'navbar-brand', id: 'nav-brand' }, ['Garaj Yönetimi']);
  const navbar = await createNavbar(user, 'admin', navigate);

  const toggleAddUserBtn = el('button', { id: 'toggle-add-user-btn', className: 'btn btn-primary btn-sm' }, ['+ Yeni Kullanıcı Ekle']);
  const sectionHeader = el('div', { className: 'section-header' }, [
    el('h1', {}, ['Kullanıcı Yönetimi (Admin)']),
    toggleAddUserBtn
  ]);

  const userFormError = el('div', { id: 'user-form-error', className: 'error-message', style: { display: 'none', marginTop: '0.5rem' } });
  const userEmailInput = el('input', { type: 'email', id: 'user-email', required: true, placeholder: 'kullanici@mail.com' });
  const userRoleSelect = el('select', { id: 'user-role', className: 'form-control', style: { width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' } }, [
    el('option', { value: 'user' }, ['Kullanıcı']),
    el('option', { value: 'admin' }, ['Admin'])
  ]);
  const cancelAddUserBtn = el('button', { type: 'button', id: 'cancel-add-user', className: 'btn btn-secondary btn-sm' }, ['İptal']);

  const addUserForm = el('form', { id: 'add-user-form', style: { marginTop: '1rem' } }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'user-email' }, ['E-posta Adresi']),
      userEmailInput
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { for: 'user-role' }, ['Rol']),
      userRoleSelect
    ]),
    el('div', { style: { display: 'flex', gap: '0.5rem' } }, [
      el('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, ['Kullanıcıyı Kaydet']),
      cancelAddUserBtn
    ])
  ]);

  const addUserContainer = el('div', { id: 'add-user-container', className: 'inline-form-container' }, [
    el('h3', {}, ['Yeni Kullanıcı Tanımla']),
    userFormError,
    addUserForm
  ]);

  const globalError = el('div', { id: 'admin-global-error', className: 'error-message', style: { display: 'none' } });
  const usersListContainer = el('div', { id: 'users-list-container', className: 'garage-grid' }, [
    el('div', { className: 'loading-screen', style: { height: '150px' } }, ['Kullanıcılar yükleniyor...'])
  ]);

  const mainContent = el('div', { className: 'main-content' }, [
    sectionHeader,
    addUserContainer,
    globalError,
    usersListContainer
  ]);

  container.appendChild(navbar);
  container.appendChild(mainContent);

  toggleAddUserBtn.addEventListener('click', () => {
    addUserContainer.classList.toggle('active');
  });
  cancelAddUserBtn.addEventListener('click', () => {
    addUserContainer.classList.remove('active');
    addUserForm.reset();
    userFormError.style.display = 'none';
  });

  loadUsers(usersListContainer, globalError);

  addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    userFormError.style.display = 'none';
    const email = userEmailInput.value;
    const role = userRoleSelect.value;

    try {
      await fsAddDoc(fsCollection(db, 'users'), {
        email,
        role,
        createdAt: new Date().toISOString()
      });
      addUserForm.reset();
      addUserContainer.classList.remove('active');
      loadUsers(usersListContainer, globalError);
    } catch (err) {
      userFormError.textContent = 'Hata: ' + err.message;
      userFormError.style.display = 'block';
    }
  });

  usersListContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    if (action === 'delete-user') {
      if (confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
        try {
          await fsDeleteDoc(fsDoc(db, 'users', id));
          loadUsers(usersListContainer, globalError);
        } catch (err) {
          alert('Hata: ' + err.message);
        }
      }
    } else if (action === 'edit-user') {
      const box = usersListContainer.querySelector(`#edit-user-box-${id}`);
      box?.classList.toggle('active');
    } else if (action === 'cancel-edit-user') {
      const box = usersListContainer.querySelector(`#edit-user-box-${id}`);
      box?.classList.remove('active');
    }
  });

  usersListContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.getAttribute('data-form') === 'edit-user') {
      const id = form.getAttribute('data-id');
      const email = form.querySelector('#edit-email').value;
      const role = form.querySelector('#edit-role').value;

      try {
        await fsUpdateDoc(fsDoc(db, 'users', id), { email, role });
        loadUsers(usersListContainer, globalError);
      } catch (err) {
        alert('Hata: ' + err.message);
      }
    }
  });
}

async function loadUsers(listContainer, globalError) {
  try {
    const snap = await fsGetDocs(fsCollection(db, 'users'));
    if (snap.empty) {
      listContainer.textContent = '';
      const empty = el('div', { className: 'empty-state' }, ['Kayıtlı kullanıcı bulunmuyor.']);
      listContainer.appendChild(empty);
      return;
    }

    listContainer.textContent = '';
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const card = el('div', { className: 'garage-card' }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' } }, [
          el('div', { style: { minWidth: 0, flex: '1 1 200px' } }, [
            el('h3', { style: { wordBreak: 'break-word', overflowWrap: 'break-word' } }, [data.email || 'İsimsiz']),
            el('p', { style: { color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' } }, [
              `Rol: `, el('strong', { style: { color: data.role === 'admin' ? 'var(--primary)' : 'inherit' } }, [data.role || 'user'])
            ])
          ]),
          el('div', { style: { display: 'flex', gap: '0.5rem', flexShrink: 0 } }, [
            el('button', { className: 'btn btn-secondary btn-sm', 'data-action': 'edit-user', 'data-id': id }, ['Düzenle']),
            el('button', { className: 'btn btn-danger btn-sm', 'data-action': 'delete-user', 'data-id': id }, ['Sil'])
          ])
        ]),
        el('div', { id: `edit-user-box-${id}`, className: 'inline-form-container', style: { marginTop: '1rem' } }, [
          el('form', { 'data-form': 'edit-user', 'data-id': id }, [
            el('div', { className: 'form-group' }, [
              el('label', {}, ['E-posta']),
              el('input', { type: 'email', id: 'edit-email', value: data.email || '', required: true })
            ]),
            el('div', { className: 'form-group' }, [
              el('label', {}, ['Rol']),
              el('select', { id: 'edit-role', className: 'form-control', style: { width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' } }, [
                el('option', { value: 'user', selected: data.role !== 'admin' }, ['Kullanıcı']),
                el('option', { value: 'admin', selected: data.role === 'admin' }, ['Admin'])
              ])
            ]),
            el('div', { style: { display: 'flex', gap: '0.5rem' } }, [
              el('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, ['Güncelle']),
              el('button', { type: 'button', className: 'btn btn-secondary btn-sm', 'data-action': 'cancel-edit-user', 'data-id': id }, ['İptal'])
            ])
          ])
        ])
      ]);

      listContainer.appendChild(card);
    });
  } catch (err) {
    globalError.textContent = 'Kullanıcılar yüklenirken hata oluştu: ' + err.message;
    globalError.style.display = 'block';
  }
}
