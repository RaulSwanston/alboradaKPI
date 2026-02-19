import { auth, db } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.1.1/firebase-firestore.js";

/**
 * @summary Muestra/oculta elementos de la UI que requieren rol de administrador.
 * @param {boolean} isAdmin - Si el usuario actual es administrador.
 */
function updateUIVisibilityByRole(isAdmin) {
  const adminElements = document.querySelectorAll('[data-role-required="admin"]');
  adminElements.forEach(element => {
    element.classList.toggle('hidden', !isAdmin);
  });
}

/**
 * @summary Inicializa la UI del dashboard para un usuario autenticado.
 * Configura el botón de logout, mensaje de bienvenida y visibilidad por rol.
 * @param {User} user - El objeto de usuario de Firebase Auth.
 */
export async function initializeDashboardSession(user) {
  if (!user) return;

  // 1. Configurar el botón de Logout (de forma segura)
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    // Evita múltiples listeners si la función se llama más de una vez.
    logoutButton.replaceWith(logoutButton.cloneNode(true));
    document.getElementById('logoutButton').addEventListener('click', () => {
      signOut(auth)
        .then(() => {
          console.log('Sesión cerrada correctamente');
          window.location.href = '/';
        })
        .catch(error => console.error('Error al cerrar sesión:', error));
    });
  }

  // 2. Mostrar mensaje de bienvenida
  const welcomeMessage = document.getElementById('welcome-message');
  if (welcomeMessage) {
    welcomeMessage.textContent = `Bienvenido/a ${user.displayName || user.email}`;
  }
  
  // 3. Verificar rol y actualizar UI
  try {
    const token = await user.getIdTokenResult();
    const isAdmin = token.claims.admin === true;
    updateUIVisibilityByRole(isAdmin);
    console.log("Custom claims del usuario, esAdmin?: ", isAdmin);

    // 4. Verificar perfil de Firestore (opcional, mantenido de la lógica original)
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      console.log("Perfil no encontrado en Firestore, creando uno nuevo...");
      // Aquí iría la llamada a la función `createUserProfile(user)` si la movemos también.
      // Por ahora solo lo notificamos.
    }
  } catch (error) {
    console.error("Error al verificar rol o cargar datos:", error);
  }
}
