// public/js/controller.js

// Exporta el objeto 'module' global si es necesario externamente.
export let module = {};

// El objeto de configuración 'modules'
const modules = {
  homeHero: { sectionView:".home", directory:"home", file:"hero.html" },
  authLogin:{ sectionView:".authentication", directory:"auth", file:"login.html" },
  authRecovery:{ sectionView:".authentication", directory:"auth", file:"recovery.html" },
  authSignup:{ sectionView:".authenticatione", directory:"auth", file:"signup.html" }
};

/* --- Referencias a la seccion de bienvenida --- */
let startButton; // "start-button"

/* --- Referencias a la seccion de autenticación --- */
// --- Módulo de login ---
let registerButton;
let loginButtonCancel;
let forgotPasswordLink;
// --- Módulo de signup ---
let signupButtonCancel;
let loginLinks;
// --- Módulo de recovery ---
let forgotPasswordLinkCancel;


/**
 * @summary Asigna elementos del DOM a variables globales.
 * Debe llamarse después de que el contenido del módulo se haya cargado en el DOM.
 */
function variableAssignment(){
  startButton = document.getElementById("start-button");

  registerButton = document.getElementById('registerButton');
  loginButtonCancel = document.getElementById('loginButtonCancel');
  forgotPasswordLink = document.getElementById('forgotPasswordLink');

  signupButtonCancel = document.getElementById('signupButtonCancel');
  loginLinks = document.querySelectorAll('.loginLinks');

  forgotPasswordLinkCancel = document.getElementById('forgotPasswordLinkCancel');

  module = {
    hero:document.getElementById("hero"),
    loginModule:document.getElementById("loginModule"),
    signupModule:document.getElementById("signupModule"),
    recoveryModule:document.getElementById("recoveryModule"),
    emailVerified:document.getElementById("emailVerified")
  };
}

/**
 * @summary Asigna event listeners a los elementos del DOM.
 * Ahora, en lugar de llamar a funciones directamente, cambian el hash de la URL.
 * Debe llamarse después de que el contenido del módulo se haya cargado en el DOM.
 */
function listenerAssignment(){
  startButton.addEventListener('click', function(){ window.location.hash = 'authLogin'; });

  registerButton.addEventListener('click', () => { window.location.hash = 'authSignup'; });
  loginButtonCancel.addEventListener('click', () => { window.location.hash = 'homeHero'; });
  forgotPasswordLink.addEventListener('click', () => { window.location.hash = 'authRecovery'; });

  signupButtonCancel.addEventListener('click', () => { window.location.hash = 'authLogin'; });
  loginLinks.forEach(loginLink => { loginLink.addEventListener('click', () => { window.location.hash = 'authLogin'; }); });

  forgotPasswordLinkCancel.addEventListener('click', () => { window.location.hash = 'authLogin'; });
}

/**
 * @summary Función auxiliar para esperar el evento 'animationend'.
 * @param {HTMLElement} element - El elemento HTML al que se le espera la animación.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la animación termina.
 */
function waitForAnimationEnd(element) {
  return new Promise(resolve => {
    element.addEventListener('animationend', resolve, { once: true });
  });
}

/**
 * @summary Ejecuta animaciones secuenciales en una lista de elementos.
 * @param {NodeListOf<HTMLElement>} listElement - La lista de elementos a animar.
 * @param {string} typeAnimation - El tipo de animación CSS a aplicar.
 * @returns {Promise<void>} Una promesa que se resuelve cuando todas las animaciones han terminado.
 */
async function runSequentialAnimations(listElement, typeAnimation) {
  for (const li of listElement) {
    li.classList.remove('hidden-animation-element');
    li.classList.add('animated', typeAnimation);
    await waitForAnimationEnd(li);
  }
}

/**
 * @summary Inicializa las animaciones específicas de la sección 'homeHero'.
 * Debe llamarse después de que el módulo 'homeHero' se haya cargado.
 * @returns {Promise<void>} Una promesa que se resuelve cuando todas las animaciones han terminado.
 */
async function initAnimateHome(){
  const listElement = document.querySelectorAll('.hero-advantages li');
  const spans = document.querySelectorAll('.hero-advantages span');
  const paragraphs = document.querySelectorAll('.hero-advantages p');
  await runSequentialAnimations(listElement, "fadeIn");
  await runSequentialAnimations(spans, "fadeInDown");
  await runSequentialAnimations(paragraphs, "fadeInUp");
}

/**
 * @summary Actualiza la visibilidad de los elementos de la UI basados en el rol de administrador.
 * Busca todos los elementos con el atributo `data-role-required="admin"` y los muestra u oculta.
 * @param {boolean} isAdmin - Indica si el usuario actual tiene privilegios de administrador.
 */
export function updateUIVisibilityByRole(isAdmin) {
  const adminElements = document.querySelectorAll('[data-role-required="admin"]');
  adminElements.forEach(element => {
    element.classList.toggle('hidden', !isAdmin);
  });
}

/**
 * @summary Carga un módulo HTML de forma segura, lo parsea y lo añade al DOM.
 * @param {string} moduleName - El nombre del archivo del módulo (sin .html).
 * @returns {Promise<Element|null>} El elemento del módulo que fue añadido, o null si falla.
 */
