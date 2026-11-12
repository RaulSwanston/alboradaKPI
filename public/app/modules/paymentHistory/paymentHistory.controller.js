import PaymentNotification from "../../models/PaymentNotification.js";
import { getAuthObjectURL } from '../../core/r2.js';
import { t } from '../../core/i18n.js';
import { router } from '../../../router.js';

export default async function paymentHistoryController(contexto) {
  const user = contexto?.data?.user;
  if (!user) return;

  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const filtersEl = document.getElementById('history-filters');
  const receiptModal = document.getElementById('history-receipt-modal');
  const receiptImage = document.getElementById('history-receipt-image');
  const receiptClose = document.getElementById('history-receipt-close');
  const receiptStage = document.getElementById('history-receipt-stage');
  const receiptControls = document.getElementById('history-receipt-controls');
  const receiptZoomIn = document.getElementById('history-receipt-zoom-in');
  const receiptZoomOut = document.getElementById('history-receipt-zoom-out');
  const receiptZoomReset = document.getElementById('history-receipt-zoom-reset');

  let allReports = [];
  let activeFilter = 'all';
  let thumbObserver = null;
  let bodyOverflowBefore = '';

  // Visor del comprobante: zoom y arrastre.
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.5;
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

  const statusConfig = {
    pending_verification: {
      label: t('paymentHistory.statusPending'),
      class: 'status-pending',
      icon: 'clock'
    },
    approved: {
      label: t('paymentHistory.statusApproved'),
      class: 'status-approved',
      icon: 'check-circle'
    },
    rejected: {
      label: t('paymentHistory.statusRejected'),
      class: 'status-rejected',
      icon: 'x-circle'
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);

  const parseDate = (value) => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (typeof value === 'string') {
      const onlyDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (onlyDate) return new Date(Number(onlyDate[1]), Number(onlyDate[2]) - 1, Number(onlyDate[3]), 12, 0, 0);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (timestamp) => {
    const date = parseDate(timestamp);
    if (!date) return '—';
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (timestamp) => {
    const date = parseDate(timestamp);
    if (!date) return '';
    return date.toLocaleDateString('es', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const updateFilterButtons = () => {
    if (!filtersEl) return;
    filtersEl.querySelectorAll('.history-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === activeFilter);
    });
  };

  const bindReceiptButtons = () => {
    listEl.querySelectorAll('.history-receipt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const transactionId = btn.dataset.transactionId;
        if (transactionId) router.navigate(`/dashboard/transactions/${transactionId}`, 'dashboard');
      });
    });
  };

  const canInteractWithReceipt = () => !!(receiptImage && !receiptImage.hidden);

  function applyZoom() {
    if (!receiptImage) return;
    receiptImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    if (receiptStage) receiptStage.classList.toggle('is-zoomed', zoom > MIN_ZOOM + 0.001);
    if (receiptZoomReset) receiptZoomReset.textContent = `${Math.round(zoom * 100)}%`;
    if (receiptZoomOut) receiptZoomOut.disabled = zoom <= MIN_ZOOM + 0.001;
    if (receiptZoomIn) receiptZoomIn.disabled = zoom >= MAX_ZOOM - 0.001;
  }

  function clampPan() {
    if (!receiptStage) return;
    // La imagen escala desde su centro: el desplazamiento máximo es la mitad
    // del tamaño que sobresale del escenario.
    const maxX = (receiptStage.clientWidth * (zoom - 1)) / 2;
    const maxY = (receiptStage.clientHeight * (zoom - 1)) / 2;
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
      if (receiptStage && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const rect = receiptStage.getBoundingClientRect();
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

  const onStagePointerDown = (event) => {
    if (!canInteractWithReceipt()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    activePointerId = event.pointerId;
    pointerMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    panStartX = panX;
    panStartY = panY;

    if (zoom > MIN_ZOOM) {
      isDragging = true;
      receiptStage.classList.add('is-dragging');
      try { receiptStage.setPointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
    }
  };

  const onStagePointerMove = (event) => {
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
  };

  const onStagePointerEnd = (event) => {
    if (event.pointerId !== activePointerId) return;

    const shouldToggle = event.type === 'pointerup' && !pointerMoved;
    if (isDragging && receiptStage.hasPointerCapture?.(event.pointerId)) {
      try { receiptStage.releasePointerCapture(event.pointerId); } catch (e) {}
    }

    isDragging = false;
    activePointerId = null;
    pointerMoved = false;
    receiptStage.classList.remove('is-dragging');

    if (shouldToggle) {
      setZoom(zoom > MIN_ZOOM ? MIN_ZOOM : 2, event.clientX, event.clientY);
    }
  };

  const onStageWheel = (event) => {
    if (!canInteractWithReceipt() || !event.deltaY) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(zoom * factor, event.clientX, event.clientY);
  };

  const onStageDoubleClick = (event) => {
    if (!canInteractWithReceipt()) return;
    event.preventDefault();
    resetZoom();
  };

  if (receiptStage) {
    receiptStage.title = t('paymentHistory.zoomHint');
    receiptStage.addEventListener('pointerdown', onStagePointerDown);
    receiptStage.addEventListener('pointermove', onStagePointerMove);
    receiptStage.addEventListener('pointerup', onStagePointerEnd);
    receiptStage.addEventListener('pointercancel', onStagePointerEnd);
    receiptStage.addEventListener('wheel', onStageWheel, { passive: false });
    receiptStage.addEventListener('dblclick', onStageDoubleClick);
  }

  if (receiptZoomIn) receiptZoomIn.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  if (receiptZoomOut) receiptZoomOut.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  if (receiptZoomReset) receiptZoomReset.addEventListener('click', resetZoom);

  function openReceipt(button) {
    if (!receiptModal || !receiptImage) return;
    const refUrl = button?.dataset?.receiptUrl;
    if (!refUrl) return;

    bodyOverflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    receiptImage.removeAttribute('src');
    receiptImage.hidden = true;
    if (receiptControls) receiptControls.hidden = true;
    resetZoom();
    receiptModal.classList.remove('hidden');

    getAuthObjectURL(refUrl)
      .then((blobUrl) => {
        if (!blobUrl) {
          closeReceipt();
          return;
        }
        receiptImage.src = blobUrl;
        receiptImage.hidden = false;
        if (receiptControls) receiptControls.hidden = false;
      })
      .catch(() => closeReceipt());
  }

  function closeReceipt() {
    if (!receiptModal) return;
    isDragging = false;
    activePointerId = null;
    pointerMoved = false;
    if (receiptStage) receiptStage.classList.remove('is-dragging');
    resetZoom();
    if (receiptControls) receiptControls.hidden = true;
    receiptModal.classList.add('hidden');
    if (receiptImage) {
      receiptImage.removeAttribute('src');
      receiptImage.hidden = true;
    }
    document.body.style.overflow = bodyOverflowBefore || '';
  }

  const bindReceiptPreviews = () => {
    const buttons = Array.from(listEl.querySelectorAll('.history-receipt-preview'));
    if (!buttons.length) return;
    if (thumbObserver) thumbObserver.disconnect();

    const loadThumb = (button) => {
      if (button.dataset.loaded === '1') return;
      getAuthObjectURL(button.dataset.receiptUrl)
        .then((blobUrl) => {
          if (!blobUrl) throw new Error('Sin URL');
          const img = button.querySelector('.history-thumb');
          if (img) img.src = blobUrl;
          button.dataset.loaded = '1';
          button.classList.add('is-loaded');
        })
        .catch(() => {
          // Si el objeto ya no está en R2, no dejamos un hueco roto.
          button.classList.add('is-error');
        });
    };

    buttons.forEach(button => {
      button.addEventListener('click', () => openReceipt(button));
    });

    // Las imágenes viven en R2 y se descargan completas: solo pedimos las que
    // están por entrar en pantalla, no todas las del historial.
    if ('IntersectionObserver' in window) {
      thumbObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          loadThumb(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '150px' });
      buttons.forEach(button => thumbObserver.observe(button));
    } else {
      buttons.forEach(loadThumb);
    }
  };

  const render = () => {
    if (allReports.length === 0) {
      listEl.classList.add('hidden');
      if (filtersEl) filtersEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    if (filtersEl) filtersEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    const reports = activeFilter === 'all'
      ? allReports
      : allReports.filter(report => report.status === activeFilter);

    if (reports.length === 0) {
      listEl.classList.remove('hidden');
      listEl.innerHTML = `<p class="error-text">${t('paymentHistory.noFiltered')}</p>`;
      return;
    }

    listEl.classList.remove('hidden');
    listEl.innerHTML = reports.map(report => {
      const cfg = statusConfig[report.status] || statusConfig.pending_verification;
      const hasReceipt = report.status === 'approved' && report.paymentTransactionId;
      return `
        <div class="history-card ${cfg.class}">
          <div class="history-card-top">
            <span class="history-status-badge ${cfg.class}">
              <div class="icon-slot-xs" data-icon="${cfg.icon}"></div>
              ${cfg.label}
            </span>
            <span class="history-amount">${formatCurrency(report.amount)}</span>
          </div>
          <div class="history-card-body">
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.property')}</span>
              <span class="history-value">${escapeHtml(report.propertyId || '—')}</span>
            </div>
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.date')}</span>
              <span class="history-value">${formatDate(report.paymentDate)}</span>
            </div>
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.reported')}</span>
              <span class="history-value">${formatDateTime(report.reportDate)}</span>
            </div>
            ${report.status === 'approved' && report.voucherNumber ? `
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.receiptNumber')}</span>
              <span class="history-value">#${escapeHtml(report.voucherNumber)}</span>
            </div>` : ''}
            ${report.status === 'approved' && report.reviewedAt ? `
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.reviewed')}</span>
              <span class="history-value">${formatDateTime(report.reviewedAt)}</span>
            </div>` : ''}
            ${report.notes ? `
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.notes')}</span>
              <span class="history-value">${escapeHtml(report.notes)}</span>
            </div>` : ''}
            ${report.rejectionReason ? `
            <div class="history-row history-rejection">
              <span class="history-label">${t('paymentHistory.rejectionReason')}</span>
              <span class="history-value">${escapeHtml(report.rejectionReason)}</span>
            </div>` : ''}
            ${report.receiptUrl ? `
            <button type="button" class="history-receipt-preview" data-receipt-url="${escapeHtml(report.receiptUrl)}">
              <img class="history-thumb" alt="" />
              <span class="history-receipt-preview-label">${t('paymentHistory.viewReceiptImage')}</span>
            </button>` : ''}
            ${hasReceipt ? `
            <button type="button" class="btn-secondary history-receipt-btn" data-transaction-id="${escapeHtml(report.paymentTransactionId)}">
              <div class="icon-slot-sm" data-icon="receipt"></div>
              ${t('paymentHistory.viewReceipt')}
            </button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    bindReceiptButtons();
    bindReceiptPreviews();
    handleIcons(listEl);
  };

  if (filtersEl) {
    filtersEl.addEventListener('click', (event) => {
      const btn = event.target.closest('.history-filter');
      if (!btn) return;
      activeFilter = btn.dataset.filter || 'all';
      updateFilterButtons();
      render();
    });
  }

  if (receiptClose) {
    receiptClose.setAttribute('aria-label', t('paymentHistory.closeReceipt'));
    receiptClose.addEventListener('click', closeReceipt);
  }
  if (receiptImage) receiptImage.alt = t('paymentHistory.receiptImageAlt');
  if (receiptZoomIn) receiptZoomIn.setAttribute('aria-label', t('paymentHistory.zoomIn'));
  if (receiptZoomOut) receiptZoomOut.setAttribute('aria-label', t('paymentHistory.zoomOut'));
  if (receiptZoomReset) receiptZoomReset.setAttribute('aria-label', t('paymentHistory.zoomReset'));
  if (receiptModal) {
    // Cerrar al hacer clic fuera de la imagen.
    receiptModal.addEventListener('click', (event) => {
      if (event.target === receiptModal) closeReceipt();
    });
  }
  const onDocumentKeydown = (event) => {
    if (event.key === 'Escape' && receiptModal && !receiptModal.classList.contains('hidden')) {
      closeReceipt();
    }
  };
  document.addEventListener('keydown', onDocumentKeydown);

  try {
    allReports = await PaymentNotification.getByUser(user.uid);
    render();
  } catch (error) {
    console.error("Error al cargar historial:", error);
    listEl.innerHTML = `<p class="error-text">${t('paymentHistory.error')}</p>`;
  }

  async function handleIcons(container) {
    try {
      const resp = await fetch('/src/img/icons.json');
      const data = await resp.json();
      container.querySelectorAll('[data-icon]').forEach(el => {
        const iconData = data.icons.find(i => i.name === el.dataset.icon);
        if (iconData) el.innerHTML = iconData.svg;
      });
    } catch (e) {}
  }

  return () => {
    document.removeEventListener('keydown', onDocumentKeydown);
    if (thumbObserver) thumbObserver.disconnect();
    document.body.style.overflow = bodyOverflowBefore || '';
  };
}
