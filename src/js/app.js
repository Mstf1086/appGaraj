import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./services/firebase.js";
import { renderLoginView } from "./views/loginView.js";
import { renderRegisterView } from "./views/registerView.js";
import { renderForgotView } from "./views/forgotView.js";
import { renderDashboardView } from "./views/dashboardView.js";
import { renderProfileView } from "./views/profileView.js";
import { renderVehicleDetailView } from "./views/vehicleDetailView.js";
import { renderNotificationsView } from "./views/notificationsView.js";
import { renderAdminView } from "./views/adminView.js";
import { clearElement } from "./services/dom.js";
import { checkAppVersion } from "./services/version.js";
import { ensureUserData, clearCache } from "./services/dataCache.js";
import "./services/swRegister.js";

checkAppVersion();

const appContainer = document.getElementById('app');

function navigate(route, push = true) {
  try {
    clearElement(appContainer);
    const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
    const [viewName, search] = cleanRoute.split('?');
    const params = new URLSearchParams(search || '');
    
    if (push) {
      const targetPath = '/' + cleanRoute;
      if (window.location.pathname + window.location.search !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }

    switch (viewName) {
      case 'login':
        renderLoginView(appContainer, navigate);
        break;
      case 'register':
        renderRegisterView(appContainer, navigate);
        break;
      case 'forgot':
        renderForgotView(appContainer, navigate);
        break;
      case 'dashboard':
        renderDashboardView(appContainer, navigate);
        break;
      case 'profile':
        renderProfileView(appContainer, navigate);
        break;
      case 'notifications':
        renderNotificationsView(appContainer, navigate);
        break;
      case 'vehicleDetail':
        renderVehicleDetailView(appContainer, navigate, params);
        break;
      case 'admin':
        renderAdminView(appContainer, navigate);
        break;
      default:
        renderLoginView(appContainer, navigate);
    }
  } catch (err) {
    console.error('Navigation error:', err);
    clearElement(appContainer);
    const errDiv = document.createElement('div');
    errDiv.className = 'error-message app-error-message';
    errDiv.textContent = 'Sayfa yüklenirken bir hata oluştu. Lütfen giriş sayfasına dönün.';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary app-error-btn';
    btn.textContent = 'Giriş Sayfasına Git';
    btn.onclick = () => navigate('login');
    appContainer.appendChild(errDiv);
    appContainer.appendChild(btn);
  }
}

onAuthStateChanged(auth, (user) => {
  try {
    const pathname = window.location.pathname.replace(/^\/+/, '');
    const search = window.location.search;
    const currentRoute = pathname + search;
    const viewName = pathname.split('?')[0];

    if (user) {
      // İlk yüklemede kullanıcının TÜM verisi tek geçişte çekilip tarayıcı
      // belleğine kaydedilir (dataCache). Sonraki tüm görünümler önbellekten
      // okur; yazmalar cerrahi güncelleme yapar → gereksiz Firestore isteği yok.
      ensureUserData(user.uid).catch(err => {
        console.error('Veri önbelleği ilk yükleme başarısız:', err);
      });
      if (['login', 'register', 'forgot', ''].includes(viewName)) {
        navigate('dashboard', true);
      } else {
        navigate(currentRoute || 'dashboard', false);
      }
    } else {
      clearCache();
      if (['dashboard', 'profile', 'vehicleDetail', 'admin', 'notifications'].includes(viewName)) {
        navigate('login', true);
      } else {
        navigate(currentRoute || 'login', false);
      }
    }
  } catch (err) {
    console.error('Auth state navigation error:', err);
    navigate('login', false);
  }
});

window.addEventListener('popstate', () => {
  const pathname = window.location.pathname.replace(/^\/+/, '');
  const search = window.location.search;
  const route = pathname + search;
  navigate(route || (auth.currentUser ? 'dashboard' : 'login'), false);
});

