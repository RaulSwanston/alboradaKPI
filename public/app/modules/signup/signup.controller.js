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

  // --- Toggle Mostrar/Ocultar Contraseña ---
  const passwordToggle = document.getElementById("toggle-password");
  const passwordInput = signupModule?.querySelector('input[name="SignUpPassword"]');
  if (passwordToggle && passwordInput) {
    const eyeOpenSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4 3 1.5 6 1.5 8S4 13 8 13s6.5-3 6.5-5S12 3 8 3zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
    const eyeClosedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4 3 1.5 6 1.5 8S4 13 8 13c1.7 0 3.27-.8 4.46-2.07l-1.07-1.07A3.5 3.5 0 0 1 6 7.54L4.72 6.26C5.68 4.84 6.78 3.86 8 3c3.4 0 6.5 2.5 6.5 5 0 .66-.24 1.31-.64 1.93l-1.16-1.16c.23-.25.3-.38.3-.38S12.06 6 8 6c-.78 0-1.52.18-2.22.49L4.6 5.31C5.61 4.16 6.77 3.27 8 3z"/><path d="M13.65 14.36L1.64 2.35a.5.5 0 0 1 .7-.7l12.02 12.01a.5.5 0 0 1-.71.7z"/><path d="M4.94 5.65a3.5 3.5 0 0 0 5.41 4.4z"/></svg>';
    passwordToggle.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      passwordToggle.innerHTML = isPassword ? eyeClosedSvg : eyeOpenSvg;
      passwordToggle.setAttribute("aria-label", isPassword ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  }
}