import { handleGoogleAuthentication, handleSignInWithEmailAndPassword } from "../../models/Authentication.js";
import { waitForAuth } from "../../core/firebase.js";

export default async function login(params) { // MODIFICADO: Ahora es un export default y acepta 'params'
  await initLoginModule();
}

async function initLoginModule() {
  let errorMessageElement = document.getElementById("error-message");
  let user = await waitForAuth();
  if (user) { window.location.href = '/dashboard/resumen'; return; }

  // --- Event Listener para el botón de Google ---
  const googleSignInButton = document.getElementById("googleSignInButton");
  if (googleSignInButton) { // Añadir una comprobación de existencia
    googleSignInButton.addEventListener("click", async () =>{
      errorMessageElement.textContent = '';
      const result = await handleGoogleAuthentication();
      if (result.success) { window.location.href = '/dashboard/resumen';
        // showToast('¡Inicio de sesión exitoso!');
      }
      else { errorMessageElement.textContent = `Error al iniciar sesión con Google: ${result.error.message}`; }
    });
  }

  // --- Event Listener para el formulario de login ---
  const loginForm = document.getElementById("loginForm");
  if (loginForm) { // Añadir una comprobación de existencia
    loginForm.addEventListener("submit", async function (e) {
      errorMessageElement.textContent = '';
      e.preventDefault();
      const result = await handleSignInWithEmailAndPassword(e.target["email"].value, e.target["password"].value);
      if (result.success) { window.location.href = '/dashboard/resumen';
        // showToast('¡Inicio de sesión exitoso!');
      }
      else { errorMessageElement.textContent = `Error al iniciar sesión: ${result.error.message}`; }
      e.target.reset();
    });
  }
}