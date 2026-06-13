import { reload, sendEmailVerification } from '../../core/firebase.js';
import User from '../../models/User.js';

/**
 * Controlador para el módulo de verificación de email.
 * Permite al usuario refrescar su estado de verificación y solicitar el reenvío del correo.
 * 
 * @param {Object} contexto - El contexto de la vista, contiene datos del usuario.
 */
export default async function emailVerificationController(contexto) {
  const user = contexto.data.user;
  const profile = contexto.data.userProfile;
  
  if (!user) {
    console.error("No se encontró usuario en el contexto.");
    return;
  }

  const refreshBtn = document.querySelector('#emailVerified button');
  const container = document.getElementById('emailVerified');

  // 1. Lógica del botón Refrescar
  const handleRefresh = async (e) => {
    e.preventDefault();
    try {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Verificando...';
      
      // Forzamos a Firebase a actualizar el estado del usuario desde el servidor
      await reload(user);
      
      if (user.emailVerified) {
        console.log("¡Email verificado con éxito!");
        
        // Transición de Rol: De 'pending' a 'guest' en Firestore mediante modelo
        if (profile && profile.role === 'pending') {
          console.log("Actualizando rol a 'guest'...");
          await User.updateRole(user.uid, 'guest');
        }

        console.log("Redirigiendo...");
        window.location.href = '/dashboard/resumen';
      } else {
        alert("El correo aún no ha sido verificado. Por favor, revisa tu bandeja de entrada.");
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'refrescar';
      }
    } catch (error) {
      console.error("Error al refrescar el estado del usuario:", error);
      alert("Hubo un error al intentar verificar. Inténtalo de nuevo.");
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'refrescar';
    }
  };

  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }

  // 2. Añadir botón de Reenvío (Dinámico para no romper el HTML actual)
  const resendContainer = document.createElement('div');
  resendContainer.style.marginTop = '20px';
  resendContainer.innerHTML = `
    <p>¿No recibiste el correo?</p>
    <button id="btn-resend-email" class="btn-secondary">Reenviar correo de verificación</button>
  `;
  container.appendChild(resendContainer);

  const resendBtn = document.getElementById('btn-resend-email');
  
  const handleResend = async () => {
    try {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Enviando...';
      
      await sendEmailVerification(user);
      
      alert("Se ha enviado un nuevo correo de verificación. Por favor, revisa tu bandeja de entrada y la carpeta de spam.");
      
      // Cooldown de 60 segundos para evitar spam
      let seconds = 60;
      const interval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          clearInterval(interval);
          resendBtn.disabled = false;
          resendBtn.textContent = 'Reenviar correo de verificación';
        } else {
          resendBtn.textContent = `Reintentar en ${seconds}s`;
        }
      }, 1000);

    } catch (error) {
      console.error("Error al reenviar el correo:", error);
      alert("Error al enviar el correo. Inténtalo más tarde.");
      resendBtn.disabled = false;
      resendBtn.textContent = 'Reenviar correo de verificación';
    }
  };

  resendBtn?.addEventListener('click', handleResend);

  // --- Función de Limpieza ---
  return () => {
    refreshBtn?.removeEventListener('click', handleRefresh);
    resendBtn?.removeEventListener('click', handleResend);
  };
}
