/**
 * docs.controller.js
 * Controlador del módulo de Documentación.
 * Gestiona el resaltado de la sección activa en la tabla de contenido.
 */
export default async function docsController(contexto) {
  const tocLinks = document.querySelectorAll('.docs-toc a');
  const sections = document.querySelectorAll('.docs-section');

  if (!tocLinks.length || !sections.length) return;

  const setActive = (id) => {
    tocLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
    });
  };

  // Estado inicial: resaltar la primera sección
  setActive(sections[0].id);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: '-15% 0px -70% 0px' }
  );

  sections.forEach((section) => observer.observe(section));

  return () => {
    observer.disconnect();
  };
}