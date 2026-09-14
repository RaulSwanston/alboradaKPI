import Property from '../../models/Property.js';
import { router } from '/router.js';
import { auth } from '../../core/firebase.js';
import { handleChangePassword } from '../../models/Authentication.js';
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

  // --- Modal Seguridad (Cambio de Contraseña) ---
  const securityOverlay = document.getElementById('security-modal-overlay');
  const securityForm = document.getElementById('security-form');
  const securityError = document.getElementById('security-error');
  const securityGoogle = document.getElementById('security-modal-google');
  const securitySubmit = document.getElementById('security-btn-submit');
  const securityCancel = document.getElementById('security-modal-cancel');
  const securityClose = document.getElementById('security-modal-close');
  const securityBtn = document.getElementById('btn-security');

  const eyeOpenSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4 3 1.5 6 1.5 8S4 13 8 13s6.5-3 6.5-5S12 3 8 3zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
  const eyeClosedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4 3 1.5 6 1.5 8S4 13 8 13c1.7 0 3.27-.8 4.46-2.07l-1.07-1.07A3.5 3.5 0 0 1 6 7.54L4.72 6.26C5.68 4.84 6.78 3.86 8 3c3.4 0 6.5 2.5 6.5 5 0 .66-.24 1.31-.64 1.93l-1.16-1.16c.23-.25.3-.38.3-.38S12.06 6 8 6c-.78 0-1.52.18-2.22.49L4.6 5.31C5.61 4.16 6.77 3.27 8 3z"/><path d="M13.65 14.36L1.64 2.35a.5.5 0 0 1 .7-.7l12.02 12.01a.5.5 0 0 1-.71.7z"/><path d="M4.94 5.65a3.5 3.5 0 0 0 5.41 4.4z"/></svg>';

  const securityErrorText = (err) => {
    const code = err?.code || '';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) return t('topbar.securityErrWrongPassword');
    if (code.includes('weak-password')) return t('topbar.securityErrWeakPassword');
    if (code.includes('requires-recent-login')) return t('topbar.securityErrRecentLogin');
    if (code.includes('network')) return t('topbar.securityErrNetwork');
    return err?.message || t('topbar.securityErrGeneric');
  };

  const openSecurityModal = () => {
    if (!securityOverlay) return;
    closeAllMenus();
    securityForm?.reset();
    if (securityError) securityError.hidden = true;
    if (securitySubmit) securitySubmit.textContent = t('topbar.securitySubmit');

    // Método de autenticación: flags centralizados en permissions (middleware/auth.js).
    // Fallback defensivo frente a contextos antiguos sin las banderas.
    const hasPasswordProvider = permissions.hasPasswordProvider !== undefined
      ? permissions.hasPasswordProvider
      : auth.currentUser?.providerData?.some(p => p.providerId === 'password');

    const isGoogleOnly = permissions.isGoogleOnlySignIn !== undefined
      ? permissions.isGoogleOnlySignIn
      : !!auth.currentUser?.providerData?.some(p => p.providerId === 'google.com') && !hasPasswordProvider;

    if (securityForm) securityForm.hidden = hasPasswordProvider !== true;
    if (securityGoogle) securityGoogle.hidden = !isGoogleOnly;

    securityOverlay.hidden = false;
    document.body.classList.add('modal-open');
  };

  const closeSecurityModal = () => {
    if (!securityOverlay) return;
    securityOverlay.hidden = true;
    document.body.classList.remove('modal-open');
  };

  const showSecurityError = (msg) => {
    if (!securityError) return;
    securityError.textContent = msg;
    securityError.hidden = false;
  };

  const handleSecuritySubmit = async (e) => {
    e.preventDefault();
    const currentInput = document.getElementById('security-current');
    const newInput = document.getElementById('security-new');
    const confirmInput = document.getElementById('security-confirm');

    const current = currentInput?.value ?? '';
    const next = newInput?.value ?? '';
    const confirm = confirmInput?.value ?? '';

    if (next.length < 6) { showSecurityError(t('topbar.securityErrMinLength')); return; }
    if (next === current) { showSecurityError(t('topbar.securityErrSamePassword')); return; }
    if (next !== confirm) { showSecurityError(t('topbar.securityErrMismatch')); return; }

    if (securitySubmit) {
      securitySubmit.disabled = true;
      securitySubmit.textContent = t('topbar.securitySubmitting');
    }
    if (securityError) securityError.hidden = true;

    const result = await handleChangePassword(current, next);
    if (result.success) {
      closeSecurityModal();
      alert(t('topbar.securitySuccess'));
    } else {
      if (securitySubmit) {
        securitySubmit.disabled = false;
        securitySubmit.textContent = t('topbar.securitySubmit');
      }
      showSecurityError(securityErrorText(result.error));
    }
  };

  securityBtn?.addEventListener('click', openSecurityModal);
  securityCancel?.addEventListener('click', closeSecurityModal);
  securityClose?.addEventListener('click', closeSecurityModal);
  const onSecurityOverlayClick = (e) => {
    if (e.target === securityOverlay) closeSecurityModal();
  };
  securityOverlay?.addEventListener('click', onSecurityOverlayClick);
  securityForm?.addEventListener('submit', handleSecuritySubmit);

  // Toggle mostrar/ocultar contraseña
  const securityToggles = document.querySelectorAll('.security-toggle');
  const onSecurityToggle = (btn) => () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.innerHTML = isPassword ? eyeClosedSvg : eyeOpenSvg;
    btn.setAttribute('aria-label', isPassword ? t('topbar.securityHide') : t('topbar.securityShow'));
  };
  const securityToggleHandlers = [];
  securityToggles.forEach(btn => {
    const handler = onSecurityToggle(btn);
    securityToggleHandlers.push([btn, handler]);
    btn.addEventListener('click', handler);
  });

  // Permite abrir el modal desde otros módulos (ej. profile → opt-security)
  const onOpenSecurityEvent = () => openSecurityModal();
  document.addEventListener('app:open-security', onOpenSecurityEvent);

  // --- Manejo de Acciones ---

  // Otras acciones (Placeholders)
  const appearanceBtn = document.getElementById('btn-appearance');
  const languageBtn = document.getElementById('btn-language');
  const helpBtn = document.getElementById('btn-help');

  const onAppearanceClick = () => {
    console.log('Cambiar apariencia (Modo Oscuro/Claro)');
    closeAllMenus();
  };

  appearanceBtn?.addEventListener('click', onAppearanceClick);

  const onHelpClick = () => {
    closeAllMenus();
    window.location.href = '/docs';
  };
  helpBtn?.addEventListener('click', onHelpClick);

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
    securityBtn?.removeEventListener('click', openSecurityModal);
    securityCancel?.removeEventListener('click', closeSecurityModal);
    securityClose?.removeEventListener('click', closeSecurityModal);
    securityOverlay?.removeEventListener('click', onSecurityOverlayClick);
    securityForm?.removeEventListener('submit', handleSecuritySubmit);
    securityToggleHandlers.forEach(([btn, handler]) => btn.removeEventListener('click', handler));
    document.removeEventListener('app:open-security', onOpenSecurityEvent);
  };
}
