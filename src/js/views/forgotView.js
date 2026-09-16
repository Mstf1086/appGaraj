import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../services/firebase.js";
import { el, clearElement } from "../services/dom.js";

export function renderForgotView(container, navigate) {
  clearElement(container);

  const errorDiv = el('div', { id: 'forgot-error', className: 'error-message', style: { display: 'none' } });
  const successDiv = el('div', { id: 'forgot-success', className: 'success-message', style: { display: 'none' } }, ['Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.']);
  const emailInput = el('input', { type: 'email', id: 'forgot-email', required: true, placeholder: 'ornek@mail.com', autocomplete: 'email' });

  const form = el('form', { id: 'forgot-form' }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'forgot-email' }, ['E-posta Adresi']),
      emailInput
    ]),
    el('button', { type: 'submit', className: 'btn btn-primary', style: { width: '100%', marginTop: '0.5rem' } }, ['Sıfırlama Bağlantısı Gönder'])
  ]);

  const toLogin = el('a', { href: '#', id: 'to-login' }, ['← Giriş Ekranına Dön']);

  const card = el('div', { className: 'auth-card' }, [
    el('div', { className: 'auth-header' }, [
      el('div', { className: 'auth-icon-badge' }, ['🔑']),
      el('h2', {}, ['Şifremi Unuttum']),
      el('p', { className: 'auth-desc' }, ['E-posta adresinizi girin, sıfırlama bağlantısı gönderelim'])
    ]),
    errorDiv,
    successDiv,
    form,
    el('div', { className: 'auth-links' }, [
      el('p', {}, [toLogin])
    ])
  ]);

  const wrapper = el('div', { className: 'auth-wrapper' }, [card]);
  container.appendChild(wrapper);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    const email = emailInput.value;

    try {
      await sendPasswordResetEmail(auth, email);
      successDiv.style.display = 'flex';
      form.reset();
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
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    case 'auth/user-not-found':
      return 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı.';
    default:
      return 'İşlem başarısız: ' + code;
  }
}
