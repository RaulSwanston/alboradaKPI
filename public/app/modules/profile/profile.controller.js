import { db, doc, updateDoc, auth, collection, getDocs, setDoc, getDoc, serverTimestamp, orderBy, query } from '../../core/firebase.js';
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

  // --- Elementos del DOM ---
  const nameTitle = document.getElementById('profile-name-title');
  const emailText = document.getElementById('profile-email-text');
  const roleBadge = document.getElementById('profile-role-badge');
  const unitBadge = document.getElementById('profile-unit-badge');
  const photoPreview = document.getElementById('profile-image-preview');
  const initialsPlaceholder = document.getElementById('profile-initials');

  const form = document.getElementById('profile-form');
  const inputDisplayName = document.getElementById('profileDisplayName');
  const inputEmail = document.getElementById('profileEmail');
  const inputMobile = document.getElementById('profileMobile');
  const inputPhone = document.getElementById('profilePhone');
  const btnSave = document.getElementById('btn-save-profile');

  // --- Inicialización de Datos ---
  if (user) {
    const displayName = user.displayName || user.email.split('@')[0];
    
    nameTitle.textContent = displayName;
    emailText.textContent = user.email;
    inputEmail.value = user.email;
    inputDisplayName.value = displayName;

    // Cargar datos adicionales desde el contexto
    if (userProfile) {
      inputMobile.value = userProfile.mobile || '';
      inputPhone.value = userProfile.phone || '';
    }

    // Badge de Rol y Unidad
    if (isAdmin) roleBadge.textContent = 'Administrador';
    else if (isResident) roleBadge.textContent = 'Residente';
    else if (role === 'guest') roleBadge.textContent = 'Visitante';
    else roleBadge.textContent = 'Pendiente';

    if (property) {
      unitBadge.textContent = `Unidad ${property.name || property.propertyId}`;
    }

    // Avatar (Prioridad: Firestore > Auth > Iniciales)
    const finalPhoto = userProfile?.photoUrl || user.photoURL;

    if (finalPhoto) {
      photoPreview.src = finalPhoto;
      photoPreview.classList.remove('hidden');
      initialsPlaceholder.classList.add('hidden');
    } else {
      const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      initialsPlaceholder.textContent = initials;
      initialsPlaceholder.classList.remove('hidden');
      photoPreview.classList.add('hidden');
    }
  }

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
