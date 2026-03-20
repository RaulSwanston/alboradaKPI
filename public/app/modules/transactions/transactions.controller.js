import Transaction from "../../models/Transaction.js";

/**
 * transactions.controller.js
 * 
 * Controlador con Paginación Local y Filtros Contextuales Dinámicos.
 */
export default async function transactionsController(contexto) {
    const els = {
        list: document.getElementById('transactions-list'),
        search: document.getElementById('transactions-search'),
        datePreset: document.getElementById('date-preset-select'),
        customContainer: document.getElementById('custom-date-container'),
        start: document.getElementById('date-start'),
        end: document.getElementById('date-end'),
        btnApply: document.getElementById('btn-apply-dates'),
        sumNet: document.getElementById('sum-total-net'),
        filtersContainer: document.getElementById('transaction-filters'),
        pagination: document.getElementById('pagination-controls')
    };

    if (!els.list) return;

    // --- ESTADO ---
    let allData = [];
    let state = {
        query: '',
        selectedTypes: [],
        range: { start: null, end: null },
        pagination: { current: 1, perPage: 20 }
    };

    const currency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const toTimestamp = (val) => {
        if (!val) return null;
        let d;
        if (val.toDate) d = val.toDate();
        else if (typeof val === 'string') d = new Date(val.includes('T') ? val : val + 'T00:00:00');
        else d = new Date(val);
        if (isNaN(d.getTime())) return null;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };

    /**
     * Genera los Chips de Filtro dinámicamente basados en los datos filtrados por fecha
     */
    const updateDynamicFilters = (dataByDate) => {
        // Obtenemos todos los tipos únicos presentes en este rango de fechas
        const typesFound = new Set();
        let hasUnidentified = false;

        dataByDate.forEach(t => {
            if (t.status === 'unidentified') hasUnidentified = true;
            if (t.type) typesFound.add(t.type);
        });

        // Mapeo de nombres legibles
        const typeLabels = {
            'PAYMENT': 'Pagos',
            'FEE': 'Cuotas',
            'EXPENSE': 'Gastos/Compras',
            'FINE': 'Multas',
            'OTHER': 'Otros'
        };

        let html = '';
        
        // Generar chips para cada tipo encontrado
        typesFound.forEach(type => {
            const isChecked = state.selectedTypes.includes(type);
            html += `
                <label class="filter-card">
                    <input type="checkbox" name="trans-type" value="${type}" ${isChecked ? 'checked' : ''}>
                    <div class="card-content">${typeLabels[type] || type}</div>
                </label>
            `;
        });

        // Caso especial para Pendientes (unidentified)
        if (hasUnidentified) {
            const isChecked = state.selectedTypes.includes('unidentified');
            html += `
                <label class="filter-card">
                    <input type="checkbox" name="trans-type" value="unidentified" ${isChecked ? 'checked' : ''}>
                    <div class="card-content">Pendientes</div>
                </label>
            `;
        }

        els.filtersContainer.innerHTML = html;

        // Re-asignar eventos a los nuevos checkboxes
        els.filtersContainer.querySelectorAll('input[name="trans-type"]').forEach(cb => {
            cb.addEventListener('change', () => {
                state.selectedTypes = Array.from(els.filtersContainer.querySelectorAll('input[name="trans-type"]:checked')).map(i => i.value);
                state.pagination.current = 1;
                render();
            });
        });
    };

    /**
     * Render principal
     */
    const render = (skipFilterUpdate = false) => {
        // 1. Filtrar por Fecha primero para determinar qué filtros mostrar
        let dataByDate = [...allData];
        if (state.range.start || state.range.end) {
            dataByDate = allData.filter(t => {
                const tTime = toTimestamp(t.effectiveDate || t.createdAt);
                if (!tTime) return false;
                if (state.range.start && tTime < state.range.start) return false;
                if (state.range.end && tTime > state.range.end) return false;
                return true;
            });
        }

        // Si la fecha cambió, actualizamos los chips disponibles
        if (!skipFilterUpdate) {
            updateDynamicFilters(dataByDate);
        }

        // 2. Aplicar el resto de filtros sobre el subconjunto de fechas
        let filtered = dataByDate;

        if (state.selectedTypes.length > 0) {
            filtered = filtered.filter(t => {
                if (state.selectedTypes.includes('unidentified') && t.status === 'unidentified') return true;
                return state.selectedTypes.includes(t.type);
            });
        }

        if (state.query) {
            const q = state.query.toLowerCase();
            filtered = filtered.filter(t => 
                (t.propertyId || '').toLowerCase().includes(q) || 
                (t.description || '').toLowerCase().includes(q)
            );
        }

        // 3. Balance Neto
        const net = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        if (els.sumNet) {
            els.sumNet.textContent = currency(net);
            els.sumNet.className = `summary-value ${net >= 0 ? 'positive' : 'negative'}`;
        }

        // 4. Paginación
        const startIndex = (state.pagination.current - 1) * state.pagination.perPage;
        const pageItems = filtered.slice(startIndex, startIndex + state.pagination.perPage);

        // 5. Render Cards
        if (pageItems.length === 0) {
            els.list.innerHTML = `<div style="grid-column: 1/-1; padding: 4rem; text-align: center; color: var(--color-text-secondary);">
                <p>No se encontraron movimientos para los filtros aplicados.</p>
            </div>`;
            renderPagination(0);
            return;
        }

        els.list.innerHTML = pageItems.map(t => {
            const isPos = t.amount > 0;
            const dateObj = new Date(toTimestamp(t.effectiveDate || t.createdAt));
            return `
                <a href="/dashboard/transactions/${t.id}" class="transaction-card" data-view="dashboard">
                    <div class="trans-header">
                        <span class="trans-type-badge type-${(t.type || 'fee').toLowerCase()}">${t.type}</span>
                        <span class="trans-date">${dateObj.toLocaleDateString()}</span>
                    </div>
                    <div class="trans-info">
                        <h3>${t.description || 'Movimiento'}</h3>
                        <span class="trans-property">Unidad ${t.propertyId || 'N/A'}</span>
                    </div>
                    <div class="trans-footer">
                        <span class="trans-status" style="color: ${t.status === 'unidentified' ? 'var(--color-error)' : 'var(--color-success)'}">
                            ● ${t.status === 'unidentified' ? 'Pendiente' : 'Verificado'}
                        </span>
                        <span class="trans-amount ${isPos ? 'amount-positive' : 'amount-negative'}">
                            ${isPos ? '+' : ''}${currency(Math.abs(t.amount))}
                        </span>
                    </div>
                </a>
            `;
        }).join('');

        renderPagination(filtered.length);
    };

    const renderPagination = (totalItems) => {
        const totalPages = Math.ceil(totalItems / state.pagination.perPage);
        if (totalPages <= 1) { els.pagination.innerHTML = ''; return; }
        let html = `<button class="pg-btn" ${state.pagination.current === 1 ? 'disabled' : ''} data-page="${state.pagination.current - 1}">&laquo; Ant.</button>`;
        html += `<button class="pg-btn ${state.pagination.current === 1 ? 'active' : ''}" data-page="1">1</button>`;
        if (state.pagination.current > 3) html += `<span style="color: var(--color-text-secondary); padding: 0 0.5rem">...</span>`;
        for (let i = Math.max(2, state.pagination.current - 1); i <= Math.min(totalPages - 1, state.pagination.current + 1); i++) {
            html += `<button class="pg-btn ${state.pagination.current === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        if (state.pagination.current < totalPages - 2) html += `<span style="color: var(--color-text-secondary); padding: 0 0.5rem">...</span>`;
        if (totalPages > 1) html += `<button class="pg-btn ${state.pagination.current === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages}</button>`;
        html += `<button class="pg-btn" ${state.pagination.current === totalPages ? 'disabled' : ''} data-page="${state.pagination.current + 1}">Sig. &raquo;</button>`;
        els.pagination.innerHTML = html;
        els.pagination.querySelectorAll('.pg-btn').forEach(btn => btn.addEventListener('click', (e) => {
            state.pagination.current = parseInt(e.currentTarget.dataset.page);
            render(true); // Al navegar páginas, NO recalculamos los chips de filtro
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }));
    };

    const setPreset = (val) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        state.range = { start: null, end: null };
        switch (val) {
            case 'today': state.range.start = today; state.range.end = today; break;
            case 'yesterday': const yest = today - 86400000; state.range.start = yest; state.range.end = yest; break;
            case 'thisMonth': state.range.start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); state.range.end = today; break;
            case 'lastMonth': state.range.start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(); state.range.end = new Date(now.getFullYear(), now.getMonth(), 0).getTime(); break;
            case 'thisYear': state.range.start = new Date(now.getFullYear(), 0, 1).getTime(); state.range.end = today; break;
            case 'lastYear': state.range.start = new Date(now.getFullYear() - 1, 0, 1).getTime(); state.range.end = new Date(now.getFullYear() - 1, 11, 31).getTime(); break;
            case 'last7days': state.range.start = today - (7 * 86400000); state.range.end = today; break;
            case 'last30days': state.range.start = today - (30 * 86400000); state.range.end = today; break;
        }
        state.pagination.current = 1;
        state.selectedTypes = []; // Limpiamos selección al cambiar periodo para ver el nuevo contexto
        render();
    };

    // --- EVENTOS ---
    els.search?.addEventListener('input', (e) => { 
        state.query = e.target.value; 
        state.pagination.current = 1;
        render(true); // Al buscar texto NO recalculamos los chips
    });

    els.datePreset?.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            els.customContainer.classList.remove('hidden');
        } else {
            els.customContainer.classList.add('hidden');
            setPreset(e.target.value);
        }
    });

    els.btnApply?.addEventListener('click', () => {
        // Obtenemos los elementos de nuevo justo al hacer click para estar 100% seguros
        const inputS = document.getElementById('date-start');
        const inputE = document.getElementById('date-end');
        console.log("Fecha Inicial", inputS.value);
        console.log("Fecha Final", inputE.value);
        
        console.log("[TransactionsController] Ejecutando búsqueda personalizada...");
        console.log("Estado actual de los inputs en el DOM:", {
            start: inputS ? inputS.value : 'No encontrado',
            end: inputE ? inputE.value : 'No encontrado'
        });

        if (!inputS?.value || !inputE?.value) {
            console.warn("Falta una de las fechas para el rango.");
            // Si falta una, podrías decidir no filtrar o avisar al usuario
        }

        state.range.start = toTimestamp(inputS?.value);
        state.range.end = toTimestamp(inputE?.value);
        
        console.log("Timestamps finales para filtrado:", state.range);
        
        state.pagination.current = 1;
        state.selectedTypes = [];
        render();
    });

    // 4. Carga Inicial
    try {
        els.list.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem;">Cargando Libro Mayor...</div>';
        allData = await Transaction.getAll();
        render();
    } catch (err) {
        console.error(err);
        els.list.innerHTML = '<div>Error al cargar datos.</div>';
    }

    return () => {};
}
