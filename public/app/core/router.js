import { Mosaic } from './mosaic.js';
import { RenderView } from './RenderView.js';

/**
 * @class Router
 * @description Gestiona el enrutamiento basado en la URL, soportando rutas anidadas y parámetros.
 * Es el orquestador principal de la navegación.
 */
export class Router {
  /**
   * Inicializa las propiedades del enrutador.
   */
  constructor() {
    this.routes = []; // Almacén para todas las rutas registradas.
    this.mosaic = new Mosaic(); // Instancia del compositor de vistas.
    this.renderView = new RenderView(); // Instancia del motor de renderizado.
    this.appView = document.getElementById('app-view'); // Contenedor principal de la aplicación.
    this.currentTargetView = null; // Almacena un destino específico para renderizado parcial.
  }

  /**
   * Convierte una ruta de cadena (ej. /users/:id) en una Expresión Regular.
   * @param {string} path - La ruta a convertir.
   * @returns {RegExp} - La expresión regular generada.
   * @private
   */
  _pathToRegex(path) {
    const regexPath = path
    .replace(/\//g, '\\/')
    .replace(/:(\w+)/g, '([^\\/]+)');
    return new RegExp(`^${regexPath}$`);
  }

  /**
   * Registra una nueva ruta.
   * @param {string} path - La ruta a registrar (ej: '/login', '/users/:id').
   * @param {string} [viewPath] - La ruta a la plantilla HTML de la vista (ej: 'auth.login').
   * @param {Array<Function>} [middlewares=[]] - Un array de funciones middleware a ejecutar antes de cargar la vista.
   * @returns {Router}
   */
  get(path, viewPath, middlewares = []) {
    const regex = this._pathToRegex(path);
    // Aseguramos que middlewares sea siempre un array para un procesamiento consistente.
    const middlewareArray = Array.isArray(middlewares) ? middlewares : [middlewares];
    this.routes.push({ path, regex, viewPath, middlewares: middlewareArray });
    return this;
  }

  /**
   * Inicia el enrutador, escuchando eventos de navegación.
   * Intercepta clics en enlaces `data-link` y cambios en el historial del navegador.
   */
  listen() {
    // Escucha cambios en el historial (botones atrás/adelante).
    window.addEventListener('popstate', () => this.handleRouteChange());

    // Intercepta clics en enlaces internos para evitar recargas completas de la página.
    document.body.addEventListener('click', e => {
      if (e.target.matches('[data-link]')) {
        e.preventDefault();
        history.pushState(null, null, e.target.href);
        this.handleRouteChange();
      }
    });

    // Procesa la ruta actual en cuanto la aplicación carga.
    this.handleRouteChange();
  }

  /**
   * Navega programáticamente a una nueva ruta.
   * @param {string} path - La ruta de destino.
   * @param {string} [targetViewName=null] - Opcional. El nombre de una vista específica para renderizado parcial.
   */
  navigate(path, targetViewName = null) {
    this.currentTargetView = targetViewName; // Almacena el destino para que handleRouteChange lo use.
    history.pushState(null, null, path);
    this.handleRouteChange();
  }

  /**
   * Orquesta el cambio de vista cuando la ruta cambia o en la carga inicial.
   * Este es el método central del enrutador.
   */
  async handleRouteChange() {
    // Obtiene la ruta actual desde la barra de direcciones del navegador.
    const currentPath = window.location.pathname;
    console.log(`Ruta actual: ${currentPath}`);

    // Verifica que el contenedor principal de la app exista en el DOM.
    if (!this.appView) {
      console.error('Element with ID "app-view" not found.');
      document.body.innerHTML = '<h1>Error: App container not found.</h1>';
      return;
    }

    let targetRoute = null;
    let params = {};

    // Itera sobre las rutas registradas para encontrar una que coincida con la ruta actual.
    for (const route of this.routes) {
      const match = currentPath.match(route.regex);
      if (match) {
        targetRoute = route;
        // Extrae los nombres de los parámetros de la ruta (ej: ':id').
        const paramNames = (route.path.match(/:(\w+)/g) || []).map(name => name.substring(1));
        // Si hay parámetros, los extrae de la URL y los mapea a sus nombres.
        if (paramNames.length > 0) {
          params = Object.fromEntries(paramNames.map((name, i) => [name, match[i + 1]]));
        }
        break; // Detiene la búsqueda al encontrar la primera coincidencia.
      }
    }

    // Si se encontró una ruta que coincide con la URL actual...
    if (targetRoute) {
      // 1. Crear el objeto de contexto para esta navegación.
      // Contendrá los parámetros de la URL y datos que los middlewares puedan añadir.
      const contexto = { params: params, data: {} };

      // 2. Ejecutar el pipeline de middlewares en secuencia.
      let canProceed = true;
      for (const middleware of targetRoute.middlewares) {
        // Un middleware puede detener la navegación devolviendo `false`.
        const result = await middleware(contexto);
        if (!result) { 
          canProceed = false; 
          console.log('Navegación detenida por un middleware.');
          break; 
        }
      }

      // Si todos los middlewares permitieron continuar...
      if (!canProceed) { return; }
      
      // 3. Orquestar la composición y el renderizado de la vista.
      try {
        // Solo procede si la ruta tiene una plantilla asociada.
        if (targetRoute.viewPath) {
          // Construye la ruta al archivo de la "receta" de la vista.
          const viewPath = `views/${targetRoute.viewPath.replace(/\./g, '/')}.html`;
          
          // Llama a Mosaic para que componga la vista y sus dependencias (módulos, CSS, etc.).
          const composedView = await this.mosaic.composeView(viewPath, contexto); 
          
          // Llama a RenderView para que actualice el DOM con la vista compuesta.
          await this.renderView.anima(composedView, contexto, this.currentTargetView);
        }
      } catch (error) {
        console.error(`Error en el flujo de ruteo para "${currentPath}":`, error);
      }
    } else {
      // Si no se encontró ninguna ruta, renderiza la vista de 404 (No Encontrado).
      const composed404 = await this.mosaic.composeView('views/404.html', { params: {}, data: {} });
      await this.renderView.anima(composed404, { params: {}, data: {} }, null);
    }
    
    // Limpia el destino de renderizado parcial para la próxima navegación.
    this.currentTargetView = null;
  }
}
