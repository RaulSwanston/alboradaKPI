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

  const refreshBtn = document.getElementById('btn-refresh-email');
  const refreshLabel = refreshBtn?.querySelector('.ev-btn-label');
  const resendBtn = document.getElementById('btn-resend-email');

  // Inyecta iconos SVG desde el repositorio central (icons.json)
  const handleIcons = async () => {
    try {
      const response = await fetch('/src/img/icons.json');
      const data = await response.json();
      const iconRepo = data.icons;
      container.querySelectorAll('[data-icon]').forEach(el => {
        const iconData = iconRepo.find(i => i.name === el.dataset.icon);
        if (iconData) el.innerHTML = iconData.svg;
      });
    } catch (error) {
      console.error("Error al cargar icons.json en emailVerification:", error);
    }
  };

  const container = document.getElementById('emailVerified');

  const setRefreshText = (text) => {
    if (refreshLabel) {
      refreshLabel.textContent = text;
    } else if (refreshBtn) {
      refreshBtn.textContent = text;
    }
  };

  // 1. Lógica del botón Refrescar
  const handleRefresh = async (e) => {
    e.preventDefault();
    try {
      refreshBtn.disabled = true;
      setRefreshText('Verificando...');
      
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
        setRefreshText('Refrescar');
      }
    } catch (error) {
      console.error("Error al refrescar el estado del usuario:", error);
      alert("Hubo un error al intentar verificar. Inténtalo de nuevo.");
      refreshBtn.disabled = false;
      setRefreshText('Refrescar');
    }
  };

  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }

  // 2. Lógica del botón de Reenvío
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

  handleIcons();

  // --- Función de Limpieza ---
  return () => {
    refreshBtn?.removeEventListener('click', handleRefresh);
    resendBtn?.removeEventListener('click', handleResend);
  };
}
