import Transaction from "../../models/Transaction.js";
import ChargeConcept from "../../models/ChargeConcept.js";
import { t } from "../../core/i18n.js";
import { injectIcons } from "../../utils/icons.js";

/**
 * generalExpenses.controller.js
 * Gestiona el módulo "Gastos Generales" (Gastos Operativos).
 * Paginación client-side (patrón propertyDetail). Manejo robusto de errores y estados vacíos.
 */

const PER_PAGE = 15;

const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value || 0));
};

const formatDate = (date) => {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTimestamp = () => {
  const now = new Date();
  return now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default async function generalExpensesController(contexto) {
  const body = document.getElementById("ge-expenses-body");
  const timestampEl = document.getElementById("ge-expenses-timestamp");
  const paginationContainer = document.getElementById("ge-expenses-pagination");
  const receiptModal = document.getElementById("ge-receipt-modal");
  const receiptBody = document.getElementById("ge-receipt-body");
  const receiptClose = document.getElementById("ge-receipt-modal-close");
  const periodSelect = document.getElementById("ge-period-select");
  const periodTotalEl = document.getElementById("ge-period-total");
  const summaryMovementsEl = document.getElementById("ge-summary-movements");
  const summaryAvgEl = document.getElementById("ge-summary-avg");

  if (!body || !paginationContainer) {
    console.error("[GeneralExpenses] Elementos DOM no encontrados");
    return;
  }

  // --- Estado ---
  const state = { current: 1, data: [], loaded: false, loading: false, period: '' };

  // --- Cache de conceptos ---
  let conceptsCache = new Map();

  const loadConcepts = async () => {
    try {
      const concepts = await ChargeConcept.getAll();
      conceptsCache = new Map(concepts.map(c => [c.id, c.name]));
    } catch (error) {
      console.warn("[GeneralExpenses] No se pudieron cargar conceptos:", error);
      conceptsCache = new Map();
    }
  };

  // --- Helpers de formato ---
  const getTypeBadge = (type) => {
    const typeMap = {
      'EXPENSE': { label: 'Gasto', class: 'expense' },
      'FEE': { label: 'Cuota', class: 'fee' },
      'FINE': { label: 'Multa', class: 'fine' },
      'PAYMENT': { label: 'Pago', class: 'payment' },
      'OTHER_INCOME': { label: 'Otro Ingreso', class: 'other_income' }
    };
    const config = typeMap[type] || { label: type, class: 'other' };
    return `<span class="ge-type-badge ${config.class}">${config.label}</span>`;
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'verified': { label: 'Verificado', class: 'verified' },
      'pending': { label: 'Pendiente', class: 'pending' },
      'unidentified': { label: 'No Identificado', class: 'unidentified' },
      'cancelled': { label: 'Cancelado', class: 'cancelled' }
    };
    const config = statusMap[status] || { label: status, class: 'other' };
    return `<span class="ge-status-badge ${config.class}">${config.label}</span>`;
  };

  const formatAmount = (amount, type) => {
    const isIncome = type === 'PAYMENT' || type === 'OTHER_INCOME' || (typeof amount === 'number' && amount > 0);
    const absAmount = Math.abs(amount || 0);
    const sign = isIncome ? '+' : '-';
    return `<span class="ge-amount ${isIncome ? 'income' : 'expense'}">${sign}${formatCurrency(absAmount)}</span>`;
  };

  const getConceptName = (tx) => {
    if (tx.description) return tx.description;
    if (tx.concept) return conceptsCache.get(tx.concept) || tx.concept;
    return '-';
  };

  const getReceiptLink = (tx) => {
    return `
      <button class="ge-receipt-link" data-id="${tx.id}" title="Ver comprobante">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Ver
      </button>
    `;
  };

  const renderRow = (tx) => {
    const type = tx.type || 'UNKNOWN';
    return `
      <tr>
        <td>${formatDate(tx.effectiveDate)}</td>
        <td>${getConceptName(tx)}</td>
        <td>${formatAmount(tx.amount, type)}</td>
        <td>${getTypeBadge(type)}</td>
        <td>${getStatusBadge(tx.status)}</td>
        <td>${getReceiptLink(tx)}</td>
      </tr>
    `;
  };

  const renderEmpty = (message) => {
    body.innerHTML = `<tr><td colspan="6" class="ge-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg><p>${message}</p></td></tr>`;
  };

  const renderError = (message) => {
    body.innerHTML = `<tr><td colspan="6" class="ge-error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg><p>${message}</p></td></tr>`;
  };

  // --- Paginación ---
  const renderPagination = () => {
    const totalItems = getFilteredData().length;
    const totalPages = Math.ceil(totalItems / PER_PAGE);
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    let html = '';

    // Prev
    const prevDisabled = state.current === 1 ? 'disabled' : '';
    html += `<button class="ge-btn-pagination ${prevDisabled}" data-page="${state.current - 1}" ${prevDisabled ? 'disabled' : ''}>
      <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"/></svg>
    </button>`;

    // Page numbers (ventana móvil con elipsis, patrón transactions)
    html += `<button class="ge-btn-pagination ${state.current === 1 ? 'active' : ''}" data-page="1">1</button>`;

    if (state.current > 3) {
      html += `<span class="ge-pagination-ellipsis">...</span>`;
    }

    for (let i = Math.max(2, state.current - 1); i <= Math.min(totalPages - 1, state.current + 1); i++) {
      const active = i === state.current ? 'active' : '';
      html += `<button class="ge-btn-pagination ${active}" data-page="${i}">${i}</button>`;
    }

    if (state.current < totalPages - 2) {
      html += `<span class="ge-pagination-ellipsis">...</span>`;
    }

    if (totalPages > 1) {
      html += `<button class="ge-btn-pagination ${state.current === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Next
    const nextDisabled = state.current === totalPages ? 'disabled' : '';
    html += `<button class="ge-btn-pagination ${nextDisabled}" data-page="${state.current + 1}" ${nextDisabled ? 'disabled' : ''}>
      <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"/></svg>
    </button>`;

    paginationContainer.innerHTML = html;

    // Event listeners
    paginationContainer.querySelectorAll('.ge-btn-pagination:not(.disabled):not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        state.current = parseInt(btn.dataset.page);
        renderTable();
      });
    });
  };

  // --- Renderizado de tabla ---
  const getFilteredData = () => {
    if (!state.period) return state.data;
    return state.data.filter(tx => tx.period === state.period);
  };

  const renderTable = () => {
    updatePeriodTotal();
    updateSummaryCard();

    const items = getFilteredData();
    if (items.length === 0) {
      renderEmpty(state.period
        ? (t('modules.generalExpenses.empty.period') || `No hay gastos registrados en este periodo`)
        : (t('modules.generalExpenses.empty.expenses') || 'No hay gastos operativos registrados'));
      renderPagination();
      if (timestampEl) timestampEl.textContent = '';
      return;
    }

    if (state.current > Math.ceil(items.length / PER_PAGE)) {
      state.current = 1;
    }

    const start = (state.current - 1) * PER_PAGE;
    const page = items.slice(start, start + PER_PAGE);

    body.innerHTML = page.map(renderRow).join('');
    renderPagination();

    if (timestampEl) {
      timestampEl.textContent = `Mostrando ${start + 1}–${Math.min(start + PER_PAGE, items.length)} de ${items.length} · ${formatTimestamp()}`;
    }
  };

  // --- Selector y total de periodo ---
  const formatPeriodLabel = (period) => {
    if (!period) return '';
    const [year, month] = period.split('-');
    const mIdx = parseInt(month, 10) - 1;
    if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return period;
    return `${monthNames[mIdx]} ${year}`;
  };

  const populatePeriodSelect = () => {
    if (!periodSelect) return;
    const periods = [...new Set(state.data.map(tx => tx.period).filter(Boolean))].sort().reverse();
    periodSelect.innerHTML = `<option value="">${t('modules.generalExpenses.period.all') || 'Todos los periodos'}</option>` +
      periods.map(p => `<option value="${p}">${formatPeriodLabel(p)}</option>`).join('');
  };

  const updatePeriodTotal = () => {
    if (!periodTotalEl) return;
    const items = getFilteredData();
    const total = items.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
    periodTotalEl.textContent = formatCurrency(total);
  };

  const updateSummaryCard = () => {
    const items = getFilteredData();
    const movements = items.length;

    const total = items.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
    const uniqueMonths = new Set(items.map(tx => tx.period).filter(Boolean)).size;
    const months = uniqueMonths > 0 ? uniqueMonths : 1;
    const avg = movements > 0 ? total / months : 0;

    if (summaryMovementsEl) summaryMovementsEl.textContent = movements;
    if (summaryAvgEl) summaryAvgEl.textContent = formatCurrency(avg);
  };

  // --- Carga de datos ---
  const loadData = async () => {
    if (state.loaded || state.loading) {
      renderTable();
      return;
    }

    state.loading = true;
    state.current = 1;

    try {
      state.data = await Transaction.getExpenses(200);
      state.loaded = true;
    } catch (error) {
      console.error("[GeneralExpenses] Error cargando gastos:", error);
      state.data = [];
      renderError(t('modules.generalExpenses.error.load') || 'Error al cargar datos');
    } finally {
      state.loading = false;
    }

    populatePeriodSelect();
    renderTable();
  };

  // --- Modal de comprobante ---
  const statusLabel = (status) => {
    const map = {
      verified: 'Verificado',
      pending: 'Pendiente',
      unidentified: 'No Identificado',
      cancelled: 'Cancelado'
    };
    return map[status] || status;
  };

  const openReceipt = (tx) => {
    if (!receiptModal || !receiptBody) return;

    const type = tx.type || 'UNKNOWN';
    const absAmount = Math.abs(tx.amount || 0);
    const isCharge = (tx.amount || 0) < 0;
    const amountClass = isCharge ? 'negative' : 'positive';
    const amountSign = isCharge ? '-' : '+';
    const dateObj = tx.effectiveDate?.toDate ? tx.effectiveDate.toDate() : new Date(tx.effectiveDate || 0);
    const dateLabel = isNaN(dateObj.getTime()) ? '—' : dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

    const rows = [
      ['Fecha', dateLabel],
      ['Descripción', tx.description || '—'],
      ['Tipo', type],
      ['Estado', statusLabel(tx.status)],
      ['Periodo', tx.period || '—'],
      ['Referencia bancaria', tx.metadata?.bankReference || '—']
    ];

    receiptBody.innerHTML = `
      <div class="ge-receipt-row">
        <span class="ge-receipt-label">Monto</span>
        <span class="ge-receipt-value amount ${amountClass}">${amountSign}$${absAmount.toFixed(2)}</span>
      </div>
      ${rows.map(([label, value]) => `
        <div class="ge-receipt-row">
          <span class="ge-receipt-label">${label}</span>
          <span class="ge-receipt-value">${value}</span>
        </div>
      `).join('')}
      ${tx.metadata?.receiptURL ? `
        <div class="ge-receipt-image-area">
          <div class="ge-receipt-image-title">Comprobante adjunto</div>
          <img src="${tx.metadata.receiptURL}" alt="Comprobante del gasto" />
        </div>
      ` : `
        <div class="ge-receipt-no-attachment">Sin comprobante adjunto</div>
      `}
    `;

    receiptModal.classList.remove('hidden');
  };

  const closeReceipt = () => {
    if (receiptModal) receiptModal.classList.add('hidden');
  };

  const attachModalEvents = () => {
    if (receiptClose) {
      receiptClose.addEventListener('click', closeReceipt);
    }
    if (receiptModal) {
      receiptModal.addEventListener('click', (e) => {
        if (e.target === receiptModal) closeReceipt();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && receiptModal && !receiptModal.classList.contains('hidden')) {
        closeReceipt();
      }
    });
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('.ge-receipt-link');
      if (btn) {
        const id = btn.dataset.id;
        const tx = state.data.find(item => item.id === id);
        if (tx) openReceipt(tx);
      }
    });
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        state.period = periodSelect.value;
        state.current = 1;
        renderTable();
      });
    }
  };

  // --- Inicialización ---
  const init = async () => {
    try {
      await injectIcons(document);
      await loadConcepts();
      attachModalEvents();
      await loadData();
    } catch (error) {
      console.error("[GeneralExpenses] Error en inicialización:", error);
      const container = document.querySelector('.general-expenses-module');
      if (container) {
        container.innerHTML = `<div class="ge-error"><p>Error al inicializar el módulo: ${error.message}</p></div>`;
      }
    }
  };

  try {
    await init();
  } catch (error) {
    console.error("[GeneralExpenses] Error fatal en inicialización:", error);
    const container = document.querySelector('.general-expenses-module');
    if (container) {
      container.innerHTML = `<div class="ge-error"><p>Error al inicializar el módulo</p></div>`;
    }
  }
}
