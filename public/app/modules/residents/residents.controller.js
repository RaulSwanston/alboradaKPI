export default async function residents(params) { // MODIFICADO: Ahora es un export default y acepta 'params'
  initResidents();
}

async function initResidents() {
  console.log("Residentes: Inicializando lógica del modal.");

  // 1. Obtener los elementos clave del DOM
  const modal = document.getElementById('admin-user-registration-section');
  const openButton = document.getElementById('btn-open-modal-user');
  const closeButton = document.getElementById('btn-close-modal-user');
  
  // Si falta alguno de los elementos, detenemos la ejecución.
  if (!modal || !openButton || !closeButton) {
    console.error("Error: Faltan elementos clave (modal, botón de abrir o botón de cerrar).");
    return;
  }

  // --- Funciones de Control del Modal ---

  // Función para abrir el modal (añade la clase 'is-open')
  const openModal = () => {
    modal.classList.add('is-open');
    // Esto asegura que el foco esté dentro del modal, mejorando la accesibilidad
    modal.setAttribute('aria-modal', 'true'); 
    modal.setAttribute('role', 'dialog');
  };

  // Función para cerrar el modal (quita la clase 'is-open')
  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.removeAttribute('aria-modal');
    modal.removeAttribute('role');
  };

  // --- Manejadores de Eventos ---

  // 2. Abrir el modal al hacer clic en el botón "Nuevo residente"
  openButton.addEventListener('click', (event) => {
    event.preventDefault(); // Previene la navegación a "#" o "/residentsaddNew"
    openModal();
  });

  // 3. Cerrar el modal al hacer clic en el botón de cierre (X)
  closeButton.addEventListener('click', closeModal);

  // 4. Cerrar el modal si se hace clic fuera del contenido (en el fondo traslúcido)
  modal.addEventListener('click', (event) => {
    // Si el clic ocurrió en el overlay (modal) y no en un hijo del modal
    if (event.target === modal) {
      closeModal();
    }
  });

  // 5. Cerrar el modal al presionar la tecla ESC (Especialmente importante para UX)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });
}