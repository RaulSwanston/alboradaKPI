import { waitForAuth } from "../core/firebase.js";
import { initializeDashboardSession } from "../core/session.js";
import { contarUsuariosActivos } from "../models/User.js";

export default async function summary(params) { // MODIFICADO: Ahora es un export default y acepta 'params'
  const user = await waitForAuth();

  if (user) {
    // Si hay un usuario, inicializa la sesión del dashboard (logout, welcome msg, roles)
    await initializeDashboardSession(user);
    // Y luego ejecuta la lógica específica de esta vista
    initSummary();
  } else {
    // Si no hay usuario, no debería estar aquí. Redirigir a login.
    console.log("No user authenticated, redirecting to login.");
    window.location.href = '/login';
  }
}

async function initSummary() {
  const statTotalResidents = document.getElementById("stat-total-residents");
  if (statTotalResidents) { // Añadir una comprobación de existencia
    statTotalResidents.textContent = await contarUsuariosActivos();
  }
}