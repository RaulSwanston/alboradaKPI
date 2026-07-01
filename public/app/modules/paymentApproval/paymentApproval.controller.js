import PaymentNotification from "../../models/PaymentNotification.js";
import { t } from '../../core/i18n.js';

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

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const loadPending = async () => {
    try {
      listEl.innerHTML = `<div class="loading-state"><p>${t('paymentApproval.loading')}</p></div>`;

      const reports = await PaymentNotification.getPending();

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
              <div class="approval-avatar">${(report.residentName || '?')[0].toUpperCase()}</div>
              <div>
                <span class="approval-resident-name">${report.residentName || '—'}</span>
                <span class="approval-property">${t('paymentApproval.unit')} ${report.propertyId || '—'}</span>
              </div>
            </div>
            <span class="approval-amount">${formatCurrency(report.amount)}</span>
          </div>

          <div class="approval-card-body">
            <div class="approval-detail-grid">
              <div class="approval-detail-item">
                <span class="approval-label"><!-- ::i18n.paymentApproval.paymentDate --></span>
                <span class="approval-value">${report.paymentDate || '—'}</span>
              </div>
              <div class="approval-detail-item">
                <span class="approval-label"><!-- ::i18n.paymentApproval.reportedDate --></span>
                <span class="approval-value">${formatDate(report.reportDate)}</span>
              </div>
            </div>
            ${report.notes ? `
            <div class="approval-detail-item">
              <span class="approval-label"><!-- ::i18n.paymentApproval.notes --></span>
              <span class="approval-value">${report.notes}</span>
            </div>` : ''}
            ${report.appliedTo?.length ? `
            <details class="approval-applied">
              <summary class="approval-applied-summary"><!-- ::i18n.paymentApproval.appliedTo --></summary>
              ${report.appliedTo.map(a => `
                <div class="approval-applied-row">
                  <span>${a.description || a.transactionId}</span>
                  <span>${formatCurrency(a.amount)}</span>
                </div>
              `).join('')}
              ${report.excessAmount > 0 ? `
              <div class="approval-applied-row approval-excess">
                <span><!-- ::i18n.paymentApproval.excess --></span>
                <span>${formatCurrency(report.excessAmount)}</span>
              </div>` : ''}
            </details>` : ''}
          </div>

          <div class="approval-card-actions">
            <button class="btn-receipt" data-url="${report.receiptUrl || ''}">
              <div class="icon-slot-sm" data-icon="eye"></div>
              <!-- ::i18n.paymentApproval.viewReceipt -->
            </button>
            <div class="approval-buttons">
              <button class="btn-approve" data-id="${report.id}">
                <div class="icon-slot-sm" data-icon="check-circle"></div>
                <!-- ::i18n.paymentApproval.approve -->
              </button>
              <button class="btn-reject" data-id="${report.id}">
                <div class="icon-slot-sm" data-icon="x-circle"></div>
                <!-- ::i18n.paymentApproval.reject -->
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
        if (url) window.open(url, '_blank');
      });
    });

    // Aprobar
    listEl.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.innerHTML = `<div class="icon-slot-sm" data-icon="loader"></div>`;
        try {
          await PaymentNotification.approve(id, { uid: user.uid, name: user.displayName || user.email });
          await loadPending();
        } catch (error) {
          console.error("Error al aprobar:", error);
          btn.disabled = false;
          btn.innerHTML = `<div class="icon-slot-sm" data-icon="check-circle"></div> ${t('paymentApproval.approve')}`;
        }
      });
    });

    // Rechazar (abre modal)
    listEl.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        currentReportId = btn.dataset.id;
        rejectReason.value = '';
        rejectModal.classList.remove('hidden');
      });
    });
  };

  btnRejectCancel.addEventListener('click', () => {
    rejectModal.classList.add('hidden');
    currentReportId = null;
  });

  btnRejectConfirm.addEventListener('click', async () => {
    const reason = rejectReason.value.trim();
    if (!reason) {
      rejectReason.classList.add('input-error');
      return;
    }
    rejectReason.classList.remove('input-error');
    btnRejectConfirm.disabled = true;
    btnRejectConfirm.textContent = '...';
    try {
      await PaymentNotification.reject(currentReportId, reason, { uid: user.uid, name: user.displayName || user.email });
      rejectModal.classList.add('hidden');
      currentReportId = null;
      await loadPending();
    } catch (error) {
      console.error("Error al rechazar:", error);
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
