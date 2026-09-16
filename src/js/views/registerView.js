import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase.js";
import { el, clearElement } from "../services/dom.js";

export function renderRegisterView(container, navigate) {
  clearElement(container);

  const errorDiv = el('div', { id: 'register-error', className: 'error-message', style: { display: 'none' } });
  const emailInput = el('input', { type: 'email', id: 'reg-email', required: true, placeholder: 'ornek@mail.com', autocomplete: 'email' });
  const passwordInput = el('input', { type: 'password', id: 'reg-password', required: true, placeholder: '••••••••', autocomplete: 'new-password' });

  const form = el('form', { id: 'register-form' }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'reg-email' }, ['E-posta Adresi']),
      emailInput
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { for: 'reg-password' }, ['Şifre (En az 6 karakter)']),
      passwordInput
    ]),
    el('button', { type: 'submit', className: 'btn btn-primary', style: { width: '100%', marginTop: '0.5rem' } }, ['Kayıt Ol'])
  ]);

  const toLogin = el('a', { href: '#', id: 'to-login' }, ['Giriş Yap']);

  const card = el('div', { className: 'auth-card' }, [
    el('div', { className: 'auth-header' }, [
      el('div', { className: 'auth-icon-badge' }, ['📝']),
      el('h2', {}, ['Yeni Hesap Oluştur']),
      el('p', { className: 'auth-desc' }, ['Garaj ve araçlarınızı yönetmek için kayıt olun'])
    ]),
    errorDiv,
    form,
    el('div', { className: 'auth-links' }, [
      el('p', {}, ['Zaten hesabınız var mı? ', toLogin])
    ])
  ]);

  const wrapper = el('div', { className: 'auth-wrapper' }, [card]);
  container.appendChild(wrapper);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.style.display = 'none';
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
      }
      await setDoc(doc(db, 'users', userCred.user.uid), {
        email: email,
        role: 'user',
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      errorDiv.textContent = getFriendlyErrorMessage(error.code);
      errorDiv.style.display = 'flex';
    }
  });

  toLogin.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('login');
  });
}

function getFriendlyErrorMessage(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu e-posta adresi zaten kullanımda.';
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    case 'auth/weak-password':
      return 'Şifre çok zayıf (en az 6 karakter olmalı).';
    default:
      return 'Kayıt olurken bir hata oluştu: ' + code;
  }
}
