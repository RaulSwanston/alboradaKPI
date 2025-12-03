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
      CSS: 'css'
    };

    // Pre-compilamos las expresiones regulares para eficiencia
    this.regex = {
      theme: new RegExp(`<!-- ::${this.directives.THEME}\\.([\\w\\.]+) -->`),
      module: new RegExp(`<!-- ::${this.directives.MODULE}\\.([\\w\\.]+) -->`, 'g'),
      content: new RegExp(`<!-- ::${this.directives.CONTENT} -->`),
      css: new RegExp(`<!-- ::${this.directives.CSS}\\.([\\w\\.]+) -->`, 'g')
    };
  }

  /**
   * Carga y procesa una vista (receta) y sus directivas (theme, module, css) usando un enfoque de "texto primero".
   * Ensambla el HTML final como texto y realiza un único parseo al final para mayor eficiencia.
   * @param {string} viewUrl La URL de la receta de la vista a cargar.
   */
  async loadAndProcessView(viewUrl) {
    try {
      // 1. Leer la "Receta" de la vista
      const viewResponse = await fetch(viewUrl);
      if (!viewResponse.ok) throw new Error(`Error al cargar la receta de vista: ${viewUrl}`);
      const viewRecipeText = await viewResponse.text();

      // 2. Extraer Instrucciones (Tema, Módulos y CSS) de la receta
      const themeMatch = viewRecipeText.match(this.regex.theme);
      if (!themeMatch) throw new Error(`La vista ${viewUrl} no define un tema (::theme).`);

      const themePath = themeMatch[1].replace(/\./g, '/');
      const themeUrl = `views/theme/${themePath}.html`;

      const moduleMatches = [...viewRecipeText.matchAll(this.regex.module)];
      const moduleUrls = moduleMatches.map(match => {
        const modulePath = match[1].replace(/\./g, '/');
        return `app/modules/${modulePath}.html`;
      });

      const cssMatches = [...viewRecipeText.matchAll(this.regex.css)];
      const cssUrls = cssMatches.map(match => {
        const cssPath = match[1].replace(/\./g, '/');
        return `src/css/${cssPath}.css`;
      });

      // 3. Cargar Recursos en Paralelo (Tema y todos los Módulos)
      const [themeResponse, ...moduleResponses] = await Promise.all([
        fetch(themeUrl),
        ...moduleUrls.map(url => fetch(url))
      ]);

      if (!themeResponse.ok) throw new Error(`No se pudo cargar el tema: ${themeUrl}`);
      const themeHtml = await themeResponse.text();

      const modulesHtmlPromises = moduleResponses.map((res, i) => {
        if (!res.ok) console.error(`Módulo no encontrado: ${moduleUrls[i]}`);
        return res.ok ? res.text() : `<!-- Módulo no encontrado: ${moduleUrls[i]} -->`;
      });
      const modulesHtml = (await Promise.all(modulesHtmlPromises)).join('\n');

      // 4. Ensamblar la vista final: Reemplazar ::content en el tema con los módulos
      const finalHtml = themeHtml.replace(this.regex.content, modulesHtml);

      // 5. Parseo FINAL: Convertir el string HTML ensamblado a un documento DOM
      const parser = new DOMParser();
      const finalDoc = parser.parseFromString(finalHtml, 'text/html');

      // 6. Fusionar <head> y actualizar <body> y título
      // Inyectar CSS definidos en la receta
      cssUrls.forEach(url => {
        const link = finalDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        finalDoc.head.appendChild(link);
      });

      await this.mergeHeadElements(finalDoc.head);

      if (this.appView) {
        this.appView.innerHTML = finalDoc.body.innerHTML;
      }

      document.title = finalDoc.title || document.title;

      console.log(`✅ Vista ${viewUrl} cargada y ensamblada eficientemente.`);

    } catch (error) {
      console.error(`⚠️ Fallo al procesar la vista ${viewUrl}:`, error);
      if (this.appView) {
        this.appView.innerHTML = `<p>Error al cargar el contenido. Por favor, intente de nuevo.</p>`;
      }
    }
  }

  /**
   * Fusiona los elementos de un <head> de una vista parcial en el <head> del documento principal.
   * Evita duplicados y recrea scripts para su ejecución, esperando a que se carguen.
   * @param {HTMLHeadElement} newHead El elemento <head> del documento parseado.
   * @returns {Promise<void>} Una promesa que se resuelve cuando todos los scripts se han cargado.
   */
  async mergeHeadElements(newHead) {
    const mainHead = document.head;
    const scriptPromises = [];

    Array.from(newHead.children).forEach(newNode => {
      const tag = newNode.tagName;
      let isDuplicate = false;

      // Evita duplicar links y scripts con el mismo src
      if (tag === 'LINK' && newNode.href) {
        isDuplicate = !!mainHead.querySelector(`link[href="${newNode.href}"]`);
      } else if (tag === 'SCRIPT' && newNode.src) {
        isDuplicate = !!mainHead.querySelector(`script[src="${newNode.src}"]`);
      }

      if (isDuplicate) return;

      if (tag === 'SCRIPT') {
        const script = document.createElement('script');
        Array.from(newNode.attributes).forEach(attr => {
          script.setAttribute(attr.name, attr.value);
        });
        script.textContent = newNode.textContent;

        // Si el script es externo (tiene src), envuélvelo en una promesa
        if (newNode.src) {
          const promise = new Promise((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Falló la carga del script: ${newNode.src}`));
          });
          scriptPromises.push(promise);
        }

        mainHead.appendChild(script);
      } else {
        mainHead.appendChild(newNode.cloneNode(true));
      }
    });

    // Espera a que todas las promesas de los scripts se completen
    await Promise.all(scriptPromises);
  }
}
