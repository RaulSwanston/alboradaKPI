import { waitForAuth, signOut, auth } from "../../app/core/firebase.js";
document.addEventListener('DOMContentLoaded', async function () {
  // --- Lógica Principal (Observador de Autenticación) ---
  const user = await waitForAuth();
  if(user){ handleAuthenticatedUser(user); }
});

async function handleAuthenticatedUser(user) {
  // Maneja el evento de clic para el botón de cerrar sesión.
  const logoutButton = document.getElementById('logoutButton');
  logoutButton.addEventListener('click', () => signOut(auth)
  .then(() => {
    console.log('Sesión cerrada correctamente');
    window.location.href = '/';
  })
  .catch(error => console.error('Error al cerrar sesión:', error)));

  console.log("Datos del usuario registrado:", user);
  // const emailVerified = document.getElementById("emailVerified");
  // const dashboardContainer = document.getElementById("dashboard-container");

  // emailVerified.classList.toggle('hidden', user.emailVerified);
  // dashboardContainer.classList.toggle('hidden', !user.emailVerified);

  document.getElementById('welcome-message').textContent = `Bienvenido/a ${auth.currentUser.displayName || auth.currentUser.email}`;
  activeSection('.dashboard');
  try {
    const token = await user.getIdTokenResult(); // user.getIdTokenResult(true);
    const isAdmin = token.claims.admin === true;
    updateUIVisibilityByRole(isAdmin);
    // Verificamos si el perfil del usuario existe en Firestore y lo creamos si no.
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      console.log("Perfil no encontrado en Firestore, creando uno nuevo...");
      await createUserProfile(user);
    }
    console.log("Custom claims del usuario, esAdmin?: ", isAdmin);
  } catch (error) {
    // errorMessageElement.textContent = `Porfavor, verifique su correo: ${error.message}`;
    // showToast("Error al cargar los datos de la sesión.", "error");
    // loadDashboardData(user);
    // clearDashboardData();
    console.error("Error al verificar rol o cargar datos:", error);
  }
}

// await loadModule("homeHero");
// variableAssignment();
// // listenerAssignment();
// dynamicMenu();

export let module = {}

let modules = {
  homeHero: { sectionView: ".home", directory: "home", file: "hero.html" },
  authLogin: { sectionView: ".authentication", directory: "auth", file: "login.html" },
  authRecovery: { sectionView: ".authentication", directory: "auth", file: "recovery.html" },
  authSignup: { sectionView: ".authenticatione", directory: "auth", file: "signup.html" }
}



/* --- Referencias a la seccion de autenticación --- */
// --- Módulo de login ---


let forgotPasswordLink;
// --- Módulo de signup ---
let signupButtonCancel;
let loginLinks;
// --- Módulo de recovery ---
let forgotPasswordLinkCancel;


function variableAssignment() {


  /* --- Referencias a la seccion de autenticación --- */
  // --- Módulo de login ---


  forgotPasswordLink = document.getElementById('forgotPasswordLink');
  // --- Módulo de signup ---
  signupButtonCancel = document.getElementById('signupButtonCancel');
  loginLinks = document.querySelectorAll('.loginLinks');
  // --- Módulo de recovery ---
  forgotPasswordLinkCancel = document.getElementById('forgotPasswordLinkCancel');

  module = {
    hero: document.getElementById("hero"),

    loginModule: document.getElementById("loginModule"),
    signupModule: document.getElementById("signupModule"),
    recoveryModule: document.getElementById("recoveryModule"),

    emailVerified: document.getElementById("emailVerified")
  };
}

function listenerAssignment() {
  // --- Módulo de login ---


  forgotPasswordLink.addEventListener('click', () => { activeModule("recoveryModule"); }); // handleForgotPassword()
  // --- Módulo de signup ---
  signupButtonCancel.addEventListener('click', () => { activeModule("loginModule"); });
  loginLinks.forEach(loginLink => { loginLink.addEventListener('click', () => { activeModule("loginModule"); }); });
  // --- Módulo de recovery ---
  forgotPasswordLinkCancel.addEventListener('click', () => { activeModule("loginModule"); });
}

/**
 * @summary Actualiza la visibilidad de los elementos de la UI basados en el rol de administrador.
 * Busca todos los elementos con el atributo `data-role-required="admin"` y los muestra u oculta.
 * @param {boolean} isAdmin - Indica si el usuario actual tiene privilegios de administrador.
 */
