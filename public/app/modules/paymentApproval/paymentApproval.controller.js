import PaymentNotification from "../../models/PaymentNotification.js";
import { activeIncomeTypes } from '../../core/incomeTypes.js';
import { t } from '../../core/i18n.js';
import { getAuthObjectURL } from '../../core/r2.js';

export default async function paymentApprovalController(contexto) {
  const user = contexto?.data?.user;
  if (!user) return;

  const listEl = document.getElementById('approval-list');
  const emptyEl = document.getElementById('approval-empty');
  const countEl = document.getElementById('pending-count');
  const rejectModal = document.getElementById('rejection-modal');
  const rejectReason = document.getElementById('rejection-reason');
  const btnRejectCancel = document.getElementById('btn-reject-cancel');
  const btnRejectConfirm = document.getElementById('btn-reject-confirm');
  let currentReportId = null;
  let currentReports = [];

  // El motivo es opcional; el placeholder no puede venir por `::i18n` en un
  // atributo (Mosaic no procesa atributos), así que se asigna desde JS.
  if (rejectReason) rejectReason.placeholder = t('paymentApproval.rejectPlaceholder');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);

  const parseDate = (value) => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (typeof value === 'string') {
      const onlyDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (onlyDate) return new Date(Number(onlyDate[1]), Number(onlyDate[2]) - 1, Number(onlyDate[3]), 12, 0, 0);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (timestamp) => {
    const date = parseDate(timestamp);
    if (!date) return '—';
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (timestamp) => {
    const date = parseDate(timestamp);
    if (!date) return '';
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Mapa de labels de método de pago desde appConfig (fuente única) + legacy en mayúscula
  const paymentMethods = contexto?.data?.appConfig?.moduleRegistry?.transactions?.paymentMethods || [];
  const paymentMethodLabels = Object.fromEntries(paymentMethods.map(m => [m.id, m.label]));
  const legacyPaymentMap = {
    'TRANSFER': 'transfer', 'ACH': 'deposit', 'YAPPY': 'yappy', 'CASH': 'cash',
    'CHECK': 'check', 'CARD': 'card', 'DEPOSIT': 'deposit', 'OTHER': 'other'
  };

  // Catálogo de tipos de ingreso, para que el admin confirme o corrija en un solo
  // clic lo que declaró el residente. Si el reporte no trae tipo (los anteriores a
  // este campo), se ofrece "Sin especificar" y aprobar no inventa nada: la lectura
  // lo deduce sola con `resolveIncomeTypeId()`.
  const incomeTypeOptions = (selectedId) => {
    const options = activeIncomeTypes().map(x =>
      `<option value="${x.id}"${x.id === selectedId ? ' selected' : ''}>${x.name}</option>`
    ).join('');
    const blank = `<option value=""${selectedId ? '' : ' selected'}>${t('paymentApproval.incomeTypeUnspecified')}</option>`;
    return blank + options;
  };

  const loadPending = async () => {
    try {
      listEl.innerHTML = `<div class="loading-state"><p>${t('paymentApproval.loading')}</p></div>`;

      const reports = await PaymentNotification.getPending();
      currentReports = reports;

      if (reports.length === 0) {
        listEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        countEl.textContent = '';
        return;
      }

      listEl.classList.remove('hidden');
      emptyEl.classList.add('hidden');
      countEl.textContent = reports.length;

      listEl.innerHTML = reports.map(report => `
        <div class="approval-card" data-id="${report.id}">
          <div class="approval-card-header">
            <div class="approval-resident">
              <div class="approval-avatar">${escapeHtml((report.residentName || '?')[0].toUpperCase())}</div>
              <div>
                <span class="approval-resident-name">${escapeHtml(report.residentName || '—')}</span>
                <span class="approval-property">${t('paymentApproval.unit')} ${escapeHtml(report.propertyId || '—')}</span>
              </div>
            </div>
            <span class="approval-amount">${formatCurrency(report.amount)}</span>
          </div>

          <div class="approval-card-body">
            <div class="approval-detail-grid">
              <div class="approval-detail-item">
                <span class="approval-label">${t('paymentApproval.paymentDate')}</span>
                <span class="approval-value">${formatDate(report.paymentDate)}</span>
              </div>
              <div class="approval-detail-item">
                <span class="approval-label">${t('paymentApproval.reportedDate')}</span>
                <span class="approval-value">${formatDateTime(report.reportDate)}</span>
              </div>
              <div class="approval-detail-item">
                <span class="approval-label">${t('paymentApproval.paymentMethod')}</span>
                <span class="approval-value">${escapeHtml(paymentMethodLabels[report.paymentMethod] || paymentMethodLabels[legacyPaymentMap[report.paymentMethod]] || report.paymentMethod || '—')}</span>
              </div>
              <div class="approval-detail-item">
                <span class="approval-label">${t('paymentApproval.incomeType')}</span>
                <select class="income-type-override" data-id="${report.id}">${incomeTypeOptions(report.incomeTypeId)}</select>
                <p class="approval-hint">${t('paymentApproval.incomeTypeHint')}</p>
              </div>
            </div>
            ${report.notes ? `
            <div class="approval-detail-item">
              <span class="approval-label">${t('paymentApproval.notes')}</span>
              <span class="approval-value">${escapeHtml(report.notes)}</span>
            </div>` : ''}
            ${report.appliedTo?.length ? `
            <details class="approval-applied">
              <summary class="approval-applied-summary">${t('paymentApproval.appliedTo')}</summary>
              ${report.appliedTo.map(a => `
                <div class="approval-applied-row">
                  <span>${escapeHtml(a.description || a.transactionId)}</span>
                  <span>${formatCurrency(a.amount)}</span>
                </div>
              `).join('')}
              ${report.excessAmount > 0 ? `
              <div class="approval-applied-row approval-excess">
                <span>${t('paymentApproval.excess')}</span>
                <span>${formatCurrency(report.excessAmount)}</span>
              </div>` : ''}
            </details>` : ''}
          </div>

          <div class="approval-card-actions">
            <button class="btn-receipt" data-url="${escapeHtml(report.receiptUrl || '')}">
              <div class="icon-slot-sm" data-icon="eye"></div>
              ${t('paymentApproval.viewReceipt')}
            </button>
            <div class="approval-buttons">
              <button class="btn-approve" data-id="${report.id}">
                <div class="icon-slot-sm" data-icon="check-circle"></div>
                ${t('paymentApproval.approve')}
              </button>
              <button class="btn-reject" data-id="${report.id}">
                <div class="icon-slot-sm" data-icon="x-circle"></div>
                ${t('paymentApproval.reject')}
              </button>
            </div>
          </div>
        </div>
      `).join('');

      await handleIcons(listEl);
      bindActions();
    } catch (error) {
      console.error("Error al cargar pendientes:", error);
      listEl.innerHTML = `<p class="error-text">${t('paymentApproval.error')}</p>`;
    }
  };

  const bindActions = () => {
    // Ver comprobante
    listEl.querySelectorAll('.btn-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (!url) return;
        const win = window.open('', '_blank');
        if (!win) return;
        getAuthObjectURL(url).then((blobUrl) => {
          win.location = blobUrl;
        }).catch(() => {
          win.close();
          console.error('No se pudo cargar el comprobante');
        });
      });
    });

    // Aprobar
    listEl.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const report = currentReports.find(r => r.id === id);
        if (!report) return;

        const confirmed = confirm(t('paymentApproval.confirmApprove', {
          amount: formatCurrency(report.amount),
          property: report.propertyId || '—'
        }));
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerHTML = `<div class="icon-slot-sm" data-icon="loader"></div>`;

        try {
          // Si el admin dejó el tipo en "Sin especificar", no mandamos override:
          // se conserva lo que declaró el residente, o null si no declaró nada.
          const incomeTypeSelect = listEl.querySelector(`.income-type-override[data-id="${id}"]`);
          const overrides = incomeTypeSelect && incomeTypeSelect.value
            ? { incomeTypeId: incomeTypeSelect.value }
            : {};
          const result = await PaymentNotification.approve(
            id,
            { uid: user.uid, name: user.displayName || user.email },
            overrides
          );
          alert(t('paymentApproval.approveSuccess', { voucher: result.voucherNumber }));
          await loadPending();
        } catch (error) {
          console.error("Error al aprobar:", error);
          alert(t('paymentApproval.approveError', { message: error?.message || '' }));
          btn.disabled = false;
          btn.innerHTML = `<div class="icon-slot-sm" data-icon="check-circle"></div> ${t('paymentApproval.approve')}`;
          await handleIcons(btn);
        }
      });
    });

    // Rechazar (abre modal)
    listEl.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        currentReportId = btn.dataset.id;
        rejectReason.value = '';
        rejectReason.classList.remove('input-error');
        rejectModal.classList.remove('hidden');
      });
    });
  };

  btnRejectCancel.addEventListener('click', () => {
    rejectModal.classList.add('hidden');
    currentReportId = null;
  });

  btnRejectConfirm.addEventListener('click', async () => {
    // El motivo es OPCIONAL: el administrador puede rechazar sin explicar.
    const reason = rejectReason.value.trim();
    rejectReason.classList.remove('input-error');
    btnRejectConfirm.disabled = true;
    btnRejectConfirm.textContent = '...';
    try {
      await PaymentNotification.reject(
        currentReportId,
        reason,
        { uid: user.uid, name: user.displayName || user.email }
      );
      rejectModal.classList.add('hidden');
      currentReportId = null;
      await loadPending();
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert(t('paymentApproval.rejectError', { message: error?.message || '' }));
    } finally {
      btnRejectConfirm.disabled = false;
      btnRejectConfirm.innerHTML = t('paymentApproval.confirmReject');
    }
  });

  rejectReason.addEventListener('input', () => rejectReason.classList.remove('input-error'));

  async function handleIcons(container) {
    try {
      const resp = await fetch('/src/img/icons.json');
      const data = await resp.json();
      container.querySelectorAll('[data-icon]').forEach(el => {
        const iconData = data.icons.find(i => i.name === el.dataset.icon);
        if (iconData) el.innerHTML = iconData.svg;
      });
    } catch (e) {}
  }

  await loadPending();
}
