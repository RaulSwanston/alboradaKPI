/**
 * search.controller.js
 * 
 * Controlador para el módulo de búsqueda reutilizable.
 * Emite eventos personalizados para que otros módulos reaccionen a la búsqueda.
 */
export default function searchController(contexto) {
  const input = document.getElementById('app-search-input');
  const clearBtn = document.getElementById('search-clear-btn');

  if (!input) return;

  /**
   * Notifica el cambio de búsqueda mediante un evento personalizado.
   * @param {string} value - El término de búsqueda.
   */
  const notifySearch = (value) => {
    const searchEvent = new CustomEvent('app:search', {
      detail: { query: value.trim() },
      bubbles: true
    });
    input.dispatchEvent(searchEvent);
  };

  /**
   * Gestiona la visibilidad del botón de limpiar.
   */
  const toggleClearBtn = () => {
    if (input.value.length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  };

  // Evento de escritura (input)
  input.addEventListener('input', (e) => {
    toggleClearBtn();
    notifySearch(e.target.value);
  });

  // Evento de limpiar búsqueda
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.focus();
      toggleClearBtn();
      notifySearch('');
    });
  }

  // Limpieza al destruir el módulo
  return () => {
    console.log("Limpiando módulo de búsqueda.");
  };
}
