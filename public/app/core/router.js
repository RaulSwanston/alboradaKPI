import { Mosaic } from './mosaic.js';

/**
 * @class Router
 * @description Gestiona el enrutamiento basado en el hash de la URL, utilizando Mosaic para el renderizado de plantillas.
 */
export class Router {
  /**
   * Crea una instancia del Router.
   */
  constructor() {
    this.routes = []; // Almacena las definiciones de las rutas.
    // Instancia Mosaic. Ya no necesita opciones, sabe dónde encontrar las vistas.
    this.mosaic = new Mosaic();
    this.appView = document.getElementById('app-view'); // Cachea el elemento principal.
  }

  /**
   * Registra una nueva ruta.
   * @param {string} hash - La ruta a registrar (ej: '#/login', '#/dashboard', '/').
   * @param {function} [controller] - La función que se ejecutará después de renderizar la plantilla. Opcional.
   * @param {string} [templateName] - El nombre de la plantilla para Mosaic (ej: 'inicio', 'theme.auth'). Opcional.
   * @returns {Router} La instancia del Router para permitir encadenamiento.
   */
  get(hash, controller, templateName) {
    this.routes.push({ hash, controller, templateName });
    return this;
  }

  /**
   * Inicia el enrutador para que escuche los cambios de URL y maneje la carga inicial.
   */
  listen() {
    window.addEventListener('popstate', () => this.handleRouteChange());
    window.addEventListener('load', () => this.handleRouteChange()); // Maneja la carga inicial.
  }

  /**
   * Se ejecuta cuando la ruta cambia o en la carga inicial.
   * Busca la ruta, renderiza la plantilla con Mosaic y ejecuta su controlador.
   */
  async handleRouteChange() {
    const path = window.location.pathname;
    const route = this.routes.find(r => r.hash === path);

    if (!this.appView) {
      console.error('Element with ID "app-view" not found. Cannot render content.');
      document.body.innerHTML = '<h1>Error: App container not found.</h1>';
      return;
    }

    if (route) {
      try {
        if (route.templateName) {
          // Convierte 'theme.auth' en 'views/theme/auth.html'
          const viewPath = `views/${route.templateName.replace(/\./g, '/')}.html`;
          // Usa el nuevo método que procesa el head y el body
          await this.mosaic.loadAndProcessView(viewPath);
        }
        if (route.controller) {
          // Ejecuta el controlador después de que el DOM ha sido actualizado.
          route.controller();
        }
      } catch (error) {
        console.error(`Error processing view for route "${hash}":`, error);
        // Dejamos que Mosaic maneje el mensaje de error en la vista.
      }
    } else {
      // Si no se encuentra la ruta, carga una vista 404.
      await this.mosaic.loadAndProcessView('views/404.html');
    }
  }
}
