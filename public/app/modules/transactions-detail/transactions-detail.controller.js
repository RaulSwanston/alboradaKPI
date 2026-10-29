import Transaction from "../../models/Transaction.js";
import Property from "../../models/Property.js";
import ExpenseAccount from "../../models/ExpenseAccount.js";
import { t } from "../../core/i18n.js";
import { activeIncomeTypes, resolveIncomeTypeId, INCOME_TYPE_IDS } from "../../core/incomeTypes.js";
import { db, doc, updateDoc } from "../../core/firebase.js";
import { uploadFileToR2, buildPropertyUploadKey, buildExpenseReceiptKey, getAuthObjectURL, revokeAuthObjectURLs } from "../../core/r2.js";
import { compressImageFile } from "../../core/imageCompress.js";

/** Fecha local en formato YYYY-MM-DD para <input type="date">. */
const toLocalDateInputValue = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Controlador para creación/edición de transacciones.
 * Soporta búsqueda de propiedad, selección de deudas, carga de comprobante y auto-monto.
 */
export default async function transactionsDetailController(contexto) {
  const isNew = contexto.params.id === 'new';
  const transId = contexto.params.id;

  // --- DOM Elements ---
  const headerTitle = document.getElementById('td-header-title');
  const headerSubtitle = document.getElementById('td-header-subtitle');
  const btnDelete = document.getElementById('td-btn-delete');
  const form = document.getElementById('td-form');
  const btnSave = document.getElementById('td-btn-save');
  const btnSaveText = document.getElementById('td-btn-save-text');
  const btnLoading = document.getElementById('td-btn-loading');

  const propertySearch = document.getElementById('td-property-search');
  const propertiesList = document.getElementById('td-properties-list');
  const propertyMeta = document.getElementById('td-property-meta');
  const propertyHint = document.getElementById('td-property-hint');

  const typeRadios = document.querySelectorAll('input[name="td-type"]');

  const debtsSection = document.getElementById('td-debts-section');
  const debtsContainer = document.getElementById('td-debts-container');
  const debtsCount = document.getElementById('td-debts-count');
  const debtsLabel = document.getElementById('td-debts-label');
  const debtsHint = document.getElementById('td-debts-hint');
  const debtsAmountSlot = document.getElementById('td-debts-amount-slot');
  const debtsAvailableLabel = document.getElementById('td-debts-available-label');
  const debtsAvailableValue = document.getElementById('td-debts-available-value');

  const paymentSection = document.getElementById('td-payment-section');
  const paymentSectionLabel = paymentSection.querySelector('.td-section-label');
  const paymentMethod = document.getElementById('td-payment-method');
  const paymentMethodField = document.getElementById('td-payment-method-field');
  const receiptLabel = document.getElementById('td-receipt-label');

  // --- Métodos de pago desde appConfig (fuente única) ---
  const paymentMethods = contexto?.data?.appConfig?.moduleRegistry?.transactions?.paymentMethods || [];
  const legacyPaymentMap = {
    'TRANSFER': 'transfer', 'ACH': 'deposit', 'YAPPY': 'yappy', 'CASH': 'cash',
    'CHECK': 'check', 'CARD': 'card', 'DEPOSIT': 'deposit', 'OTHER': 'other'
  };
  if (paymentMethod) {
    paymentMethod.innerHTML = `<option value="">Seleccione...</option>` +
      paymentMethods.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
  }

  const uploadZone = document.getElementById('td-upload-zone');
  const receiptFileInput = document.getElementById('td-receipt-file');
  const uploadPlaceholder = document.getElementById('td-upload-placeholder');
  const uploadPreview = document.getElementById('td-upload-preview');
  const uploadFilename = document.getElementById('td-upload-filename');
  const uploadRemove = document.getElementById('td-upload-remove');
  const uploadThumb = document.getElementById('td-upload-thumb');
  const previewModal = document.getElementById('td-preview-modal');
  const previewImg = document.getElementById('td-preview-img');

  const descriptionInput = document.getElementById('td-description');
  const descriptionLabel = document.getElementById('td-description-label');
  const accountField = document.getElementById('td-account-field');
  const accountSelect = document.getElementById('td-expense-account');
  const incomeTypeField = document.getElementById('td-income-type-field');
  const incomeTypeSelect = document.getElementById('td-income-type');
  const amountInput = document.getElementById('td-amount');
  const amountField = document.getElementById('td-amount-field');
  const amountLabel = document.getElementById('td-amount-label');
  const dateInput = document.getElementById('td-effective-date');
  const dateField = document.getElementById('td-date-field');
  const bankRefInput = document.getElementById('td-bank-ref');
  const statusField = document.getElementById('td-status-field');
  const statusSelect = document.getElementById('td-status');

  const reconCard = document.getElementById('td-recon-card');
  const reconContent = document.getElementById('td-recon-content');

  // --- State ---
  let cachedProperties = [];
  let debtsCache = [];
  let debtCardById = new Map();
  let selectedDebtIds = new Set();
  let selectedDebtAmounts = new Map();
  let debtsLoadToken = 0;
  let receiptFile = null;
  let currentPropertyId = '';
  let isManualAmount = false;
  let _settingAmount = false;
  let originalTransaction = null;
  let isSaving = false;
  let idempotencyKey = null;
  let propertySearchTimer = null;
  let receiptPreviewUrl = null;
  let expenseAccounts = [];

  // =============================================
  //  INIT
  // =============================================
  const init = async () => {
    // Set today as default date
    dateInput.value = toLocalDateInputValue();
    populateIncomeTypeSelect();

    if (isNew) {
      headerTitle.textContent = 'Nueva Transacción';
      headerSubtitle.textContent = 'Complete los campos para registrar un movimiento';
      btnDelete.classList.add('hidden');
      await loadProperties();
      await loadExpenseAccounts();
      populateAccountSelect('');
      attachEvents();
      return;
    }

    headerTitle.textContent = 'Cargando...';
    headerSubtitle.textContent = '';
    btnDelete.classList.remove('hidden');
    await loadProperties();
    await loadExpenseAccounts();
    await loadExistingTransaction(transId);
    attachEvents();
  };

  // =============================================
  //  EXPENSE ACCOUNTS
  // =============================================
  const loadExpenseAccounts = async () => {
    try {
      expenseAccounts = await ExpenseAccount.getAll();
    } catch (e) {
      console.warn('[TD] Error loading expense accounts:', e);
      expenseAccounts = [];
    }
  };

  const populateAccountSelect = (selectedId = '') => {
    if (!accountSelect) return;
    const activeAccounts = expenseAccounts.filter(a => a.active !== false);
    const byCategory = new Map();
    activeAccounts.forEach(a => {
      const key = a.category || t('modules.generalExpenses.summaryAccounts.misc') || 'Otros';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(a);
    });

    if (selectedId) {
      const selectedAcc = expenseAccounts.find(a => a.id === selectedId);
      if (selectedAcc && selectedAcc.active === false) {
        const key = selectedAcc.category || t('modules.generalExpenses.summaryAccounts.misc') || 'Otros';
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).unshift(selectedAcc);
      }
    }

    let html = `<option value="">${t('modules.transactionsDetail.expenseAccount.unclassified') || 'Sin clasificar'}</option>`;
    byCategory.forEach((accounts, category) => {
      html += `<optgroup label="${category}">` +
        accounts.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.name}</option>`).join('') +
        `</optgroup>`;
    });
    accountSelect.innerHTML = html;
  };

  const populateIncomeTypeSelect = (selectedId = INCOME_TYPE_IDS.INTERESES_BANCARIOS) => {
    if (!incomeTypeSelect) return;
    const types = activeIncomeTypes();
    const options = types
      .map(x => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${x.name}</option>`);
    // Un id que ya no exista en el catálogo semilla no se pierde al editar: se
    // añade como opción para que el guardado no lo reemplace por el primero.
    if (selectedId && !types.some(x => x.id === selectedId)) {
      options.unshift(`<option value="${selectedId}" selected>${selectedId}</option>`);
    }
    incomeTypeSelect.innerHTML = options.join('');
    if (selectedId) incomeTypeSelect.value = selectedId;
  };

  // =============================================
  //  PROPERTIES
  // =============================================
  const loadProperties = async () => {
    try {
      cachedProperties = await Property.getAll();
      propertiesList.innerHTML = cachedProperties.map(p => {
        const ownerName = p.ownerInfo?.name || '';
        const label = ownerName ? `${ownerName}` : p.name;
        return `<option value="${p.id}" label="${label}"></option>`;
      }).join('');
    } catch (e) {
      console.error('[TD] Error loading properties:', e);
    }
  };

  const handlePropertyChange = (val) => {
    // Gasto/Compras y Otro no se vinculan a una unidad: si queda un debounce
    // pendiente de cuando el tipo era un cargo, no debe fijar la propiedad.
    if (!requiresProperty(getSelectedType())) return;

    const value = (val || '').trim();
    if (!value) {
      updatePropertyMeta(null);
      clearDebts();
      return;
    }

    // 1) Match exacto por ID: lo que se selecciona de la lista de sugerencias.
    let matches = cachedProperties.filter(p => p.id === value);

    // 2) Sin match exacto, resolver SOLO si hay una única coincidencia parcial.
    //    Evita auto-seleccionar "016" cuando "16" también matchea 216/316.
    if (matches.length === 0) {
      const lower = value.toLowerCase();
      matches = cachedProperties.filter(p =>
        p.id?.toLowerCase().includes(lower) ||
        p.name?.toLowerCase().includes(lower) ||
        p.ownerInfo?.name?.toLowerCase().includes(lower)
      );
    }

    const prop = matches.length === 1 ? matches[0] : null;
    updatePropertyMeta(prop);
    const type = getSelectedType();
    if ((type === 'PAYMENT' || type === 'CREDIT_NOTE') && currentPropertyId) {
      loadDebts(currentPropertyId);
    } else {
      clearDebts();
    }
  };

  const updatePropertyMeta = (prop) => {
    if (!prop) {
      propertyMeta.innerHTML = '';
      currentPropertyId = '';
      return;
    }
    currentPropertyId = prop.id;
    const ownerName = prop.ownerInfo?.name || '';
    propertyMeta.innerHTML = `
      <span class="td-prop-badge">Unidad ${prop.id}</span>
      <span class="td-prop-name">${ownerName || prop.name || ''}</span>
    `;
  };

  // =============================================
  //  TYPE SELECTION
  // =============================================
  const getSelectedType = () => {
    for (const radio of typeRadios) {
      if (radio.checked) return radio.value;
    }
    return 'FEE';
  };

  /**
   * Tipos de movimiento que pertenecen a una unidad. Un Gasto/Compra es un
   * egreso de la administración y "Otro" un apunte administrativo: ninguno se
   * vincula a un residente ni debe afectar el saldo de una propiedad.
   */
  const PROPERTY_TYPES = new Set(['FEE', 'PAYMENT', 'FINE', 'CREDIT_NOTE']);
  const requiresProperty = (type) => PROPERTY_TYPES.has(type);

  const setPropertyFieldVisibility = (needsProperty) => {
    propertySearch.classList.toggle('hidden', !needsProperty);
    propertyMeta.classList.toggle('hidden', !needsProperty);
    propertyHint?.classList.toggle('hidden', needsProperty);
  };

  /**
   * El monto es una única fuente de verdad: el mismo input se mueve entre
   * "Cargos a pagar" (pagos) y "Detalles del Movimiento" (resto de tipos).
   * Se conservan id, listeners y validación nativa.
   */
  const placeAmountField = (inDebtsSlot, labelText) => {
    if (!amountField) return;
    if (inDebtsSlot) {
      debtsAmountSlot?.appendChild(amountField);
      if (amountLabel) amountLabel.textContent = labelText;
    } else if (dateField?.parentNode) {
      dateField.parentNode.insertBefore(amountField, dateField);
      if (amountLabel) amountLabel.textContent = labelText;
    }
  };

  const handleTypeChange = (type, { skipDebts = false } = {}) => {
    const isPayment = type === 'PAYMENT';
    const isCreditNote = type === 'CREDIT_NOTE';
    const isExpense = type === 'EXPENSE';
    const isIncome = type === 'OTHER_INCOME';
    const needsProperty = requiresProperty(type);
    const showReceiptSection = isPayment || isExpense;
    const amountLabelText = isCreditNote
      ? 'Monto a condonar (USD)'
      : (isPayment ? 'Monto del pago (USD)' : (isIncome ? 'Monto del ingreso (USD)' : 'Monto (USD)'));
    placeAmountField(isPayment || isCreditNote, amountLabelText);

    setPropertyFieldVisibility(needsProperty);
    if (!needsProperty) {
      // Al salir de un tipo con unidad, se limpia la selección para que no se
      // guarde un vínculo heredado (ni se consulte el saldo de un residente).
      clearTimeout(propertySearchTimer);
      propertySearch.value = '';
      updatePropertyMeta(null);
    }

    debtsSection.classList.toggle('hidden', !(isPayment || isCreditNote));
    paymentSection.classList.toggle('hidden', !showReceiptSection);
    if (paymentMethodField) paymentMethodField.classList.toggle('hidden', !isPayment);
    if (paymentSectionLabel) {
      paymentSectionLabel.textContent = isExpense ? 'Comprobante del Gasto' : 'Detalle del Pago';
    }
    if (receiptLabel) {
      receiptLabel.textContent = isExpense ? 'Comprobante del Gasto (opcional)' : 'Comprobante de Pago (opcional)';
    }

    if (debtsLabel) {
      debtsLabel.textContent = isCreditNote ? 'Facturas a condonar' : 'Cargos a pagar';
    }
    if (debtsHint) {
      debtsHint.textContent = isCreditNote
        ? 'El monto de la nota se aplica a las facturas seleccionadas. El resto de cada factura queda pendiente.'
        : 'Si el monto es menor al total seleccionado, se aplicará como abono parcial y el resto quedará pendiente.';
    }
    if (descriptionLabel) {
      descriptionLabel.textContent = isCreditNote ? 'Motivo de la condonación' : 'Descripción';
    }

    if (accountField) {
      accountField.classList.toggle('hidden', type !== 'EXPENSE');
    }

    if (incomeTypeField) {
      incomeTypeField.classList.toggle('hidden', !isIncome);
    }
    if (descriptionInput) {
      descriptionInput.placeholder = isCreditNote
        ? 'Ej: Condonación cuota marzo 2025 - acuerdo con el residente'
        : (isIncome
          ? 'Ej: Intereses cuenta de ahorros'
          : 'Ej: Cuota de Mantenimiento Enero 2026');
    }

    if (!isNew) {
      statusField.classList.remove('hidden');
    }

    if (skipDebts) {
      // El llamador ya cargó los cargos (p. ej. edición con vínculos existentes).
    } else if ((isPayment || isCreditNote) && currentPropertyId) {
      loadDebts(currentPropertyId);
    } else if (!(isPayment || isCreditNote)) {
      clearDebts();
    }

    renderDebtCards();
  };

  // =============================================
  //  DEBTS
  // =============================================

  // En edición el monto del pago ya está definido y no debe recalcularse a partir
  // de los cargos. En alta solo es fijo si el usuario escribió el monto a mano.
  const isFixedAmount = () => !isNew || isManualAmount;

  const getSelectedTotal = () => {
    let total = 0;
    selectedDebtAmounts.forEach(amount => { total += amount; });
    return total;
  };

  const getPaymentAmount = () => Math.abs(parseFloat(amountInput.value) || 0);

  /**
   * @param {string} propertyId
   * @param {Array<{transactionId:string, amount:number}>} [appliedEntries]
   *        Vínculos actuales del pago (modo edición). Se incluyen en la consulta
   *        aunque ya estén saldados para poder mostrarlos seleccionados.
   */
  const loadDebts = async (propertyId, appliedEntries = []) => {
    const token = ++debtsLoadToken;
    try {
      debtsContainer.innerHTML = '<p class="td-empty-hint">Buscando deudas pendientes...</p>';
      debtsSection.classList.remove('hidden');
      debtsCache = [];
      debtCardById = new Map();
      selectedDebtIds = new Set();
      selectedDebtAmounts = new Map();

      // En alta, si el monto todavía se calcula solo, una nueva carga de cargos
      // invalida el total anterior (p. ej. al cambiar de unidad).
      if (isNew && !isManualAmount) {
        _settingAmount = true;
        amountInput.value = '';
        _settingAmount = false;
      }

      const appliedById = new Map(
        (appliedEntries || [])
          .filter(a => a && a.transactionId)
          .map(a => [a.transactionId, a])
      );
      const debts = await Transaction.getPendingDebts(propertyId, {
        includeIds: [...appliedById.keys()]
      });
      if (token !== debtsLoadToken) return;

      debtsCache = debts.map(debt => {
        // `pendingAmount` ya descuenta lo pagado, incluido este pago. Si falta
        // (datos antiguos), se deriva de `paidBy` para no sumar dos veces el
        // importe vinculado.
        const paidSum = (debt.paidBy || []).reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
        // `getPendingDebts` ya devuelve el pendiente cruzando `paidBy` con el
        // `appliedTo` de los pagos; usar `pendingAmount` aquí resucitaría un
        // residual fantasma cuando ese caché quedó viejo.
        const basePending = debt.pending != null
          ? Math.abs(Number(debt.pending) || 0)
          : (debt.pendingAmount != null
            ? Math.abs(Number(debt.pendingAmount) || 0)
            : Math.max(0, Math.abs(Number(debt.amount) || 0) - paidSum));
        const applied = appliedById.get(debt.id);
        let linkedAmount = applied ? Math.abs(Number(applied.amount) || 0) : 0;

        // Compatibilidad con vínculos antiguos sin `amount`: se recupera de
        // `paidBy` y, como último recurso, del propio cargo.
        if (applied && linkedAmount <= 0) {
          const paidBy = (debt.paidBy || []).find(p => p && p.paymentId === transId);
          linkedAmount = Math.abs(Number(paidBy?.amount) || 0);
        }
        if (applied && linkedAmount <= 0) {
          linkedAmount = Math.min(basePending || Math.abs(Number(debt.amount) || 0), getPaymentAmount());
        }

        const item = {
          id: debt.id,
          description: debt.description || 'Cargo sin descripción',
          voucherNumber: debt.voucherNumber || `Cargo ${debt.id.slice(0, 6)}`,
          fullAmount: basePending + linkedAmount
        };

        if (applied) {
          selectedDebtIds.add(item.id);
          selectedDebtAmounts.set(item.id, linkedAmount);
        }
        return item;
      });

      if (debtsCache.length === 0) {
        debtsContainer.innerHTML = '<p class="td-empty-hint">La unidad no tiene cargos pendientes</p>';
        renderDebtCards();
        return;
      }

      // Las tarjetas se crean una vez por carga de deudas. A partir de aquí solo
      // se actualizan en sitio (visibilidad, selección e importe), sin recrear el
      // DOM ni repetir la consulta a Firestore.
      debtsContainer.innerHTML = '';
      debtCardById = new Map();

      debtsCache.forEach(item => {
        const card = document.createElement('div');
        card.className = 'td-debt-card';
        card.dataset.debtId = item.id;
        card.innerHTML = `
          <div class="td-debt-check">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="td-debt-info">
            <span class="td-debt-title">${item.description}</span>
            <span class="td-debt-sub">${item.voucherNumber}</span>
          </div>
          <span class="td-debt-amount"></span>
        `;

        card.addEventListener('click', () => toggleDebt(item));
        debtCardById.set(item.id, card);
        debtsContainer.appendChild(card);
      });

      renderDebtCards();
    } catch (e) {
      if (token !== debtsLoadToken) return;
      console.error('[TD] Error loading debts:', e);
      debtsContainer.innerHTML = '<p class="td-empty-hint">Error al cargar deudas</p>';
    }
  };

  const renderDebtCards = () => {
    const fixed = isFixedAmount();
    const paymentAmount = getPaymentAmount();
    const selectedTotal = getSelectedTotal();
    const remaining = fixed ? paymentAmount - selectedTotal : Infinity;

    debtsCache.forEach(item => {
      const card = debtCardById.get(item.id);
      if (!card) return;

      const isSelected = selectedDebtIds.has(item.id);
      // Con monto fijo, mientras quede saldo se muestran todos los cargos por
      // conciliar. Si el pago ya está totalmente asignado, solo los vinculados.
      // Con monto 0 se muestran todos para poder seleccionar antes de escribir.
      const show = isSelected || !fixed || remaining > 0.005 || paymentAmount <= 0;
      const amount = isSelected ? (selectedDebtAmounts.get(item.id) || 0) : item.fullAmount;
      const isPartial = isSelected && amount > 0 && amount < item.fullAmount - 0.005;
      let amountLabel;
      if (isSelected && amount <= 0) {
        amountLabel = 'Sin asignar';
      } else if (isPartial) {
        amountLabel = `$${amount.toFixed(2)} ${t('modules.conciliation.partialOf')} $${item.fullAmount.toFixed(2)}`;
      } else {
        amountLabel = `$${item.fullAmount.toFixed(2)}`;
      }

      card.classList.toggle('selected', isSelected);
      card.dataset.amount = amount.toFixed(2);
      card.querySelector('.td-debt-amount').textContent = amountLabel;
      card.hidden = !show;
    });

    if (debtsAvailableLabel) {
      debtsAvailableLabel.textContent = fixed ? 'Disponible' : 'Total seleccionado';
    }
    if (debtsAvailableValue) {
      const value = fixed ? Math.max(0, paymentAmount - selectedTotal) : selectedTotal;
      debtsAvailableValue.textContent = `$${value.toFixed(2)}`;
    }

    updateDebtsCount(selectedDebtIds.size);
  };

  /**
   * En modo automático (alta sin editar el monto) el total del pago es la suma
   * de los cargos seleccionados. Cada cargo se aplica completo.
   */
  const applyAutoAmount = () => {
    if (isManualAmount) return;

    if (selectedDebtIds.size === 0) {
      selectedDebtAmounts.clear();
      _settingAmount = true;
      amountInput.value = '';
      _settingAmount = false;
      return;
    }

    selectedDebtAmounts.clear();
    let total = 0;
    selectedDebtIds.forEach(id => {
      const item = debtsCache.find(debt => debt.id === id);
      if (!item) return;
      selectedDebtAmounts.set(id, item.fullAmount);
      total += item.fullAmount;
    });

    _settingAmount = true;
    amountInput.value = total > 0 ? total.toFixed(2) : '';
    _settingAmount = false;
  };

  /**
   * Recoloca los importes seleccionados cuando el usuario cambia el monto.
   * Conserva lo ya asignado: al subir el monto completa los cargos en orden de
   * selección; al bajarlo recorta desde el último seleccionado. Nunca asigna más
   * que el monto del pago. Los cargos que quedan sin saldo siguen seleccionados
   * para que, al volver a subir el monto, se rellenen sin perder la selección.
   */
  const rebalanceSelected = () => {
    const target = getPaymentAmount();
    const entries = [];
    let total = 0;

    selectedDebtIds.forEach(id => {
      const item = debtsCache.find(debt => debt.id === id);
      if (!item) return;
      const current = Math.max(0, Math.min(item.fullAmount, selectedDebtAmounts.get(id) || 0));
      entries.push({ id, full: item.fullAmount, amount: current });
      total += current;
    });

    if (target > total) {
      let extra = target - total;
      for (const entry of entries) {
        if (extra <= 0) break;
        const room = entry.full - entry.amount;
        if (room <= 0) continue;
        const add = Math.min(room, extra);
        entry.amount += add;
        extra -= add;
      }
    } else if (target < total) {
      let excess = total - target;
      for (let i = entries.length - 1; i >= 0 && excess > 0; i--) {
        const cut = Math.min(entries[i].amount, excess);
        entries[i].amount -= cut;
        excess -= cut;
      }
    }

    selectedDebtAmounts.clear();
    entries.forEach(entry => selectedDebtAmounts.set(entry.id, entry.amount));
    selectedDebtIds.forEach(id => {
      if (!selectedDebtAmounts.has(id)) selectedDebtAmounts.set(id, 0);
    });
  };

  const toggleDebt = (item) => {
    if (selectedDebtIds.has(item.id)) {
      selectedDebtIds.delete(item.id);
      selectedDebtAmounts.delete(item.id);
    } else {
      selectedDebtIds.add(item.id);
    }

    if (!isFixedAmount()) {
      applyAutoAmount();
    } else if (selectedDebtIds.has(item.id)) {
      // Al añadir en modo manual/edición se asigna solo el saldo disponible,
      // sin recolocar los importes ya elegidos por el usuario.
      const available = Math.max(0, getPaymentAmount() - getSelectedTotal());
      selectedDebtAmounts.set(item.id, Math.min(item.fullAmount, available));
    }

    renderDebtCards();
  };

  const updateDebtsCount = (count) => {
    const isNC = getSelectedType() === 'CREDIT_NOTE';
    debtsCount.textContent = count === 1
      ? (isNC ? '1 seleccionada' : '1 seleccionado')
      : `${count} ${isNC ? 'seleccionadas' : 'seleccionados'}`;
  };

  const clearDebts = () => {
    debtsLoadToken++;
    debtsContainer.innerHTML = '<p class="td-empty-hint">Seleccione una unidad para ver sus cargos pendientes</p>';
    debtsCache = [];
    debtCardById = new Map();
    selectedDebtIds = new Set();
    selectedDebtAmounts = new Map();
    renderDebtCards();
  };

  // =============================================
  //  RECEIPT UPLOAD
  // =============================================
  const handleFileSelect = (file) => {
    if (!file) return;
    receiptFile = file;

    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
      receiptPreviewUrl = null;
    }

    const isImage = file.type?.startsWith('image/');
    if (isImage) {
      receiptPreviewUrl = URL.createObjectURL(file);
      uploadThumb.src = receiptPreviewUrl;
      uploadThumb.style.display = '';
    } else {
      uploadThumb.removeAttribute('src');
      uploadThumb.style.display = 'none';
    }

    uploadFilename.textContent = file.name;
    uploadPlaceholder.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    uploadZone.classList.add('has-file');
  };

  const handleFileRemove = () => {
    receiptFile = null;
    receiptFileInput.value = '';
    uploadThumb.removeAttribute('src');
    uploadThumb.style.display = 'none';
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
      receiptPreviewUrl = null;
    }
    uploadPreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
    uploadZone.classList.remove('has-file');
  };

  const openPreview = () => {
    if (!uploadThumb.src) return;
    previewImg.src = uploadThumb.src;
    previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closePreview = () => {
    previewModal.classList.add('hidden');
    previewImg.removeAttribute('src');
    document.body.style.overflow = '';
  };

  const onPreviewKeydown = (e) => {
    if (e.key === 'Escape') closePreview();
  };

  const uploadReceipt = async (propertyId) => {
    if (!receiptFile) return null;
    const type = getSelectedType();
    // Solo pagos y gastos usan el comprobante. Un ingreso administrativo no
    // tiene unidad a la que asociar la clave de R2.
    if (type !== 'PAYMENT' && type !== 'EXPENSE') return null;
    const { blob, ext } = await compressImageFile(receiptFile);
    const uid = contexto?.data?.user?.uid || 'admin';
    const key = type === 'EXPENSE'
      ? buildExpenseReceiptKey(uid, ext)
      : buildPropertyUploadKey(propertyId, uid, 'comprobante', ext);
    return await uploadFileToR2(blob, key);
  };

  // =============================================
  //  SAVE
  // =============================================
  const validate = () => {
    const type = getSelectedType();
    if (requiresProperty(type) && !currentPropertyId) {
      alert('Debe seleccionar una unidad/propiedad para este tipo de movimiento');
      return false;
    }
    if (type === 'OTHER_INCOME' && !incomeTypeSelect?.value) {
      alert('Debe seleccionar un tipo de ingreso');
      return false;
    }
    if (!descriptionInput.value.trim()) {
      alert('Debe ingresar una descripción');
      return false;
    }
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount === 0) {
      alert('Debe ingresar un monto válido');
      return false;
    }
    if (!dateInput.value) {
      alert('Debe seleccionar una fecha');
      return false;
    }
    if (type === 'PAYMENT' && !paymentMethod.value) {
      alert('Debe seleccionar un método de pago');
      return false;
    }
    return true;
  };

  /**
   * Concilia un pago con los cargos a los que se aplica.
   *
   * Delega en `Transaction.reconcileCharges()`, que hace `upsert` por `paymentId` y
   * DERIVA `pendingAmount` de la suma de `paidBy`. Por eso la operación es
   * idempotente y AUTO-REPARABLE: volver a guardar el mismo pago repara cualquier
   * cargo que hubiera quedado sin `paidBy`, aunque su `appliedTo` ya lo listara.
   *
   * @throws Si la conciliación falla, para que el formulario lo reporte en lugar de
   *         mostrar un éxito falso.
   * @returns {Promise<{conciliados:number, liberados:number, omitidos:number}>}
   */
  const applyPaymentToCharges = async (paymentId, appliedTo, propertyId, paymentAmount) => {
    const links = (appliedTo || []).filter(a => a && a.transactionId && (a.amount || 0) > 0);
    if (!links.length) return { conciliados: 0, liberados: 0, omitidos: 0 };

    return Transaction.reconcileCharges({
      paymentId,
      propertyId,
      links,
      balanceDelta: paymentAmount
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!validate()) return;

    const type = getSelectedType();
    const isIncome = type === 'OTHER_INCOME';
    const isCreditNote = type === 'CREDIT_NOTE';
    const absAmount = Math.abs(parseFloat(amountInput.value));
    let selectedDebts = [];

    if (type === 'PAYMENT' || isCreditNote) {
      selectedDebts = Array.from(debtsContainer.querySelectorAll('.td-debt-card.selected'))
        .map(card => ({
          transactionId: card.dataset.debtId,
          amount: parseFloat(card.dataset.amount || '0') || 0,
          description: card.querySelector('.td-debt-title')?.textContent || ''
        }))
        .filter(link => link.amount > 0);

      const appliedTotal = selectedDebts.reduce((sum, link) => sum + link.amount, 0);
      if (isCreditNote) {
        if (!selectedDebts.length) {
          alert('Selecciona al menos una factura a condonar.');
          return;
        }
        if (Math.abs(appliedTotal - absAmount) > 0.005) {
          alert('El monto de la nota debe coincidir con lo condonado en las facturas.');
          return;
        }
      } else if (appliedTotal > absAmount + 0.005) {
        alert('El importe aplicado a los cargos no puede superar el monto del pago.');
        return;
      }
    }

    isSaving = true;
    setSavingState(true);

    // Idempotencia: clave estable por operación lógica (mismo envío/re-intento), única por formulario.
    if (isNew && !idempotencyKey) {
      idempotencyKey = globalThis.crypto?.randomUUID?.() || `td-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const amount = (type === 'PAYMENT' || isIncome || isCreditNote) ? absAmount : -absAmount;

    const data = {
      propertyId: requiresProperty(type) ? currentPropertyId : (isIncome ? '__ADMIN_INCOME__' : null),
      description: descriptionInput.value.trim(),
      amount,
      type,
      effectiveDate: new Date(dateInput.value + 'T12:00:00'),
      status: isNew ? 'verified' : statusSelect.value
    };

    // `bankReference` va con notación de punto al ACTUALIZAR: `updateDoc` reemplaza
    // el mapa `metadata` completo (no hace merge profundo), así que mandarlo como
    // objeto en una edición borraría `receiptURL`, `paymentNotificationId`,
    // `incomeTypeSource`, `adminReviewedBy/Name`… En el alta sí es un mapa, porque
    // el documento todavía no tiene metadata que preservar.
    const bankReference = bankRefInput.value.trim() || '';
    if (isNew) {
      data.metadata = { bankReference };
    } else {
      data['metadata.bankReference'] = bankReference;
    }

    if (isIncome) {
      data.incomeTypeId = incomeTypeSelect?.value || INCOME_TYPE_IDS.OTROS_INGRESOS;
      data.voucherType = 'Nota de Crédito';
      data.voucherNumber = bankReference || originalTransaction?.voucherNumber || 'N/A';
    }

    if (type === 'EXPENSE') {
      data.expenseAccountId = accountSelect?.value || null;
    }

    if (isNew) data.idempotencyKey = idempotencyKey;

    if (type === 'PAYMENT') {
      data.paymentMethod = paymentMethod.value;

      if (isNew) {
        data.appliedTo = selectedDebts;
      } else {
        // El formulario conoce todos los cargos de la unidad (aunque algunos queden
        // ocultos al no quedar saldo). Los vínculos a cargos conocidos que el
        // usuario desmarcó se liberan; los huérfanos (cargo eliminado o de otra
        // unidad) se preservan por id para no perderlos al guardar.
        const knownIds = new Set(debtsCache.map(item => item.id));
        const preserved = (originalTransaction?.appliedTo || [])
          .filter(a => a && a.transactionId && !knownIds.has(a.transactionId));
        data.appliedTo = [...preserved, ...selectedDebts];
      }
    }

    if (isCreditNote) {
      data.appliedTo = selectedDebts;
    }

    // Fuera del `try` a propósito: el `catch` necesita saber si el pago llegó a
    // escribirse, para no informar una conciliación fallida como si nada se hubiera guardado.
    let savedId = null;

    try {
      const initiator = { type: 'USER', name: 'Administrador' };

      if (isNew) {
        if (isCreditNote) {
          const created = await Transaction.createCreditNote(data, initiator);
          savedId = created.id;
        } else {
          const created = await Transaction.create(data, initiator);
          savedId = created.id;
          // Duplicado (re-intento del mismo envío): el pago no se vuelve a crear, pero
          // la conciliación de cargos SÍ se reintenta más abajo. Antes se hacía
          // `window.history.back()` aquí, lo que convertía un fallo transitorio de la
          // conciliación en un descuadre permanente: el reintento siempre caía en esta
          // rama y nunca llegaba a conciliar. `applyPaymentToCharges` ya es idempotente,
          // así que repetirla no descuenta dos veces.
          if (created.duplicate) {
            console.warn(`[TD] Reintento del pago ${savedId}: se reintenta la conciliación de cargos.`);
          }
        }
      } else {
        await Transaction.update(transId, data, initiator);
        savedId = transId;
      }

      // Conciliar cargos vinculados/desvinculados.
      // `data.appliedTo` ya viene MEZCLADO (selección del formulario + vínculos que
      // no se pudieron renderizar porque el cargo ya estaba saldado). Por eso se
      // reconcilia el conjunto completo y no solo el diff: así, volver a guardar
      // repara un cargo que quedó sin `paidBy` aunque su `appliedTo` ya lo listara.
      if (type === 'PAYMENT' && savedId) {
        if (isNew && data.appliedTo?.length > 0) {
          await applyPaymentToCharges(savedId, data.appliedTo, currentPropertyId, absAmount);
        } else if (!isNew) {
          const oldAT = originalTransaction?.appliedTo || [];
          const newAT = data.appliedTo || [];
          const oldIds = new Set(oldAT.map(a => a.transactionId).filter(Boolean));
          const newIds = new Set(newAT.map(a => a.transactionId).filter(Boolean));
          const releaseIds = [...oldIds].filter(id => !newIds.has(id));
          const oldAmount = Math.abs(originalTransaction?.amount || 0);

          if (newAT.length > 0 || releaseIds.length > 0 || absAmount !== oldAmount) {
            // El `appliedTo` ya lo guardó `Transaction.update` arriba; aquí solo se
            // reconcilian los cargos (auto-reparable) y, si cambió, el saldo.
            await Transaction.reconcileCharges({
              paymentId: savedId,
              propertyId: currentPropertyId,
              links: newAT,
              releaseIds,
              balanceDelta: absAmount - oldAmount
            });
          }
        }
      }

      if (receiptFile && savedId) {
        try {
          const receiptURL = await uploadReceipt(currentPropertyId);
          if (receiptURL) {
            const transRef = doc(db, "transactions", savedId);
            await updateDoc(transRef, {
              'metadata.receiptURL': receiptURL
            });
          }
        } catch (uploadErr) {
          console.warn('[TD] Receipt upload failed (non-fatal):', uploadErr);
        }
      }

      window.history.back();
    } catch (error) {
      console.error('[TD] Save error:', error);
      // Si el pago se guardó pero la conciliación no, decirlo explícitamente: el
      // reintento es seguro (la conciliación es idempotente) y es lo que deja las
      // facturas en estado correcto. Informar solo "no se pudo guardar" haría que
      // el administrador asumiera que no se guardó nada, y el descuadre quedaría
      // invisible.
      if (isCreditNote) {
        alert(error?.message || 'No se pudo guardar la nota de crédito.');
      } else if (savedId && type === 'PAYMENT' && data.appliedTo?.length) {
        alert(
          'El pago se guardó, pero no se pudo conciliar con las cuotas seleccionadas.\n\n' +
          'Vuelva a guardar el mismo registro para reintentar la conciliación. ' +
          'No se descontará dos veces.'
        );
      } else {
        alert('No se pudieron guardar los cambios. Intente de nuevo.');
      }
      setSavingState(false);
      isSaving = false;
    }
  };

  const setSavingState = (saving) => {
    btnSave.disabled = saving;
    btnSaveText.classList.toggle('hidden', saving);
    btnLoading.classList.toggle('hidden', !saving);
  };

  // =============================================
  //  DELETE
  // =============================================
  const handleDelete = async () => {
    if (!confirm('¿Está seguro de eliminar esta transacción? Esta acción es irreversible.')) return;

    btnDelete.disabled = true;
    const originalText = btnDelete.innerHTML;
    btnDelete.innerHTML = 'Eliminando...';

    try {
      await Transaction.delete(transId, { type: 'USER', name: 'Administrador' });
      window.history.back();
    } catch (error) {
      console.error('[TD] Delete error:', error);
      alert('Error al eliminar la transacción');
      btnDelete.disabled = false;
      btnDelete.innerHTML = originalText;
    }
  };

  // =============================================
  //  LOAD EXISTING (edit mode)
  // =============================================
  const loadExistingTransaction = async (id) => {
    try {
      const trans = await Transaction.getById(id);
      if (!trans) {
        alert('La transacción no existe o fue eliminada.');
        window.history.back();
        return;
      }

      if (trans.type === 'CREDIT_NOTE') {
        alert('Las notas de crédito no se editan. Si necesitas corregirla, elimínala y crea una nueva.');
        window.history.back();
        return;
      }

      // En edición no se permite convertir una transacción existente en nota de
      // crédito (solo se crean desde cero).
      const creditNoteRadio = document.querySelector('input[name="td-type"][value="CREDIT_NOTE"]');
      if (creditNoteRadio) {
        creditNoteRadio.closest('.td-type-option')?.classList.add('hidden');
      }

      headerTitle.textContent = 'Editar Transacción';
      headerSubtitle.textContent = `#${trans.voucherNumber || id.slice(0, 8)}`;

      // Property
      currentPropertyId = trans.propertyId || '';
      propertySearch.value = currentPropertyId;
      const prop = cachedProperties.find(p => p.id === currentPropertyId);
      updatePropertyMeta(prop || null);

      // Type
      const type = trans.type || 'FEE';
      for (const radio of typeRadios) {
        if (radio.value === type) {
          radio.checked = true;
          break;
        }
      }

      if (type === 'OTHER_INCOME') {
        populateIncomeTypeSelect(resolveIncomeTypeId(trans) || INCOME_TYPE_IDS.INTERESES_BANCARIOS);
      }

      // Description
      descriptionInput.value = trans.description || '';

      // Amount (show absolute, sign determined by type)
      amountInput.value = Math.abs(trans.amount || 0).toFixed(2);

      // Date
      if (trans.effectiveDate) {
        const d = trans.effectiveDate.toDate ? trans.effectiveDate.toDate() : new Date(trans.effectiveDate);
        if (!isNaN(d.getTime())) {
          // Se conserva la fecha tal como se almacenó (día UTC) para no mover
          // los históricos importados a medianoche UTC al abrirlos para editar.
          dateInput.value = d.toISOString().split('T')[0];
        }
      }

      // Bank reference
      bankRefInput.value = trans.metadata?.bankReference || '';

      // Expense account (EXPENSE only)
      if (type === 'EXPENSE') {
        populateAccountSelect(trans.expenseAccountId || '');
      }

      // Status
      statusField.classList.remove('hidden');
      statusSelect.value = trans.status || 'verified';

      // Payment-specific fields
      if (type === 'PAYMENT') {
        paymentSection.classList.remove('hidden');
        debtsSection.classList.remove('hidden');
        paymentMethod.value = legacyPaymentMap[trans.paymentMethod] || trans.paymentMethod || '';
      }

      // Existing receipt preview (from stored metadata.receiptURL)
      const existingReceiptUrl = trans.metadata?.receiptURL;
      if (existingReceiptUrl) {
        const lastSeg = decodeURIComponent(existingReceiptUrl).split('/').pop()?.split('?')[0] || '';
        const isPdf = /\.pdf$/i.test(lastSeg);
        if (isPdf) {
          uploadThumb.removeAttribute('src');
          uploadThumb.style.display = 'none';
        } else {
          getAuthObjectURL(existingReceiptUrl).then((blobUrl) => {
            if (blobUrl && uploadThumb && !receiptFile) {
              uploadThumb.src = blobUrl;
              uploadThumb.style.display = '';
            }
          }).catch(() => {
            uploadThumb.removeAttribute('src');
            uploadThumb.style.display = 'none';
          });
        }
        uploadFilename.textContent = lastSeg || 'Comprobante adjunto';
        uploadPlaceholder.classList.add('hidden');
        uploadPreview.classList.remove('hidden');
        uploadZone.classList.add('has-file');
      }

      // Store original for diff calculation on edit
      originalTransaction = trans;

      // Trigger type change UI (sin recargar cargos: se cargan abajo con los vínculos)
      handleTypeChange(type, { skipDebts: true });

      if (type === 'PAYMENT' && currentPropertyId) {
        await loadDebts(currentPropertyId, trans.appliedTo || []);
      }

      // Reconciliation
      const isFee = (trans.amount || 0) < 0;
      const links = isFee ? (trans.paidBy || []) : (trans.appliedTo || []);

      if (links.length > 0) {
        reconCard.classList.remove('hidden');
        reconContent.innerHTML = `
          <div class="td-recon-list">
            ${links.map(link => `
              <div class="td-recon-item">
                <span class="td-recon-desc">${link.description || (isFee ? 'Recibo' : 'Cargo')}</span>
                <span class="td-recon-amount">$${Math.abs(link.amount).toFixed(2)}</span>
                <span class="td-recon-ref">${link.voucherNumber || link.transactionId || ''}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

    } catch (error) {
      console.error('[TD] Error loading transaction:', error);
      alert('Error al cargar los datos de la transacción.');
    }
  };

  // =============================================
  //  EVENTS
  // =============================================
  const attachEvents = () => {
    // Property search (debounced: resuelve al dejar de escribir)
    propertySearch.addEventListener('input', (e) => {
      clearTimeout(propertySearchTimer);
      propertySearchTimer = setTimeout(() => handlePropertyChange(e.target.value), 250);
    });

    // Type change
    typeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          handleTypeChange(e.target.value);
        }
      });
    });

    // Amount manual override (skip if being set programmatically)
    amountInput.addEventListener('input', () => {
      if (_settingAmount) return;
      // Con un importe escrito, el monto manda. Si se borra, vuelve el modo
      // automático (la selección se conserva y se rellena al volver a escribir).
      isManualAmount = amountInput.value !== '';
      if (getSelectedType() === 'PAYMENT' && debtsCache.length > 0) {
        rebalanceSelected();
        renderDebtCards();
      }
    });

    // Save
    form.addEventListener('submit', handleSubmit);

    // Delete
    if (btnDelete) {
      btnDelete.addEventListener('click', handleDelete);
    }

    // Cancel
    document.getElementById('td-btn-cancel').addEventListener('click', () => {
      window.history.back();
    });

    // Upload zone
    uploadZone.addEventListener('click', () => {
      receiptFileInput.click();
    });

    receiptFileInput.addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
    });

    uploadRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFileRemove();
    });

    // Thumbnail → modal a tamaño completo
    uploadThumb.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreview();
    });

    previewModal.querySelectorAll('[data-td-close-preview]').forEach(el => {
      el.addEventListener('click', closePreview);
    });

    document.addEventListener('keydown', onPreviewKeydown);

    // Back button
    document.getElementById('btn-back-list').addEventListener('click', () => {
      window.history.back();
    });
  };

  // =============================================
  //  START
  // =============================================
  await init();

  return () => {
    // Cleanup
    clearTimeout(propertySearchTimer);
    document.removeEventListener('keydown', onPreviewKeydown);
    closePreview();
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    revokeAuthObjectURLs();
  };
}
