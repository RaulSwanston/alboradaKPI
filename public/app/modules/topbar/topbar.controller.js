import Property from '../../models/Property.js';
import { router } from '/router.js';
import { auth } from '../../core/firebase.js';
import { t } from '../../core/i18n.js';

/**
 * Controlador para el módulo Topbar.
 * Se encarga de mostrar la información del usuario, gestionar la búsqueda
 * y los menús desplegables de ajustes y perfil.
 * 
 * @param {Object} contexto - El contexto de la vista, contiene datos del usuario.
 */
export default async function topbarController(contexto) {
  const user = contexto.data.user;
  const permissions = contexto.data.permissions || {};
  const isAdmin = permissions.isAdmin;

  const nameElement = document.getElementById('topbar-user-name');
  const propertyElement = document.getElementById('topbar-user-property');
  const photoElement = document.getElementById('topbar-user-photo');
  const initialsElement = document.getElementById('topbar-user-initials');

  if (user) {
    // 1. Mostrar nombre
    nameElement.textContent = user.displayName || user.email.split('@')[0];

    // 2. Mostrar propiedad o rol
    if (isAdmin) {
      propertyElement.textContent = t('roles.admin') || 'Administrador';
    } else {
      if (contexto.data.property) {
        propertyElement.textContent = contexto.data.property.name;
      } else {
        propertyElement.textContent = t('roles.resident') || 'Residente';
      }
    }

    // 3. Gestionar Avatar (Prioridad: Firestore > Auth > Iniciales)
    const profilePhoto = contexto.data.userProfile?.photoUrl || contexto.data.userProfile?.photoURL;
    const authPhoto = user.photoURL;
    const finalPhoto = profilePhoto || authPhoto;

    if (finalPhoto) {
      photoElement.src = finalPhoto;
      photoElement.classList.remove('hidden');
      initialsElement.classList.add('hidden');
    } else {
      const initials = (user.displayName || user.email || 'U')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
      
      initialsElement.textContent = initials;
      initialsElement.classList.remove('hidden');
      photoElement.classList.add('hidden');
    }
  }

  // --- Lógica de Menús Desplegables ---
  const settingsTrigger = document.getElementById('settings-trigger');
  const settingsMenu = document.getElementById('settings-menu');
  const profileTrigger = document.getElementById('user-profile-trigger');
  const profileMenu = document.getElementById('profile-menu');

  /**
   * Cierra todos los menús abiertos
   */
  const closeAllMenus = () => {
    settingsMenu?.classList.remove('active');
    profileMenu?.classList.remove('active');
  };

  /**
   * Maneja el toggle de los menús
   */
  const handleDropdownToggle = (e, menu) => {
    e.stopPropagation();
    const isActive = menu.classList.contains('active');
    closeAllMenus();
    if (!isActive) menu.classList.add('active');
  };

  // Listeners para los disparadores
  const onSettingsClick = (e) => handleDropdownToggle(e, settingsMenu);
  const onProfileClick = (e) => handleDropdownToggle(e, profileMenu);
  
  settingsTrigger?.addEventListener('click', onSettingsClick);
  profileTrigger?.addEventListener('click', onProfileClick);

  // Cerrar al hacer clic fuera
  const onWindowClick = (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
      closeAllMenus();
    }
  };
  window.addEventListener('click', onWindowClick);

  // --- Manejo de Acciones ---
  
  // Cerrar Sesión
  const logoutBtn = document.getElementById('btn-logout');
  const handleLogout = async () => {
    try {
      await auth.signOut();
      router.navigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };
  logoutBtn?.addEventListener('click', handleLogout);

  // Otras acciones (Placeholders)
  const appearanceBtn = document.getElementById('btn-appearance');
  const languageBtn = document.getElementById('btn-language');
  const notificationsConfigBtn = document.getElementById('btn-notifications-config');
  const helpBtn = document.getElementById('btn-help');

  const onAppearanceClick = () => {
    console.log('Cambiar apariencia (Modo Oscuro/Claro)');
    closeAllMenus();
  };

  appearanceBtn?.addEventListener('click', onAppearanceClick);

  // --- Lógica de Búsqueda ---
  const searchInput = document.getElementById('topbar-search');
  const handleSearch = (e) => {
    const query = e.target.value.trim();
    const searchEvent = new CustomEvent('app:search', {
      detail: { query },
      bubbles: true,
      composed: true
    });
    document.dispatchEvent(searchEvent);
  };
  searchInput?.addEventListener('input', handleSearch);

  // --- Función de Limpieza ---
  return () => {
    settingsTrigger?.removeEventListener('click', onSettingsClick);
    profileTrigger?.removeEventListener('click', onProfileClick);
    window.removeEventListener('click', onWindowClick);
    logoutBtn?.removeEventListener('click', handleLogout);
    appearanceBtn?.removeEventListener('click', onAppearanceClick);
    searchInput?.removeEventListener('input', handleSearch);
  };
}
