import { db, storage, serverTimestamp, ref, uploadBytes, getDownloadURL, query, where, getDocs, orderBy } from "../../core/firebase.js";
import User from "../../models/User.js";
import Property from "../../models/Property.js";
import Transaction from "../../models/Transaction.js";
import PaymentNotification from "../../models/PaymentNotification.js";

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
  const amountInput = document.getElementById('amount');
  const dateInput = document.getElementById('paymentDate');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('receipt-file');
  const filePreview = document.getElementById('file-preview');
  const previewImg = document.getElementById('preview-img');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const statusModal = document.getElementById('status-modal');
  const btnModalClose = document.getElementById('btn-modal-close');

  let selectedFile = null;
  let currentPropertyId = null;
  let pendingDebts = [];
  let selectedDebtIds = new Set();

  // --- Inicialización ---
  dateInput.value = new Date().toISOString().split('T')[0]; // Fecha de hoy por defecto

  try {
    const userProfile = await User.getById(user.uid);
    const propertyIds = userProfile?.propertyIds || [];

    if (propertyIds.length === 0) {
      debtsList.innerHTML = '<div class="info-message"><p>No tienes unidades vinculadas. Contacta al administrador.</p></div>';
    } else {
      if (propertyIds.length > 1 || userProfile.role === 'admin') {
        propertyContainer.classList.remove('hidden');
        const props = await Promise.all(propertyIds.map(id => Property.getById(id)));
        propertySelect.innerHTML = '<option value="" disabled selected>Selecciona una unidad</option>' + 
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

  // --- Carga de Deudas Pendientes ---
  async function loadDebts(propertyId) {
    currentPropertyId = propertyId;
    debtsList.innerHTML = '<div class="loading-state"><p>Buscando cargos pendientes...</p></div>';
    selectedDebtIds.clear();
    updateTotalAmount();

    try {
      pendingDebts = await Transaction.getPendingDebts(propertyId);
      renderDebts();
    } catch (error) {
      console.error("Error al cargar deudas:", error);
      debtsList.innerHTML = '<p class="error-text">No se pudieron cargar las deudas.</p>';
    }
  }

  function renderDebts() {
    if (pendingDebts.length === 0) {
      debtsList.innerHTML = '<div class="info-message"><p>No tienes deudas pendientes. Tu cuenta está al día.</p></div>';
      return;
    }

    debtsList.innerHTML = pendingDebts.map(debt => `
      <div class="debt-card ${selectedDebtIds.has(debt.id) ? 'selected' : ''}" data-id="${debt.id}">
        <div class="debt-check">
          <div class="icon-slot-sm" data-icon="${selectedDebtIds.has(debt.id) ? 'check-circle' : 'circle'}"></div>
        </div>
        <div class="debt-info">
          <span class="debt-type type-${debt.type?.toLowerCase() || 'fee'}">${debt.type || 'CARGO'}</span>
          <h4 class="debt-desc">${debt.description}</h4>
          <span class="debt-date">${new Date(debt.effectiveDate || debt.createdAt?.toDate?.() || Date.now()).toLocaleDateString()}</span>
        </div>
        <div class="debt-amount">
          <span class="currency">$</span>
          <span class="value">${debt.pending.toFixed(2)}</span>
        </div>
      </div>
    `).join('');

    // Eventos de selección
    debtsList.querySelectorAll('.debt-card').forEach(card => {
      card.onclick = () => {
        const id = card.dataset.id;
        if (selectedDebtIds.has(id)) selectedDebtIds.delete(id);
        else selectedDebtIds.add(id);
        renderDebts();
        updateTotalAmount();
      };
    });
    handleIcons(debtsList);
  }

  function updateTotalAmount() {
    let total = 0;
    pendingDebts.forEach(d => {
      if (selectedDebtIds.has(d.id)) total += d.pending;
    });
    amountInput.value = total > 0 ? total.toFixed(2) : '';
  }

  // --- Gestión de Archivos ---
  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert("Por favor, selecciona una imagen válida.");
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
      alert("Es obligatorio adjuntar el comprobante de pago.");
      return;
    }
    if (!currentPropertyId) {
      alert("Por favor, selecciona una unidad.");
      return;
    }

    const submitBtn = document.getElementById('btn-submit-report');
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Enviando Reporte...';

    try {
      // 1. Subir Imagen
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `comprobantes_pagos/${user.uid}_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, fileName);
      const uploadResult = await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Preparar Desglose (appliedTo)
      const reportedAmount = parseFloat(amountInput.value);
      let remainingToApply = reportedAmount;
      const appliedTo = [];

      pendingDebts.forEach(debt => {
        if (selectedDebtIds.has(debt.id)) {
          const apply = Math.min(remainingToApply, debt.pending);
          if (apply > 0) {
            appliedTo.push({ transactionId: debt.id, amount: apply, description: debt.description });
            remainingToApply -= apply;
          }
        }
      });

      // 3. Crear Notificación
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
        notes: document.getElementById('notes').value || '',
        residentName: user.displayName || user.email
      };

      // 3. Registrar Notificación y Actividad de forma atómica
      await PaymentNotification.create(reportData, { 
        id: user.uid, 
        name: user.displayName, 
        email: user.email 
      });

      showModal("¡Reporte Enviado!", "Tu pago ha sido registrado y el administrador ha sido notificado para su verificación.", "check-circle");
      form.reset();
      btnRemoveFile.click();
      loadDebts(currentPropertyId);

    } catch (error) {
      console.error("Error al enviar reporte:", error);
      showModal("Error", "No se pudo enviar el reporte. Por favor, intenta de nuevo.", "x-circle");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<div class="icon-slot-sm" data-icon="send"></div> Enviar Reporte de Pago';
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
      const response = await fetch('/src/img/icons.json');
      const data = await response.json();
      container.querySelectorAll('[data-icon]').forEach(el => {
        const iconData = data.icons.find(i => i.name === el.dataset.icon);
        if (iconData) el.innerHTML = iconData.svg;
      });
    } catch (e) {}
  }

  await handleIcons();
}

