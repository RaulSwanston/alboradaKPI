/**
 * RenderView.js
 * 
 * Esta clase es responsable de tomar una vista pre-procesada (compuesta por Mosaic)
 * y renderizarla en el DOM. Su trabajo incluye inyectar el HTML, cargar
 * los assets (CSS, JS) y ejecutar el controlador de la vista.
 */
export class RenderView {
  constructor() {
    this.appView = document.getElementById('app-view');
    
    /**
     * GESTIÓN DE CICLO DE VIDA (CLEANUPS):
     * Utilizamos un Map para organizar las funciones de limpieza según su "ámbito" (scope).
     * Esto permite que al navegar en un renderizado parcial (ej. data-view="dashboard"),
     * solo destruyamos la lógica de esa zona, manteniendo vivos los componentes globales (Navigator).
     * 
     * Estructura: Map<string, Array<Function>>
     */
    this.activeCleanups = new Map();
    
    if (!this.appView) {
      console.error("El elemento #app-view no fue encontrado. Esencial para RenderView.");
    }
  }

  /**
   * Ejecuta las funciones de limpieza de forma selectiva.
   * @param {string|null} scope - Nombre del ámbito a limpiar. 
   * Si es null, se asume una carga total y se limpia TODA la aplicación.
   */
  cleanupPreviousView(scope = null) {
    if (scope === null) {
      // Caso: Carga inicial o navegación a una página con estructura totalmente diferente
      console.log("RenderView: Ejecutando limpieza TOTAL (Reset de aplicación).");
      this.activeCleanups.forEach(cleanups => {
        cleanups.forEach(cleanup => {
          try { cleanup(); } catch (e) { console.error("Error en cleanup global:", e); }
        });
      });
      this.activeCleanups.clear();
    } else if (this.activeCleanups.has(scope)) {
      // Caso: Renderizado parcial (solo limpiamos el área que va a cambiar)
      console.log(`RenderView: Ejecutando limpieza selectiva para el ámbito [${scope}].`);
      const cleanups = this.activeCleanups.get(scope);
      cleanups.forEach(cleanup => {
        try { cleanup(); } catch (e) { console.error(`Error en cleanup de [${scope}]:`, e); }
      });
      this.activeCleanups.delete(scope);
    }
  }

  /**
   * Registra una función de limpieza (devuelta por un controlador) en un ámbito.
   * @param {string} scope - Ámbito donde vive el controlador (ej. 'dashboard' o 'global').
   * @param {Function} cleanupFn - La función a ejecutar cuando el componente se destruya.
   */
  registerCleanup(scope, cleanupFn) {
    if (!cleanupFn || typeof cleanupFn !== 'function') return;
    const key = scope || 'global';
    if (!this.activeCleanups.has(key)) {
      this.activeCleanups.set(key, []);
    }
    this.activeCleanups.get(key).push(cleanupFn);
  }

