import Transaction from "../../models/Transaction.js";
import { t } from '../../core/i18n.js';
import { db, doc, getDoc, writeBatch, arrayUnion } from "../../core/firebase.js";

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

    els.search.placeholder = t('modules.transactions.searchPlaceholder');

    // --- ESTADO ---
    let allData = [];
    let expandedRows = new Set();
    let conciliationDataCache = new Map();
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
            'PAYMENT': t('modules.transactions.typePayment'),
            'FEE': t('modules.transactions.typeFee'),
            'EXPENSE': t('modules.transactions.typeExpense'),
            'FINE': t('modules.transactions.typeFine'),
            'OTHER_INCOME': t('modules.transactions.typeOtherIncome'),
            'OTHER': t('modules.transactions.typeOther')
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
                    <div class="card-content">${t('modules.transactions.statusUnidentified')}</div>
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
                if (label) label.textContent = t('modules.transactions.selectPeriodHint');
            } else {
                const net = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
                els.sumNet.textContent = currency(net);
                els.sumNet.className = `summary-value ${net >= 0 ? 'positive' : 'negative'}`;
                if (label) label.textContent = t('modules.transactions.netBalance');
            }
        }

        const startIndex = (state.pagination.current - 1) * state.pagination.perPage;
        const pageItems = filtered.slice(startIndex, startIndex + state.pagination.perPage);

        if (pageItems.length === 0) {
            els.list.innerHTML = `<div style="grid-column: 1/-1; padding: 4rem; text-align: center; color: var(--color-text-secondary);">
                <p>${t('modules.transactions.emptyFilters')}</p>
            </div>`;
            renderPagination(0);
            return;
        }

        const isExpanded = (id) => expandedRows.has(id);

        els.list.innerHTML = pageItems.map(tx => {
            const isPos = tx.amount > 0;
            const dateObj = new Date(toTimestamp(tx.effectiveDate || tx.createdAt));
            const statusLabel = tx.status === 'unidentified' ? t('modules.transactions.statusPending') : t('modules.transactions.statusVerified');
            const statusClass = tx.status === 'unidentified' ? 'dot-pending' : 'dot-verified';
            const expanded = isExpanded(tx.id);
            const appliedToCount = (tx.appliedTo || []).length;

            return `
                <div class="transaction-row-wrapper" data-id="${tx.id}">
                    <div class="transaction-row">
                        <div class="col-date">${dateObj.toLocaleDateString()}</div>
                        <div class="col-desc">
                            <h3>${tx.description || t('modules.transactions.defaultDescription')}</h3>
                            <div class="col-status">
                                <span class="status-dot ${statusClass}">● ${statusLabel}</span>
                            </div>
                        </div>
                        <div class="col-type">
                            <span class="badge badge-${(tx.type || 'fee').toLowerCase()}">${tx.type || t('modules.transactions.typeOther')}</span>
                        </div>
                        <div class="col-prop">${t('modules.transactions.propertyPrefix')} ${tx.propertyId || t('modules.transactions.propertyNa')}</div>
                        <div class="col-amount ${isPos ? 'amount-pos' : 'amount-neg'}">
                            ${isPos ? '+' : ''}${currency(tx.amount)}
                        </div>
                        <div class="col-actions">
                            <button class="btn-action btn-receipt" title="Ver Comprobante" data-id="${tx.id}" ${tx.voucherNumber ? '' : 'style="display:none"'}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
                                </svg>
                            </button>
                            <button class="btn-action btn-conciliate" title="Conciliar con cargos" data-id="${tx.id}" ${tx.type === 'PAYMENT' && tx.propertyId ? '' : 'style="display:none"'}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M21 6H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zm-1 10H4V8h16v8z"/>
                                    <circle cx="12" cy="12" r="2"/>
                                </svg>
                            </button>
                            <button class="btn-action btn-edit" title="Editar" data-id="${tx.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="m13.498.795.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796a1.5 1.5 0 0 1 1.998-.001"/>
                                </svg>
                            </button>
                            <button class="btn-action btn-delete" title="Eliminar" data-id="${tx.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5M8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5m3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0"/>
                                </svg>
                            </button>
                            ${appliedToCount > 0 ? `<span class="conciliate-badge" title="${appliedToCount} cargo(s) conciliado(s)">${appliedToCount}</span>` : ''}
                        </div>
                    </div>
                    <div class="conciliation-panel ${expanded ? '' : 'hidden'}" data-property-id="${tx.propertyId || ''}">
                        <div class="conciliation-panel-inner">
                            <div class="conciliation-header">
                                <span class="conciliation-title">Conciliar Pago — Unidad ${tx.propertyId || ''}</span>
                                <span class="conciliation-subtitle">Seleccione los cargos que este recibo está pagando</span>
                            </div>
                            <div class="conciliation-debts" data-payment-id="${tx.id}">
                                <p class="conciliation-loading">Cargando deudas pendientes...</p>
                            </div>
                            <div class="conciliation-actions ${expanded ? '' : 'hidden'}">
                                <button class="btn-save-conciliation button principal" data-id="${tx.id}">Guardar Conciliación</button>
                                <button class="btn-cancel-conciliation button secondary" data-id="${tx.id}">Cancelar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Botón "Ver Recibo"
        els.list.querySelectorAll('.btn-receipt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                const tx = allData.find(item => item.id === id);
                if (tx) showReceiptModal(tx);
            });
        });

        // Botón "Conciliar"
        els.list.querySelectorAll('.btn-conciliate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                toggleConciliation(id);
            });
        });

        // Botón "Guardar Conciliación"
        els.list.querySelectorAll('.btn-save-conciliation').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                saveConciliation(id);
            });
        });

        // Botón "Cancelar" dentro del panel
        els.list.querySelectorAll('.btn-cancel-conciliation').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                closeConciliation(id);
            });
        });

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
                if (confirm(t('modules.transactions.deleteConfirm'))) {
                    try {
                        await Transaction.delete(id);
                        allData = allData.filter(item => item.id !== id);
                        render(true);
                    } catch (err) {
                        alert(t('modules.transactions.deleteError') + err.message);
                    }
                }
            });
        });

        // Cargar deudas en paneles ya expandidos (después de render)
        expandedRows.forEach(id => {
            const wrapper = els.list.querySelector(`.transaction-row-wrapper[data-id="${id}"]`);
            if (wrapper) loadDebtsForPanel(wrapper, id);
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

    // =============================================
    //  CONCILIATION (cross-reference PAYMENT ↔ charges)
    // =============================================

    const toggleConciliation = (id) => {
        const wrapper = els.list.querySelector(`.transaction-row-wrapper[data-id="${id}"]`);
        if (!wrapper) return;

        if (expandedRows.has(id)) {
            closeConciliation(id);
        } else {
            expandedRows.add(id);
            wrapper.classList.add('expanded');
            const panel = wrapper.querySelector('.conciliation-panel');
            panel.classList.remove('hidden');
            const actions = panel.querySelector('.conciliation-actions');
            if (actions) actions.classList.remove('hidden');
            loadDebtsForPanel(wrapper, id);
        }
    };

    const closeConciliation = (id) => {
        expandedRows.delete(id);
        const wrapper = els.list.querySelector(`.transaction-row-wrapper[data-id="${id}"]`);
        if (!wrapper) return;
        wrapper.classList.remove('expanded');
        const panel = wrapper.querySelector('.conciliation-panel');
        if (panel) panel.classList.add('hidden');
    };

    const loadDebtsForPanel = async (wrapper, paymentId) => {
        const tx = allData.find(item => item.id === paymentId);
        if (!tx || !tx.propertyId) return;

        const panel = wrapper.querySelector('.conciliation-panel');
        const debtsContainer = panel?.querySelector('.conciliation-debts');
        if (!debtsContainer) return;

        const cacheKey = tx.propertyId;
        if (conciliationDataCache.has(cacheKey)) {
            renderDebtsInPanel(debtsContainer, conciliationDataCache.get(cacheKey), tx);
            return;
        }

        debtsContainer.innerHTML = '<p class="conciliation-loading">Cargando deudas pendientes...</p>';

        try {
            const debts = await Transaction.getPendingDebts(tx.propertyId);
            conciliationDataCache.set(cacheKey, debts);
            renderDebtsInPanel(debtsContainer, debts, tx);
        } catch (e) {
            console.error('[TX] Error loading debts for conciliation:', e);
            debtsContainer.innerHTML = '<p class="conciliation-empty">Error al cargar deudas</p>';
        }
    };

    const renderDebtsInPanel = (container, debts, paymentTx) => {
        const preSelectedIds = new Set((paymentTx.appliedTo || []).map(a => a.transactionId));

        if (debts.length === 0) {
            container.innerHTML = '<p class="conciliation-empty">La unidad no tiene cargos pendientes</p>';
            return;
        }

        container.innerHTML = debts.map(debt => {
            const debtId = debt.id;
            const isSelected = preSelectedIds.has(debtId);
            const pending = debt.pendingAmount !== undefined ? debt.pendingAmount : Math.abs(debt.amount);
            const voucherLabel = debt.voucherNumber || `Cargo ${debtId.slice(0, 6)}`;
            const desc = debt.description || 'Cargo sin descripción';

            return `
                <label class="conciliation-debt-card ${isSelected ? 'selected' : ''}" data-transaction-id="${debtId}" data-amount="${Math.abs(pending).toFixed(2)}">
                    <div class="conciliation-debt-check">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}>
                        <span class="check-indicator">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </span>
                    </div>
                    <div class="conciliation-debt-info">
                        <span class="conciliation-debt-title">${desc}</span>
                        <span class="conciliation-debt-voucher">${voucherLabel}</span>
                    </div>
                    <span class="conciliation-debt-amount">$${Math.abs(pending).toFixed(2)}</span>
                </label>
            `;
        }).join('');

        container.querySelectorAll('.conciliation-debt-card').forEach(card => {
            const checkbox = card.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                card.classList.toggle('selected', checkbox.checked);
            });
        });
    };

    const saveConciliation = async (paymentId) => {
        const tx = allData.find(item => item.id === paymentId);
        if (!tx) return;

        const wrapper = els.list.querySelector(`.transaction-row-wrapper[data-id="${paymentId}"]`);
        if (!wrapper) return;

        const panel = wrapper.querySelector('.conciliation-panel');
        const debtsContainer = panel?.querySelector('.conciliation-debts');
        if (!debtsContainer) return;

        const selectedCards = debtsContainer.querySelectorAll('.conciliation-debt-card.selected');
        const newAppliedTo = Array.from(selectedCards).map(card => ({
            transactionId: card.dataset.transactionId,
            amount: parseFloat(card.dataset.amount || '0'),
            description: card.querySelector('.conciliation-debt-title')?.textContent || ''
        }));

        const oldAppliedTo = tx.appliedTo || [];
        const oldIds = new Set(oldAppliedTo.map(a => a.transactionId));
        const newIds = new Set(newAppliedTo.map(a => a.transactionId));

        const added = newAppliedTo.filter(a => !oldIds.has(a.transactionId));
        const removedIds = [...oldIds].filter(id => !newIds.has(id));

        // Si no hay cambios, solo cerrar
        if (added.length === 0 && removedIds.length === 0) {
            closeConciliation(paymentId);
            return;
        }

        // Leer docs actuales de cargos afectados
        const allChargeIds = [...new Set([...newAppliedTo.map(a => a.transactionId), ...oldAppliedTo.map(a => a.transactionId)])];
        try {
            const chargeSnaps = await Promise.all(allChargeIds.map(id => getDoc(doc(db, "transactions", id))));
            const chargeData = {};
            chargeSnaps.forEach(s => { if (s.exists()) chargeData[s.id] = s.data(); });

            const batch = writeBatch(db);

            // Cargos añadidos: decrementar pendingAmount, añadir paidBy
            for (const item of added) {
                const charge = chargeData[item.transactionId];
                if (!charge) continue;
                const currentPending = charge.pendingAmount !== undefined ? charge.pendingAmount : Math.abs(charge.amount || 0);
                batch.update(doc(db, "transactions", item.transactionId), {
                    pendingAmount: Math.max(0, currentPending - item.amount),
                    paidBy: arrayUnion({
                        paymentId: paymentId,
                        voucherNumber: tx.voucherNumber || '',
                        amount: item.amount,
                        description: item.description || ''
                    })
                });
            }

            // Cargos removidos: restaurar pendingAmount, quitar de paidBy
            for (const removedId of removedIds) {
                const charge = chargeData[removedId];
                if (!charge) continue;
                const currentPending = charge.pendingAmount || 0;
                const removedItem = oldAppliedTo.find(a => a.transactionId === removedId);
                const updatedPaidBy = (charge.paidBy || []).filter(pb => pb.paymentId !== paymentId);
                batch.update(doc(db, "transactions", removedId), {
                    pendingAmount: currentPending + (removedItem?.amount || 0),
                    paidBy: updatedPaidBy
                });
            }

            // Actualizar appliedTo del PAYMENT
            batch.update(doc(db, "transactions", paymentId), {
                appliedTo: newAppliedTo
            });

            await batch.commit();

            // Actualizar caché local
            tx.appliedTo = newAppliedTo;
            closeConciliation(paymentId);

            // Recargar fila para reflejar el badge actualizado
            render(true);
            showToast('Conciliación guardada correctamente', 'success');
        } catch (err) {
            console.error('[TX] Error saving conciliation:', err);
            showToast('Error al guardar conciliación: ' + err.message, 'error');
        }
    };

    const showToast = (message, type = 'success') => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 5000);
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

        expandedRows.clear();
        conciliationDataCache.clear();

        if (periodToFetch) {
            els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingPeriod')} ${periodToFetch}...</div>`;
            allData = await Transaction.getByPeriod(periodToFetch);
        } else if (fetchRange) {
            els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingDb')}</div>`;
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
        els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingDb')}</div>`;
        expandedRows.clear();
        conciliationDataCache.clear();
        allData = await Transaction.getByDateRange(state.range.start, state.range.end);
        state.pagination.current = 1;
        state.selectedTypes = [];
        render();
    });

    try {
        els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingDb')}</div>`;
        allData = await Transaction.getAll(100); 
        render();
    } catch (err) {
        console.error(err);
        els.list.innerHTML = `<div>${t('modules.transactions.loadError')}</div>`;
    }

    // --- RECEIPT MODAL ---
    const receiptModal = document.getElementById('receipt-modal');
    const receiptBody = document.getElementById('receipt-body');
    const receiptClose = document.getElementById('receipt-modal-close');
    const btnPrint = document.getElementById('btn-print-receipt');

    const showReceiptModal = (tx) => {
        if (!receiptModal || !receiptBody) return;
        const isCharge = (tx.amount || 0) < 0;
        const absAmount = Math.abs(tx.amount || 0);
        const dateObj = tx.effectiveDate?.toDate?.() || new Date(tx.effectiveDate || tx.createdAt?.toDate?.());
        const voucherTypeLabel = tx.voucherType === 'FAC' ? t('modules.transactions.receiptFactura') : tx.voucherType === 'REC' ? t('modules.transactions.receiptRecibo') : t('modules.transactions.receiptVoucher');

        receiptBody.innerHTML = `
            <div class="receipt-title-area">
                <h3>${voucherTypeLabel}</h3>
                <div class="receipt-subtitle">${tx.voucherNumber || ''}</div>
            </div>
            <div class="receipt-row">
                <span class="receipt-label">${t('modules.transactions.receiptDate')}</span>
                <span class="receipt-value">${dateObj.toLocaleDateString()}</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-label">${t('modules.transactions.receiptUnit')}</span>
                <span class="receipt-value">${tx.propertyId || '—'}</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-label">${t('modules.transactions.receiptConcept')}</span>
                <span class="receipt-value">${tx.description || ''}</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-label">${t('modules.transactions.receiptType')}</span>
                <span class="receipt-value">${tx.type || ''}</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-label">${t('modules.transactions.receiptStatus')}</span>
                <span class="receipt-value">${tx.status === 'verified' ? t('modules.transactions.statusVerified') : t('modules.transactions.statusPending')}</span>
            </div>
            <div class="receipt-amount-large ${isCharge ? 'negative' : 'positive'}">
                ${isCharge ? '-' : '+'}$${absAmount.toFixed(2)}
            </div>
            ${tx.period ? `<div class="receipt-row"><span class="receipt-label">${t('modules.transactions.receiptPeriod')}</span><span class="receipt-value">${tx.period}</span></div>` : ''}
            ${tx.pendingAmount ? `<div class="receipt-row"><span class="receipt-label">${t('modules.transactions.receiptPending')}</span><span class="receipt-value">$${Math.abs(tx.pendingAmount).toFixed(2)}</span></div>` : ''}
        `;
        receiptModal.classList.remove('hidden');
    };

    receiptClose?.addEventListener('click', () => receiptModal.classList.add('hidden'));
    receiptModal?.addEventListener('click', (e) => { if (e.target === receiptModal) receiptModal.classList.add('hidden'); });
    btnPrint?.addEventListener('click', () => window.print());

    return () => {};
}
