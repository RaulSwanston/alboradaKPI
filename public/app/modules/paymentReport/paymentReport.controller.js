import { db, serverTimestamp, query, where, getDocs, orderBy } from "../../core/firebase.js";
import { uploadFileToR2, buildPropertyUploadKey } from '../../core/r2.js';
import { compressImageFile } from '../../core/imageCompress.js';
import Property from "../../models/Property.js";
import Transaction from "../../models/Transaction.js";
import PaymentNotification from "../../models/PaymentNotification.js";
import { activeIncomeTypes, INCOME_TYPE_IDS } from '../../core/incomeTypes.js';
import { t } from '../../core/i18n.js';
import { router } from '../../../router.js';

/** Fecha de hoy en formato `YYYY-MM-DD` usando la zona horaria local. */
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Escapa texto de Firestore antes de interpolarlo en innerHTML. */
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

/**
 * paymentReport.controller.js
 * Gestiona la lógica de reporte de pagos con conciliación de deudas.
 */
export default async function paymentReportController(contexto) {
  const user = contexto?.data?.user;
  if (!user) return;

  // --- Referencias al DOM ---
  const form = document.getElementById('payment-report-form');
  const propertySelect = document.getElementById('propertyId');
  const propertyContainer = document.getElementById('property-selection-container');
  const debtsList = document.getElementById('debts-list');
  const debtsCount = document.getElementById('debts-count');
  const availableLabel = document.getElementById('debts-available-label');
  const availableValue = document.getElementById('debts-available-value');
  const amountInput = document.getElementById('amount');
  const dateInput = document.getElementById('paymentDate');
  const paymentMethodSelect = document.getElementById('paymentMethod');
  const incomeTypeSelect = document.getElementById('incomeTypeId');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('receipt-file');
  const filePreview = document.getElementById('file-preview');
  const previewImg = document.getElementById('preview-img');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const statusModal = document.getElementById('status-modal');
  const btnModalClose = document.getElementById('btn-modal-close');
  const pendingNotice = document.getElementById('pending-reports-notice');
  const pendingNoticeText = document.getElementById('pending-reports-text');
  const btnViewMyReports = document.getElementById('btn-view-my-reports');

  let selectedFile = null;
  let currentPropertyId = null;
  let selectedDebtIds = new Set();
  let selectedDebtAmounts = new Map();
  let debtsCache = [];
  let debtCardById = new Map();
  let debtsLoadToken = 0;
  let isManualAmount = false;
  let _settingAmount = false;
  let showFutureDebts = false;
  // Facturas cuyo importe el residente fijó a mano. El reparto automático del
  // monto total nunca las pisa; solo mueve las que siguen en modo automático.
  let pinnedIds = new Set();
  // Una sola consulta de reportes por carga, compartida por el aviso de
  // pendientes y por el estado "en revisión" de las facturas.
  let pendingReportsPromise = null;
  // El catálogo de iconos se pide una sola vez por carga: `renderDebtCards`
  // corre en cada tecla del importe y no debe refetchear el JSON cada vez.
  let iconsPromise = null;

  // --- Métodos de pago desde appConfig (fuente única) ---
  const paymentMethods = contexto?.data?.appConfig?.moduleRegistry?.transactions?.paymentMethods || [];
  if (paymentMethodSelect) {
    paymentMethodSelect.innerHTML = paymentMethods.map(m =>
      `<option value="${m.id}">${m.label}</option>`
    ).join('');
  }

  // --- Tipos de ingreso (qué entró, no cómo pagó) ---
  // El reporte de pago siempre se hace contra cuotas, así que se precarga la cuota
  // de mantenimiento: es el 92% de los ingresos reales. Queda editable porque
  // alguien también puede pagar la rifa, un boleto o una tarjeta desde el mismo
  // formulario, y en ese caso lo declarado por el residente es el dato bueno.
  const incomeTypes = activeIncomeTypes();
  if (incomeTypeSelect) {
    incomeTypeSelect.innerHTML = incomeTypes.map(x =>
      `<option value="${x.id}"${x.id === INCOME_TYPE_IDS.CUOTA_AREA_SOCIAL ? ' selected' : ''}>${x.name}</option>`
    ).join('');
  }

  // --- Inicialización ---
  // `toISOString()` devuelve UTC: en Venezuela (UTC-4) después de las 20:00
  // ya es el día siguiente y el residente reportaría con fecha equivocada.
  dateInput.value = localToday();

  /**
   * Avisa al residente si ya tiene reportes esperando aprobación, para que no
   * los envíe dos veces. La misma consulta alimenta el estado "en revisión" de
   * las facturas, así que solo se paga una vez por carga.
   */
  const getPendingReports = () => {
    if (!pendingReportsPromise) {
      pendingReportsPromise = PaymentNotification.getByUser(user.uid).catch((error) => {
        console.warn("[paymentReport] No se pudo consultar reportes pendientes:", error);
        return [];
      });
    }
    return pendingReportsPromise;
  };

  const loadPendingNotice = async () => {
    if (!pendingNotice) return;
    try {
      const reports = await getPendingReports();
      const pending = reports.filter(r => r.status === 'pending_verification');
      if (pending.length === 0) {
        pendingNotice.classList.add('hidden');
        return;
      }
      pendingNoticeText.textContent = t('paymentReport.pendingNotice', { count: pending.length });
      pendingNotice.classList.remove('hidden');
      await handleIcons(pendingNotice);
    } catch (error) {
      // El aviso es informativo: si falla, no debe romper el formulario.
      console.warn("[paymentReport] No se pudo consultar reportes pendientes:", error);
      pendingNotice.classList.add('hidden');
    }
  };

  if (btnViewMyReports) {
    btnViewMyReports.onclick = () => router.navigate('/dashboard/payments/history', 'dashboard');
  }

  loadPendingNotice();

  try {
    // Perfil ya preparado por el middleware (role claim-aware: admin por custom claim).
    const userProfile = contexto.data.userProfile;
    const propertyIds = userProfile?.propertyIds || [];

    if (propertyIds.length === 0 && userProfile.role !== 'admin') {
      debtsList.innerHTML = `<div class="info-message"><p>${t('paymentReport.noProperties')}</p></div>`;
    } else {
      if (propertyIds.length > 1 || userProfile.role === 'admin') {
        propertyContainer.classList.remove('hidden');
        const props = await Promise.all(propertyIds.map(id => Property.getById(id)));
        propertySelect.innerHTML = `<option value="" disabled selected>${t('paymentReport.selectProperty')}</option>` + 
          props.map(p => `<option value="${p.id}">${p.name || `Unidad ${p.id}`}</option>`).join('');
        
        propertySelect.onchange = (e) => loadDebts(e.target.value);
      } else {
        // Usuario con una sola propiedad: Auto-selección
        currentPropertyId = propertyIds[0];
        loadDebts(currentPropertyId);
      }
    }
  } catch (error) {
    console.error("Error al inicializar reporte:", error);
  }

  const currentPeriodKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const getSelectedTotal = () => {
    let total = 0;
    selectedDebtAmounts.forEach(amount => { total += amount; });
    return total;
  };

  const getPaymentAmount = () => Math.abs(parseFloat(amountInput.value) || 0);

  /**
   * En modo automático el total es la suma de lo asignado. Se usa al editar el
   * importe de una factura cuando el residente todavía no escribió un monto.
   * En modo manual NO se llama: el total manda y lo que sobra es el disponible.
   */
  const syncTotalFromAllocations = () => {
    const total = Math.round(getSelectedTotal() * 100) / 100;
    _settingAmount = true;
    amountInput.value = total > 0 ? total.toFixed(2) : '';
    _settingAmount = false;
  };

  const isFixedAmount = () => isManualAmount;

  /**
   * Badge de facturas seleccionadas + indicador de dinero disponible.
   * En modo manual el monto es la fuente de verdad y se va restando lo que
   * consume cada factura; en modo automático se muestra el total seleccionado.
   */
  const updateDebtsSummary = () => {
    const fixed = isFixedAmount();
    const paymentAmount = getPaymentAmount();
    const selectedTotal = getSelectedTotal();
    if (debtsCount) {
      const count = selectedDebtIds.size;
      debtsCount.textContent = count === 0
        ? ''
        : (count === 1
          ? t('paymentReport.selectedCountOne')
          : t('paymentReport.selectedCount', { count }));
    }
    if (availableLabel) {
      availableLabel.textContent = fixed
        ? t('paymentReport.available')
        : t('paymentReport.selectedTotal');
    }
    if (availableValue) {
      const value = fixed ? Math.max(0, paymentAmount - selectedTotal) : selectedTotal;
      availableValue.textContent = `$${value.toFixed(2)}`;
    }
  };

  // --- Carga de Deudas Pendientes ---
  async function loadDebts(propertyId) {
    currentPropertyId = propertyId;
    debtsList.innerHTML = `<div class="loading-state"><p>${t('paymentReport.searchingDebts')}</p></div>`;
    debtsCache = [];
    debtCardById = new Map();
    selectedDebtIds = new Set();
    selectedDebtAmounts = new Map();
    pinnedIds = new Set();
    isManualAmount = false;
    showFutureDebts = false;
    _settingAmount = true;
    amountInput.value = '';
    _settingAmount = false;

    const token = ++debtsLoadToken;
    try {
      // Pendiente explícito por factura (paidBy/appliedTo/pendingAmount). No se
      // aplica ningún saldo a favor: el programa no mueve dinero; solo el
      // residente o el administrador pueden decidir una aplicación.
      const [debts, reports] = await Promise.all([
        Transaction.getPendingDebts(propertyId),
        getPendingReports()
      ]);
      if (token !== debtsLoadToken) return;

      // Facturas que ya cubre un reporte pendiente del residente: se muestran
      // como "En revisión" y no se pueden volver a reportar.
      const inReviewByCharge = new Map();
      for (const report of reports) {
        if (report.status !== 'pending_verification' || report.propertyId !== propertyId) continue;
        for (const ap of (Array.isArray(report.appliedTo) ? report.appliedTo : [])) {
          if (!ap?.transactionId) continue;
          inReviewByCharge.set(
            ap.transactionId,
            (inReviewByCharge.get(ap.transactionId) || 0) + (Number(ap.amount) || 0)
          );
        }
      }

      const cp = currentPeriodKey();
      debtsCache = debts.map(debt => ({
        id: debt.id,
        description: debt.description || t('paymentReport.debtTypeFallback'),
        voucherNumber: debt.voucherNumber || `Cargo ${debt.id.slice(0, 6)}`,
        fullAmount: Number(debt.pending ?? Transaction.getChargePending(debt)),
        period: debt.period || '',
        isFuture: !!debt.period && debt.period > cp,
        inReview: (inReviewByCharge.get(debt.id) || 0) > 0,
        date: debt.effectiveDate || debt.createdAt
      })).filter(d => d.fullAmount > 0.005)
        .sort((a, b) => (a.period || '').localeCompare(b.period || ''));

      if (debtsCache.length === 0) {
        updateDebtsSummary();
        debtsList.innerHTML = `<div class="info-message"><p>${t('paymentReport.noDebts')}</p></div>`;
        return;
      }

      debtsList.innerHTML = '';
      const currentItems = debtsCache.filter(d => !d.isFuture);
      const futureItems = debtsCache.filter(d => d.isFuture);

      const renderCard = (item, container) => {
        const card = document.createElement('div');
        card.className = 'debt-card';
        card.dataset.debtId = item.id;
        card.innerHTML = `
          <div class="debt-check">
            <div class="icon-slot-sm" data-icon="${item.inReview ? 'clock' : 'circle'}"></div>
          </div>
          <div class="debt-info">
            ${item.period ? `<span class="debt-period">${escapeHtml(item.period)}</span>` : ''}
            <h4 class="debt-desc">${escapeHtml(item.description)}</h4>
            <span class="debt-date">${formatDebtDate(item.date)}</span>
            ${item.inReview ? `<span class="debt-review-badge">${t('paymentReport.inReview')}</span>` : ''}
          </div>
          <div class="debt-amount">
            <span class="currency">$</span>
            <span class="value">${item.fullAmount.toFixed(2)}</span>
            <input class="debt-amount-input hidden" type="number" min="0" max="${item.fullAmount.toFixed(2)}" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${t('paymentReport.amountToApply')}">
            <span class="debt-amount-max hidden">de $${item.fullAmount.toFixed(2)}</span>
          </div>
        `;
        if (item.inReview) {
          card.classList.add('in-review');
          card.setAttribute('aria-disabled', 'true');
        }
        card.addEventListener('click', () => {
          if (item.inReview) return;
          toggleDebt(item);
        });

        const amountField = card.querySelector('.debt-amount-input');
        if (amountField) {
          // El área del importe no debe seleccionar/deseleccionar la tarjeta al
          // hacer clic para editar (el resto de la tarjeta sí).
          const amountWrap = card.querySelector('.debt-amount');
          if (amountWrap) {
            amountWrap.addEventListener('click', (event) => {
              if (selectedDebtIds.has(item.id)) event.stopPropagation();
            });
          }
          amountField.addEventListener('click', (event) => event.stopPropagation());
          amountField.addEventListener('input', () => {
            if (item.inReview) return;
            const raw = parseFloat(amountField.value);
            const others = getSelectedTotal() - (selectedDebtAmounts.get(item.id) || 0);
            // En manual manda el monto total; en automático cada factura puede
            // llegar hasta su propio saldo y el total se recalcula.
            const cap = isManualAmount
              ? Math.min(item.fullAmount, Math.max(0, getPaymentAmount() - others))
              : item.fullAmount;
            const amount = Number.isFinite(raw)
              ? Math.max(0, Math.min(cap, raw))
              : 0;
            selectedDebtAmounts.set(item.id, Math.round(amount * 100) / 100);
            // Editarla a mano la fija: cambiar el monto total no debe pisarla.
            pinnedIds.add(item.id);
            if (!isManualAmount) syncTotalFromAllocations();
            renderDebtCards();
          });
          amountField.addEventListener('blur', () => renderDebtCards());
        }

        debtCardById.set(item.id, card);
        container.appendChild(card);
      };

      const currentContainer = document.createElement('div');
      currentContainer.className = 'debts-grid';
      debtsList.appendChild(currentContainer);
      currentItems.forEach(item => renderCard(item, currentContainer));

      if (futureItems.length > 0) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'debt-future-toggle';
        toggle.textContent = `Mostrar facturas futuras (${futureItems.length})`;
        const futureContainer = document.createElement('div');
        futureContainer.className = 'debts-grid hidden';
        futureItems.forEach(item => renderCard(item, futureContainer));
        toggle.addEventListener('click', () => {
          showFutureDebts = !showFutureDebts;
          futureContainer.classList.toggle('hidden', !showFutureDebts);
          toggle.textContent = showFutureDebts
            ? 'Ocultar facturas futuras'
            : `Mostrar facturas futuras (${futureItems.length})`;
          // Reevaluar la visibilidad individual: en modo manual con el monto ya
          // repartido las tarjetas quedan ocultas hasta que su bloque se abre.
          renderDebtCards();
        });
        debtsList.appendChild(toggle);
        debtsList.appendChild(futureContainer);
      }

      renderDebtCards();
      await handleIcons(debtsList);
    } catch (error) {
      if (token !== debtsLoadToken) return;
      console.error("Error al cargar deudas:", error);
      debtsList.innerHTML = `<p class="error-text">${t('paymentReport.debtsError')}</p>`;
    }
  }

  // Convierte Timestamp de Firestore o Date/string a texto; evita "Invalid Date"
  function formatDebtDate(val) {
    const d = val?.toDate ? val.toDate() : new Date(val || Date.now());
    return (d instanceof Date && !isNaN(d.getTime())) ? d.toLocaleDateString() : '—';
  }

  function renderDebtCards() {
    const fixed = isFixedAmount();
    const paymentAmount = getPaymentAmount();
    const selectedTotal = getSelectedTotal();
    const remaining = fixed ? paymentAmount - selectedTotal : Infinity;

    debtsCache.forEach(item => {
      const card = debtCardById.get(item.id);
      if (!card) return;
      const isSelected = selectedDebtIds.has(item.id);
      // Con monto manual, las facturas sin saldo disponible se ocultan: solo
      // quedan las seleccionadas y las que están en revisión. Si el residente
      // ya fijó importes a mano, se mantienen todas visibles para reasignar.
      // Las futuras se muestran al abrir su bloque aunque no quede saldo.
      const keepAllVisible = pinnedIds.size > 0;
      const show = item.inReview || isSelected || !fixed || keepAllVisible
        || (item.isFuture && showFutureDebts)
        || remaining > 0.005 || paymentAmount <= 0;
      const amount = isSelected ? (selectedDebtAmounts.get(item.id) || 0) : item.fullAmount;

      card.classList.toggle('selected', isSelected);
      card.classList.toggle('partial', isSelected && amount > 0 && amount < item.fullAmount - 0.005);
      const iconEl = card.querySelector('.debt-check .icon-slot-sm');
      if (iconEl) {
        iconEl.setAttribute('data-icon', item.inReview ? 'clock' : (isSelected ? 'check-circle' : 'circle'));
      }

      const valueEl = card.querySelector('.debt-amount .value');
      const inputEl = card.querySelector('.debt-amount-input');
      const maxEl = card.querySelector('.debt-amount-max');
      const editable = isSelected && !item.inReview;

      if (valueEl) {
        valueEl.textContent = `$${item.fullAmount.toFixed(2)}`;
        valueEl.classList.toggle('hidden', editable);
      }
      if (inputEl) {
        inputEl.classList.toggle('hidden', !editable);
        if (editable && document.activeElement !== inputEl) {
          inputEl.value = amount > 0 ? amount.toFixed(2) : '';
        }
      }
      if (maxEl) maxEl.classList.toggle('hidden', !editable);

      card.hidden = !show;
    });

    updateDebtsSummary();
    handleIcons(debtsList);
  }

  function applyAutoAmount() {
    if (isManualAmount) return;
    if (selectedDebtIds.size === 0) {
      selectedDebtAmounts.clear();
      pinnedIds.clear();
      _settingAmount = true;
      amountInput.value = '';
      _settingAmount = false;
      return;
    }
    const next = new Map();
    let total = 0;
    selectedDebtIds.forEach(id => {
      const item = debtsCache.find(d => d.id === id);
      if (!item) return;
      // Respeta lo que el residente editó a mano; el resto va completo.
      const amount = (pinnedIds.has(id) && selectedDebtAmounts.has(id))
        ? selectedDebtAmounts.get(id)
        : item.fullAmount;
      next.set(id, amount);
      total += amount;
    });
    selectedDebtAmounts = next;
    _settingAmount = true;
    amountInput.value = total > 0 ? total.toFixed(2) : '';
    _settingAmount = false;
  }

  function rebalanceSelected() {
    let target = getPaymentAmount();
    const fixedEntries = [];
    const autoEntries = [];
    let fixedTotal = 0;
    let autoTotal = 0;

    selectedDebtIds.forEach(id => {
      const item = debtsCache.find(d => d.id === id);
      if (!item) return;
      const current = Math.max(0, Math.min(item.fullAmount, selectedDebtAmounts.get(id) || 0));
      if (pinnedIds.has(id)) {
        fixedEntries.push({ id, amount: current });
        fixedTotal += current;
      } else {
        autoEntries.push({ id, full: item.fullAmount, amount: current });
        autoTotal += current;
      }
    });

    // El monto no puede quedar por debajo de lo que el residente fijó a mano:
    // se eleva al mínimo y se recortan las facturas automáticas para que lo
    // asignado no supere el total.
    if (target + 0.005 < fixedTotal) {
      target = fixedTotal;
      _settingAmount = true;
      amountInput.value = fixedTotal.toFixed(2);
      _settingAmount = false;
    }

    let diff = Math.round((target - fixedTotal - autoTotal) * 100) / 100;
    if (diff > 0) {
      for (const entry of autoEntries) {
        if (diff <= 0) break;
        const room = entry.full - entry.amount;
        if (room <= 0) continue;
        const add = Math.min(room, diff);
        entry.amount += add;
        diff = Math.round((diff - add) * 100) / 100;
      }
    } else if (diff < 0) {
      let excess = -diff;
      for (let i = autoEntries.length - 1; i >= 0 && excess > 0; i--) {
        const cut = Math.min(autoEntries[i].amount, excess);
        autoEntries[i].amount -= cut;
        excess = Math.round((excess - cut) * 100) / 100;
      }
    }

    selectedDebtAmounts.clear();
    fixedEntries.forEach(entry => selectedDebtAmounts.set(entry.id, entry.amount));
    autoEntries.forEach(entry => selectedDebtAmounts.set(entry.id, entry.amount));
    selectedDebtIds.forEach(id => {
      if (!selectedDebtAmounts.has(id)) selectedDebtAmounts.set(id, 0);
    });
  }

  function toggleDebt(item) {
    if (selectedDebtIds.has(item.id)) {
      selectedDebtIds.delete(item.id);
      selectedDebtAmounts.delete(item.id);
      pinnedIds.delete(item.id);
    } else {
      selectedDebtIds.add(item.id);
    }
    if (!isFixedAmount()) {
      applyAutoAmount();
    } else if (selectedDebtIds.has(item.id)) {
      // Al añadir en modo manual se asigna solo el saldo disponible, sin
      // recolocar los importes que el residente ya había asignado.
      const available = Math.max(0, getPaymentAmount() - getSelectedTotal());
      selectedDebtAmounts.set(item.id, Math.min(item.fullAmount, available));
    }
    renderDebtCards();
  }

  // Listener del monto total
  amountInput.addEventListener('input', () => {
    if (_settingAmount) return;
    isManualAmount = amountInput.value !== '';
    if (debtsCache.length > 0) {
      rebalanceSelected();
      renderDebtCards();
    } else {
      updateDebtsSummary();
    }
  });

  // --- Gestión de Archivos ---
  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert(t('paymentReport.invalidImage'));
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      filePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  };

  uploadZone.onclick = () => fileInput.click();
  fileInput.onchange = (e) => handleFile(e.target.files[0]);
  
  btnRemoveFile.onclick = (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    previewImg.src = '';
  };

  // --- Envío del Formulario ---
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert(t('paymentReport.requiredReceipt'));
      return;
    }
    if (!currentPropertyId) {
      alert(t('paymentReport.requiredProperty'));
      return;
    }

    const reportedAmount = parseFloat(amountInput.value);
    if (!Number.isFinite(reportedAmount) || reportedAmount <= 0) {
      alert(t('paymentReport.requiredAmount'));
      return;
    }
    const blocked = debtsCache.filter(item => item.inReview && selectedDebtIds.has(item.id));
    if (blocked.length > 0) {
      alert(t('paymentReport.inReviewError'));
      return;
    }

    // El desglose se calcula ANTES de subir la imagen: si algo no cuadra, no se
    // gasta una subida a R2 ni se crea un reporte a medias.
    const appliedTo = [];
    selectedDebtIds.forEach(id => {
      const item = debtsCache.find(d => d.id === id);
      if (!item) return;
      const raw = Number(selectedDebtAmounts.get(id)) || 0;
      const amount = Math.round(Math.max(0, Math.min(item.fullAmount, raw)) * 100) / 100;
      if (amount > 0) {
        appliedTo.push({ transactionId: id, amount, description: item.description });
      }
    });
    const appliedTotal = Math.round(appliedTo.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;
    if (appliedTotal > reportedAmount + 0.005) {
      alert(t('paymentReport.allocationExceeds'));
      return;
    }
    const remainingToApply = Math.max(0, Math.round((reportedAmount - appliedTotal) * 100) / 100);

    const submitBtn = document.getElementById('btn-submit-report');
    submitBtn.disabled = true;
    submitBtn.innerHTML = t('paymentReport.sending');

    try {
      // 1. Subir Imagen
      const { blob, ext } = await compressImageFile(selectedFile);
      const key = buildPropertyUploadKey(currentPropertyId, user.uid, 'comprobante', ext);
      const downloadUrl = await uploadFileToR2(blob, key);

      // 2. Crear Notificación con el desglose ya validado
      const reportData = {
        propertyId: currentPropertyId,
        residentUid: user.uid,
        amount: reportedAmount,
        paymentDate: dateInput.value,
        reportDate: serverTimestamp(),
        status: 'pending_verification',
        receiptUrl: downloadUrl,
        appliedTo: appliedTo,
        excessAmount: Math.max(0, remainingToApply),
        paymentMethod: document.getElementById('paymentMethod').value || 'transfer',
        incomeTypeId: incomeTypeSelect?.value || null,
        notes: document.getElementById('notes').value || '',
        residentName: user.displayName || user.email
      };

      // 3. Registrar Notificación y Actividad de forma atómica
      await PaymentNotification.create(reportData, { 
        id: user.uid, 
        name: user.displayName, 
        email: user.email 
      });

      showModal(t('paymentReport.successTitle'), t('paymentReport.successMessage'), "check-circle");
      form.reset();
      // `form.reset()` borra la fecha porque el input no tiene value por defecto.
      dateInput.value = localToday();
      btnRemoveFile.click();
      // El reporte recién creado debe verse como "En revisión" en la próxima carga.
      pendingReportsPromise = null;
      loadDebts(currentPropertyId);
      loadPendingNotice();

    } catch (error) {
      console.error("Error al enviar reporte:", error);
      // Los errores de validación del modelo traen un mensaje apto para el usuario
      // (factura ya en revisión, saldo insuficiente...). El resto va genérico.
      showModal(
        t('paymentReport.errorTitle'),
        error?.friendly && error.message ? error.message : t('paymentReport.errorMessage'),
        "x-circle"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<div class="icon-slot-sm" data-icon="send"></div> ${t('paymentReport.submit')}`;
      await handleIcons();
    }
  };

  // --- UI Helpers ---
  const showModal = (title, message, icon) => {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    const iconEl = document.getElementById('modal-icon');
    iconEl.setAttribute('data-icon', icon);
    handleIcons(iconEl);
    statusModal.classList.remove('hidden');
  };

  btnModalClose.onclick = () => statusModal.classList.add('hidden');

  async function handleIcons(container = document) {
    try {
      if (!iconsPromise) {
        iconsPromise = fetch('/src/img/icons.json')
          .then(response => response.json())
          .catch(() => ({ icons: [] }));
      }
      const data = await iconsPromise;
      container.querySelectorAll('[data-icon]').forEach(el => {
        const iconData = data.icons.find(i => i.name === el.dataset.icon);
        if (iconData) el.innerHTML = iconData.svg;
      });
    } catch (e) {}
  }

  await handleIcons();
}