  /**
   * Renderiza la vista compuesta en el DOM.
   * @param {object} composedView - Datos de la vista (HTML, CSS, JS) generados por Mosaic.
   * @param {object} contexto - Datos de la ruta y sesión.
   * @param {string} targetViewName - Nombre del ámbito de renderizado parcial (del atributo data-view).
   */
  async anima(composedView, contexto, targetViewName = null) {
    console.log(`RenderView: Iniciando animación (Ámbito: ${targetViewName || 'TOTAL'})`);
    
    // --- PASO 0: Limpieza Inteligente ---
    // Solo matamos la lógica de la zona que va a ser reemplazada.
    this.cleanupPreviousView(targetViewName);

    if (!composedView) {
      this.appView.innerHTML = `<p>Error al componer la vista.</p>`;
      return;
    }

    const { finalHtml, cssUrls, controllerPaths } = composedView;
    const parser = new DOMParser();
    const finalDoc = parser.parseFromString(finalHtml, 'text/html');

    // --- PASO 1: Inyección de Estilos ---
    cssUrls.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        finalDoc.head.appendChild(link);
    });
    await this.mergeHeadElements(finalDoc.head);

    // --- PASO 2: Inyección de HTML ---
    // Identificamos si tenemos un contenedor específico para renderizado parcial.
    const targetContainer = targetViewName ? document.querySelector(`[data-content="${targetViewName}"]`) : null;
    
    if (targetContainer) {
      // RENDERIZADO PARCIAL: Solo cambiamos el "hijo" que ha mutado.
      const newContentBlock = finalDoc.querySelector(`[data-content="${targetViewName}"]`);
      if (newContentBlock) {
        console.log(`RenderView: Reemplazando contenido en [data-content="${targetViewName}"].`);
        targetContainer.replaceWith(newContentBlock);
      } else {
        // Fallback: Si no encontramos el bloque parcial en la nueva receta, hacemos renderizado completo.
        this.appView.innerHTML = finalDoc.body.innerHTML;
        targetViewName = null; 
      }
    } else {
      // RENDERIZADO TOTAL: Reemplazo absoluto del contenedor principal.
      this.appView.innerHTML = finalDoc.body.innerHTML;
    }
    
    document.title = finalDoc.title || document.title;
    
    // --- PASO 3: Ejecución Selectiva de Controladores ---
    /**
     * LÓGICA DE ACTIVACIÓN:
     * Para evitar el re-inicio innecesario de módulos (parpadeos), decidimos qué controladores
     * ejecutar basándonos en si son nuevos en el DOM o parte del ámbito actualizado.
     */
    let controllersToRun = [];
    
    if (targetViewName) {
      // En renderizado parcial, SOLO ejecutamos controladores que vivan dentro del bloque actualizado.
      const updatedContainer = document.querySelector(`[data-content="${targetViewName}"]`);
      if (updatedContainer) {
        // Obtenemos los controladores de los módulos mediante la marca inyectada por Mosaic.
        controllersToRun = Array.from(updatedContainer.querySelectorAll('[data-module-controller]'))
          .map(el => el.getAttribute('data-module-controller'));
          
        // Añadimos también controladores de página que Mosaic haya detectado y que no sean módulos.
        const moduleSet = new Set(controllersToRun);
        controllerPaths.forEach(path => {
          if (!moduleSet.has(path)) controllersToRun.push(path);
        });
      }
    } else {
      // En renderizado total, ejecutamos todos los controladores detectados.
      controllersToRun = controllerPaths;
    }

    if (controllersToRun && controllersToRun.length > 0) {
      for (const controllerPath of controllersToRun) {
        // SEGURIDAD: Si el controlador ya está vivo en un ámbito persistente (Layout), 
        // y estamos en un renderizado parcial, NO debemos ejecutarlo de nuevo.
        if (targetViewName) {
          const existingEl = document.querySelector(`[data-module-controller="${controllerPath}"]`);
          const isPersistent = existingEl && existingEl.closest(`[data-content]`)?.getAttribute('data-content') !== targetViewName;
          
          // Si el elemento existe y NO está dentro del área que estamos actualizando, lo ignoramos.
          if (isPersistent && !document.querySelector(`[data-content="${targetViewName}"]`).contains(existingEl)) {
            console.log(`RenderView: Saltando controlador persistente [${controllerPath}].`);
            continue;
          }
        }

        let objectUrl = null;
        try {
          const response = await fetch(controllerPath);
          if (!response.ok) continue;

          // Procesamiento del script para resolver importaciones dinámicas relativas.
          const scriptText = await response.text();
          const baseUrl = new URL(controllerPath, window.location.origin).href;
          const processedScriptText = scriptText.replace(/(import\s+.*?\s+from\s+)(['"])([^'"]+)(['"])/g, (match, pre, quote, path, post) => {
            return (path.startsWith('/') || path.startsWith('.')) ? `${pre}${quote}${new URL(path, baseUrl).href}${post}` : match;
          });

          const blob = new Blob([processedScriptText], { type: 'application/javascript' });
          objectUrl = URL.createObjectURL(blob);
          const controllerModule = await import(objectUrl);

          if (controllerModule.default && typeof controllerModule.default === 'function') {
            // Ejecutamos el controlador y capturamos su función de limpieza.
            const cleanupFn = await controllerModule.default(contexto);
            
            /**
             * DETERMINACIÓN DEL ÁMBITO DE REGISTRO:
             * Buscamos el elemento en el DOM REAL para saber exactamente dónde vive.
             * Si vive dentro de un [data-content], ese es su ámbito de limpieza.
             * De lo contrario, es un componente 'global' (Layout).
             */
            const element = document.querySelector(`[data-module-controller="${controllerPath}"]`);
            const parentContent = element?.closest('[data-content]');
            const scope = parentContent ? parentContent.getAttribute('data-content') : (targetViewName || 'global');

            this.registerCleanup(scope, cleanupFn);
          }
        } catch (error) {
          console.error(`❌ Fallo en controlador [${controllerPath}]:`, error);
        } finally {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
      }
    }

    // --- PASO 4: Visibilidad por rol en cada render ---
    // Garantiza que los elementos [data-role-required] se oculten/muestren
    // correctamente en carga global y parcial, sin depender del orden en que
    // se inyecten los módulos. Fuente de verdad: contexto.data.permissions.
    // Se aplica siempre (aun si falta permissions) para no mostrar controles
    // de admin a quien no los tiene.
    const isAdmin = contexto?.data?.permissions?.isAdmin === true;
    const isResident = contexto?.data?.permissions?.isResident === true;
    document.querySelectorAll('[data-role-required="admin"]')
      .forEach(el => el.classList.toggle('hidden', !isAdmin));
    document.querySelectorAll('[data-role-required="resident"]')
      .forEach(el => el.classList.toggle('hidden', !isResident));

    console.log(`✅ Ciclo de renderizado completado con éxito.`);
  }

  /**
   * Fusiona los elementos de un <head> de una vista parcial en el <head> del documento principal.
   * Evita duplicados y recrea scripts para su ejecución, esperando a que se carguen.
   * @param {HTMLHeadElement} newHead El elemento <head> del documento parseado.
   * @returns {Promise<void>} Una promesa que se resuelve cuando todos los scripts se han cargado.
   */
  async mergeHeadElements(newHead) {
    const mainHead = document.head;
    const assetPromises = [];

    Array.from(newHead.children).forEach(newNode => {
      const tag = newNode.tagName;
      let isDuplicate = false;
      // Usar getAttribute para obtener el valor literal del atributo, no la URL resuelta.
      const key = newNode.getAttribute('src') || newNode.getAttribute('href');

      if (key) {
        // Comparar atributo con atributo para una deduplicación precisa.
        isDuplicate = !!mainHead.querySelector(`${tag}[src="${key}"], ${tag}[href="${key}"]`);
      }

      if (isDuplicate) return;

      const clonedNode = newNode.cloneNode(true);

      // Crear promesas para esperar la carga de scripts y hojas de estilo
      if ((tag === 'SCRIPT' && clonedNode.src) || (tag === 'LINK' && clonedNode.rel === 'stylesheet')) {
        const promise = new Promise((resolve, reject) => {
          clonedNode.onload = resolve;
          clonedNode.onerror = () => reject(new Error(`Falló la carga de: ${clonedNode.src || clonedNode.href}`));
        });
        assetPromises.push(promise);
      }
      
      mainHead.appendChild(clonedNode);
    });

    // Esperar a que todos los scripts y hojas de estilo se hayan cargado
    await Promise.all(assetPromises);
  }
}
