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
    // Almacena las funciones de limpieza devueltas por los controladores de la vista activa.
    this.activeCleanups = [];
    if (!this.appView) {
      console.error("El elemento #app-view no fue encontrado. Esencial para RenderView.");
    }
  }

  /**
   * Ejecuta todas las funciones de limpieza registradas para la vista anterior.
   * Esto es crucial para detener procesos como setIntervals o event listeners y evitar "fugas de memoria" y ejecuciones múltiples.
   */
  cleanupPreviousView() {
    if (this.activeCleanups.length > 0) {
      console.log(`Ejecutando ${this.activeCleanups.length} funciones de limpieza de la vista anterior.`);
      // Llama a cada función de limpieza registrada.
      this.activeCleanups.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error("Error durante la ejecución de una función de limpieza:", error);
        }
      });
      // Resetea el array para la nueva vista.
      this.activeCleanups = [];
    }
  }

  /**
   * Toma una vista pre-compuesta y la "anima" (renderiza) en el DOM.
   * Su trabajo incluye inyectar el HTML, cargar los assets y ejecutar los controladores de la vista.
   * @param {object} composedView - El objeto de vista compuesto por Mosaic.
   * @param {object} contexto - El contexto de la ruta actual.
   */
  async anima(composedView, contexto, targetViewName = null) {
    console.log("composedView recibido en anima:", composedView);
    // --- PASO 0: Limpiar la lógica de la vista anterior ---
    // Esto previene la acumulación de listeners o intervalos de controladores previos.
    this.cleanupPreviousView();

    if (!composedView) {
      this.appView.innerHTML = `<p>Error al componer la vista. Por favor, intente de nuevo.</p>`;
      return;
    }

    const { finalHtml, cssUrls, controllerPaths } = composedView;
    const parser = new DOMParser();
    const finalDoc = parser.parseFromString(finalHtml, 'text/html');

    // --- PASO 1 (CORREGIDO): Cargar todo el CSS y ESPERAR a que esté listo ---
    // Primero, agrega los CSS descubiertos por Mosaic al <head> del documento en memoria.
    cssUrls.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        finalDoc.head.appendChild(link);
    });
    // Luego, fusiona el <head> del documento en memoria con el <head> real, evitando duplicados.
    await this.mergeHeadElements(finalDoc.head);

    // --- PASO 2 (CORREGIDO): AHORA, inyectar el HTML en el DOM ---
    const targetContainer = targetViewName ? document.querySelector(`[data-content="${targetViewName}"]`) : null;
    
    if (targetContainer) {
      // --- MODO DE RENDERIZADO PARCIAL ---
      const newContentBlock = finalDoc.querySelector(`[data-content="${targetViewName}"]`);
      if (newContentBlock) {
        console.log(`Renderizado Inteligente: Actualizando solo el bloque [data-content="${targetViewName}"].`);
        // Reemplaza el nodo DOM completo para una actualización más limpia y atómica.
        targetContainer.replaceWith(newContentBlock);
      } else {
        console.warn(`No se encontró el bloque [data-content="${targetViewName}"] en la nueva vista. Realizando renderizado completo.`);
        this.appView.innerHTML = finalDoc.body.innerHTML;
      }
    } else {
      // --- MODO DE RENDERIZADO COMPLETO ---
      console.log("Renderizado Completo: No se especificó un targetView o no se encontró el contenedor.");
      this.appView.innerHTML = finalDoc.body.innerHTML;
    }
    
    document.title = finalDoc.title || document.title;
    
    // --- PASO 3: Cargar y ejecutar los controladores ---
    if (controllerPaths && controllerPaths.length > 0) {
      for (const controllerPath of controllerPaths) {
        let objectUrl = null;
        try {
          const response = await fetch(controllerPath);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const scriptText = await response.text();
          const importRegex = /(import\s+.*?\s+from\s+)(['"])([^'"]+)(['"])/g;
          const origin = window.location.origin;
          const baseUrl = new URL(controllerPath, origin).href;
          const processedScriptText = scriptText.replace(importRegex, (match, pre, quote, path, post) => {
            if (path.startsWith('/') || path.startsWith('.')) {
              const resolvedUrl = new URL(path, baseUrl).href;
              return `${pre}${quote}${resolvedUrl}${post}`;
            }
            return match;
          });
          const blob = new Blob([processedScriptText], { type: 'application/javascript' });
          objectUrl = URL.createObjectURL(blob);
          const controllerModule = await import(objectUrl);
          if (controllerModule.default && typeof controllerModule.default === 'function') {
            // Ejecuta el controlador y captura la función de limpieza si la devuelve.
            const cleanupFn = controllerModule.default(contexto);
            if (typeof cleanupFn === 'function') {
              // La almacena para ejecutarla antes de la próxima navegación.
              this.activeCleanups.push(cleanupFn);
            }
          }
          else {
            console.warn(`El controlador ${controllerPath} no tiene una exportación por defecto (función).`);
          }
        } catch (error) {
          console.error(`Error al cargar o ejecutar el controlador: ${controllerPath}`, error);
        } finally {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        }
      }
    }
    console.log(`✅ Vista renderizada y controladores ejecutados.`);
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
