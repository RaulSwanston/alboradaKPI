# Estándares de Desarrollo (Skills)

## Arquitectura de Renderizado (Mosaic & RenderView)
- **Mosaic (El Albañil):** Ensambla la estructura del DOM mediante directivas HTML.
    - **Directivas disponibles:**
        - `<!-- ::theme.ruta -->` — Carga un layout (tema) desde `/views/theme/ruta.html`.
        - `<!-- ::module.nombre -->` — Carga un módulo desde `app/modules/nombre/nombre.html`.
        - `<!-- ::content -->` / `<!-- ::content.nombre -->` — Slots de contenido reemplazados por bloques `data-content` de la receta.
        - `<!-- ::css.ruta -->` — Incluye CSS desde `/src/css/ruta.css`.
        - `<!-- ::controller.ruta -->` — Incluye un controller desde `/app/controllers/ruta.js`.
        - `<!-- ::i18n.clave -->` — Reemplazado por el texto traducido vía `t(clave)`.
    - **Orden de procesamiento en `composeView()`:**
        1. Recolecta y remueve `::css`, `::controller`, `::theme` de la receta.
        2. Extrae bloques `data-content` de la receta.
        3. Inyecta contenido en el tema (`::content`).
        4. Bucle de composición: resuelve `::module` (fetchea HTML, auto-descubre CSS/controller mediante HEAD).
        5. Reemplaza `::i18n.clave` por su traducción desde el diccionario cargado.
        6. Retorna paquete de renderizado: `{ finalHtml, cssUrls[], controllerPaths[] }`.
    - **Regla crítica:** NO editar `mosaic.js` sin permiso explícito del usuario.
- **RenderView (El Animador - `anima`):** Inyecta vida al DOM.
    - Gestiona la inyección de assets, deduplicación de estilos y ejecución de controladores.
    - **Regla crítica:** No inyectar scripts/estilos manualmente en el `head` desde controladores.

## Contrato de Controladores y Modelos

### Estructura de un Módulo
Cada módulo vive en su propio directorio dentro de `public/app/modules/` y contiene exactamente 3 archivos:

- `nombre_modulo.html` — Template HTML del módulo.
- `nombre_modulo.css` — Estilos específicos del módulo.
- `nombre_modulo.controller.js` — Lógica del módulo (controlador).

El patrón de nombres debe coincidir con el del directorio (ej: `login/login.controller.js`, `summary/summary.controller.js`).

### Responsabilidades del Controlador
- Gestiona la lógica de presentación e interacción del módulo.
- **PROHIBIDO** llamar a Firestore, Firebase Auth o cualquier API de Firebase directamente.
- Para operaciones con Firebase, debe importar y usar el modelo correspondiente en `/public/app/models/`.

### Acceso a Datos
- Los modelos (`/public/app/models/`) son la única capa autorizada para comunicarse con Firebase.
- Ejemplo: un controlador de login no hace `signInWithEmailAndPassword` directamente, sino que llama a `Authentication.login(email, password)`.

### Ciclo de Vida
- Todo controlador DEBE exportar una función por defecto que retorne un objeto con un método `cleanup()` para liberar eventos, temporizadores o referencias DOM al navegar (evitar *memory leaks*).
- El cleanup se ejecuta automáticamente al cambiar de ruta.

### Internacionalización (i18n)
- `<!-- ::i18n.clave -->` en **contenido textual** (`<span>`, `<p>`, etc.) → funciona directamente, el DOMParser preserva los comment nodes para que Mosaic los reemplace.
- `<!-- ::i18n.clave -->` en **atributos HTML** (`placeholder`, `title`, `alt`, etc.) → el DOMParser puede escapar `<` a `&lt;` al serializar con `innerHTML`, rompiendo la regex de Mosaic. Setear desde el controlador con `t('clave')`.

## Navegación y Ruteo
- **Contenedor:** Renderizar exclusivamente en `<div id="app-view"></div>`.
- **Evento Global:** Router dispara `app:route-changed`.
- **UX:** Diferenciación entre comportamiento en Escritorio vs. Móvil.

## CSS y UI
- **Prohibición:** No usar `!important`, clases de utilidad (Tailwind-like) o fuentes de iconos externas (Material Symbols, etc.).
- **Enfoque:** CSS Semántico, clases descriptivas, variables CSS para jerarquía.
- **SVG:** Iconos SVG locales, inyectados directamente, usando `fill='currentColor'` para estilización dinámica.

## Transacciones
- **Folios:** Formato `FAC-YYYYMM-PropId` para cargos, `REC-YYYYMMDD-XXXX` para pagos.
- **Campos Obligatorios:** `pendingAmount`, `period` (YYYY-MM), `effectiveDate` (Timestamp).

## Edición de Código y Protocolo de Seguridad
- **Prioridad Quirúrgica:** Usar exclusivamente la herramienta `edit` (reemplazo de fragmentos) para realizar cambios localizados. Queda estrictamente PROHIBIDO el uso de `write` para sobrescribir archivos existentes.
- **Protocolo de Validación:**
    1. **Propuesta:** Antes de cualquier cambio, el agente debe presentar el `oldString` y el `newString` al usuario.
    2. **Confirmación:** El agente DEBE obtener la aprobación explícita del usuario antes de aplicar `edit`.
    3. **Contexto:** El agente debe realizar un `read` del archivo antes de proponer cualquier edición para asegurar la precisión del contexto.
- **Reglas del Entorno:**
    - SO: Windows (win32).
    - Shell: **PowerShell** (obligatorio).
    - Scripts: `.ps1` para tareas de automatización.
