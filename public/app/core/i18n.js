/**
 * i18n.js
 * Sistema de internacionalización dinámico.
 * Maneja traducción de rutas y carga de diccionarios de contenido desde archivos JSON.
 */

let currentTranslations = {};
let currentLang = 'es';

/**
 * Carga el archivo de traducciones para un idioma específico.
 * @param {string} lang - Código del idioma (ej. 'es', 'en').
 */
export async function loadTranslations(lang = 'es') {
  if (currentLang === lang && Object.keys(currentTranslations).length > 0) return;

  try {
    const response = await fetch(`/app/core/lang/${lang}/translations.json`);
    if (!response.ok) throw new Error(`No se pudo cargar el idioma: ${lang}`);
    currentTranslations = await response.json();
    currentLang = lang;
    console.log(`🌍 Idioma cargado: ${lang}`);
  } catch (error) {
    console.error("❌ Error en i18n:", error);
    // Fallback: Si no hay traducciones, al menos inicializamos el objeto
    currentTranslations = currentTranslations || {};
  }
}

/**
 * Traduce una clave de contenido. Soporta claves anidadas (ej. 'config.languages.es').
 * @param {string} key - La clave a traducir.
 * @returns {string} - El texto traducido o la clave si no existe.
 */
export function t(key) {
  const keys = key.split('.');
  let value = currentTranslations;

  for (const k of keys) {
    value = value?.[k];
    if (!value) break;
  }

  return value || key;
}

/**
 * Traduce una URL amigable a su ruta interna.
 */
export function getInternalPath(path) {
  const routes = currentTranslations.routes || {};
  for (const [internal, friendly] of Object.entries(routes)) {
    // Escapar barras y manejar parámetros dinámicos (:id)
    const regexSource = '^' + friendly.replace(/\//g, '\\/').replace(/:(\w+)/g, '([^\\/]+)') + '$';
    const regex = new RegExp(regexSource);
    if (path.match(regex)) return internal;
  }
  return path;
}

/**
 * Traduce una ruta interna a su URL amigable.
 */
export function getFriendlyPath(internalPath) {
  const routes = currentTranslations.routes || {};
  return routes[internalPath] || internalPath;
}

/**
 * Obtiene el idioma cargado actualmente.
 */
export function getCurrentLang() {
    return currentLang;
}
