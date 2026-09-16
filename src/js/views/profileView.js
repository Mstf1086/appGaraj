import { updatePassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
      userSnap = await getDoc(userRef, { source: 'server' });
    } catch (e) {
      userSnap = await getDoc(userRef);
    }
    if (userSnap.exists()) {
      const r = userSnap.data().role;
      roleText = r === 'admin' ? 'Admin (Yönetici)' : 'Standart Kullanıcı';
    }
  } catch (e) {
    console.error(e);
  }

  const errorDiv = el('div', { id: 'profile-error', className: 'error-message', style: { display: 'none' } });
  const successDiv = el('div', { id: 'profile-success', className: 'success-message', style: { display: 'none' } });
  const emailInput = el('input', { type: 'email', value: user ? user.email : '', disabled: true, style: { backgroundColor: '#f1f5f9' } });
  const roleInput = el('input', { type: 'text', value: roleText, disabled: true, style: { backgroundColor: '#f1f5f9', fontWeight: 'bold', color: roleText.includes('Admin') ? 'var(--primary)' : 'inherit' } });
  const newPasswordInput = el('input', { type: 'password', id: 'new-password', required: true, placeholder: '********' });

  const passwordForm = el('form', { id: 'password-form', style: { marginTop: '1rem' } }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'new-password' }, ['Yeni Şifre (En az 6 karakter)']),
      newPasswordInput
    ]),
    el('button', { type: 'submit', className: 'btn btn-primary' }, ['Şifreyi Güncelle'])
  ]);

  const authCard = el('div', { className: 'auth-card', style: { maxWidth: '600px', margin: '0 auto' } }, [
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
    el('hr', { style: { margin: '1.5rem 0', border: 'none', borderTop: '1px solid var(--border-color)' } }),
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
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    const newPassword = newPasswordInput.value;

    try {
      if (!user) throw new Error('Oturum açmış kullanıcı bulunamadı.');
      await updatePassword(user, newPassword);
      successDiv.textContent = 'Şifreniz başarıyla güncellendi.';
      successDiv.style.display = 'block';
      passwordForm.reset();
    } catch (err) {
      errorDiv.textContent = 'Hata: ' + err.message;
      errorDiv.style.display = 'block';
    }
  });
}
