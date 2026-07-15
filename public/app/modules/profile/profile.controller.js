import { auth } from '../../core/firebase.js';
import User from '../../models/User.js';
import { router } from '/router.js';

/**
 * Controlador para el módulo de Perfil.
 * Gestiona la visualización y edición de datos del usuario.
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
  const inputMobile = document.getElementById('profileMobile');
  const inputPhone = document.getElementById('profilePhone');
  const btnSave = document.getElementById('btn-save-profile');
  const nameTitle = document.getElementById('profile-name-title');

  // Poblar datos iniciales
  if (userProfile) {
    inputDisplayName.value = userProfile.displayName || '';
    inputEmail.value = user.email || '';
    inputMobile.value = userProfile.mobile || '';
    inputPhone.value = userProfile.phone || '';
    nameTitle.textContent = userProfile.displayName || user.email?.split('@')[0] || 'Usuario';
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

  // --- Manejo de Guardado ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    const updateData = {
      displayName: inputDisplayName.value.trim(),
      mobile: inputMobile.value.trim(),
      phone: inputPhone.value.trim()
    };

    try {
      // Uso del modelo User para centralizar la actualización
      await User.updateProfile(user.uid, updateData);
      
      alert('Perfil actualizado correctamente.');
      
      // Actualizar UI local
      nameTitle.textContent = updateData.displayName;
      
      // Actualizar contexto global para otras vistas
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

  // Acciones Rápidas
  document.getElementById('opt-notifications')?.addEventListener('click', () => console.log('Notificaciones'));
  document.getElementById('opt-security')?.addEventListener('click', () => console.log('Seguridad'));

  // Cerrar Sesión
  const logoutBtn = document.getElementById('btn-logout-profile');
  const handleLogout = async () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      await auth.signOut();
      router.navigate('/login');
    }
  };
  logoutBtn?.addEventListener('click', handleLogout);

  // --- Función de Limpieza ---
  return () => {
    form?.removeEventListener('submit', handleProfileUpdate);
    logoutBtn?.removeEventListener('click', handleLogout);
  };
}

