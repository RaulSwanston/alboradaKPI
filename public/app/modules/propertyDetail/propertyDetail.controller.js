import Property from "../../models/Property.js";
import Transaction from "../../models/Transaction.js";
import { appConfig } from "../../core/appConfig.js";
import { getAuthObjectURL } from "../../core/r2.js";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { injectIcons } from "../../utils/icons.js";

/**
 * propertyDetail.controller.js
 * Gestiona el "Estado de Cuenta" detallado de una propiedad.
 */
export default async function propertyDetailController(contexto) {
  const propertyId = contexto?.params?.id || contexto?.data?.activePropertyId;
  if (!propertyId) return;

  // --- ESTADO LOCAL ---
  let allMovements = [];
  let currentPropData = null;
  let totalBalance = 0;
  let state = { pagination: { current: 1, perPage: 10 } };

  // --- Referencias al DOM ---
  const getEl = (id) => document.getElementById(id);
  const listContainer = getEl('movements-list-container');
  const paginationContainer = document.querySelector('.pagination');
  const btnDownloadPdf = getEl('btn-download-pdf');

  // --- Nombre del condominio (configurable desde configManager → appConfig) ---
  const brandName = contexto?.data?.appConfig?.branding?.appName || appConfig.branding.appName;

  // --- Helpers de Formateo ---
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return '---';
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return isNaN(date.getTime()) ? '---' : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  /**
   * Filtro de vigencia: oculta facturas (cargos, amount < 0) de periodos FUTUROS
   * que aún no han sido pagadas (pendingAmount > 0). Las facturas pre-pagadas se
   * conservan para mantener la reconciliación (paidBy/appliedTo) y el saldo.
   * @param {Object} t - Transacción
   * @returns {boolean} true si el movimiento NO debe mostrarse.
   */
  const isHiddenFutureCharge = (t) => {
    if ((t.amount || 0) >= 0) return false;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const pending = t.pendingAmount !== undefined ? t.pendingAmount : Math.abs(t.amount || 0);
    return pending > 0 && t.period && t.period > currentPeriod;
  };

  /**
   * Carga el logo del condominio (branding.logoUrl) y lo convierte a PNG
   * vía canvas (soporta SVG por defecto y PNG/JPG subidos a R2).
   * @returns {Promise<{dataUrl:string, w:number, h:number}|null>}
   */
  const buildLogoDataURL = async () => {
    const refUrl = contexto?.data?.appConfig?.branding?.logoUrl || appConfig.branding.logoUrl;
    if (!refUrl) return null;
    try {
      const url = await getAuthObjectURL(refUrl);
      if (!url) return null;
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const w = img.naturalWidth || 300;
      const h = img.naturalHeight || 150;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      return { dataUrl: canvas.toDataURL('image/png'), w, h };
    } catch (err) {
      console.warn('[PDF] Logo no disponible:', err);
      return null;
    }
  };

  /**
   * Genera el PDF del Estado de Cuenta
   */
  const generatePDF = async () => {
    if (!allMovements.length || !currentPropData) return;
    try {
      const doc = new jsPDF();
      const margin = 20;
      const logo = await buildLogoDataURL();
      let y = 16;
      if (logo) {
        const logoW = 56, logoH = 25;
        doc.addImage(logo.dataUrl, 'PNG', margin, y, logoW, logoH);
        y += logoH + 5;
      } else {
        y = 20;
      }

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("ESTADO DE CUENTA", margin, y);
      doc.setFontSize(10);
      doc.text(brandName, 190, y, { align: "right" });
      
      y += 15;
      doc.setFontSize(12);
      doc.text(`Unidad: ${currentPropData.id}`, margin, y);
      doc.text(`Titular: ${currentPropData.ownerInfo?.name || 'No registrado'}`, 190, y, { align: "right" });
      
      y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, margin, y);
      doc.text(`Saldo: ${formatCurrency(totalBalance)} USD`, 190, y, { align: "right" });

      y += 15;
      const cargoWidth = 20;
      const cargoCenter = margin + 118;
      const abonoWidth = 20;
      const abonoCenter = margin + 138;
      const drawHeader = (hy) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setFillColor(246, 245, 239);
        doc.rect(margin, hy, 170, 8, 'F');
        doc.text("Fecha", margin + 11, hy + 6, { align: "center" });
        doc.text("Descripción", margin + 24, hy + 6);
        doc.text("Cargo", cargoCenter, hy + 6, { align: "center" });
        doc.text("Abono", abonoCenter, hy + 6, { align: "center" });
        doc.text("Saldo", margin + 168, hy + 6, { align: "right" });
      };
      drawHeader(y);
      
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      const lineH = 4;
      const descX = margin + 24;
      const descWidth = 84;
      const saldoRight = margin + 168;

      allMovements.forEach((t) => {
        const isPayment = (t.amount || 0) > 0;
        const descLines = doc.splitTextToSize(t.description || 'Movimiento', descWidth);
        const rowH = descLines.length * lineH + 3;
        if (y + rowH > 280) {
          doc.addPage();
          y = 20;
          drawHeader(y);
          y += 12;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
        }

doc.text(formatDate(t.effectiveDate), margin + 2, y);
        descLines.forEach((line, i) => doc.text(line, descX, y + i * lineH));
        doc.text(!isPayment ? `-${Math.abs(t.amount).toFixed(2)}` : "", cargoCenter, y, { align: "center" });
        doc.setTextColor(25, 124, 64);
        doc.text(isPayment ? `+${Math.abs(t.amount).toFixed(2)}` : "", abonoCenter, y, { align: "center" });
        doc.setTextColor(0, 0, 0);
        doc.text(`${t.currentBalance.toFixed(2)}`, margin + 168, y, { align: "right" });
        y += rowH;
      });

      // Abrir en nueva pestaña para vista previa
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
    } catch (err) { console.error("Error PDF:", err); }
  };

  const renderTable = () => {
    if (!listContainer) return;
    const start = (state.pagination.current - 1) * state.pagination.perPage;
    const items = allMovements.slice(start, start + state.pagination.perPage);

    listContainer.innerHTML = items.map(t => {
      const isPayment = (t.amount || 0) > 0;
      let reference = t.voucherNumber || t.metadata?.bankReference || '';
      if (reference.toUpperCase() === 'S/N' || reference.toUpperCase() === 'SN') reference = '';

      return `
        <tr class="${isPayment ? 'bg-highlight' : ''}">
          <td>${formatDate(t.effectiveDate)}</td>
          <td>
            <div class="concept-cell">
              <span class="concept-main">${t.description || 'Movimiento'}</span>
              <span class="concept-sub">${t.type === 'FEE' ? 'Cuota Ordinaria' : brandName}</span>
              ${(t.paidBy?.length || t.appliedTo?.length) ? `
                <div class="recon-indicator">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                  <span>${isPayment ? 'Aplicado a deudas' : 'Pagado con recibos'}</span>
                </div>
              ` : ''}
            </div>
          </td>
          <td>
            ${reference ? `<span class="ref-badge ${isPayment ? 'payment' : ''}">${reference}</span>` : ''}
          </td>
          <td class="text-right font-bold ${!isPayment ? 'text-error' : ''}">${!isPayment ? `-$${Math.abs(t.amount).toFixed(2)}` : ''}</td>
          <td class="text-right font-bold ${isPayment ? 'text-success' : ''}">${isPayment ? `+$${Math.abs(t.amount).toFixed(2)}` : ''}</td>
          <td class="text-right font-bold">${formatCurrency(t.currentBalance)}</td>
        </tr>
      `;
    }).join('');

    renderPagination();
  };

  const renderPagination = () => {
    if (!paginationContainer) return;
    const pages = Math.ceil(allMovements.length / state.pagination.perPage);
    if (pages <= 1) { paginationContainer.innerHTML = ''; return; }

    let html = `<button class="btn-pagination ${state.pagination.current === 1 ? 'disabled' : ''}" data-page="${state.pagination.current - 1}"><svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"/></svg></button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="btn-pagination ${state.pagination.current === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="btn-pagination ${state.pagination.current === pages ? 'disabled' : ''}" data-page="${state.pagination.current + 1}"><svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"/></svg></button>`;
    
    paginationContainer.innerHTML = html;
    paginationContainer.querySelectorAll('.btn-pagination:not(.disabled)').forEach(btn => {
      btn.onclick = (e) => { state.pagination.current = parseInt(e.currentTarget.dataset.page); renderTable(); };
    });
  };

  // --- CARGA INICIAL ---
  try {
    if (listContainer) listContainer.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';
    const [prop, transactions] = await Promise.all([Property.getById(propertyId), Transaction.getByPropertyId(propertyId)]);
    
    if (prop) {
      currentPropData = prop;
      if (getEl('detail-property-id')) getEl('detail-property-id').textContent = `Unidad ${prop.id}`;
      if (getEl('detail-property-owner')) getEl('detail-property-owner').textContent = prop.ownerInfo?.name || 'No registrado';
      if (getEl('detail-property-address')) getEl('detail-property-address').textContent = prop.address?.street || prop.address?.Street || brandName;
      if (getEl('detail-property-phone')) getEl('detail-property-phone').textContent = prop.ownerInfo?.mobile || 'Sin teléfono';
    }

    const visible = transactions.filter(t => !isHiddenFutureCharge(t));
    const sorted = [...visible].sort((a, b) => (a.effectiveDate?.seconds || 0) - (b.effectiveDate?.seconds || 0));
    let running = 0;
    allMovements = sorted.map(t => { running -= (Number(t.amount) || 0); return { ...t, currentBalance: running }; }).reverse();
    totalBalance = allMovements.length > 0 ? allMovements[0].currentBalance : 0;

    // Actualizar contador de transacciones
    const transactionsCountEl = getEl('detail-transactions-count');
    if (transactionsCountEl) {
      transactionsCountEl.innerHTML = `Mostrando <span class="count-value">${allMovements.length}</span> transacciones`;
    }

    if (getEl('detail-property-balance')) getEl('detail-property-balance').textContent = formatCurrency(totalBalance);
    
    // --- ACTUALIZACIÓN DE ESTADO Y ÚLTIMO PAGO ---
    const statusBadgeEl = getEl('detail-property-status-badge');
    const statusContainerEl = getEl('detail-property-status-container');
    const statusIconEl = getEl('detail-property-status-icon');
    const lastPaymentAmountEl = getEl('detail-last-payment-amount');
    const lastPaymentDateEl = getEl('detail-last-payment-date');

    // 1. Estado de Cuenta
    if (statusBadgeEl && statusContainerEl) {
      if (totalBalance > 0.01) {
        statusBadgeEl.textContent = 'Pendiente de pago';
        statusContainerEl.className = 'status-indicator status-debt';
        if (statusIconEl) statusIconEl.setAttribute('data-icon', 'x-circle');
      } else if (totalBalance < -0.01) {
        statusBadgeEl.textContent = 'Saldo a favor';
        statusContainerEl.className = 'status-indicator status-credit';
        if (statusIconEl) statusIconEl.setAttribute('data-icon', 'plus-circle');
      } else {
        statusBadgeEl.textContent = 'Cuenta al día';
        statusContainerEl.className = 'status-indicator status-ok';
        if (statusIconEl) statusIconEl.setAttribute('data-icon', 'check-circle');
      }
    }

    // 2. Último Pago
    const lastPayment = transactions.filter(t => t.amount > 0).sort((a, b) => {
      const dateA = a.effectiveDate?.seconds || 0;
      const dateB = b.effectiveDate?.seconds || 0;
      return dateB - dateA;
    })[0];

    if (lastPayment) {
      if (lastPaymentAmountEl) lastPaymentAmountEl.textContent = formatCurrency(lastPayment.amount);
      if (lastPaymentDateEl) lastPaymentDateEl.textContent = `Realizado el ${formatDate(lastPayment.effectiveDate)}`;
    }

    // 3. Reinyectar iconos para asegurar visibilidad (acotado a este módulo)
    const handleIcons = async (container = document) => {
      await injectIcons(container);
    };

    const moduleContainer = document.querySelector('.property-detail-wrapper') || document;
    await handleIcons(moduleContainer);
    
    if (btnDownloadPdf) btnDownloadPdf.onclick = generatePDF;

    renderTable();
  } catch (error) {
    console.error("Error Fatal:", error);
    if (listContainer) listContainer.innerHTML = '<tr><td colspan="6">Error al cargar datos.</td></tr>';
  }
}