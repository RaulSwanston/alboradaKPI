/**
 * @file icons.js
 * @description Utilidad centralizada para carga e inyección de iconos SVG con caché en memoria.
 */

let cachedIcons = null;
let fetchPromise = null;

/**
 * Carga el diccionario de iconos desde el repositorio central.
 * Utiliza una promesa única para evitar múltiples peticiones fetch simultáneas.
 * @returns {Promise<Array>} Lista de iconos.
 */
async function loadIcons() {
  if (cachedIcons) return cachedIcons;
  
  if (!fetchPromise) {
    fetchPromise = fetch('/src/img/icons.json')
      .then(response => {
        if (!response.ok) throw new Error('No se pudo cargar icons.json');
        return response.json();
      })
      .then(data => {
        cachedIcons = data.icons || [];
        return cachedIcons;
      })
      .catch(error => {
        fetchPromise = null; // Permitir reintento si falla
        console.error("❌ Error en cargador de iconos centralizado:", error);
        return [];
      });
  }
  
  return fetchPromise;
}

/**
 * Inyecta iconos SVG en todos los elementos con [data-icon] dentro de un contenedor.
 * @param {HTMLElement|Document} [container=document] - Contenedor donde buscar los elementos.
 */
export async function injectIcons(container = document) {
  try {
    const icons = await loadIcons();
    const elements = container.querySelectorAll('[data-icon]');
    
    elements.forEach(el => {
      const iconName = el.dataset.icon;
      const iconData = icons.find(i => i.name === iconName);
      if (iconData) {
        el.innerHTML = iconData.svg;
      }
    });
  } catch (error) {
    console.error("❌ Error al inyectar iconos:", error);
  }
}
