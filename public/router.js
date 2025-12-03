import { Router } from './app/core/router.js'; // Importa la clase Router
import * as controller from './app/controllers/index.js';

// --- Definición de Rutas ---
// Se definen las rutas utilizando el nuevo formato para Mosaic, relativo a /app/views.
const router = new Router();
router
  .get('/', controller.home, 'inicio')
  .get('/login', controller.login, 'auth/login')
  .get('/signup', controller.signup, 'auth/signup')
  .get('/recovery', controller.recovery, 'auth/recovery')
  .get('/summary', controller.summary, 'dashboard/summary');

// La función que se exporta para ser llamada desde el script principal.
export function initRouter() {
  router.listen();
}