import { auth } from '../../core/firebase.js';
import User from '../../models/User.js';
import { router } from '/router.js';

/**
 * Controlador para el módulo de Perfil.
 * Gestiona la visualización y edición de datos del usuario, incluyendo teléfonos dinámicos.
 */
export default async function profileController(contexto) {
  const user = contexto.data.user;
  const userProfile = contexto.data.userProfile;
  const isAdmin = contexto.data.permissions?.isAdmin;
  const isResident = contexto.data.permissions?.isResident;
  const role = contexto.data.permissions?.role;
  const property = contexto.data.property;

  // --- Referencias al DOM ---
  const form = document.getElementById('profile-form');
  const inputDisplayName = document.getElementById('profileDisplayName');
  const inputEmail = document.getElementById('profileEmail');
  const mobilesContainer = document.getElementById('mobiles-container');
  const phonesContainer = document.getElementById('phones-container');
  const btnAddMobile = document.getElementById('add-mobile');
  const btnAddPhone = document.getElementById('add-phone');
  const btnSave = document.getElementById('btn-save-profile');
  const nameTitle = document.getElementById('profile-name-title');

  // --- Configuración de Códigos de País ---
  const countryCodes = [
    { code: '+507', label: 'Panamá (+507)' },
    { code: '+1', label: 'EE.UU./Canadá (+1)' },
    { code: '+52', label: 'México (+52)' },
    { code: '+54', label: 'Argentina (+54)' },
    { code: '+57', label: 'Colombia (+57)' },
    { code: '+51', label: 'Perú (+51)' },
    { code: '+56', label: 'Chile (+56)' },
    { code: '+34', label: 'España (+34)' },
    { code: '+593', label: 'Ecuador (+593)' },
    { code: '+591', label: 'Bolivia (+591)' },
    { code: '+595', label: 'Paraguay (+595)' },
    { code: '+598', label: 'Uruguay (+598)' },
    { code: '+58', label: 'Venezuela (+58)' },
  ];

  const countryOptionsHtml = countryCodes.map(c => `<button type="button" class="phone-country-option" data-value="${c.code}">${c.label}</button>`).join('');

  // --- Patrones de formato por código de país ---
  // Cada patrón es un array que define los segmentos de dígitos separados por guión.
  // Ej: [4, 4] → "XXXX-XXXX", [3, 3, 4] → "XXX-XXX-XXXX"
  const phonePatterns = {
    '+507': { mobile: [4, 4], landline: [3, 4] },
    '+1': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+52': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+54': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+57': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+51': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+56': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+34': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+593': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+591': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+595': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+598': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    '+58': { mobile: [3, 3, 4], landline: [3, 3, 4] },
    _default: { mobile: [3, 3, 4], landline: [3, 3, 4] }
  };

  const stripPhoneFormatting = (str) => String(str).replace(/\D/g, '');

  const formatPhoneNumber = (digits, countryCode, phoneType = 'mobile') => {
    const raw = stripPhoneFormatting(digits);
    const patterns = phonePatterns[countryCode] || phonePatterns._default;
    const pattern = patterns[phoneType] || patterns.mobile;
    const totalLength = pattern.reduce((sum, len) => sum + len, 0);
    const truncated = raw.slice(0, totalLength);
    let result = '';
    let pos = 0;
    for (let i = 0; i < pattern.length; i++) {
      const segment = truncated.slice(pos, pos + pattern[i]);
      if (!segment) break;
      if (i > 0) result += '-';
      result += segment;
      pos += pattern[i];
    }
    return result;
  };

  // --- Helpers para Teléfonos ---
  const normalizeToArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object') {
        return value.filter(v => v != null);
      }
      return value.filter(v => v && String(v).trim()).map(v => ({
        code: '+507',
        number: stripPhoneFormatting(v)
      }));
    }
    const str = String(value).trim();
    return str ? [{ code: '+507', number: stripPhoneFormatting(str) }] : [];
  };

  const createPhoneRow = (container, data, labelText, phoneType = 'mobile', removable = true) => {
    const code = (data && data.code) || '+507';
    const rawNumber = (data && data.number) || (typeof data === 'string' ? data : '');
    const formatted = formatPhoneNumber(rawNumber, code, phoneType);

    const row = document.createElement('div');
    row.className = 'phone-row';
    row.innerHTML = `
      <div class="phone-field-wrapper">
        <div class="phone-country-trigger">
          <button type="button" class="phone-country-btn">${code}</button>
          <div class="phone-country-dropdown hidden">
            ${countryOptionsHtml}
          </div>
        </div>
        <div class="phone-field-divider"></div>
        <div class="phone-input-area">
          <input type="tel" class="phone-number-input" placeholder=" " autocomplete="tel" value="${formatted}">
          <label class="form-label">${labelText}</label>
        </div>
      </div>
      ${removable ? '<button type="button" class="btn-remove" title="Eliminar">×</button>' : ''}
    `;
    row.querySelector('.phone-country-trigger').dataset.value = code;

    const input = row.querySelector('.phone-number-input');

    // Input masking: auto-inserta guiones mientras el usuario tipea
    input.addEventListener('input', () => {
      const trigger = row.querySelector('.phone-country-trigger');
      const digits = stripPhoneFormatting(input.value);
      const formatted = formatPhoneNumber(digits, trigger.dataset.value, phoneType);
      if (formatted !== input.value) {
        input.value = formatted;
      }
    });

    // Custom dropdown: toggle y seleccion
    const btn = row.querySelector('.phone-country-btn');
    const dropdown = row.querySelector('.phone-country-dropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    dropdown.addEventListener('click', (e) => {
      const option = e.target.closest('.phone-country-option');
      if (!option) return;
      const value = option.dataset.value;
      btn.textContent = value;
      row.querySelector('.phone-country-trigger').dataset.value = value;
      dropdown.classList.add('hidden');
      // Re-formatear al cambiar código de país
      const digits = stripPhoneFormatting(input.value);
      input.value = formatPhoneNumber(digits, value, phoneType);
    });

    // Remove handler (solo si es removible)
    if (removable) {
      row.querySelector('.btn-remove').addEventListener('click', () => {
        row.remove();
      });
    }

    container.appendChild(row);
  };

  const renderPhoneList = (containerId, values, labelText, phoneType = 'mobile') => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const arr = normalizeToArray(values);
    if (arr.length === 0) {
      createPhoneRow(container, { code: '+507', number: '' }, labelText, phoneType, false);
    } else {
      arr.forEach((v, i) => createPhoneRow(container, v, labelText, phoneType, i > 0));
    }
  };

  const collectPhones = (containerId) => {
    const container = document.getElementById(containerId);
    const rows = container.querySelectorAll('.phone-row');
    return Array.from(rows).map(row => {
      const trigger = row.querySelector('.phone-country-trigger');
      const input = row.querySelector('.phone-number-input');
      return {
        code: trigger.dataset.value,
        number: stripPhoneFormatting(input.value)
      };
    }).filter(v => v.number);
  };

  // --- Poblar datos iniciales ---
  if (userProfile) {
    inputDisplayName.value = userProfile.displayName || '';
    inputEmail.value = user.email || '';
    nameTitle.textContent = userProfile.displayName || user.email?.split('@')[0] || 'Usuario';

    // Teléfonos: leer mobile/phones (string o array) y normalizar
    renderPhoneList('mobiles-container', userProfile.mobiles ?? userProfile.mobile, 'Celular', 'mobile');
    renderPhoneList('phones-container', userProfile.phones ?? userProfile.phone, 'Teléfono Fijo', 'landline');
  }

  const roleBadge = document.getElementById('profile-role-badge');
  const unitBadge = document.getElementById('profile-unit-badge');
  if (roleBadge) {
    const roleMap = { admin: 'Administrador', resident: 'Residente', guest: 'Visitante', pending: 'Pendiente', provider: 'Proveedor', hybrid: 'Híbrido' };
    roleBadge.textContent = roleMap[role] || role || 'Desconocido';
  }
  if (unitBadge) {
    unitBadge.textContent = userProfile?.propertyIds?.length > 0 ? `${userProfile.propertyIds.length} unidad(es)` : 'Sin Unidad';
  }

  // --- Eventos: Agregar filas ---
  const handleAddMobile = () => createPhoneRow(mobilesContainer, { code: '+507', number: '' }, 'Celular', 'mobile');
  const handleAddPhone = () => createPhoneRow(phonesContainer, { code: '+507', number: '' }, 'Teléfono Fijo', 'landline');
  btnAddMobile?.addEventListener('click', handleAddMobile);
  btnAddPhone?.addEventListener('click', handleAddPhone);

  // --- Manejo de Guardado ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    const updateData = {
      displayName: inputDisplayName.value.trim(),
      mobiles: collectPhones('mobiles-container'),
      phones: collectPhones('phones-container')
    };

    try {
      await User.updateProfile(user.uid, updateData);
      alert('Perfil actualizado correctamente.');
      nameTitle.textContent = updateData.displayName;
      if (contexto.data.userProfile) {
        Object.assign(contexto.data.userProfile, updateData);
      }
    } catch (error) {
      console.error("Error al actualizar perfil:", error);
      alert('Error al guardar los cambios.');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Guardar Cambios';
    }
  };

  form?.addEventListener('submit', handleProfileUpdate);

  // --- Manejo de Otros Eventos ---
  document.getElementById('opt-notifications')?.addEventListener('click', () => console.log('Notificaciones'));
  document.getElementById('opt-security')?.addEventListener('click', () => console.log('Seguridad'));

  const logoutBtn = document.getElementById('btn-logout-profile');
  const handleLogout = async () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      await auth.signOut();
      router.navigate('/login');
    }
  };
  logoutBtn?.addEventListener('click', handleLogout);

  // --- Cerrar dropdowns al hacer clic fuera ---
  const handleOutsideClick = (e) => {
    document.querySelectorAll('.phone-country-dropdown:not(.hidden)').forEach(dd => {
      if (!dd.closest('.phone-country-trigger')?.contains(e.target)) {
        dd.classList.add('hidden');
      }
    });
  };
  document.addEventListener('click', handleOutsideClick);

  // --- Función de Limpieza ---
  return () => {
    document.removeEventListener('click', handleOutsideClick);
    form?.removeEventListener('submit', handleProfileUpdate);
    btnAddMobile?.removeEventListener('click', handleAddMobile);
    btnAddPhone?.removeEventListener('click', handleAddPhone);
    logoutBtn?.removeEventListener('click', handleLogout);
  };
}