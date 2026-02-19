export class Mosaic {
  constructor() {
    this.appView = document.getElementById('app-view');
    if (!this.appView) {
      console.error("El elemento #app-view no fue encontrado. Es esencial para el renderizado de vistas.");
    }

    // Objeto para gestionar las directivas y sus expresiones regulares
    this.directives = {
      THEME: 'theme',
      MODULE: 'module',
      CONTENT: 'content',
      CSS: 'css',
      CONTROLLER: 'controller' // NUEVO: Añadimos la directiva del controlador.
    };

    // Pre-compilamos las expresiones regulares para eficiencia
    this.regex = {
      theme: new RegExp(`<!-- ::${this.directives.THEME}\\.([\\w\\.]+) -->`),
      module: new RegExp(`<!-- ::${this.directives.MODULE}\\.([\\w\\.]+) -->`, 'g'),
      content: new RegExp(`<!-- ::${this.directives.CONTENT} -->`),
      css: new RegExp(`<!-- ::${this.directives.CSS}\\.([\\w\\.]+) -->`, 'g'),
      controller: new RegExp(`<!-- ::${this.directives.CONTROLLER}\\.([\\w\\.]+) -->`, 'g') // CORREGIDO: Añadido el flag global 'g'
    };
  }

  /**
   * Compone una vista de forma recursiva, procesando todas las directivas anidadas (`::module`, `::css`, `::controller`)
   * hasta que no queden más. Al final, aplica el tema principal.
   * @param {string} viewUrl La URL de la receta inicial de la vista.
   * @returns {object} Un "paquete de renderizado" con { finalHtml, cssUrls, controllerNames }.
   */
  async composeView(viewUrl) {
    try {
      let viewRecipeText = await (await fetch(viewUrl)).text();

      const cssUrls = new Set();
      const controllerPaths = new Set(); // <--- De nombres a rutas
      let themeUrl = null;
      let currentHtml;

      // 1. Recopilación de directivas globales (CSS, Controller, Theme)
      const cssMatches = [...viewRecipeText.matchAll(this.regex.css)];
      if (cssMatches.length > 0) {
        cssMatches.forEach(match => cssUrls.add(`src/css/${match[1].replace(/\./g, '/')}.css`));
        viewRecipeText = viewRecipeText.replace(this.regex.css, '');
      }

      const controllerMatches = [...viewRecipeText.matchAll(this.regex.controller)];
      if (controllerMatches.length > 0) {
        controllerMatches.forEach(match => controllerPaths.add(`/app/controllers/${match[1]}.js`)); // Añadir ruta completa
        viewRecipeText = viewRecipeText.replace(this.regex.controller, '');
      }
      
      const themeMatch = viewRecipeText.match(this.regex.theme);
      if (themeMatch) {
        const themePath = themeMatch[1].replace(/\./g, '/');
        themeUrl = `views/theme/${themePath}.html`;
        viewRecipeText = viewRecipeText.replace(this.regex.theme, '');
      }

      // 2. Análisis estructural de la vista con DOMParser
      const parser = new DOMParser();
      const viewDoc = parser.parseFromString(viewRecipeText, 'text/html');
      const namedContentBlocks = {};
      
      const children = Array.from(viewDoc.body.children);
      for (const child of children) {
        if (child.dataset.content) {
          namedContentBlocks[child.dataset.content] = child.outerHTML;
          child.remove();
        }
      }
      const defaultContentHtml = viewDoc.body.innerHTML;

      // 3. Obtener HTML del tema o usar base
      let themeHtml = themeUrl ? await (await fetch(themeUrl)).text() : '<!-- ::content -->';

      // 4. Pre-inyección de contenido en el tema
      currentHtml = themeHtml;
      for (const key in namedContentBlocks) {
        currentHtml = currentHtml.replace(new RegExp(`<!-- ::content\\.${key} -->`, 'g'), namedContentBlocks[key]);
      }
      currentHtml = currentHtml.replace(/<!-- ::content -->/g, defaultContentHtml);

      // 5. Bucle de composición de módulos (con auto-descubrimiento de assets)
      const MAX_ITERATIONS = 50;
      let iterations = 0;
      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const moduleMatches = [...currentHtml.matchAll(this.regex.module)];
        if (moduleMatches.length === 0) break;

        const modulePromises = moduleMatches.map(async (match) => {
          const moduleName = match[1].split('.').pop(); // 'dashboard.summary' -> 'summary'
          const moduleBasePath = `app/modules/${moduleName}`;
          
          const htmlPath = `/${moduleBasePath}/${moduleName}.html`;
          const cssPath = `/${moduleBasePath}/${moduleName}.css`;
          const controllerPath = `/${moduleBasePath}/${moduleName}.controller.js`;

          const [htmlResponse, cssCheck, controllerCheck] = await Promise.all([
            fetch(htmlPath),
            fetch(cssPath, { method: 'HEAD' }),
            fetch(controllerPath, { method: 'HEAD' })
          ]);

          if (cssCheck.ok) cssUrls.add(cssPath);
          if (controllerCheck.ok) controllerPaths.add(controllerPath);

          if (!htmlResponse.ok) return `<!-- Error: Módulo ${match[1]} no encontrado en ${htmlPath} -->`;
          return await htmlResponse.text();
        });
        
        const moduleContents = await Promise.all(modulePromises);
        let replacementIndex = 0;
        currentHtml = currentHtml.replace(this.regex.module, () => moduleContents[replacementIndex++]);
      }

      if (iterations === MAX_ITERATIONS) {
        console.warn('Mosaic: Se alcanzó el límite máximo de iteraciones.');
      }
      
      console.log(`✅ Vista ${viewUrl} compuesta exitosamente (con auto-discovery).`);

      // 6. Devolver paquete de renderizado final
      return {
        finalHtml: currentHtml,
        cssUrls: [...cssUrls],
        controllerPaths: [...controllerPaths] // <--- Devolver rutas
      };

    } catch (error) {
      console.error(`⚠️ Fallo al componer la vista ${viewUrl}:`, error);
      return null;
    }
  }
}