async function loadModule(moduleName) {
  const moduleConfig = modules[moduleName];
  const sectionView = document.querySelector(moduleConfig.sectionView);

  console.log("Desde loadModule: ", sectionView);
  try {
    const response = await fetch(`/modules/${moduleConfig.directory}/${moduleConfig.file}`);
    if (!response.ok) {
      throw new Error(`Error HTTP! Estado: ${response.status}`);
    }
    const htmlContent = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const moduleElement = doc.body.firstElementChild;

    if (!moduleElement) {
      throw new Error(`El módulo ${moduleName} parece estar vacío o no tiene un elemento raíz.`);
    }

    sectionView.innerHTML = '';
    sectionView.appendChild(moduleElement);

    return moduleElement;

  } catch (error) {
    console.error(`Error al cargar el módulo '${moduleName}':`, error);
    sectionView.innerHTML = `<p style="color:var(--color-error);">Error al cargar el componente.</p>`;
    return null;
  }
}

/**
 * @summary Gestiona la visibilidad de los módulos dentro de una sección específica.
 * Oculta todos los elementos con la clase '.module' dentro de la sección
 * y luego muestra solo el módulo especificado.
 * @param {string} name - El nombre del módulo a activar (ej: "loginModule", "signupModule").
 */
export function activeModule(name) {
  console.log("desde activeModule:", module[name]);
  if (!module[name] || !module[name].parentNode) {
    console.error("Error: El módulo a mostrar no es un elemento válido.");
    return;
  }
  const allModules = module[name].parentNode.querySelectorAll('.module');
  console.log("todos los modulos: ", allModules);
  allModules.forEach(childModule => { childModule.classList.toggle('hidden', childModule !== module[name]); });
}

/**
 * @summary Inicializa la lógica del menú dinámico del dashboard.
 * Debe llamarse después de que el contenido del dashboard se haya cargado.
 */
function dynamicMenu(){
  const menuContainer = document.getElementById('dashboard-menu');
  const menuToggleButton = menuContainer ? menuContainer.querySelector('button') : null;

  if (menuToggleButton) {
    menuToggleButton.addEventListener('click', () => {
      menuContainer.classList.toggle('is-open');
    });
  }

  function adjustLayoutForSidebar() {
    const dashboardSection = document.getElementById('sectionDashboard');
    if (!dashboardSection) return;

    if (window.innerWidth >= 768) {
      dashboardSection.classList.add('has-sidebar');
    } else {
      dashboardSection.classList.remove('has-sidebar');
    }
  }

  adjustLayoutForSidebar();
  window.addEventListener('resize', adjustLayoutForSidebar);
}

/**
 * @summary Muestra una vista específica cargando su módulo y configurando la UI.
 * Esta es la función principal que el enrutador llamará.
 * @param {string} moduleName - El nombre del módulo a cargar (ej: "homeHero", "authLogin").
 */
async function showView(moduleName) {
  const moduleConfig = modules[moduleName];
  if (!moduleConfig) {
    console.error(`Configuration for module '${moduleName}' not found.`);
    window.location.hash = 'homeHero';
    return;
  }

  const selector = moduleConfig.sectionView;
  const sectionCall = document.querySelector(".sectionView" + selector);
  const allSections = document.querySelectorAll('.sectionView');

  allSections.forEach(sectionView => {
    sectionView.classList.add('hidden');
  });

  if (sectionCall) {
    sectionCall.classList.remove('hidden');
  } else {
    console.error(`Section view with selector '${selector}' not found for module '${moduleName}'.`);
    return;
  }

  await loadModule(moduleName);

  if (moduleName === 'homeHero') {
    initAnimateHome();
  }
  // Re-asignar variables y listeners para el nuevo contenido
  variableAssignment();
  listenerAssignment();
  dynamicMenu();
}

// El objeto controlador principal con el que interactuará el enrutador
export const mainController = {
    /**
     * Maneja la ruta recibida del enrutador y muestra la vista correspondiente.
     * @param {string} routeName - El nombre de la ruta/módulo a manejar.
     */
    handleRoute(routeName) { showView(routeName); },
    updateUIVisibilityByRole,
    activeModule
};

/**
 * Carga el contenido de un módulo HTML y lo renderiza en el <body>.
 * @param {string} modulePath - La ruta al archivo de módulo HTML.
 */
export async function renderModule(modulePath) {
    try {
        const response = await fetch(modulePath);
        if (!response.ok) throw new Error(`No se encontró el módulo en: ${modulePath}`);
        
        document.body.innerHTML = await response.text();
    } catch (error) {
        console.error('Error al renderizar el módulo:', error);
        document.body.innerHTML = '<h1>Error al cargar esta vista.</h1>';
    }
}

export function homeController() {
    console.log("Vista 'home' cargada. Lógica específica para la página de inicio.");
}

export function loginController() {
    console.log("Vista 'login' cargada. Lógica para la página de login, como añadir listeners al formulario.");
}

export function signupController() {
    console.log("Vista 'signup' cargada. Lógica para la página de registro.");
}