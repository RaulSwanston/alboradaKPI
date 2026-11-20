import Property from "../../models/Property.js";
import Transaction from "../../models/Transaction.js";

/**
 * properties.controller.js
 *
 * Controlador autosuficiente para el listado de propiedades.
 * Carga datos reales de Firestore/D1 y gestiona filtros combinados
 * (Chips + Búsqueda) con paginación por lotes de tarjetas.
 */

const PER_PAGE = 12;

export default async function propertiesController(contexto) {
  const listContainer = document.getElementById('properties-list-container');
  const paginationContainer = document.getElementById('properties-pagination');
  const totalDebtEl = document.getElementById('prop-total-debt');
  const propCountEl = document.getElementById('prop-count');
  const filterChips = document.querySelectorAll('.filter-chip');

  if (!listContainer) return;

  let allProperties = []; // Almacén para el total de datos cargados
  let currentFilter = 'all';
  let currentSearchQuery = '';
  let currentPage = 1;

  /**
   * Formatea moneda
   */
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  /**
   * Renderiza la barra de paginación (patrón generalExpenses: prev/next +
   * ventana de números con elipsis).
   */
  const renderPagination = (totalItems) => {
    if (!paginationContainer) return;

    const totalPages = Math.ceil(totalItems / PER_PAGE);
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    let html = '';

    // Prev
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    html += `<button class="prop-btn-pagination ${prevDisabled}" data-page="${currentPage - 1}" ${prevDisabled ? 'disabled' : ''} aria-label="Anterior">
      <svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"/></svg>
    </button>`;

    // Primera página
    html += `<button class="prop-btn-pagination ${currentPage === 1 ? 'active' : ''}" data-page="1">1</button>`;

    if (currentPage > 3) {
      html += `<span class="prop-pagination-ellipsis">...</span>`;
    }

    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      const active = i === currentPage ? 'active' : '';
      html += `<button class="prop-btn-pagination ${active}" data-page="${i}">${i}</button>`;
    }

    if (currentPage < totalPages - 2) {
      html += `<span class="prop-pagination-ellipsis">...</span>`;
    }

    if (totalPages > 1) {
      html += `<button class="prop-btn-pagination ${currentPage === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Next
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    html += `<button class="prop-btn-pagination ${nextDisabled}" data-page="${currentPage + 1}" ${nextDisabled ? 'disabled' : ''} aria-label="Siguiente">
      <svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"/></svg>
    </button>`;

    paginationContainer.innerHTML = html;

    paginationContainer.querySelectorAll('.prop-btn-pagination:not(.disabled):not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page, 10);
        renderProperties();
      });
    });
  };

  /**
   * Renderiza las tarjetas aplicando filtros, búsqueda y paginación de forma combinada.
   */
  const renderProperties = () => {
    // 1. Filtrar por tipo (Chip)
    let filtered = allProperties;
    if (currentFilter === 'debt') {
        filtered = allProperties.filter(p => (p.balance || 0) < 0);
    } else if (currentFilter === 'paid') {
        filtered = allProperties.filter(p => (p.balance || 0) >= 0);
    }

    // 2. Filtrar por búsqueda de texto
    if (currentSearchQuery) {
        const query = currentSearchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            p.id.toLowerCase().includes(query) || 
            (p.ownerInfo?.name || '').toLowerCase().includes(query)
        );
    }

    // El contador refleja el TOTAL de coincidencias (no solo la página actual).
    if (propCountEl) propCountEl.textContent = String(filtered.length);

    // 3. Sin resultados
    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-services" style="grid-column: 1/-1; width: 100%;">
            <p>No se encontraron resultados.</p>
        </div>`;
      renderPagination(0);
      return;
    }

    // 4. Paginación
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * PER_PAGE;
    const page = filtered.slice(start, start + PER_PAGE);

    const html = page.map(prop => {
      const balance = prop.balance || 0;
      const isDebt = balance < 0;
      const ownerName = prop.ownerInfo?.name || 'Propietario no registrado';
      
      return `
        <a href="/dashboard/properties/${prop.id}" data-view="dashboard">
          <div class="property-card ${isDebt ? 'has-debt' : ''}" data-id="${prop.id}">
            <div class="property-header">
              <span class="property-id-badge">${prop.id}</span>
              <span class="property-status-badge ${isDebt ? 'status-debt' : 'status-ok'}">
                ${isDebt ? 'Pendiente' : 'Al día'}
              </span>
            </div>
            <div class="property-info">
              <h3>${ownerName}</h3>
              <p class="property-owner">Unidad Residencial</p>
            </div>
            <div class="property-footer">
              <div class="property-balance">
                <span class="balance-label">Saldo Actual</span>
                <span class="balance-value">${formatCurrency(balance)}</span>
              </div>
            </div>
          </div>
        </a>
      `;
    }).join('');

    listContainer.innerHTML = html;
    renderPagination(filtered.length);
  };

  /**
   * Carga inicial de datos
   */
  const loadData = async () => {
    try {
        listContainer.innerHTML = '<div class="loading-text" style="grid-column: 1/-1;">Cargando catálogo de unidades...</div>';
        
        // Carga de propiedades y transacciones en paralelo para eficiencia
        const [props, transactions] = await Promise.all([
            Property.getAll(),
            Transaction.getAll(5000) // Pedimos un límite alto para cubrir todo el año
        ]);

        allProperties = props;
        allProperties.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true, sensitivity: 'base'}));

        // Sumatoria de movimientos de dinero reales (Excluyendo FEE)
        const totalNetBalance = transactions.reduce((acc, t) => {
            const type = (t.type || '').toUpperCase();
            return type !== 'FEE' ? acc + (Number(t.amount) || 0) : acc;
        }, 0);
        
        if (totalDebtEl) {
            totalDebtEl.textContent = formatCurrency(totalNetBalance);
            // Ajustamos el label si es necesario (opcional, por claridad visual)
            const labelEl = totalDebtEl.previousElementSibling;
            if (labelEl && labelEl.classList.contains('label')) {
                labelEl.textContent = 'Balance Neto (Caja)';
            }
        }

        renderProperties();

    } catch (error) {
        console.error("[PropertiesController] Error:", error);
        listContainer.innerHTML = '<div class="error" style="grid-column: 1/-1;">Error al cargar las propiedades o el balance.</div>';
    }
  };

  // --- Manejo de Eventos ---

  // 1. Chips de Filtro
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
        currentPage = 1; // El filtro cambia el conjunto: volver a la primera página
        renderProperties();
    });
  });

  // 2. Evento del Módulo de Búsqueda Reutilizable
  document.addEventListener('app:search', (e) => {
    currentSearchQuery = e.detail.query;
    currentPage = 1; // La búsqueda cambia el conjunto: volver a la primera página
    renderProperties();
  });

  // Ejecutar carga
  await loadData();

  // Limpieza al salir de la vista
  return () => {
    // Es importante remover listeners globales si los hay (en este caso el de app:search)
    console.log("Saliendo del módulo de propiedades.");
  };
}
