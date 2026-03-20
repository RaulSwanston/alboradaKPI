import Property from "../../models/Property.js";
import Transaction from "../../models/Transaction.js";

/**
 * properties.controller.js
 * 
 * Controlador autosuficiente para el listado de propiedades.
 * Carga datos reales de Firestore y gestiona filtros combinados (Chips + Búsqueda).
 */
export default async function propertiesController(contexto) {
  const listContainer = document.getElementById('properties-list-container');
  const totalDebtEl = document.getElementById('prop-total-debt');
  const propCountEl = document.getElementById('prop-count');
  const filterChips = document.querySelectorAll('.filter-chip');

  if (!listContainer) return;

  let allProperties = []; // Almacén para el total de datos cargados
  let currentFilter = 'all';
  let currentSearchQuery = '';

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
   * Renderiza las tarjetas aplicando filtros y búsqueda de forma combinada.
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

    // 3. Mostrar resultados
    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-services" style="grid-column: 1/-1; width: 100%;">
            <p>No se encontraron resultados.</p>
        </div>`;
      if (propCountEl) propCountEl.textContent = '0';
      return;
    }

    const html = filtered.map(prop => {
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
    if (propCountEl) propCountEl.textContent = filtered.length;
  };

  /**
   * Carga inicial de datos desde Firestore
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
        renderProperties();
    });
  });

  // 2. Evento del Módulo de Búsqueda Reutilizable
  // Escuchamos el evento personalizado 'app:search' que emite el módulo search
  document.addEventListener('app:search', (e) => {
    currentSearchQuery = e.detail.query;
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
