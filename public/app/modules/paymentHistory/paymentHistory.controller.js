import PaymentNotification from "../../models/PaymentNotification.js";
import { t } from '../../core/i18n.js';
import { router } from '../../../router.js';

export default async function paymentHistoryController(contexto) {
  const user = contexto?.data?.user;
  if (!user) return;

  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const filtersEl = document.getElementById('history-filters');

  let allReports = [];
  let activeFilter = 'all';

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
    return date.toLocaleDateString('es', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const updateFilterButtons = () => {
    if (!filtersEl) return;
    filtersEl.querySelectorAll('.history-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === activeFilter);
    });
  };

  const bindReceiptButtons = () => {
    listEl.querySelectorAll('.history-receipt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const transactionId = btn.dataset.transactionId;
        if (transactionId) router.navigate(`/dashboard/transactions/${transactionId}`, 'dashboard');
      });
    });
  };

  const render = () => {
    if (allReports.length === 0) {
      listEl.classList.add('hidden');
      if (filtersEl) filtersEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    if (filtersEl) filtersEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    const reports = activeFilter === 'all'
      ? allReports
      : allReports.filter(report => report.status === activeFilter);

    if (reports.length === 0) {
      listEl.classList.remove('hidden');
      listEl.innerHTML = `<p class="error-text">${t('paymentHistory.noFiltered')}</p>`;
      return;
    }

    listEl.classList.remove('hidden');
    listEl.innerHTML = reports.map(report => {
      const cfg = statusConfig[report.status] || statusConfig.pending_verification;
      const hasReceipt = report.status === 'approved' && report.paymentTransactionId;
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
              <span class="history-label">${t('paymentHistory.property')}</span>
              <span class="history-value">${escapeHtml(report.propertyId || '—')}</span>
            </div>
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.date')}</span>
              <span class="history-value">${formatDate(report.paymentDate)}</span>
            </div>
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.reported')}</span>
              <span class="history-value">${formatDateTime(report.reportDate)}</span>
            </div>
            ${report.status === 'approved' && report.voucherNumber ? `
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.receiptNumber')}</span>
              <span class="history-value">#${escapeHtml(report.voucherNumber)}</span>
            </div>` : ''}
            ${report.status === 'approved' && report.reviewedAt ? `
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.reviewed')}</span>
              <span class="history-value">${formatDateTime(report.reviewedAt)}</span>
            </div>` : ''}
            ${report.notes ? `
            <div class="history-row">
              <span class="history-label">${t('paymentHistory.notes')}</span>
              <span class="history-value">${escapeHtml(report.notes)}</span>
            </div>` : ''}
            ${report.rejectionReason ? `
            <div class="history-row history-rejection">
              <span class="history-label">${t('paymentHistory.rejectionReason')}</span>
              <span class="history-value">${escapeHtml(report.rejectionReason)}</span>
            </div>` : ''}
            ${hasReceipt ? `
            <button type="button" class="btn-secondary history-receipt-btn" data-transaction-id="${escapeHtml(report.paymentTransactionId)}">
              <div class="icon-slot-sm" data-icon="receipt"></div>
              ${t('paymentHistory.viewReceipt')}
            </button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    bindReceiptButtons();
    handleIcons(listEl);
  };

  if (filtersEl) {
    filtersEl.addEventListener('click', (event) => {
      const btn = event.target.closest('.history-filter');
      if (!btn) return;
      activeFilter = btn.dataset.filter || 'all';
      updateFilterButtons();
      render();
    });
  }

  try {
    allReports = await PaymentNotification.getByUser(user.uid);
    render();
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
