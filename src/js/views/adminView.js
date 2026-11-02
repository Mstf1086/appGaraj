import {
  collection as fsCollection, doc as fsDoc, getDocs as fsGetDocs,
  updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc
} from "firebase/firestore";
import { auth, db } from "../services/firebase.js";
import { createNavbar, checkIsAdmin } from "../services/authHelper.js";
import { el, clearElement } from "../services/dom.js";
import { sendAdminMessage } from "../services/notificationService.js";

export async function renderAdminView(container, navigate) {
  const user = auth.currentUser;
  if (!user) {
    navigate('login');
    return;
  }

  clearElement(container);

  // Rol yalnızca firestore.rules ile korunur; istemci tarafında otomatik admin ataması yapılmaz.
  // "İlk kullanıcı admin olur" mantığı kaldırıldı — admin Firebase Console'dan elle atanır.
  const isAdmin = await checkIsAdmin(user);

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

  // "Yeni Kullanıcı Ekle": Firestore'a rastgele ID ile users dokümanı yazmak
  // yetim kayıt üretir (Auth uid ile eşleşmez, kurallar create'i reddeder).
  // Kullanıcı önce Kayıt Ol ekranından Auth hesabı açar, rolü listeden
  // düzenlenir — bu yüzden burada yalnızca bilgilendirme gösterilir.
  const addUserContainer = el('div', { id: 'add-user-container', className: 'inline-form-container' }, [
    el('h3', {}, ['Yeni Kullanıcı Tanımla']),
    el('p', { className: 'admin-user-info-text' }, [
      'Yeni kullanıcı Kayıt Ol ekranından hesabını oluşturur; ardından buradaki listeden rolü düzenlenir.'
    ]),
    el('button', { type: 'button', id: 'cancel-add-user', className: 'btn btn-secondary btn-sm' }, ['Kapat'])
  ]);

  const globalError = el('div', { id: 'admin-global-error', className: 'error-message hidden' });
  const msgTarget = el('select', { id: 'msg-target', className: 'form-control form-control-full' });
  const msgTitle = el('input', { type: 'text', id: 'msg-title', maxLength: '80', placeholder: 'Duyuru başlığı (örn. Bakım hatırlatması)' });
  const msgBody = el('textarea', { id: 'msg-body', rows: '3', maxLength: '500', placeholder: 'Mesaj (en fazla 500 karakter)' });
  const msgStatus = el('div', { id: 'msg-status', className: 'admin-msg-status' });
  const msgBtn = el('button', { type: 'button', id: 'send-msg-btn', className: 'btn btn-primary btn-sm' }, ['Bildirimi Gönder']);
  const msgPanel = el('div', { className: 'admin-msg-panel' }, [
    el('h3', {}, ['Kullanıcılara Bildirim Gönder']),
    el('p', { className: 'admin-user-info-text' }, ['Açıkken anında rozet/sayfada, kapalıyken telefona push iletilir.']),
    el('div', { className: 'form-group' }, [el('label', {}, ['Alıcı']), msgTarget]),
    el('div', { className: 'form-group' }, [el('label', {}, ['Başlık']), msgTitle]),
    el('div', { className: 'form-group' }, [el('label', {}, ['Mesaj']), msgBody]),
    msgBtn, msgStatus
  ]);
  const usersListContainer = el('div', { id: 'users-list-container', className: 'garage-grid' }, [
    el('div', { className: 'loading-screen loading-screen-short' }, ['Kullanıcılar yükleniyor...'])
  ]);

  const mainContent = el('div', { className: 'main-content' }, [
    sectionHeader,
    addUserContainer,
    msgPanel,
    globalError,
    usersListContainer
  ]);

  container.appendChild(navbar);
  container.appendChild(mainContent);

  toggleAddUserBtn.addEventListener('click', () => {
    addUserContainer.classList.toggle('active');
  });
  addUserContainer.querySelector('#cancel-add-user')?.addEventListener('click', () => {
    addUserContainer.classList.remove('active');
  });

  loadUsers(usersListContainer, globalError).then((users) => {
    msgTarget.replaceChildren();
    msgTarget.appendChild(el('option', { value: '__all' }, ['Tüm kullanıcılar']));
    (users || []).forEach((u) => msgTarget.appendChild(el('option', { value: u.id }, [u.email])));
  });

  msgBtn.addEventListener('click', async () => {
    const title = msgTitle.value.trim();
    const body = msgBody.value.trim();
    const target = msgTarget.value;
    msgStatus.textContent = '';
    if (!title || !body) { msgStatus.textContent = 'Başlık ve mesaj zorunludur.'; return; }
    const opts = Array.from(msgTarget.options).map((o) => o.value).filter((v) => v && v !== '__all');
    const targets = target === '__all' ? opts : [target];
    if (!target || targets.length === 0) { msgStatus.textContent = 'Alıcı bulunamadı.'; return; }
    msgBtn.disabled = true;
    let ok = 0;
    for (const uid of targets) {
      msgStatus.textContent = `Gönderiliyor... (${ok}/${targets.length})`;
      try { await sendAdminMessage(uid, title, body); ok++; }
      catch (err) { console.error('Bildirim gönderilemedi (' + uid + '):', err); }
    }
    msgBtn.disabled = false;
    msgTitle.value = '';
    msgBody.value = '';
    msgStatus.textContent = ok === targets.length
      ? `✅ ${ok} kullanıcıya bildirim gönderildi.`
      : `⚠️ ${ok}/${targets.length} gönderildi; kalanlar için konsolu kontrol edin.`;
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
    const userOpts = snap.docs.map((d) => ({ id: d.id, email: d.data().email || d.id }));
    if (snap.empty) {
      listContainer.textContent = '';
      const empty = el('div', { className: 'empty-state' }, ['Kayıtlı kullanıcı bulunmuyor.']);
      listContainer.appendChild(empty);
      return [];
    }

    listContainer.textContent = '';
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const card = el('div', { className: 'garage-card' }, [
        el('div', { className: 'admin-user-row' }, [
          el('div', { className: 'admin-user-info' }, [
            el('h3', { className: 'admin-user-email' }, [data.email || 'İsimsiz']),
            el('p', { className: 'admin-user-role' }, [
              `Rol: `, el('strong', { className: data.role === 'admin' ? 'admin-role-admin' : 'admin-role-user' }, [data.role || 'user'])
            ])
          ]),
          el('div', { className: 'admin-user-actions' }, [
            el('button', { className: 'btn btn-secondary btn-sm', 'data-action': 'edit-user', 'data-id': id }, ['Düzenle']),
            el('button', { className: 'btn btn-danger btn-sm', 'data-action': 'delete-user', 'data-id': id }, ['Sil'])
          ])
        ]),
        el('div', { id: `edit-user-box-${id}`, className: 'inline-form-container admin-edit-box' }, [
          el('form', { 'data-form': 'edit-user', 'data-id': id }, [
            el('div', { className: 'form-group' }, [
              el('label', {}, ['E-posta']),
              el('input', { type: 'email', id: 'edit-email', value: data.email || '', required: true })
            ]),
            el('div', { className: 'form-group' }, [
              el('label', {}, ['Rol']),
              el('select', { id: 'edit-role', className: 'form-control form-control-full' }, [
                el('option', { value: 'user', selected: data.role !== 'admin' }, ['Kullanıcı']),
                el('option', { value: 'admin', selected: data.role === 'admin' }, ['Admin'])
              ])
            ]),
            el('div', { className: 'btn-row' }, [
              el('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, ['Güncelle']),
              el('button', { type: 'button', className: 'btn btn-secondary btn-sm', 'data-action': 'cancel-edit-user', 'data-id': id }, ['İptal'])
            ])
          ])
        ])
      ]);

      listContainer.appendChild(card);
    });
    return userOpts;
  } catch (err) {
    globalError.textContent = 'Kullanıcılar yüklenirken hata oluştu: ' + err.message;
    globalError.classList.remove('hidden');
    return [];
  }
}
