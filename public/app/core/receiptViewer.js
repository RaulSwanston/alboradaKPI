/**
 * Visor compartido de comprobantes de pago.
 *
 * Se inyecta una sola vez en <body> y lo usan tanto el historial de reportes
 * como la aprobación de pagos. Incluye carga autenticada desde R2, miniatura
 * con carga diferida y zoom (clic, rueda, arrastre, doble clic y controles).
 */
import { getAuthObjectURL } from './r2.js';
import { t } from './i18n.js';

const MODAL_ID = 'receipt-viewer-modal';
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

let modal = null;
let stage = null;
let image = null;
let controls = null;
let closeBtn = null;
let zoomInBtn = null;
let zoomOutBtn = null;
let resetBtn = null;

let bodyOverflowBefore = '';
let openToken = 0;
let thumbObserver = null;

// Estado del zoom.
let zoom = MIN_ZOOM;
let panX = 0;
let panY = 0;
let activePointerId = null;
let pointerMoved = false;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;

function cacheRefs() {
  modal = document.getElementById(MODAL_ID);
  stage = modal?.querySelector('.receipt-viewer-stage');
  image = modal?.querySelector('.receipt-viewer-image');
  controls = modal?.querySelector('.receipt-viewer-controls');
  closeBtn = modal?.querySelector('[data-receipt-close]');
  zoomInBtn = modal?.querySelector('[data-receipt-zoom-in]');
  zoomOutBtn = modal?.querySelector('[data-receipt-zoom-out]');
  resetBtn = modal?.querySelector('[data-receipt-zoom-reset]');
}

function setAriaLabels() {
  if (closeBtn) closeBtn.setAttribute('aria-label', t('receiptViewer.close'));
  if (zoomInBtn) zoomInBtn.setAttribute('aria-label', t('receiptViewer.zoomIn'));
  if (zoomOutBtn) zoomOutBtn.setAttribute('aria-label', t('receiptViewer.zoomOut'));
  if (resetBtn) resetBtn.setAttribute('aria-label', t('receiptViewer.zoomReset'));
  if (image) image.alt = t('receiptViewer.imageAlt');
  if (stage) stage.title = t('receiptViewer.zoomHint');
}

function canInteract() {
  return !!(image && !image.hidden);
}

function applyZoom() {
  if (!image) return;
  image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (stage) stage.classList.toggle('is-zoomed', zoom > MIN_ZOOM + 0.001);
  if (resetBtn) resetBtn.textContent = `${Math.round(zoom * 100)}%`;
  if (zoomOutBtn) zoomOutBtn.disabled = zoom <= MIN_ZOOM + 0.001;
  if (zoomInBtn) zoomInBtn.disabled = zoom >= MAX_ZOOM - 0.001;
}

function clampPan() {
  if (!stage) return;
  // La imagen escala desde su centro: el desplazamiento máximo es la mitad
  // del tamaño que sobresale del escenario.
  const maxX = (stage.clientWidth * (zoom - 1)) / 2;
  const maxY = (stage.clientHeight * (zoom - 1)) / 2;
  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

function resetZoom() {
  zoom = MIN_ZOOM;
  panX = 0;
  panY = 0;
  applyZoom();
}

function setZoom(nextZoom, clientX, clientY) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  if (Math.abs(clamped - zoom) < 0.001) return;

  if (clamped === MIN_ZOOM) {
    zoom = MIN_ZOOM;
    panX = 0;
    panY = 0;
  } else {
    // Zoom anclado al puntero: el punto bajo el cursor se queda quieto.
    if (stage && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const rect = stage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const originX = clientX - centerX;
      const originY = clientY - centerY;
      const ratio = clamped / zoom;
      panX = originX + (panX - originX) * ratio;
      panY = originY + (panY - originY) * ratio;
    }
    zoom = clamped;
    clampPan();
  }

  applyZoom();
}

function onStagePointerDown(event) {
  if (!canInteract()) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  activePointerId = event.pointerId;
  pointerMoved = false;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  panStartX = panX;
  panStartY = panY;

  if (zoom > MIN_ZOOM) {
    isDragging = true;
    stage.classList.add('is-dragging');
    try { stage.setPointerCapture(event.pointerId); } catch (e) {}
    event.preventDefault();
  }
}

function onStagePointerMove(event) {
  if (event.pointerId !== activePointerId) return;

  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  if (!pointerMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) pointerMoved = true;
  if (!isDragging) return;

  panX = panStartX + dx;
  panY = panStartY + dy;
  clampPan();
  applyZoom();
  event.preventDefault();
}

function onStagePointerEnd(event) {
  if (event.pointerId !== activePointerId) return;

  const shouldToggle = event.type === 'pointerup' && !pointerMoved;
  if (isDragging && stage.hasPointerCapture?.(event.pointerId)) {
    try { stage.releasePointerCapture(event.pointerId); } catch (e) {}
  }

  isDragging = false;
  activePointerId = null;
  pointerMoved = false;
  stage.classList.remove('is-dragging');

  if (shouldToggle) {
    setZoom(zoom > MIN_ZOOM ? MIN_ZOOM : 2, event.clientX, event.clientY);
  }
}

