import { handleGoogleAuthentication, handleSignInWithEmailAndPassword } from "../models/Authentication.js";
import { waitForAuth } from "../core/firebase.js";

export async function login() {
  await initLoginModule();
}

async function initLoginModule() {
  let errorMessageElement = document.getElementById("error-message");
  let user = await waitForAuth();
  if (user) { window.location.href = '/summary'; return; }

  // --- Event Listener para el botón de Google ---
  const googleSignInButton = document.getElementById("googleSignInButton");
  googleSignInButton.addEventListener("click", async () =>{
    errorMessageElement.textContent = '';
    const result = await handleGoogleAuthentication();
    if (result.success) { window.location.href = '/summary';
      // showToast('¡Inicio de sesión exitoso!');
    }
    else { errorMessageElement.textContent = `Error al iniciar sesión con Google: ${result.error.message}`; }
  });

  // --- Event Listener para el formulario de login ---
  const loginForm = document.getElementById("loginForm");
  loginForm.addEventListener("submit", async function (e) {
    errorMessageElement.textContent = '';
    e.preventDefault();
    const result = await handleSignInWithEmailAndPassword(e.target["email"].value, e.target["password"].value);
    if (result.success) { window.location.href = '/summary';
      // showToast('¡Inicio de sesión exitoso!');
    }
    else { errorMessageElement.textContent = `Error al iniciar sesión: ${result.error.message}`; }
    e.target.reset();
  });
}