/**
 * i18n.js
 * Sistema básico de internacionalización para rutas.
 */

const translations = {
  es: {
    '/dashboard/requests': '/dashboard/solicitudes',
    '/dashboard/profile': '/dashboard/perfil',
    '/dashboard/residents': '/dashboard/residentes',
    '/dashboard/properties': '/dashboard/propiedades',
    '/dashboard/transactions': '/dashboard/transacciones'
  }
};

/**
 * Traduce una URL amigable a su ruta interna buscando en TODOS los idiomas disponibles.
 * Esto hace que el sistema sea agnóstico al idioma configurado y "simplemente funcione".
 */
export function getInternalPath(path) {
  // Buscamos en todos los idiomas registrados en el objeto translations
  for (const lang of Object.keys(translations)) {
    const map = translations[lang];
    
    for (const [internal, friendly] of Object.entries(map)) {
      const regex = new RegExp('^' + friendly.replace(/:(\w+)/g, '([^\\/]+)') + '$');
      if (path.match(regex)) {
        return internal;
      }
    }
  }
  
  // Si no es un alias, devolvemos el path original (podría ser la ruta en inglés)
  return path;
}

/**
 * Traduce una ruta interna a su URL amigable para el usuario.
 * @param {string} internalPath - La ruta interna (ej. /dashboard/requests).
 * @param {string} lang - El idioma deseado.
 * @returns {string} - La URL traducida.
 */
export function getFriendlyPath(internalPath, lang = 'es') {
  return translations[lang]?.[internalPath] || internalPath;
}
