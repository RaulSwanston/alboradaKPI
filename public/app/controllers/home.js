import { waitForAuth } from "../core/firebase.js";

export async function home() {
  const user = await waitForAuth();
  const startButton = document.getElementById("start-button");
  if (user) {
    startButton.addEventListener('click', function () { window.location.href = '/summary'; });
  } else {
    startButton.addEventListener('click', function () { window.location.href = '/login'; });
  }
  initAnimateHome();
}

async function initAnimateHome() {
  // 1. Obtener todos los elementos que se van a animar
  const listElement = document.querySelectorAll('.hero-advantages li');
  const spans = document.querySelectorAll('.hero-advantages span');
  const paragraphs = document.querySelectorAll('.hero-advantages p');
  await runSequentialAnimations(listElement, "fadeIn");
  await runSequentialAnimations(spans, "fadeInDown");
  await runSequentialAnimations(paragraphs, "fadeInUp");
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