function onStageWheel(event) {
  if (!canInteract() || !event.deltaY) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  setZoom(zoom * factor, event.clientX, event.clientY);
}

function onStageDoubleClick(event) {
  if (!canInteract()) return;
  event.preventDefault();
  resetZoom();
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
    closeReceiptViewer();
  }
}

function bindViewerEvents() {
  if (!modal) return;

  closeBtn?.addEventListener('click', closeReceiptViewer);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeReceiptViewer();
  });

  zoomInBtn?.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  zoomOutBtn?.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  resetBtn?.addEventListener('click', resetZoom);

  stage?.addEventListener('pointerdown', onStagePointerDown);
  stage?.addEventListener('pointermove', onStagePointerMove);
  stage?.addEventListener('pointerup', onStagePointerEnd);
  stage?.addEventListener('pointercancel', onStagePointerEnd);
  stage?.addEventListener('wheel', onStageWheel, { passive: false });
  stage?.addEventListener('dblclick', onStageDoubleClick);

  document.addEventListener('keydown', onDocumentKeydown);
}

/**
 * Crea el modal (una sola vez) y refresca las etiquetas traducidas.
 */
export function initReceiptViewer() {
  if (!document.getElementById(MODAL_ID)) {
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'receipt-viewer-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <button type="button" class="receipt-viewer-close" data-receipt-close>
        <span class="receipt-viewer-close-icon" aria-hidden="true">&times;</span>
      </button>
      <div class="receipt-viewer-stage">
        <img class="receipt-viewer-image" alt="" draggable="false">
      </div>
      <div class="receipt-viewer-controls" role="group" hidden>
        <button type="button" class="receipt-viewer-zoom" data-receipt-zoom-out>&minus;</button>
        <button type="button" class="receipt-viewer-zoom receipt-viewer-zoom-reset" data-receipt-zoom-reset>100%</button>
        <button type="button" class="receipt-viewer-zoom" data-receipt-zoom-in>+</button>
      </div>
    `;
    document.body.appendChild(modal);
    cacheRefs();
    bindViewerEvents();
  } else {
    cacheRefs();
  }
  setAriaLabels();
}

/**
 * Abre el comprobante de una referencia de R2 en el visor compartido.
 */
export function openReceiptViewer(refUrl) {
  if (!refUrl) return;

  initReceiptViewer();
  if (!modal || !image) return;

  const token = ++openToken;
  bodyOverflowBefore = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  image.removeAttribute('src');
  image.hidden = true;
  if (controls) controls.hidden = true;
  resetZoom();
  modal.classList.remove('hidden');

  getAuthObjectURL(refUrl)
    .then((blobUrl) => {
      if (token !== openToken) return;
      if (!blobUrl) {
        closeReceiptViewer();
        return;
      }
      image.src = blobUrl;
      image.hidden = false;
      if (controls) controls.hidden = false;
    })
    .catch(() => {
      if (token === openToken) closeReceiptViewer();
    });
}

export function closeReceiptViewer() {
  openToken++;
  if (!modal) return;

  isDragging = false;
  activePointerId = null;
  pointerMoved = false;
  if (stage) stage.classList.remove('is-dragging');
  resetZoom();
  if (controls) controls.hidden = true;
  modal.classList.add('hidden');
  if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
  document.body.style.overflow = bodyOverflowBefore || '';
}

/**
 * Prepara los botones `.receipt-preview` de un contenedor: carga sus
 * miniaturas de forma diferida y abre el visor al pulsarlos.
 */
export function hydrateReceiptPreviews(container = document) {
  if (!container) return;

  const buttons = Array.from(container.querySelectorAll('.receipt-preview'));

  disposeReceiptPreviews();

  if (!buttons.length) return;

  const loadThumb = (button) => {
    if (button.dataset.receiptLoaded === '1') return;
    getAuthObjectURL(button.dataset.receiptUrl)
      .then((blobUrl) => {
        if (!blobUrl) throw new Error('Sin URL');
        const img = button.querySelector('.receipt-thumb');
        if (img) img.src = blobUrl;
        button.dataset.receiptLoaded = '1';
        button.classList.add('is-loaded');
      })
      .catch(() => {
        // Si el objeto ya no está en R2, no dejamos un hueco roto.
        button.classList.add('is-error');
      });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => openReceiptViewer(button.dataset.receiptUrl));
  });

  // Las imágenes viven en R2 y se descargan completas: solo pedimos las que
  // están por entrar en pantalla.
  if ('IntersectionObserver' in window) {
    thumbObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        loadThumb(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '150px' });
    buttons.forEach((button) => thumbObserver.observe(button));
  } else {
    buttons.forEach(loadThumb);
  }
}

/**
 * Deja de observar miniaturas. Se llama al desmontar el módulo o antes de
 * hidratar una nueva lista.
 */
export function disposeReceiptPreviews() {
  if (!thumbObserver) return;
  thumbObserver.disconnect();
  thumbObserver = null;
}
