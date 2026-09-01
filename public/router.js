import { Router } from './app/core/router.js'; // Importa la CLASE Router
import { logMiddleware } from './app/middleware/log.middleware.js'; // Importa nuestro primer middleware
import { sessionGuard, adminGuard } from './app/middleware/auth.js';

// --- Definición de Rutas ---
// Se definen las rutas utilizando el nuevo formato para Mosaic, relativo a /app/views.
export const router = new Router(); // CREA y EXPORTA la instancia del router

// Exponer globalmente para acceso desde controladores
window.router = router;

router
  .get('/', 'inicio', [logMiddleware]) // Se aplica el middleware a la ruta raíz
  .get('/login', 'auth/login')
  .get('/signup', 'auth/signup')
  .get('/recovery', 'auth/recovery')
  .get('/dashboard/resumen', 'dashboard/summary', [sessionGuard])
  .get('/services', 'dashboard/services', [sessionGuard])
  .get('/services-new', 'dashboard/services-new', [sessionGuard])
  .get('/services/:id', 'dashboard/services-detail', [sessionGuard])
  .get('/dashboard/properties', 'dashboard/properties', [sessionGuard])
  .get('/dashboard/properties/:id', 'dashboard/property-detail', [sessionGuard])
  .get('/dashboard/estado-cuenta', 'dashboard/property-detail', [sessionGuard])
  .get('/dashboard/gastos-generales', 'dashboard/general-expenses', [sessionGuard])
  .get('/dashboard/profile', 'dashboard/profile', [sessionGuard])
  .get('/dashboard/requests', 'dashboard/requests', [sessionGuard])
  .get('/dashboard/transactions', 'dashboard/transactions', [sessionGuard])
  .get('/dashboard/transactions/:id', 'dashboard/transactions-detail', [sessionGuard])
  .get('/dashboard/notifications', 'dashboard/notifications', [sessionGuard])
  .get('/dashboard/events', 'dashboard/events', [sessionGuard])
  .get('/dashboard/providers', 'dashboard/providers', [sessionGuard])
  .get('/residents', 'dashboard/residents', [sessionGuard])
  .get('/import-residents', 'dashboard/importResidents', [sessionGuard, adminGuard])
  .get('/import-properties', 'dashboard/importProperties', [sessionGuard, adminGuard])
  .get('/dashboard/config', 'dashboard/config', [sessionGuard, adminGuard])
  // --- Rutas de Pagos ---
  .get('/dashboard/payments/report', 'dashboard/payments/report', [sessionGuard])
  .get('/dashboard/payments/history', 'dashboard/payments/history', [sessionGuard])
  .get('/dashboard/payments/pending', 'dashboard/payments/pending', [sessionGuard])
  .get('/dashboard/payments/:id', 'dashboard/payments/detail', [sessionGuard]);


import { loadTranslations } from './app/core/i18n.js';

// ... resto del código ...

// La función que se exporta para ser llamada desde el script principal.
export async function initRouter() {
  // Estrategia de Carga Dinámica Síncrona:
  // Intentamos recuperar el idioma del usuario desde el caché local (localStorage)
  // para cargar el mapa de rutas antes de que el router procese la URL actual.
  try {
    const cached = localStorage.getItem('gph_app_config');
    const lang = cached ? JSON.parse(cached).systemDefaults?.language : 'es';
    await loadTranslations(lang);
  } catch (e) {
    await loadTranslations('es'); // Fallback de seguridad
  }
  
  router.listen();
}