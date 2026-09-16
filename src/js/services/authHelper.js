import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db, auth } from "./firebase.js";
import { signOut } from "firebase/auth";
import { el } from "./dom.js";

export async function checkIsAdmin(user) {
  if (!user) return false;
  try {
    const userRef = doc(db, 'users', user.uid);
    let userSnap;
    try {
      userSnap = await getDoc(userRef, { source: 'server' });
    } catch (e) {
      userSnap = await getDoc(userRef);
    }
    if (userSnap.exists()) {
      return userSnap.data().role === 'admin';
    } else {
      try {
        if (auth.currentUser) {
          await auth.currentUser.getIdToken(true);
        }
        await setDoc(userRef, {
          email: user.email || '',
          role: 'user',
          createdAt: new Date().toISOString()
        });
      } catch (setErr) {
        console.error("Failed to auto-create user doc:", setErr);
      }
      return false;
    }
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function createNavbar(user, activeView, navigate) {
  const isAdmin = await checkIsAdmin(user);

  const brandIcon = el('span', { className: 'brand-icon' }, ['🏎️']);
  const navBrand = el('a', { href: '#', className: 'navbar-brand', id: 'nav-brand' }, [
    brandIcon,
    el('span', {}, ['Garaj Portal'])
  ]);

  const menuItems = [];

  if (isAdmin) {
    const navAdmin = el('a', { href: '#', className: `nav-link ${activeView === 'admin' ? 'active' : ''}`, id: 'nav-admin' }, [
      '🛡️ Admin'
    ]);
    menuItems.push(navAdmin);
  }

  const userInitial = (user.email || 'U').charAt(0).toUpperCase();
  const userChip = el('div', { className: 'nav-user-chip' }, [
    el('div', { className: 'user-avatar' }, [userInitial]),
    el('span', {}, [user.email ? user.email.split('@')[0] : 'Kullanıcı'])
  ]);

  const profileItem = el('button', { className: 'user-dropdown-item', id: 'dropdown-profile' }, [
    '👤 Profil'
  ]);
  const logoutItem = el('button', { className: 'user-dropdown-item', id: 'dropdown-logout' }, [
    '🚪 Çıkış'
  ]);

  const dropdownMenu = el('div', { className: 'user-dropdown-menu' }, [
    profileItem,
    el('div', { className: 'user-dropdown-divider' }),
    logoutItem
  ]);

  const userMenuContainer = el('div', { className: 'user-menu-container' }, [
    userChip,
    dropdownMenu
  ]);

  menuItems.push(userMenuContainer);

  const navbar = el('nav', { className: 'navbar' }, [
    navBrand,
    el('div', { className: 'navbar-menu' }, menuItems)
  ]);

  navBrand.addEventListener('click', (e) => { e.preventDefault(); navigate('dashboard'); });
  if (isAdmin) {
    const adminEl = navbar.querySelector('#nav-admin');
    if (adminEl) adminEl.addEventListener('click', (e) => { e.preventDefault(); navigate('admin'); });
  }

  userChip.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });

  dropdownMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', () => {
    dropdownMenu.classList.remove('show');
  });

  profileItem.addEventListener('click', (e) => {
    e.preventDefault();
    dropdownMenu.classList.remove('show');
    navigate('profile');
  });

  logoutItem.addEventListener('click', async (e) => {
    e.preventDefault();
    dropdownMenu.classList.remove('show');
    await signOut(auth);
    navigate('login');
  });

  return navbar;
}
