import Transaction from "../../models/Transaction.js";

/**
 * transactions.controller.js
 * 
 * Controlador con Paginación Local y Filtros Contextuales Dinámicos.
 * Rediseñado con Look & Feel de Tabla/Globos y Acciones Rápidas.
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
        const typesFound = new Set();
        let hasUnidentified = false;

        dataByDate.forEach(t => {
            if (t.status === 'unidentified') hasUnidentified = true;
            if (t.type) typesFound.add(t.type);
        });

        const typeLabels = {
            'PAYMENT': 'Pagos',
            'FEE': 'Cargos',
            'EXPENSE': 'Gastos/Compras',
            'FINE': 'Multas',
            'OTHER_INCOME': 'Otros Ingresos',
            'OTHER': 'Otros'
        };

        let html = '';
        typesFound.forEach(type => {
            const isChecked = state.selectedTypes.includes(type);
            html += `
                <label class="filter-card">
                    <input type="checkbox" name="trans-type" value="${type}" ${isChecked ? 'checked' : ''}>
                    <div class="card-content">${typeLabels[type] || type}</div>
                </label>
            `;
        });

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

        if (!skipFilterUpdate) {
            updateDynamicFilters(dataByDate);
        }

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

        // 3. Balance Neto Inteligente
        const hasRange = state.range.start || state.range.end || state.query || state.selectedTypes.length > 0;
        if (els.sumNet) {
            const label = els.sumNet.previousElementSibling;
            if (!hasRange && allData.length <= 100) {
                els.sumNet.textContent = '--';
                els.sumNet.className = 'summary-value';
                if (label) label.textContent = 'Seleccione un periodo para ver balance';
            } else {
                const net = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
                els.sumNet.textContent = currency(net);
                els.sumNet.className = `summary-value ${net >= 0 ? 'positive' : 'negative'}`;
                if (label) label.textContent = 'Balance Neto del Periodo';
            }
        }

        const startIndex = (state.pagination.current - 1) * state.pagination.perPage;
        const pageItems = filtered.slice(startIndex, startIndex + state.pagination.perPage);

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
            const statusLabel = t.status === 'unidentified' ? 'Pendiente' : 'Verificado';
            const statusClass = t.status === 'unidentified' ? 'dot-pending' : 'dot-verified';
            
            return `
                <div class="transaction-row" data-id="${t.id}">
                    <div class="col-date">${dateObj.toLocaleDateString()}</div>
                    <div class="col-desc">
                        <h3>${t.description || 'Movimiento'}</h3>
                        <div class="col-status">
                            <span class="status-dot ${statusClass}">● ${statusLabel}</span>
                        </div>
                    </div>
                    <div class="col-type">
                        <span class="badge badge-${(t.type || 'fee').toLowerCase()}">${t.type || 'OTRO'}</span>
                    </div>
                    <div class="col-prop">Unidad ${t.propertyId || 'N/A'}</div>
                    <div class="col-amount ${isPos ? 'amount-pos' : 'amount-neg'}">
                        ${isPos ? '+' : ''}${currency(t.amount)}
                    </div>
                    <div class="col-actions">
                        <button class="btn-action btn-edit" title="Editar" data-id="${t.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                <path d="m13.498.795.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796a1.5 1.5 0 0 1 1.998-.001"/>
                            </svg>
                        </button>
                        <button class="btn-action btn-delete" title="Eliminar" data-id="${t.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5M8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5m3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Re-asignar eventos de acción
        els.list.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                window.router.navigate(`/dashboard/transactions/${id}`, 'dashboard');
            });
        });

        els.list.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                if (confirm('¿Estás seguro de eliminar esta transacción? Esta acción es irreversible.')) {
                    try {
                        await Transaction.delete(id);
                        allData = allData.filter(item => item.id !== id);
                        render(true);
                    } catch (err) {
                        alert('Error al eliminar: ' + err.message);
                    }
                }
            });
        });

        renderPagination(filtered.length);
    };

    const renderPagination = (totalItems) => {
        const totalPages = Math.ceil(totalItems / state.pagination.perPage);
        if (totalPages <= 1) { els.pagination.innerHTML = ''; return; }

        let html = `
            <button class="pg-btn ${state.pagination.current === 1 ? 'disabled' : ''}" data-page="${state.pagination.current - 1}" ${state.pagination.current === 1 ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
        `;

        html += `<button class="pg-btn ${state.pagination.current === 1 ? 'active' : ''}" data-page="1">1</button>`;
        
        if (state.pagination.current > 3) {
            html += `<span style="color: var(--color-gurkha-300); display: flex; align-items: center; padding: 0 0.25rem;">...</span>`;
        }

        for (let i = Math.max(2, state.pagination.current - 1); i <= Math.min(totalPages - 1, state.pagination.current + 1); i++) {
            html += `<button class="pg-btn ${state.pagination.current === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (state.pagination.current < totalPages - 2) {
            html += `<span style="color: var(--color-gurkha-300); display: flex; align-items: center; padding: 0 0.25rem;">...</span>`;
        }

        if (totalPages > 1) {
            html += `<button class="pg-btn ${state.pagination.current === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `
            <button class="pg-btn ${state.pagination.current === totalPages ? 'disabled' : ''}" data-page="${state.pagination.current + 1}" ${state.pagination.current === totalPages ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        `;

        els.pagination.innerHTML = html;
        els.pagination.querySelectorAll('.pg-btn:not(.disabled)').forEach(btn => btn.addEventListener('click', (e) => {
            state.pagination.current = parseInt(e.currentTarget.dataset.page);
            render(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }));
    };

    const setPreset = async (val) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        state.range = { start: null, end: null };
        let periodToFetch = null;
        let fetchRange = false;

        switch (val) {
            case 'today': state.range.start = today; state.range.end = today; fetchRange = true; break;
            case 'yesterday': const yest = today - 86400000; state.range.start = yest; state.range.end = yest; fetchRange = true; break;
            case 'thisMonth': state.range.start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); state.range.end = today; periodToFetch = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; break;
            case 'lastMonth': const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1); state.range.start = lastM.getTime(); state.range.end = new Date(now.getFullYear(), now.getMonth(), 0).getTime(); periodToFetch = `${lastM.getFullYear()}-${String(lastM.getMonth() + 1).padStart(2, '0')}`; break;
            case 'last7days': state.range.start = today - (7 * 86400000); state.range.end = today; fetchRange = true; break;
            case 'last30days': state.range.start = today - (30 * 86400000); state.range.end = today; fetchRange = true; break;
            case 'last3months': state.range.start = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime(); state.range.end = today; fetchRange = true; break;
            case 'last6months': state.range.start = new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime(); state.range.end = today; fetchRange = true; break;
            case 'thisYear': state.range.start = new Date(now.getFullYear(), 0, 1).getTime(); state.range.end = today; fetchRange = true; break;
            case 'lastYear': state.range.start = new Date(now.getFullYear() - 1, 0, 1).getTime(); state.range.end = new Date(now.getFullYear() - 1, 11, 31).getTime(); fetchRange = true; break;
            case 'all': state.range.start = null; state.range.end = null; fetchRange = true; break;
        }

        if (periodToFetch) {
            els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">Consultando periodo ${periodToFetch}...</div>`;
            allData = await Transaction.getByPeriod(periodToFetch);
        } else if (fetchRange) {
            els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">Consultando base de datos...</div>`;
            allData = val === 'all' ? await Transaction.getAll(5000) : await Transaction.getByDateRange(state.range.start, state.range.end);
        }

        state.pagination.current = 1;
        state.selectedTypes = []; 
        render();
    };

    els.search?.addEventListener('input', (e) => { 
        state.query = e.target.value; 
        state.pagination.current = 1;
        render(true);
    });

    els.datePreset?.addEventListener('change', (e) => {
        if (e.target.value === 'custom') els.customContainer.classList.remove('hidden');
        else { els.customContainer.classList.add('hidden'); setPreset(e.target.value); }
    });

    els.btnApply?.addEventListener('click', async () => {
        if (!els.start?.value || !els.end?.value) return;
        state.range.start = toTimestamp(els.start.value);
        state.range.end = toTimestamp(els.end.value);
        els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">Buscando en base de datos...</div>`;
        allData = await Transaction.getByDateRange(state.range.start, state.range.end);
        state.pagination.current = 1;
        state.selectedTypes = [];
        render();
    });

    try {
        els.list.innerHTML = '<div style="text-align: center; padding: 4rem;">Cargando movimientos recientes...</div>';
        allData = await Transaction.getAll(100); 
        render();
    } catch (err) {
        console.error(err);
        els.list.innerHTML = '<div>Error al cargar datos.</div>';
    }

    return () => {};
}
