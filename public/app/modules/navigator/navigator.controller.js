import { router } from '/router.js';

export default function navigator(contexto) {
  console.log("Ejecutando inicialización del 'navigator'.");

  // --- Referencias a Elementos del DOM ---
  const dashboardMenu = document.getElementById("dashboard-menu");
  const dividers = dashboardMenu?.querySelectorAll(".menu-divider");
  const buttonMenu = document.getElementById("button-menu");
  
  if (!dashboardMenu || !dividers || !buttonMenu || dividers.length === 0) {
      console.warn("Elementos del navegador no encontrados. Es posible que esta vista no los requiera.");
      return; // No hacer nada si los elementos no existen.
  }

  // --- Definición de los Handlers (manejadores de eventos) ---
  const handleDividerClick = (e) => {
    e.preventDefault();
    const divider = e.currentTarget;
    const isDesktop = window.matchMedia("(min-width: 768px)");

    if (isDesktop.matches) {
      divider.classList.toggle("selected");
    } else {
      dividers.forEach(el => el.classList.remove("selected"));
      divider.classList.add("selected");
    }

    const link = divider.querySelector('a');
    if (link && link.href) {
      const path = new URL(link.href).pathname;
      router.navigate(path, link.dataset.view);
    }
  };

  const handleMenuButtonClick = () => {
    buttonMenu.classList.toggle('open');
  };

  // --- Fase de Suscripción: Añadir los Event Listeners ---
  dividers.forEach((divider) => {
    divider.addEventListener("click", handleDividerClick);
  });
  buttonMenu.addEventListener("click", handleMenuButtonClick);

  console.log("'navigator' listeners adjuntados.");
  
  // --- Devolver la Función de Limpieza ---
  // Esto es CRUCIAL. RenderView ejecutará esta función antes de renderizar la próxima vista.
  return () => {
    console.log("Limpiando listeners del 'navigator'.");
    dividers.forEach((divider) => {
      divider.removeEventListener("click", handleDividerClick);
    });
    buttonMenu.removeEventListener("click", handleMenuButtonClick);
  };
}