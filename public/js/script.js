// Función auxiliar para esperar el evento 'animationend'
function waitForAnimationEnd(element) {
  return new Promise(resolve => {
    // El { once: true } es crucial para que el listener se elimine solo
    element.addEventListener('animationend', resolve, { once: true });
  });
}

// Envuelve tu lógica en una función asíncrona para usar 'await'
async function runSequentialAnimations(listElement, typeAnimation) {
  for (const li of listElement) {
    // 1. Inicia la animación
    li.classList.remove('hidden-animation-element');
    li.classList.add('animated', typeAnimation);
    await waitForAnimationEnd(li);
  }
}

async function initAnimateHome(){
  // 1. Obtener todos los elementos que se van a animar
  const listElement = document.querySelectorAll('.hero-advantages li');
  const spans = document.querySelectorAll('.hero-advantages span');
  const paragraphs = document.querySelectorAll('.hero-advantages p');
  await runSequentialAnimations(listElement, "fadeIn");
  await runSequentialAnimations(spans, "fadeInDown");
  await runSequentialAnimations(paragraphs, "fadeInUp");
}

function activeSection(selector){
  const allSections = document.querySelectorAll('.sectionView');
  allSections.forEach(section => {section.classList.add('hidden');}); // Oculta las secciones principales
  document.querySelector(selector).classList.remove('hidden');
}

function dynamicMenu(){
  // --- Lógica para el menú dinámico ---
  const menuContainer = document.getElementById('dashboard-menu');
  const menuToggleButton = menuContainer ? menuContainer.querySelector('button') : null;

  if (menuToggleButton) {
    menuToggleButton.addEventListener('click', () => {
      menuContainer.classList.toggle('is-open');
    });
  }

  function adjustLayoutForSidebar() {
    if (window.innerWidth >= 768) {
      document.body.classList.add('has-sidebar');
    } else {
      document.body.classList.remove('has-sidebar');
    }
  }

  adjustLayoutForSidebar();
  window.addEventListener('resize', adjustLayoutForSidebar);
}

document.addEventListener('DOMContentLoaded', function() {
    // --- Tu código existente en DOMContentLoaded ---
    const btnIngresar = document.getElementById('btnIngresar');
    if (btnIngresar) { // Buena práctica añadir una verificación
        btnIngresar.addEventListener('click', function(){activeSection('.authentication')});
    }
    
    dynamicMenu()
    initAnimateHome();
});