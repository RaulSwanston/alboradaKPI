import Property from '../../models/Property.js';
import { router } from '/router.js';
import { auth } from '../../core/firebase.js';
import { t } from '../../core/i18n.js';
import { initSessionUI } from '../../middleware/auth.js';

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

    // 2. Mostrar unidad activa o rol
    if (contexto.data.property) {
      propertyElement.textContent = contexto.data.property.name;
    } else if (isAdmin) {
      propertyElement.textContent = t('roles.admin') || 'Administrador';
    } else {
      propertyElement.textContent = t('roles.resident') || 'Residente';
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

  // --- Inicializar visibilidad por roles ---
  initSessionUI(contexto);

  // --- Lógica de Menú Desplegable (único) ---
  const profileTrigger = document.getElementById('user-profile-trigger');
  const profileMenu = document.getElementById('profile-menu');

  /**
   * Cierra el menú
   */
  const closeAllMenus = () => {
    profileMenu?.classList.remove('active');
  };

  /**
   * Maneja el toggle del menú
   */
  const handleDropdownToggle = (e, menu) => {
    e.stopPropagation();
    const isActive = menu.classList.contains('active');
    closeAllMenus();
    if (!isActive) menu.classList.add('active');
  };

  // Listener para el disparador
  const onProfileClick = (e) => handleDropdownToggle(e, profileMenu);
  profileTrigger?.addEventListener('click', onProfileClick);

  // Cerrar al hacer clic fuera
  const onWindowClick = (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
      closeAllMenus();
    }
  };
  window.addEventListener('click', onWindowClick);

  // --- Modal Cambiar Unidad ---
  const changeUnitBtn = document.getElementById('btn-change-unit');
  const modalOverlay = document.getElementById('unit-modal-overlay');
  const modalList = document.getElementById('unit-modal-list');
  const modalClose = document.getElementById('unit-modal-close');
  const modalCancel = document.getElementById('unit-modal-cancel');

  const openUnitModal = async () => {
    if (!modalOverlay) return;
    closeAllMenus();
    modalOverlay.hidden = false;
    document.body.classList.add('modal-open');
    await renderUnitList();
  };

  const closeUnitModal = () => {
    if (!modalOverlay) return;
    modalOverlay.hidden = true;
    document.body.classList.remove('modal-open');
  };

  const renderUnitList = async () => {
    if (!modalList) return;
    modalList.innerHTML = `<div class="unit-modal-loading"><div class="spinner-small"></div><p>${t('topbar.loadingUnits')}</p></div>`;

    try {
      const propertyIds = contexto.data.userProfile?.propertyIds || [];
      const activePropertyId = contexto.data.activePropertyId;

      if (propertyIds.length === 0) {
        modalList.innerHTML = `<p class="unit-modal-empty">${t('topbar.noUnits')}</p>`;
        return;
      }

      const properties = await Promise.all(
        propertyIds.map(id => Property.getById(id))
      );

      modalList.innerHTML = properties
        .filter(Boolean)
        .map(prop => {
          const isActive = prop.id === activePropertyId;
          return `
            <button type="button" class="unit-modal-item${isActive ? ' is-active' : ''}" data-unit-id="${prop.id}">
              <span class="unit-modal-item-name">${prop.name || `Unidad ${prop.id}`}</span>
              ${isActive ? `<span class="unit-modal-item-badge">${t('topbar.currentUnit')}</span>` : ''}
              <span class="unit-modal-item-arrow">
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </button>`;
        })
        .join('');

      modalList.querySelectorAll('.unit-modal-item').forEach(item => {
        item.addEventListener('click', () => selectUnit(item.dataset.unitId));
      });
    } catch (error) {
      console.error("[Topbar] Error al cargar unidades:", error);
      modalList.innerHTML = `<p class="unit-modal-empty">${t('topbar.unitsError')}</p>`;
    }
  };

  const selectUnit = (propertyId) => {
    localStorage.setItem('gph_active_property', propertyId);
    closeUnitModal();
    // Recarga la vista actual para que los módulos lean la nueva unidad activa.
    window.location.reload();
  };

  changeUnitBtn?.addEventListener('click', openUnitModal);
  modalClose?.addEventListener('click', closeUnitModal);
  modalCancel?.addEventListener('click', closeUnitModal);
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeUnitModal();
  });

  // --- Manejo de Acciones ---

  // Otras acciones (Placeholders)
  const appearanceBtn = document.getElementById('btn-appearance');
  const languageBtn = document.getElementById('btn-language');
  const helpBtn = document.getElementById('btn-help');
  const securityBtn = document.getElementById('btn-security');

  const onAppearanceClick = () => {
    console.log('Cambiar apariencia (Modo Oscuro/Claro)');
    closeAllMenus();
  };

  appearanceBtn?.addEventListener('click', onAppearanceClick);

  // --- Lógica de Búsqueda ---
  const searchInput = document.getElementById('topbar-search');

  if (searchInput) {
    searchInput.placeholder = t('topbar.searchPlaceholder');
  }

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
    profileTrigger?.removeEventListener('click', onProfileClick);
    window.removeEventListener('click', onWindowClick);
    appearanceBtn?.removeEventListener('click', onAppearanceClick);
    searchInput?.removeEventListener('input', handleSearch);
    changeUnitBtn?.removeEventListener('click', openUnitModal);
    modalClose?.removeEventListener('click', closeUnitModal);
    modalCancel?.removeEventListener('click', closeUnitModal);
  };
}
