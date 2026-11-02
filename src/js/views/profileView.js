import { updatePassword } from "firebase/auth";
import { doc, getDocFromServer, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase.js";
import { createNavbar } from "../services/authHelper.js";
import { el, clearElement } from "../services/dom.js";

export async function renderProfileView(container, navigate) {
  clearElement(container);
  const user = auth.currentUser;
  if (!user) {
    navigate('login');
    return;
  }

  const navbar = await createNavbar(user, 'profile', navigate);

  let roleText = 'Standart Kullanıcı';
  try {
    const userRef = doc(db, 'users', user.uid);
    let userSnap;
    try {
      userSnap = await getDocFromServer(userRef);
    } catch (e) {
      userSnap = await getDoc(userRef);
    }
    if (userSnap.exists()) {
      const r = userSnap.data().role;
      roleText = r === 'admin' ? 'Admin (Yönetici)' : 'Standart Kullanıcı';
    }
  } catch (e) {
    console.error('Profil bilgileri yüklenemedi:', e);
  }

  const errorDiv = el('div', { id: 'profile-error', className: 'error-message hidden' });
  const successDiv = el('div', { id: 'profile-success', className: 'success-message hidden' });
  const emailInput = el('input', { type: 'email', value: user ? user.email : '', disabled: true, className: 'input-disabled' });
  const roleInput = el('input', { type: 'text', value: roleText, disabled: true, className: roleText.includes('Admin') ? 'input-role input-role-admin' : 'input-role' });
  const newPasswordInput = el('input', { type: 'password', id: 'new-password', required: true, placeholder: '********' });

  const passwordForm = el('form', { id: 'password-form', className: 'profile-password-form' }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'new-password' }, ['Yeni Şifre (En az 6 karakter)']),
      newPasswordInput
    ]),
    el('button', { type: 'submit', className: 'btn btn-primary' }, ['Şifreyi Güncelle'])
  ]);

  const authCard = el('div', { className: 'auth-card profile-card' }, [
    errorDiv,
    successDiv,
    el('div', { className: 'form-group' }, [
      el('label', {}, ['E-posta Adresi']),
      emailInput
    ]),
    el('div', { className: 'form-group' }, [
      el('label', {}, ['Kullanıcı Durumu / Rolü']),
      roleInput
    ]),
    el('hr', { className: 'profile-divider' }),
    el('h3', {}, ['Şifre Değiştir']),
    passwordForm
  ]);

  const mainContent = el('div', { className: 'main-content' }, [
    el('div', { className: 'section-header' }, [
      el('h1', {}, ['Profil Bilgileri'])
    ]),
    authCard
  ]);

  container.appendChild(navbar);
  container.appendChild(mainContent);

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    const newPassword = newPasswordInput.value;

    try {
      if (!user) throw new Error('Oturum açmış kullanıcı bulunamadı.');
      await updatePassword(user, newPassword);
      successDiv.textContent = 'Şifreniz başarıyla güncellendi.';
      successDiv.classList.remove('hidden');
      passwordForm.reset();
    } catch (err) {
      errorDiv.textContent = 'Hata: ' + err.message;
      errorDiv.classList.remove('hidden');
    }
  });
}
