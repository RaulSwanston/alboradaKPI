import { auth, db, doc, getDoc, signOut, waitForAuth } from '../core/firebase.js';
import { createUserProfile } from "../models/Profile.js";

/**
 * sessionGuard (Middleware para el Router)
 * Orquesta el flujo de acceso: Auth -> Email -> isActive -> Rol
 */
export const sessionGuard = async (contexto) => {
  const user = await waitForAuth();

  if (!user) {
    console.warn("No hay sesión activa. Redirigiendo a /login");
    window.location.href = '/login';
    return false;
  }

  // 1. Cargar Datos de Identidad
  const idTokenResult = await user.getIdTokenResult();
  const userDocRef = doc(db, "users", user.uid);
  let userDoc = await getDoc(userDocRef);

  // Si el usuario no tiene documento en Firestore, lo creamos
  if (!userDoc.exists()) {
    await createUserProfile(user);
    userDoc = await getDoc(userDocRef);
  }

  const profile = userDoc.data();

  // 2. Construir Ficha de Identidad (Permissions)
  contexto.data.user = user;
  contexto.data.userProfile = {
    ...profile,
    photoUrl: profile.photoUrl || profile.photoURL || user.photoURL // Normalización
  };
  contexto.data.permissions = {
    isEmailVerified: user.emailVerified,
    isActive: profile.isActive === true, 
    isAdmin: !!idTokenResult.claims.admin,
    isResident: (profile.propertyIds && profile.propertyIds.length > 0),
    role: profile.role || 'pending'
  };

  // 3. Lógica de Redirección e Intercepción Dinámica
  const path = window.location.pathname;

  // --- Caso A: Email no verificado ---
  if (!user.emailVerified && path !== '/login' && path !== '/signup') {
    contexto.data.forcedView = 'auth/verify-email';
  } 
  // --- Caso B: Redirección Inteligente por Rol / Estado ---
  // Si está verificado pero NO es admin y NO tiene propiedad asignada, su lugar es 'Servicios'
  else if (!contexto.data.permissions.isAdmin && !contexto.data.permissions.isResident) {
    // Si intenta entrar a cualquier ruta del dashboard financiero, lo mandamos a servicios
    if (path.startsWith('/dashboard/resumen') || path.startsWith('/dashboard/transactions')) {
      console.log("Usuario sin propiedad asignada. Redirigiendo a Servicios.");
      window.location.href = '/services';
      return false;
    }
  }

  return true;
};

/**
 * initSessionUI
 * Inicializa la UI común basándose en los permisos ya cargados en el contexto.
 */
export async function initSessionUI(contexto) {
  const { user, permissions } = contexto.data;
  if (!user) return;

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.onclick = async () => {
      await signOut(auth);
      window.location.href = '/';
    };
  }

  const welcomeMessage = document.getElementById('welcome-message');
  if (welcomeMessage) {
    welcomeMessage.textContent = `Hola, ${user.displayName || user.email.split('@')[0]}`;
  }

  document.querySelectorAll('[data-role-required="admin"]')
    .forEach(el => el.classList.toggle('hidden', !permissions.isAdmin));
  
  document.querySelectorAll('[data-role-required="resident"]')
    .forEach(el => el.classList.toggle('hidden', !permissions.isResident));
}
