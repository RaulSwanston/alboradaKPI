import { handleSendPasswordResetEmail } from "../../models/Authentication.js";
import { waitForAuth } from "../../core/firebase.js";

export default async function recovery(params) { // MODIFICADO: Ahora es un export default y acepta 'params'
  await initRecoveryModule();
}

async function initRecoveryModule() {
  let errorMessageElement = document.getElementById("error-message");
  let user = await waitForAuth();
  if (user) { window.location.href = '/summary'; return; }

  // --- Event Listener para el botón de restablecimiento de contraseña ---
  const recoveryModule = document.getElementById("recoveryModule");
  if (recoveryModule) { // Añadir una comprobación de existencia
    recoveryModule.addEventListener("submit", async function(e){
      e.preventDefault();
      const result = await handleSendPasswordResetEmail(e.target["recoveryEmail"].value);
      if (result.success) { window.location.href = '/login';
        // showToast('¡Inicio de sesión exitoso!');
      }
      else { errorMessageElement.textContent = `Error al restablecer la contraseña: ${result.error.message}`; }
      e.target.reset();
    });
  }
}

// showToast('Se ha enviado un correo para restablecer tu contraseña.', 'success');