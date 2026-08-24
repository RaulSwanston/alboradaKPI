import Transaction from "../../models/Transaction.js";
import Property from "../../models/Property.js";
import User from "../../models/User.js";
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

    // --- Identidad y alcance (rol / propiedades) ---
    const userProfile = contexto?.data?.user ? await User.getById(contexto.data.user.uid) : null;
    const isAdmin = userProfile?.role === 'admin';
    const myPropertyIds = userProfile?.propertyIds || [];

    // Carga todas las transacciones de las unidades del residente (rule-compliant:
    // filtra por propertyId). El filtrado por fecha/tipo lo hace render() en memoria.
    const loadResidentTransactions = async () => {
        if (myPropertyIds.length === 0) return [];
        const lists = await Promise.all(myPropertyIds.map(pid => Transaction.getByPropertyId(pid)));
        return lists.flat().sort((a, b) => {
            const da = a.effectiveDate?.toDate ? a.effectiveDate.toDate() : new Date(a.effectiveDate || 0);
            const db = b.effectiveDate?.toDate ? b.effectiveDate.toDate() : new Date(b.effectiveDate || 0);
            return db - da;
        });
    };

    els.search.placeholder = t('modules.transactions.searchPlaceholder');

    // --- ESTADO ---
    let allData = [];
    let expandedRows = new Set();
    let conciliationDataCache = new Map();
    // Caché de documentos vinculados (id -> {voucherNumber, description, type})
    // para resolver chips FAC/REC sin lecturas repetidas a Firestore.
    let linkCache = new Map();
    let state = {
        query: '',
        selectedTypes: [],
        range: { start: null, end: null },
        pagination: { current: 1, perPage: 20 },
        smartFilter: true
    };

    const currency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const getPeriodKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    // Números a palabras en español (hasta millones), para el recibo físico
    const wordsUnidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const wordsDecenas10 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const wordsDecenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const wordsCentenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const words2 = (n) => {
        if (n < 10) return wordsUnidades[n];
        if (n < 20) return wordsDecenas10[n - 10];
        if (n < 30) return n === 20 ? 'VEINTE' : `VEINTI${wordsUnidades[n % 10]}`;
        const d = Math.floor(n / 10);
        const u = n % 10;
        return wordsDecenas[d] + (u ? ` Y ${wordsUnidades[u]}` : '');
    };

    const words3 = (n) => {
        const c = Math.floor(n / 100);
        const rest = n % 100;
        const cw = c === 1 ? (rest ? 'CIENTO' : 'CIEN') : wordsCentenas[c];
        return (cw ? cw + (rest ? ' ' : '') : '') + (rest ? words2(rest) : '');
    };

    const numberToWords = (num) => {
        const n = Math.floor(Math.abs(Number(num) || 0));
        const m = Math.floor(n / 1000000);
        const t = Math.floor((n % 1000000) / 1000);
        const rest = n % 1000;
        let s = '';
        if (m) s += (m === 1 ? 'UN MILLÓN' : `${words3(m)} MILLONES`) + ((t || rest) ? ' ' : '');
        if (t) s += (t === 1 ? 'MIL' : `${words3(t)} MIL`) + (rest ? ' ' : '');
        if (rest) s += words3(rest);
        return s || 'CERO';
    };

    /**
     * Infiere el método de pago desde la descripción cuando el campo paymentMethod
     * no existe (pagos históricos). Misma lógica que Analytics.inferPaymentMethod.
     */
    const inferPaymentMethodLabel = (tx, labels) => {
        const desc = ((tx.description || '') + ' ' + (tx.paymentMethod || '')).toUpperCase();
        if (desc.includes('YAPPY')) return labels.yappy || 'Yappy';
        if (desc.includes('CHEQUE')) return labels.check || 'Cheque';
        if (desc.includes('EFECTIVO') || desc.includes(' CASH')) return labels.cash || 'Efectivo';
        if (desc.includes('TARJETA') || desc.includes('CARD') || desc.includes('POS')) return labels.card || 'Tarjeta';
        if (desc.includes('DEPOSIT') || desc.includes('DEPÓSITO')) return labels.deposit || 'Depósito';
        if (desc.includes('TRANSFER') || desc.includes('BANCA') || desc.includes('ACH') || desc.includes(' BG ')) return labels.transfer || 'Transferencia';
        return '';
    };

    /**
     * Filtro inteligente: oculta facturas (cargos) de meses FUTUROS que aún
     * no han sido pagadas. Los residentes que pagan el año adelantado generan
     * facturas de 2027; esas no deben ensuciar el feed del mes en curso.
     * Solo aplica a cargos (amount < 0) con periodo > mes actual y pendingAmount > 0.
     */
    const applySmartFilter = (list) => {
        const now = new Date();
        const currentPeriod = getPeriodKey(now);
        return list.filter(t => {
            if (t.amount >= 0) return true;
            const pending = t.pendingAmount !== undefined ? t.pendingAmount : Math.abs(t.amount || 0);
            if (pending > 0 && t.period && t.period > currentPeriod) return false;
            return true;
        });
    };

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
     * Resuelve las referencias (FAC/REC) de los documentos vinculados via
     * appliedTo (PAYMENT -> FEE) o paidBy (FEE -> PAYMENT). Las transacciones
     * ya cargadas cubren la mayoría de vínculos; los faltantes se buscan en
     * lote y se cachean para no repetir lecturas a Firestore.
     * Transacciones sin appliedTo/paidBy (revisión manual) simplemente no
     * muestran chips.
     */
    const resolveRefs = async () => {
        const byId = new Map(allData.map(t => [t.id, t]));
        const missing = new Set();
        allData.forEach(t => {
            const linkIds = t.type === 'PAYMENT'
                ? (t.appliedTo || [])
                : (t.type === 'FEE' || t.type === 'FINE' ? (t.paidBy || []) : []);
            linkIds.forEach(link => {
                const id = typeof link === 'string' ? link : (link.transactionId || link.paymentId);
                if (id && !byId.has(id) && !linkCache.has(id)) missing.add(id);
            });
        });
        if (missing.size === 0) return;

        const ids = Array.from(missing);
        const snaps = await Promise.all(ids.map(id => getDoc(doc(db, "transactions", id)).catch(() => null)));
        snaps.forEach((snap, i) => {
            const id = ids[i];
            if (snap && snap.exists()) {
                const d = snap.data();
                linkCache.set(id, { id, voucherNumber: d.voucherNumber, description: d.description, type: d.type });
            } else {
                linkCache.set(id, null);
            }
        });
        render();
    };

    /**
     * Referencias de una transacción: PAYMENT -> facturas (FAC) en appliedTo,
     * FEE/FINE -> recibos (REC) en paidBy. El label visible es el voucherNumber
     * (fallback description / id). Vacío si no hay vínculos.
     */
    const refsFor = (tx, byId) => {
        const refs = [];
        const links = tx.type === 'PAYMENT'
            ? (tx.appliedTo || [])
            : (tx.type === 'FEE' || tx.type === 'FINE' ? (tx.paidBy || []) : []);
        const chipClass = tx.type === 'PAYMENT' ? 'fac' : 'rec';
        links.forEach(link => {
            const id = typeof link === 'string' ? link : (link.transactionId || link.paymentId);
            if (!id) return;
            const r = linkCache.get(id) || byId.get(id);
            if (r) refs.push({ id, label: r.voucherNumber || r.description || id, chipClass });
        });
        return refs;
    };

    /**
     * Render principal
     */
    const render = (skipFilterUpdate = false) => {
        let dataByDate = state.smartFilter ? applySmartFilter(allData) : [...allData];
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

        const byId = new Map(allData.map(t => [t.id, t]));

        els.list.innerHTML = pageItems.map(tx => {
            const isPos = tx.amount > 0;
            const dateObj = new Date(toTimestamp(tx.effectiveDate || tx.createdAt));
            const statusLabel = tx.status === 'unidentified' ? t('modules.transactions.statusPending') : t('modules.transactions.statusVerified');
            const statusClass = tx.status === 'unidentified' ? 'dot-pending' : 'dot-verified';
            const expanded = isExpanded(tx.id);
            const refs = refsFor(tx, byId);

            return `
                <div class="transaction-row-wrapper" data-id="${tx.id}">
                    <div class="transaction-row">
                        <div class="col-date">${dateObj.toLocaleDateString()}</div>
                        <div class="col-desc">
                            <h3>${tx.description || t('modules.transactions.defaultDescription')}</h3>
                            <div class="col-status">
                                <span class="status-dot ${statusClass}">● ${statusLabel}</span>
                            </div>
                            ${refs.length ? `
                            <div class="col-refs">
                                ${refs.map(r => `<a class="ref-chip ${r.chipClass}" href="/dashboard/transactions/${r.id}" data-view="dashboard" title="${r.label}">${r.label}</a>`).join('')}
                            </div>` : ''}
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

        debtsContainer.innerHTML = '<p class="conciliation-loading">Cargando deudas pendientes...</p>';

        try {
            const debts = await Transaction.getPendingDebts(tx.propertyId);
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
                <div class="conciliation-debt-card ${isSelected ? 'selected' : ''}" data-transaction-id="${debtId}" data-amount="${Math.abs(pending).toFixed(2)}">
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
                </div>
            `;
        }).join('');

        container.querySelectorAll('.conciliation-debt-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const checkbox = card.querySelector('input[type="checkbox"]');
                e.preventDefault();
                checkbox.checked = !checkbox.checked;
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

        state.smartFilter = val !== 'all';

        if (periodToFetch) {
            els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingPeriod')} ${periodToFetch}...</div>`;
            allData = isAdmin ? await Transaction.getByPeriod(periodToFetch) : await loadResidentTransactions();
        } else if (fetchRange) {
            els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingDb')}</div>`;
            allData = isAdmin
                ? (val === 'all' ? await Transaction.getAll(5000) : await Transaction.getByDateRange(state.range.start, state.range.end))
                : await loadResidentTransactions();
        }

        state.pagination.current = 1;
        state.selectedTypes = []; 
        render();
        resolveRefs();
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
        state.smartFilter = false;
        allData = isAdmin ? await Transaction.getByDateRange(state.range.start, state.range.end) : await loadResidentTransactions();
        state.pagination.current = 1;
        state.selectedTypes = [];
        render();
        resolveRefs();
    });

    try {
        els.list.innerHTML = `<div style="text-align: center; padding: 4rem;">${t('modules.transactions.loadingDb')}</div>`;
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (isAdmin) {
            allData = await Transaction.getByPeriods([getPeriodKey(prevMonth)]);
        } else {
            allData = await loadResidentTransactions();
        }
        render();
        resolveRefs();
    } catch (err) {
        console.error(err);
        els.list.innerHTML = `<div>${t('modules.transactions.loadError')}</div>`;
    }

    // --- RECEIPT MODAL ---
    const receiptModal = document.getElementById('receipt-modal');
    const receiptBody = document.getElementById('receipt-body');
    const receiptPhysical = document.getElementById('receipt-physical-body');
    const receiptModalContent = receiptModal?.querySelector('.receipt-modal-content');
    const receiptClose = document.getElementById('receipt-modal-close');
    const btnPrint = document.getElementById('btn-print-receipt');

    // Cambia de pestaña y aplica el modo "recibo físico" (proporción más ancha que alta)
    const setReceiptTab = (tabName) => {
        receiptModal.querySelectorAll('.receipt-tab').forEach(tb => tb.classList.toggle('active', tb.dataset.tab === tabName));
        receiptModal.querySelectorAll('.receipt-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tabName));
        if (receiptModalContent) receiptModalContent.classList.toggle('physical-mode', tabName === 'physical');
    };

    // El modal vive anidado en el wrapper del módulo; para imprimir correctamente
    // (la regla @media print usa body > *:not(#receipt-modal)) se teleporta a body
    // mientras está abierto. position:fixed mantiene su posición visual intacta.
    let receiptModalParent = null;
    const teleportReceiptModal = () => {
        if (!receiptModal || receiptModalParent || receiptModal.parentElement === document.body) return;
        receiptModalParent = receiptModal.parentElement;
        document.body.appendChild(receiptModal);
    };
    const restoreReceiptModal = () => {
        if (!receiptModal || !receiptModalParent) return;
        receiptModalParent.appendChild(receiptModal);
        receiptModalParent = null;
    };

    /**
     * Sección de documentos vinculados en el comprobante:
     * PAYMENT -> facturas cubiertas (appliedTo); FEE/FINE -> recibos que lo pagaron (paidBy).
     * Resuelve el voucherNumber en lote vía linkCache/allData o getDoc on-demand.
     * Sin vínculos (pago sin conciliar) no se renderiza sección.
     */
    const buildAppliedSection = async (tx) => {
        const links = tx.type === 'PAYMENT'
            ? (tx.appliedTo || [])
            : (tx.type === 'FEE' || tx.type === 'FINE' ? (tx.paidBy || []) : []);
        if (!links.length) return '';

        const byId = new Map(allData.map(item => [item.id, item]));
        const missing = [];
        links.forEach(link => {
            const id = typeof link === 'string' ? link : (link.transactionId || link.paymentId);
            if (id && !byId.has(id) && !linkCache.has(id)) missing.push(id);
        });
        if (missing.length) {
            const snaps = await Promise.all(missing.map(id => getDoc(doc(db, "transactions", id)).catch(() => null)));
            snaps.forEach((snap, i) => {
                const id = missing[i];
                if (snap && snap.exists()) {
                    const d = snap.data();
                    linkCache.set(id, { id, voucherNumber: d.voucherNumber, description: d.description, type: d.type });
                } else {
                    linkCache.set(id, null);
                }
            });
        }

        const title = tx.type === 'PAYMENT'
            ? t('modules.transactions.receiptAppliedTitle')
            : t('modules.transactions.receiptPaidByTitle');

        const rows = links.map(link => {
            const id = typeof link === 'string' ? link : (link.transactionId || link.paymentId);
            const r = linkCache.get(id) || byId.get(id);
            const label = (r && (r.voucherNumber || r.description))
                || (typeof link === 'object' && (link.voucherNumber || link.description))
                || id
                || '';
            const amount = (typeof link === 'object' && Number(link.amount))
                || (r ? Math.abs(Number(r.amount) || 0) : 0);
            const desc = (typeof link === 'object' && link.description) || (r ? r.description : '') || '';
            return `
                <div class="receipt-applied-row">
                    <div class="receipt-applied-info">
                        <span class="receipt-applied-voucher">${label}</span>
                        ${desc ? `<span class="receipt-applied-desc">${desc}</span>` : ''}
                    </div>
                    <span class="receipt-applied-amount">$${amount.toFixed(2)}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="receipt-applied">
                <div class="receipt-applied-title">${title}</div>
                ${rows}
            </div>
        `;
    };

    /**
     * Recibo con formato físico (solo pagos). Header con logo y datos de contacto,
     * cuerpo estilo formulario, forma de pago, saldos y firma.
     * Las líneas se rellenan con la información disponible.
     */
    const buildPhysicalReceipt = async (tx, absAmount) => {
        const cfg = contexto?.data?.appConfig || {};
        const logoUrl = cfg.branding?.logoUrl || '/src/img/alborada.svg';
        const paymentMethods = cfg.moduleRegistry?.transactions?.paymentMethods || [];
        const methodLabels = Object.fromEntries(paymentMethods.map(m => [m.id, m.label]));
        const method = tx.paymentMethod || '';

        let ownerName = '';
        if (tx.propertyId) {
            try {
                const prop = await Property.getById(tx.propertyId);
                ownerName = prop?.ownerInfo?.name || prop?.name || '';
            } catch (e) { ownerName = ''; }
        }

        const dateObj = tx.effectiveDate?.toDate?.() || new Date(tx.effectiveDate || tx.createdAt?.toDate?.());
        const validDate = !isNaN(dateObj.getTime());
        const day = validDate ? String(dateObj.getDate()) : '';
        const month = validDate ? monthNames[dateObj.getMonth()] : '';
        const year = validDate ? String(dateObj.getFullYear()) : '';

        // Saldos: sumamos los movimientos de la unidad hasta la fecha del pago.
        // Convención de balance en Firestore: negativo = deuda.
        let saldoAnterior = null;
        let saldoActual = null;
        if (tx.propertyId && validDate) {
            try {
                const propTx = await Transaction.getByPropertyId(tx.propertyId);
                const payTime = toTimestamp(tx.effectiveDate);
                let sum = 0;
                propTx.forEach(tt => {
                    const ttTime = toTimestamp(tt.effectiveDate || tt.createdAt);
                    if (ttTime !== null && ttTime <= payTime) sum += Number(tt.amount) || 0;
                });
                const pago = Math.abs(Number(tx.amount) || 0);
                saldoAnterior = -(sum - pago);
                saldoActual = -sum;
            } catch (e) {
                saldoAnterior = null;
                saldoActual = null;
            }
        }

        const fmtMoney = (v) => v === null || isNaN(v) ? '' : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
        let isCash = method === 'cash';
        let isCheck = method === 'check';
        let otherLabel = methodLabels[method] || '';
        if (!method) {
            // Pagos históricos sin paymentMethod: inferir desde la descripción
            const inferred = inferPaymentMethodLabel(tx, methodLabels);
            if (inferred === methodLabels.cash) isCash = true;
            else if (inferred === methodLabels.check) isCheck = true;
            else otherLabel = inferred || '';
        }
        const isOther = !isCash && !isCheck;
        const sumaEnLetras = `${numberToWords(absAmount)} CON ${String(Math.round((absAmount % 1) * 100)).padStart(2, '0')}/100`;
        const cashedBy = tx.metadata?.adminReviewedByName || '';

        return `
            <div class="receipt-physical">
                <div class="physical-header">
                    <div class="physical-logo"><img src="${logoUrl}" alt="Alborada" /></div>
                    <div class="physical-center">
                        <div class="physical-receipt-title">${t('modules.transactions.receiptRecibo')}</div>
                        <div class="physical-receipt-number">${tx.voucherNumber || ''}</div>
                    </div>
                    <div class="physical-contact">
                        <div class="physical-contact-row"><strong>email:</strong> comunicadosalborada@gmail.com</div>
                        <div class="physical-contact-row"><strong>Tel:</strong> 474-6310/6311</div>
                    </div>
                    <div class="physical-claim-note">${t('modules.transactions.receiptClaimNote')}</div>
                </div>

                <div class="physical-form">
                    <div class="physical-form-line">
                        ${t('modules.transactions.receiptDateLabel')}
                        <span class="physical-blank">${day}</span> de
                        <span class="physical-blank">${month}</span> de 20
                        <span class="physical-blank">${year}</span>
                        <span class="physical-casa">${t('modules.transactions.receiptCasaNo')}</span>
                        <span class="physical-blank">${tx.propertyId || ''}</span>
                    </div>
                    <div class="physical-form-line fill">
                        ${t('modules.transactions.receiptReceived')} <span class="physical-blank physical-wide">${ownerName}</span>
                    </div>
                    <div class="physical-form-line fill">
                        ${t('modules.transactions.receiptSumOf')} <span class="physical-blank physical-wide">${sumaEnLetras}</span>
                    </div>
                    <div class="physical-form-line fill">
                        ${t('modules.transactions.receiptConceptOf')} <span class="physical-blank physical-wide">${tx.description || ''}</span>
                    </div>
                </div>

                <div class="physical-payform">
                    <div class="physical-payform-title">${t('modules.transactions.receiptPayForm')}</div>
                    <div class="physical-payform-row">
                        <label class="physical-check"><span class="physical-checkbox ${isCash ? 'checked' : ''}"></span> ${t('modules.transactions.receiptPayCash')}</label>
                        <label class="physical-check"><span class="physical-checkbox ${isCheck ? 'checked' : ''}"></span> ${t('modules.transactions.receiptPayCheck')}</label>
                        <label class="physical-check"><span class="physical-checkbox ${isOther ? 'checked' : ''}"></span> ${t('modules.transactions.receiptPayOther')}</label>
                        <span class="physical-blank physical-inline">${otherLabel}</span>
                    </div>
                    <div class="physical-saldo-row"><span class="physical-saldo-label">${t('modules.transactions.receiptPrevBalance')}</span><span class="physical-blank physical-saldo-value">${fmtMoney(saldoAnterior)}</span></div>
                    <div class="physical-saldo-row"><span class="physical-saldo-label">${t('modules.transactions.receiptPaymentAmt')}</span><span class="physical-blank physical-saldo-value">${fmtMoney(absAmount)}</span></div>
                    <div class="physical-saldo-row"><span class="physical-saldo-label">${t('modules.transactions.receiptCurrentBalance')}</span><span class="physical-blank physical-saldo-value">${fmtMoney(saldoActual)}</span></div>
                </div>

                <div class="physical-sign">
                    <div class="physical-sign-line">${cashedBy}</div>
                    <div class="physical-sign-label">${t('modules.transactions.receiptCollectedBy')}</div>
                </div>
            </div>
        `;
    };

    const showReceiptModal = async (tx) => {
        if (!receiptModal || !receiptBody) return;
        const isCharge = (tx.amount || 0) < 0;
        const absAmount = Math.abs(tx.amount || 0);
        const dateObj = tx.effectiveDate?.toDate?.() || new Date(tx.effectiveDate || tx.createdAt?.toDate?.());
        const voucherTypeLabel = tx.voucherType === 'FAC' ? t('modules.transactions.receiptFactura') : tx.voucherType === 'REC' ? t('modules.transactions.receiptRecibo') : t('modules.transactions.receiptVoucher');

        const appliedSection = await buildAppliedSection(tx);

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
            ${appliedSection}
        `;

        // Panel "Formato físico": solo pagos (recibo de pago)
        const isPayment = tx.type === 'PAYMENT';
        const physicalTab = receiptModal.querySelector('.receipt-tab[data-tab="physical"]');
        if (physicalTab) physicalTab.classList.toggle('hidden', !isPayment);
        if (receiptPhysical) {
            receiptPhysical.innerHTML = isPayment ? await buildPhysicalReceipt(tx, absAmount) : '';
        }

        // Restablecer a la pestaña "Comprobante"
        setReceiptTab('current');

        receiptModal.classList.remove('hidden');
        teleportReceiptModal();
    };

    receiptModal?.querySelectorAll('.receipt-tab').forEach(tab => {
        tab.addEventListener('click', () => setReceiptTab(tab.dataset.tab));
    });

    const closeReceiptModal = () => {
        receiptModal.classList.add('hidden');
        restoreReceiptModal();
    };

    receiptClose?.addEventListener('click', closeReceiptModal);
    receiptModal?.addEventListener('click', (e) => { if (e.target === receiptModal) closeReceiptModal(); });
    btnPrint?.addEventListener('click', () => window.print());

    // Cerrar el comprobante al navegar: así el modal no "traba" la vista de
    // transacciones. Captura para ejecutarse antes del router y cerrar de inmediato.
    const closeOnNavigate = (e) => {
        if (e.target.closest && e.target.closest('[data-view]')) closeReceiptModal();
    };
    const onKeydown = (e) => { if (e.key === 'Escape') closeReceiptModal(); };
    document.addEventListener('click', closeOnNavigate, true);
    document.addEventListener('keydown', onKeydown);

    return () => {
        document.removeEventListener('click', closeOnNavigate, true);
        document.removeEventListener('keydown', onKeydown);
        restoreReceiptModal();
    };
}
