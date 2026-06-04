import { waitForAuth } from "/app/core/firebase.js";

export default async function home(contexto) {
  console.log('[Home Controller] Contexto recibido:', contexto);

  const user = await waitForAuth();
  console.log('Este es el valor de user: ', user);
  const startButton = document.getElementById("start-button");
  if (startButton) { // Añadir una comprobación de existencia
    if (user) {
      startButton.addEventListener('click', function () { window.location.href = '/dashboard/resumen'; });
    } else {
      startButton.addEventListener('click', function () { window.location.href = '/login'; });
    }
  }
  initAnimateHome();
}

async function initAnimateHome() {
  // 1. Obtener todos los elementos que se van a animar
  const listElement = document.querySelectorAll('.hero-advantages li');
  const spans = document.querySelectorAll('.hero-advantages span');
  const paragraphs = document.querySelectorAll('.hero-advantages p');
  
  // Añadir comprobaciones para asegurar que los elementos existen antes de animar
  if (listElement.length > 0) {
      // Primero animamos la aparición de los contenedores
      await runSequentialAnimations(listElement, "fadeIn");
  }

  // 2. Ejecutamos las animaciones de los textos en paralelo
  if (spans.length > 0 || paragraphs.length > 0) {
      // Al no usar 'await' aquí para cada uno, se inician al mismo tiempo
      runSequentialAnimations(spans, "fadeInDown");
      runSequentialAnimations(paragraphs, "fadeInUp");
  }
}

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