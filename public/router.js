import { Router } from './app/core/router.js'; // Importa la CLASE Router
import { logMiddleware } from './app/middleware/log.middleware.js'; // Importa nuestro primer middleware
import { sessionGuard } from './app/middleware/auth.js';

// --- Definición de Rutas ---
// Se definen las rutas utilizando el nuevo formato para Mosaic, relativo a /app/views.
export const router = new Router(); // CREA y EXPORTA la instancia del router
router
  .get('/', 'inicio', [logMiddleware]) // Se aplica el middleware a la ruta raíz
  .get('/login', 'auth/login')
  .get('/signup', 'auth/signup')
  .get('/recovery', 'auth/recovery')
  .get('/dashboard/resumen', 'dashboard/summary', [sessionGuard])
  .get('/services', 'dashboard/services', [sessionGuard])
  .get('/services-new', 'dashboard/services-new', [sessionGuard])
  .get('/dashboard/properties', 'dashboard/properties', [sessionGuard])
  .get('/dashboard/properties/:id', 'dashboard/property-detail', [sessionGuard])
  .get('/dashboard/profile', 'dashboard/profile', [sessionGuard])
  .get('/dashboard/requests', 'dashboard/requests', [sessionGuard])
  .get('/dashboard/transactions', 'dashboard/transactions', [sessionGuard])
  .get('/dashboard/transactions/:id', 'dashboard/transactions-detail', [sessionGuard])
  .get('/notifications', 'dashboard/notifications', [sessionGuard])
  .get('/residents', 'dashboard/residents', [sessionGuard])
  .get('/import-residents', 'dashboard/importResidents', [sessionGuard])
  .get('/import-properties', 'dashboard/importProperties', [sessionGuard])
  // --- Rutas de Pagos ---
  .get('/dashboard/payments/report', 'dashboard/payments/report', [sessionGuard])
  .get('/dashboard/payments/history', 'dashboard/payments/history', [sessionGuard])
  .get('/dashboard/payments/pending', 'dashboard/payments/pending', [sessionGuard])
  .get('/dashboard/payments/:id', 'dashboard/payments/detail', [sessionGuard]);


// La función que se exporta para ser llamada desde el script principal.
export function initRouter() {
  router.listen();
}