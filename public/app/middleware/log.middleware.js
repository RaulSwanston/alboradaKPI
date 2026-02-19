/**
 * log.middleware.js
 * 
 * Este es un middleware de ejemplo que registra en la consola la información
 * de la navegación cada vez que se activa una ruta que lo utiliza.
 * 
 * @param {object} params - Un objeto que contiene los parámetros dinámicos de la URL.
 * @returns {boolean} - Siempre devuelve true para permitir que la navegación continúe.
 */
export const logMiddleware = async (contexto) => {
  console.log('[Middleware Log] Navegando a la ruta:', window.location.pathname);
  if (Object.keys(contexto.params).length > 0) {
    console.log('[Middleware Log] Parámetros de ruta detectados:', contexto.params);
  }
  return true; // Es importante devolver true para no bloquear el pipeline.
};
