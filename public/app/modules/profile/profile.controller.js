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

  // ... (referencias al DOM inicialización igual)

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

