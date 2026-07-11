import Transaction from "../../models/Transaction.js";
import Property from "../../models/Property.js";
import { t } from "../../core/i18n.js";
import { db, storage, ref, uploadBytes, getDownloadURL, doc, updateDoc, getDoc, writeBatch, arrayUnion } from "../../core/firebase.js";

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

  const typeRadios = document.querySelectorAll('input[name="td-type"]');

  const debtsSection = document.getElementById('td-debts-section');
  const debtsContainer = document.getElementById('td-debts-container');
  const debtsCount = document.getElementById('td-debts-count');

  const paymentSection = document.getElementById('td-payment-section');
  const paymentMethod = document.getElementById('td-payment-method');

  const uploadZone = document.getElementById('td-upload-zone');
  const receiptFileInput = document.getElementById('td-receipt-file');
  const uploadPlaceholder = document.getElementById('td-upload-placeholder');
  const uploadPreview = document.getElementById('td-upload-preview');
  const uploadFilename = document.getElementById('td-upload-filename');
  const uploadRemove = document.getElementById('td-upload-remove');

  const descriptionInput = document.getElementById('td-description');
  const amountInput = document.getElementById('td-amount');
  const dateInput = document.getElementById('td-effective-date');
  const bankRefInput = document.getElementById('td-bank-ref');
  const statusField = document.getElementById('td-status-field');
  const statusSelect = document.getElementById('td-status');

  const reconCard = document.getElementById('td-recon-card');
  const reconContent = document.getElementById('td-recon-content');

  // --- State ---
  let cachedProperties = [];
  let selectedDebtIds = new Set();
  let receiptFile = null;
  let currentPropertyId = '';
  let isManualAmount = false;
  let _settingAmount = false;

  // =============================================
  //  INIT
  // =============================================
  const init = async () => {
    // Set today as default date
    dateInput.value = new Date().toISOString().split('T')[0];

    if (isNew) {
      headerTitle.textContent = 'Nueva Transacción';
      headerSubtitle.textContent = 'Complete los campos para registrar un movimiento';
      btnDelete.classList.add('hidden');
      await loadProperties();
      attachEvents();
      return;
    }

    headerTitle.textContent = 'Cargando...';
    headerSubtitle.textContent = '';
    btnDelete.classList.remove('hidden');
    await loadProperties();
    await loadExistingTransaction(transId);
    attachEvents();
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

  const findProperty = (val) => {
    if (!val) return null;
    return cachedProperties.find(p =>
      p.id === val || p.name?.toLowerCase().includes(val.toLowerCase()) ||
      p.ownerInfo?.name?.toLowerCase().includes(val.toLowerCase())
    );
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

  const handlePropertyChange = (val) => {
    const prop = findProperty(val);
    updatePropertyMeta(prop);
    const type = getSelectedType();
    if (type === 'PAYMENT' && currentPropertyId) {
      loadDebts(currentPropertyId);
    } else {
      clearDebts();
    }
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

  const handleTypeChange = (type) => {
    const isPayment = type === 'PAYMENT';
    debtsSection.classList.toggle('hidden', !isPayment);
    paymentSection.classList.toggle('hidden', !isPayment);

    if (!isNew) {
      statusField.classList.remove('hidden');
    }

    if (isPayment && currentPropertyId) {
      loadDebts(currentPropertyId);
    } else if (!isPayment) {
      clearDebts();
    }

    if (!isPayment) {
      isManualAmount = false;
    }
  };

  // =============================================
  //  DEBTS
  // =============================================
  const loadDebts = async (propertyId, preSelectedIds = []) => {
    try {
      debtsContainer.innerHTML = '<p class="td-empty-hint">Buscando deudas pendientes...</p>';
      debtsSection.classList.remove('hidden');

      const debts = await Transaction.getPendingDebts(propertyId);
      selectedDebtIds = new Set();

      if (debts.length === 0) {
        debtsContainer.innerHTML = '<p class="td-empty-hint">La unidad no tiene cargos pendientes</p>';
        updateDebtsCount(0);
        return;
      }

      renderDebtCards(debts, preSelectedIds);
    } catch (e) {
      console.error('[TD] Error loading debts:', e);
      debtsContainer.innerHTML = '<p class="td-empty-hint">Error al cargar deudas</p>';
    }
  };

  const renderDebtCards = (debts, preSelectedIds = []) => {
    debtsContainer.innerHTML = '';

    debts.forEach(debt => {
      const card = document.createElement('div');
      card.className = 'td-debt-card';
      card.dataset.debtId = debt.id;
      card.dataset.amount = Math.abs(debt.pending || Math.abs(debt.amount));

      if (preSelectedIds.includes(debt.id)) {
        card.classList.add('selected');
        selectedDebtIds.add(debt.id);
      }

      const voucherLabel = debt.voucherNumber || `Cargo ${debt.id.slice(0, 6)}`;
      const desc = debt.description || 'Cargo sin descripción';

      card.innerHTML = `
        <div class="td-debt-check">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="td-debt-info">
          <span class="td-debt-title">${desc}</span>
          <span class="td-debt-sub">${voucherLabel}</span>
        </div>
        <span class="td-debt-amount">$${Math.abs(debt.pending || Math.abs(debt.amount)).toFixed(2)}</span>
      `;

      card.addEventListener('click', () => toggleDebt(card));
      debtsContainer.appendChild(card);
    });

    if (preSelectedIds.length > 0) {
      recalculateAmount();
    }
    updateDebtsCount(selectedDebtIds.size);
  };

  const toggleDebt = (card) => {
    const debtId = card.dataset.debtId;
    const isSelected = card.classList.toggle('selected');

    if (isSelected) {
      selectedDebtIds.add(debtId);
    } else {
      selectedDebtIds.delete(debtId);
    }

    recalculateAmount();
    updateDebtsCount(selectedDebtIds.size);
  };

  const recalculateAmount = () => {
    if (isManualAmount || selectedDebtIds.size === 0) return;

    let total = 0;
    const cards = debtsContainer.querySelectorAll('.td-debt-card');
    cards.forEach(card => {
      if (card.classList.contains('selected')) {
        total += parseFloat(card.dataset.amount) || 0;
      }
    });

    if (total > 0) {
      _settingAmount = true;
      amountInput.value = total.toFixed(2);
      _settingAmount = false;
    }
  };

  const updateDebtsCount = (count) => {
    debtsCount.textContent = count > 0 ? `${count} seleccionados` : '0 seleccionados';
  };

  const clearDebts = () => {
    debtsContainer.innerHTML = '<p class="td-empty-hint">Seleccione una unidad para ver sus cargos pendientes</p>';
    selectedDebtIds = new Set();
    updateDebtsCount(0);
  };

  // =============================================
  //  RECEIPT UPLOAD
  // =============================================
  const handleFileSelect = (file) => {
    if (!file) return;
    receiptFile = file;
    uploadFilename.textContent = file.name;
    uploadPlaceholder.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    uploadZone.classList.add('has-file');
  };

  const handleFileRemove = () => {
    receiptFile = null;
    receiptFileInput.value = '';
    uploadPreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
    uploadZone.classList.remove('has-file');
  };

  const uploadReceipt = async (propertyId) => {
    if (!receiptFile) return null;
    const timestamp = Date.now();
    const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `receipts/${propertyId}/${timestamp}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, receiptFile);
    return await getDownloadURL(storageRef);
  };

  // =============================================
  //  SAVE
  // =============================================
  const validate = () => {
    const type = getSelectedType();
    if (!currentPropertyId) {
      alert('Debe seleccionar una unidad/propiedad');
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
   * Decrementa pendingAmount de los cargos vinculados y actualiza el balance
   * de la propiedad. Es el mismo patrón que PaymentNotification.approve().
   */
  const applyPaymentToCharges = async (paymentId, appliedTo, propertyId, paymentAmount) => {
    try {
      const readPromises = appliedTo.map(a => getDoc(doc(db, "transactions", a.transactionId)));
      const snapshots = await Promise.all(readPromises);

      const [propSnap] = await Promise.all([
        getDoc(doc(db, "properties", propertyId))
      ]);
      const currentBalance = propSnap.exists() ? (propSnap.data().balance || 0) : 0;

      const batch = writeBatch(db);

      for (const applied of appliedTo) {
        const snap = snapshots.find(s => s.id === applied.transactionId);
        if (!snap?.exists()) continue;
        const currentPend = snap.data().pendingAmount || 0;
        batch.update(doc(db, "transactions", applied.transactionId), {
          pendingAmount: Math.max(0, currentPend - (applied.amount || 0)),
          paidBy: arrayUnion({
            paymentId: paymentId,
            amount: applied.amount || 0,
            description: applied.description || ''
          })
        });
      }

      batch.update(doc(db, "properties", propertyId), {
        balance: currentBalance + paymentAmount,
        lastBalanceUpdate: new Date()
      });

      await batch.commit();
      console.log(`[TD] Applied payment ${paymentId} to ${appliedTo.length} charges`);
    } catch (e) {
      console.warn('[TD] Error updating charge pending amounts (non-fatal):', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!validate()) return;

    isSaving = true;
    setSavingState(true);

    const type = getSelectedType();
    const absAmount = Math.abs(parseFloat(amountInput.value));
    const amount = type === 'PAYMENT' ? absAmount : -absAmount;

    const data = {
      propertyId: currentPropertyId,
      description: descriptionInput.value.trim(),
      amount,
      type,
      effectiveDate: new Date(dateInput.value + 'T12:00:00'),
      status: isNew ? 'verified' : statusSelect.value,
      metadata: {
        bankReference: bankRefInput.value.trim() || ''
      }
    };

    if (type === 'PAYMENT') {
      data.paymentMethod = paymentMethod.value;
      if (selectedDebtIds.size > 0) {
        data.appliedTo = Array.from(debtsContainer.querySelectorAll('.td-debt-card.selected')).map(card => ({
          transactionId: card.dataset.debtId,
          amount: parseFloat(card.dataset.amount),
          description: card.querySelector('.td-debt-title')?.textContent || ''
        }));
      }
    }

    try {
      const initiator = { type: 'USER', name: 'Administrador' };
      let savedId;

      if (isNew) {
        savedId = await Transaction.create(data, initiator);
      } else {
        await Transaction.update(transId, data, initiator);
        savedId = transId;
      }

      // Decrementar pendingAmount de los cargos vinculados (solo PAYMENT nuevos)
      if (isNew && type === 'PAYMENT' && data.appliedTo?.length > 0 && savedId) {
        await applyPaymentToCharges(savedId, data.appliedTo, currentPropertyId, absAmount);
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
      alert('No se pudieron guardar los cambios. Intente de nuevo.');
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

      // Description
      descriptionInput.value = trans.description || '';

      // Amount (show absolute, sign determined by type)
      amountInput.value = Math.abs(trans.amount || 0).toFixed(2);

      // Date
      if (trans.effectiveDate) {
        const d = trans.effectiveDate.toDate ? trans.effectiveDate.toDate() : new Date(trans.effectiveDate);
        if (!isNaN(d.getTime())) {
          dateInput.value = d.toISOString().split('T')[0];
        }
      }

      // Bank reference
      bankRefInput.value = trans.metadata?.bankReference || '';

      // Status
      statusField.classList.remove('hidden');
      statusSelect.value = trans.status || 'verified';

      // Payment-specific fields
      if (type === 'PAYMENT') {
        paymentSection.classList.remove('hidden');
        debtsSection.classList.remove('hidden');
        paymentMethod.value = trans.paymentMethod || '';
        if (currentPropertyId) {
          const preSelectedIds = (trans.appliedTo || []).map(a => a.transactionId).filter(Boolean);
          await loadDebts(currentPropertyId, preSelectedIds);
        }
      }

      // Trigger type change UI
      handleTypeChange(type);

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
    // Property search
    propertySearch.addEventListener('input', (e) => {
      handlePropertyChange(e.target.value);
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
      isManualAmount = amountInput.value !== '';
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
  };
}