export function updateUIVisibilityByRole(isAdmin) {
  const adminElements = document.querySelectorAll('[data-role-required="admin"]');
  adminElements.forEach(element => {
    // Si es admin, QUITA la clase .hidden
    // Si NO es admin, AÑADE la clase .hidden
    element.classList.toggle('hidden', !isAdmin);
  });
}

export async function activeSection(selector) {
  // let moduleName;
  // if(!selector){ selector = ".home"; moduleName = "homeHero"; }
  const sectionCall = document.querySelector(".sectionView" + selector);
  const allSections = document.querySelectorAll('.sectionView');
  allSections.forEach(sectionView => { sectionView.classList.add('hidden'); }); // Oculta las secciones principales
  sectionCall.classList.remove('hidden');

  // if(moduleName){
  //   await loadModule(moduleName);
  //   if (moduleName === 'homeHero') { initAnimateHome(); }
  // }
}

/**
  * Gestiona la visibilidad de los módulos dentro de una sección específica.
  * Oculta todos los elementos con la clase '.module' dentro de la sección
  * y luego muestra solo el módulo especificado.
  */
export function activeModule(name) {
  // Si no se pasa un módulo válido, no se hace nada (medida de seguridad).
  console.log("desde activeModule:", module[name]);
  if (!module[name] || !module[name].parentNode) {
    console.error("Error: El módulo a mostrar no es un elemento válido.");
    return;
  }
  // 1. Encuentra todos los módulos "hermanos" dentro del mismo contenedor.
  const allModules = module[name].parentNode.querySelectorAll('.module');
  console.log("todos los modulos: ", allModules);
  // 2. Itera sobre todos los módulos. Añade o quita la clase .hidden
  allModules.forEach(childModule => { childModule.classList.toggle('hidden', childModule !== module[name]); });
}

/**
 * @summary Carga un módulo HTML de forma segura, lo parsea y lo añade al DOM.
 * @param {string} moduleName - El nombre del archivo del módulo (sin .html).
 * @param {HTMLElement} targetElement - El contenedor donde se inyectará el módulo.
 * @returns {Promise<Element|null>} El elemento del módulo que fue añadido, o null si falla.
 */
export async function loadModule(moduleName) {
  const module = modules[moduleName];
  const sectionView = document.querySelector(module.sectionView);
  if (sectionView.classList.contains("hidden")) { await activeSection(module.sectionView); }
  console.log("Desde loadModule: ", sectionView);
  try {
    const response = await fetch(`/modules/${module.directory}/${module.file}`);
    if (!response.ok) {
      throw new Error(`Error HTTP! Estado: ${response.status}`);
    }
    const htmlContent = await response.text();

    // 1. Usar DOMParser para convertir el string HTML en un documento seguro.
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const moduleElement = doc.body.firstElementChild; // Asumimos que el módulo es el primer elemento en el <body> del fragmento.

    if (!moduleElement) {
      throw new Error(`El módulo ${moduleName} parece estar vacío o no tiene un elemento raíz.`);
    }

    // 2. Limpiar el contenedor y añadir el nuevo módulo con appendChild.
    sectionView.innerHTML = ''; // Manera simple y efectiva de limpiar el contenedor.
    sectionView.appendChild(moduleElement);

    return moduleElement; // Devolvemos el elemento para poder interactuar con él después de cargarlo.

  } catch (error) {
    console.error(`Error al cargar el módulo '${moduleName}':`, error);
    sectionView.innerHTML = `<p style="color:var(--color-error);">Error al cargar el componente.</p>`;
    return null;
  }
}



function dynamicMenu() {
  // --- Lógica para el menú dinámico ---
  const menuContainer = document.getElementById('dashboard-menu');
  const menuToggleButton = menuContainer ? menuContainer.querySelector('button') : null;

  if (menuToggleButton) {
    menuToggleButton.addEventListener('click', () => {
      menuContainer.classList.toggle('is-open');
    });
  }

  function adjustLayoutForSidebar() {
    const dashboardSection = document.getElementById('sectionDashboard');
    if (!dashboardSection) return; // Safety check

    if (window.innerWidth >= 768) {
      dashboardSection.classList.add('has-sidebar');
    } else {
      dashboardSection.classList.remove('has-sidebar');
    }
  }

  adjustLayoutForSidebar();
  window.addEventListener('resize', adjustLayoutForSidebar);
}