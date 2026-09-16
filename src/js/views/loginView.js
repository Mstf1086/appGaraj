import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase.js";
import { el, clearElement } from "../services/dom.js";

export function renderLoginView(container, navigate) {
  clearElement(container);

  const errorDiv = el('div', { id: 'login-error', className: 'error-message', style: { display: 'none' } });
  const emailInput = el('input', { type: 'email', id: 'email', required: true, placeholder: 'ornek@mail.com', autocomplete: 'email' });
  const passwordInput = el('input', { type: 'password', id: 'password', required: true, placeholder: '••••••••', autocomplete: 'current-password' });
  
  const form = el('form', { id: 'login-form' }, [
    el('div', { className: 'form-group' }, [
      el('label', { for: 'email' }, ['E-posta Adresi']),
      emailInput
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { for: 'password' }, ['Şifre']),
      passwordInput
    ]),
    el('button', { type: 'submit', className: 'btn btn-primary', style: { width: '100%', marginTop: '0.5rem' } }, ['Giriş Yap'])
  ]);

  const toRegister = el('a', { href: '#', id: 'to-register' }, ['Kayıt Ol']);
  const toForgot = el('a', { href: '#', id: 'to-forgot' }, ['Şifremi Unuttum']);

  const card = el('div', { className: 'auth-card' }, [
    el('div', { className: 'auth-header' }, [
      el('div', { className: 'auth-icon-badge' }, ['🏎️']),
      el('h2', {}, ['Garaj Portalı']),
      el('p', { className: 'auth-desc' }, ['Hesabınıza giriş yaparak devam edin'])
    ]),
    errorDiv,
    form,
    el('div', { className: 'auth-links' }, [
      el('p', {}, ['Hesabınız yok mu? ', toRegister]),
      el('p', { style: { marginTop: '0.6rem' } }, [toForgot])
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
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      errorDiv.textContent = getFriendlyErrorMessage(error.code);
      errorDiv.style.display = 'flex';
    }
  });

  toRegister.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('register');
  });

  toForgot.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('forgot');
  });
}

function getFriendlyErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    case 'auth/user-not-found':
      return 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı.';
    case 'auth/wrong-password':
      return 'Hatalı şifre.';
    case 'auth/invalid-credential':
      return 'E-posta veya şifre hatalı.';
    case 'auth/too-many-requests':
      return 'Çok fazla başarısız deneme yapıldı. Lütfen daha sonra tekrar deneyin.';
    default:
      return 'Giriş yapılırken bir hata oluştu: ' + code;
  }
}
