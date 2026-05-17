import { db, storage, collection, addDoc, serverTimestamp, ref, uploadBytes, getDownloadURL } from "../../core/firebase.js";
import User from "../../models/User.js";
import Property from "../../models/Property.js";

/**
 * paymentReport.controller.js
 * Gestiona la lógica de reporte de pagos por parte del residente.
 */
export default async function paymentReportController(contexto) {
  const user = contexto?.data?.user;
  if (!user) return;

  // --- Referencias al DOM ---
  const form = document.getElementById('payment-report-form');
  const propertySelect = document.getElementById('propertyId');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('receipt-file');
  const filePreview = document.getElementById('file-preview');
  const previewImg = document.getElementById('preview-img');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const statusModal = document.getElementById('status-modal');
  const btnModalClose = document.getElementById('btn-modal-close');

  let selectedFile = null;

  // --- Inicialización: Cargar Propiedades del Usuario ---
  try {
    // Obtenemos los propertyIds del perfil del usuario
    const userProfile = await User.getById(user.uid);
    const propertyIds = userProfile?.propertyIds || [];

    if (propertyIds.length === 0) {
      propertySelect.innerHTML = '<option value="" disabled>No tienes propiedades asociadas</option>';
    } else {
      // Cargamos los nombres de las propiedades
      const props = await Promise.all(propertyIds.map(id => Property.getById(id)));
      propertySelect.innerHTML = '<option value="" disabled selected>Selecciona una propiedad</option>' + 
        props.map(p => `<option value="${p.id}">${p.name || `Unidad ${p.id}`} (${p.id})</option>`).join('');
    }
  } catch (error) {
    console.error("Error al cargar propiedades:", error);
  }

  // --- Gestión de Archivos (Subida / Vista Previa) ---
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

    const submitBtn = document.getElementById('btn-submit-report');
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Enviando...';

    try {
      // 1. Subir Imagen a Firebase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `comprobantes_pagos/${user.uid}_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, fileName);
      
      const uploadResult = await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Crear documento en Firestore (paymentNotifications)
      const formData = new FormData(form);
      const reportData = {
        propertyId: formData.get('propertyId'),
        amount: parseFloat(formData.get('amount')),
        paymentDate: formData.get('paymentDate'),
        reportDate: serverTimestamp(),
        status: 'pending_verification',
        receiptUrl: downloadUrl,
        notes: formData.get('notes') || '',
        residentUid: user.uid,
        residentName: user.displayName || user.email
      };

      await addDoc(collection(db, "paymentNotifications"), reportData);

      // 3. Mostrar Éxito
      showModal("¡Éxito!", "Tu pago ha sido reportado y está pendiente de verificación.", "check-circle");
      form.reset();
      btnRemoveFile.click();

    } catch (error) {
      console.error("Error al reportar pago:", error);
      showModal("Error", "No se pudo enviar el reporte. Por favor, intenta de nuevo.", "x-circle");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<div class="icon-slot-sm" data-icon="send"></div> Enviar Reporte';
      await handleIcons(); // Re-inyectar icono del botón
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

  const handleIcons = async (container = document) => {
    try {
      const response = await fetch('/src/img/icons.json');
      const data = await response.json();
      const inject = (c, iconName) => {
        const iconData = data.icons.find(i => i.name === iconName);
        if (iconData && c) c.innerHTML = iconData.svg;
      };
      container.querySelectorAll('[data-icon]').forEach(el => inject(el, el.dataset.icon));
    } catch (e) {}
  };

  await handleIcons();
}
