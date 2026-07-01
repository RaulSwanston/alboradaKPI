import PaymentNotification from "../../models/PaymentNotification.js";
import { t } from '../../core/i18n.js';

export default async function paymentHistoryController(contexto) {
  const user = contexto?.data?.user;
  if (!user) return;

  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');

  const statusConfig = {
    pending_verification: {
      label: t('paymentHistory.statusPending'),
      class: 'status-pending',
      icon: 'clock'
    },
    approved: {
      label: t('paymentHistory.statusApproved'),
      class: 'status-approved',
      icon: 'check-circle'
    },
    rejected: {
      label: t('paymentHistory.statusRejected'),
      class: 'status-rejected',
      icon: 'x-circle'
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  try {
    const reports = await PaymentNotification.getByUser(user.uid);

    if (reports.length === 0) {
      listEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    listEl.innerHTML = reports.map(report => {
      const cfg = statusConfig[report.status] || statusConfig.pending_verification;
      return `
        <div class="history-card ${cfg.class}">
          <div class="history-card-top">
            <span class="history-status-badge ${cfg.class}">
              <div class="icon-slot-xs" data-icon="${cfg.icon}"></div>
              ${cfg.label}
            </span>
            <span class="history-amount">${formatCurrency(report.amount)}</span>
          </div>
          <div class="history-card-body">
            <div class="history-row">
              <span class="history-label"><!-- ::i18n.paymentHistory.property --></span>
              <span class="history-value">${report.propertyId || '—'}</span>
            </div>
            <div class="history-row">
              <span class="history-label"><!-- ::i18n.paymentHistory.date --></span>
              <span class="history-value">${formatDate(report.paymentDate)}</span>
            </div>
            <div class="history-row">
              <span class="history-label"><!-- ::i18n.paymentHistory.reported --></span>
              <span class="history-value">${formatDate(report.reportDate)}</span>
            </div>
            ${report.notes ? `
            <div class="history-row">
              <span class="history-label"><!-- ::i18n.paymentHistory.notes --></span>
              <span class="history-value">${report.notes}</span>
            </div>` : ''}
            ${report.rejectionReason ? `
            <div class="history-row history-rejection">
              <span class="history-label"><!-- ::i18n.paymentHistory.rejectionReason --></span>
              <span class="history-value">${report.rejectionReason}</span>
            </div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    await handleIcons(listEl);
  } catch (error) {
    console.error("Error al cargar historial:", error);
    listEl.innerHTML = `<p class="error-text">${t('paymentHistory.error')}</p>`;
  }

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
}
