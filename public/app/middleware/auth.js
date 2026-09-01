import { auth, db, doc, getDoc, signOut, waitForAuth } from '../core/firebase.js';
import { createUserProfile } from "../models/Profile.js";
import Property from '../models/Property.js';
import { appConfig } from '../core/appConfig.js';
import { loadTranslations } from '../core/i18n.js';

/**
 * sessionGuard (Middleware para el Router)
 * Orquesta el flujo de acceso: Auth -> Email -> isActive -> Rol
 */
export const sessionGuard = async (contexto) => {
  // --- Capa de Configuración Dinámica (Estrategia de Fusión) ---
  // Iniciamos con la configuración local por defecto como base sólida
  let currentConfig = { ...appConfig };

  try {
    const configDoc = await getDoc(doc(db, "appConfig", "app"));
    if (configDoc.exists()) {
      // FUSIONAMOS: La nube sobreescribe los campos que tenga (ej: stats)
      // pero preserva lo que no tenga (ej: navigation, accessControl)
      currentConfig = { ...currentConfig, ...configDoc.data() };
      localStorage.setItem('gph_app_config', JSON.stringify(currentConfig));
    } else {
      // Si no hay nube, intentamos recuperar del caché local
      const cached = localStorage.getItem('gph_app_config');
      if (cached) currentConfig = JSON.parse(cached);
    }
  } catch (error) {
    // Modo offline: Usamos localStorage o nos quedamos con el default del archivo JS
    console.log("Modo offline: Cargando configuración desde caché.");
    const cached = localStorage.getItem('gph_app_config');
    if (cached) currentConfig = JSON.parse(cached);
  }

  contexto.data.appConfig = currentConfig;

  // Aseguramos que las traducciones estén cargadas
  const lang = contexto.data.appConfig.systemDefaults?.language || 'es';
  await loadTranslations(lang);

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
  // Rol: fuente única de verdad = custom claim (admin). Fallback al doc de Firestore.
  const isAdmin = !!idTokenResult.claims.admin;
  const effectiveRole = isAdmin ? 'admin' : (profile.role || 'pending');

  contexto.data.userProfile = {
    ...profile,
    role: effectiveRole,
    photoUrl: profile.photoUrl || profile.photoURL || user.photoURL // Normalización
  };
  contexto.data.permissions = {
    isEmailVerified: user.emailVerified,
    isActive: profile.isActive === true,
    isAdmin,
    isResident: (profile.propertyIds && profile.propertyIds.length > 0),
    role: effectiveRole
  };

  // 3. Determinar la Unidad Activa
  // Fuente de verdad: profile.propertyIds (admin y residente). Unidad por defecto:
  // la guardada en localStorage si sigue siendo válida, si no la primera.
  const propertyIds = profile.propertyIds || [];
  const storedProperty = localStorage.getItem('gph_active_property');
  const activePropertyId = propertyIds.includes(storedProperty)
    ? storedProperty
    : (propertyIds[0] || null);
  contexto.data.activePropertyId = activePropertyId;

  if (activePropertyId) {
    try {
      const activeProperty = await Property.getById(activePropertyId);
      contexto.data.property = activeProperty;
    } catch (error) {
      console.error("[sessionGuard] Error al cargar unidad activa:", error);
      contexto.data.property = null;
    }
  } else {
    contexto.data.property = null;
  }

  // 4. Lógica de Redirección e Intercepción Dinámica
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

/**
 * adminGuard (Middleware para el Router)
 * Protege rutas de administración: permite el acceso solo a usuarios con
 * rol admin (basado en custom claim). Debe correr DESPUÉS de sessionGuard,
 * que es quien popula contexto.data.permissions.
 * @returns {boolean} false si el acceso es denegado (detiene la navegación).
 */
export const adminGuard = (contexto) => {
  const isAdmin = contexto?.data?.permissions?.isAdmin === true;
  if (!isAdmin) {
    console.warn("Acceso denegado: se requiere rol admin.");
    window.location.href = '/dashboard/resumen';
    return false;
  }
  return true;
};
