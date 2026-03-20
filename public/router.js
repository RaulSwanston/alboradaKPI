import { Router } from './app/core/router.js'; // Importa la CLASE Router
import { logMiddleware } from './app/middleware/log.middleware.js'; // Importa nuestro primer middleware

// --- Definición de Rutas ---
// Se definen las rutas utilizando el nuevo formato para Mosaic, relativo a /app/views.
export const router = new Router(); // CREA y EXPORTA la instancia del router
router
  .get('/', 'inicio', [logMiddleware]) // Se aplica el middleware a la ruta raíz
  .get('/login', 'auth/login')
  .get('/signup', 'auth/signup')
  .get('/recovery', 'auth/recovery')
  .get('/summary', 'dashboard/summary')
  .get('/services', 'dashboard/services')
  .get('/services-new', 'dashboard/services-new')
  .get('/dashboard/properties', 'dashboard/properties')
  .get('/dashboard/properties/:id', 'dashboard/property-detail')
  .get('/dashboard/transactions', 'dashboard/transactions')
  .get('/dashboard/transactions/:id', 'dashboard/transactions-detail')
  .get('/notifications', 'dashboard/notifications')
  .get('/residents', 'dashboard/residents')
  .get('/import-residents', 'dashboard/importResidents')
  .get('/import-properties', 'dashboard/importProperties');

// La función que se exporta para ser llamada desde el script principal.
export function initRouter() {
  router.listen();
}