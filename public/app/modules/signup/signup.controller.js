import { handleGoogleAuthentication, handleCreateUserWithEmailAndPassword } from "../../models/Authentication.js";
import { waitForAuth } from "../../core/firebase.js";

export default async function signup(params) { // MODIFICADO: Ahora es un export default y acepta 'params'
  await initSignupModule();
}

async function initSignupModule() {
  let errorMessageElement = document.getElementById("error-message");
  let user = await waitForAuth();
  if (user) { window.location.href = '/dashboard/resumen'; return; }

  // --- Event Listener para el botón de "Continuar con Google" ---
  const googleSignupButton = document.getElementById("googleSignupButton");
  if (googleSignupButton) { // Añadir una comprobación de existencia
    googleSignupButton.addEventListener("click", async () =>{
      errorMessageElement.textContent = '';
      const result = await handleGoogleAuthentication();
      if (result.success) { window.location.href = '/dashboard/resumen';
        // showToast('¡Registro exitoso! Por favor, inicia sesión.');
      }
      else { errorMessageElement.textContent = `Error al Continuar con Google: ${result.error.message}`; }
    });
  }

  // --- Event Listener para el formulario de registro ---
  const signupModule = document.getElementById("signupModule");
  if (signupModule) { // Añadir una comprobación de existencia
    signupModule.addEventListener("submit", async function(e){
      e.preventDefault();
      const result = await handleCreateUserWithEmailAndPassword(e.target["SignUpUser"].value, e.target["SignUpEmail"].value, e.target["SignUpPassword"].value);
      if (result.success) { window.location.href = '/dashboard/resumen';
        // showToast('¡Registro exitoso! Por favor, inicia sesión.');
      }
      else { errorMessageElement.textContent = `Error al registrarse: ${result.error.message}`; }
      e.target.reset();
    });
  }
}