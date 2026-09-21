/**
 * receipt.js — Render del recibo con formato físico (generado sobre la marcha).
 *
 * Fuente ÚNICA de la información del recibo: residentes (Estado de Cuenta) y
 * administradores (módulo de Transacciones) ven exactamente los mismos datos
 * de la transacción. No se persiste ningún PDF/archivo en R2 (opción B).
 */

import { getAuthObjectURL } from './r2.js';
import { t } from './i18n.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';

const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Números a palabras en español (hasta millones), para el recibo físico
const wordsUnidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const wordsDecenas10 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const wordsDecenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const wordsCentenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

const words2 = (n) => {
  if (n < 10) return wordsUnidades[n];
  if (n < 20) return wordsDecenas10[n - 10];
  if (n < 30) return n === 20 ? 'VEINTE' : `VEINTI${wordsUnidades[n % 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  return wordsDecenas[d] + (u ? ` Y ${wordsUnidades[u]}` : '');
};

const words3 = (n) => {
  const c = Math.floor(n / 100);
  const rest = n % 100;
  const cw = c === 1 ? (rest ? 'CIENTO' : 'CIEN') : wordsCentenas[c];
  return (cw ? cw + (rest ? ' ' : '') : '') + (rest ? words2(rest) : '');
};

const numberToWords = (num) => {
  const n = Math.floor(Math.abs(Number(num) || 0));
  const m = Math.floor(n / 1000000);
  const tN = Math.floor((n % 1000000) / 1000);
  const rest = n % 1000;
  let s = '';
  if (m) s += (m === 1 ? 'UN MILLÓN' : `${words3(m)} MILLONES`) + ((tN || rest) ? ' ' : '');
  if (tN) s += (tN === 1 ? 'MIL' : `${words3(tN)} MIL`) + (rest ? ' ' : '');
  if (rest) s += words3(rest);
  return s || 'CERO';
};

const toTimestamp = (val) => {
  if (!val) return null;
  let d;
  if (val.toDate) d = val.toDate();
  else if (typeof val === 'string') d = new Date(val.includes('T') ? val : val + 'T00:00:00');
  else d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Infiere el método de pago desde la descripción cuando el campo paymentMethod
 * no existe (pagos históricos). Misma lógica que Analytics.inferPaymentMethod.
 */
const inferPaymentMethodLabel = (tx, labels) => {
  const desc = ((tx.description || '') + ' ' + (tx.paymentMethod || '')).toUpperCase();
  if (desc.includes('YAPPY')) return labels.yappy || 'Yappy';
  if (desc.includes('CHEQUE')) return labels.check || 'Cheque';
  if (desc.includes('EFECTIVO') || desc.includes(' CASH')) return labels.cash || 'Efectivo';
  if (desc.includes('TARJETA') || desc.includes('CARD') || desc.includes('POS')) return labels.card || 'Tarjeta';
  if (desc.includes('DEPOSIT') || desc.includes('DEPÓSITO')) return labels.deposit || 'Depósito';
  if (desc.includes('TRANSFER') || desc.includes('BANCA') || desc.includes('ACH') || desc.includes(' BG ')) return labels.transfer || 'Transferencia';
  return '';
};

/**
 * Construye el HTML del recibo con formato físico a partir de una transacción.
 * @param {Object} opts
 * @param {Object} opts.tx           Transacción (pago).
 * @param {Object} [opts.appConfig]  Configuración (branding.logoUrl, paymentMethods).
 * @returns {Promise<string>} HTML del recibo.
 */
export async function buildPhysicalReceiptHtml({ tx, appConfig = {} }) {
  const absAmount = Math.abs(Number(tx.amount) || 0);

  let logoUrl = appConfig?.branding?.logoUrl || '/src/img/alborada.svg';
  if (logoUrl && !logoUrl.startsWith('/') && !logoUrl.startsWith('data:')) {
    try {
      logoUrl = await getAuthObjectURL(logoUrl);
    } catch (e) {
      logoUrl = '/src/img/alborada.svg';
    }
  }
  const paymentMethods = appConfig?.moduleRegistry?.transactions?.paymentMethods || [];
  const methodLabels = Object.fromEntries(paymentMethods.map(m => [m.id, m.label]));
  const method = tx.paymentMethod || '';

  let ownerName = '';
  if (tx.propertyId) {
    try {
      const prop = await Property.getById(tx.propertyId);
      ownerName = prop?.ownerInfo?.name || prop?.name || '';
    } catch (e) { ownerName = ''; }
  }

  const dateObj = tx.effectiveDate?.toDate?.() || new Date(tx.effectiveDate || tx.createdAt?.toDate?.());
  const validDate = !isNaN(dateObj.getTime());
  const day = validDate ? String(dateObj.getDate()) : '';
  const month = validDate ? monthNames[dateObj.getMonth()] : '';
  const year = validDate ? String(dateObj.getFullYear()) : '';

  // Saldos: sumamos los movimientos de la unidad hasta la fecha del pago.
  // Convención de balance en Firestore: negativo = deuda.
  let saldoAnterior = null;
  let saldoActual = null;
  if (tx.propertyId && validDate) {
    try {
      const propTx = await Transaction.getByPropertyId(tx.propertyId);
      const payTime = toTimestamp(tx.effectiveDate);
      let sum = 0;
      propTx.forEach(tt => {
        const ttTime = toTimestamp(tt.effectiveDate || tt.createdAt);
        if (ttTime !== null && ttTime <= payTime) sum += Number(tt.amount) || 0;
      });
      const pago = Math.abs(Number(tx.amount) || 0);
      saldoAnterior = -(sum - pago);
      saldoActual = -sum;
    } catch (e) {
      saldoAnterior = null;
      saldoActual = null;
    }
  }

  const fmtMoney = (v) => v === null || isNaN(v) ? '' : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
  let isCash = method === 'cash';
  let isCheck = method === 'check';

  let otherLabel = methodLabels[method] || '';
  if (!method) {
    // Pagos históricos sin paymentMethod: inferir desde la descripción
    const inferred = inferPaymentMethodLabel(tx, methodLabels);
    if (inferred === methodLabels.cash) isCash = true;
    else if (inferred === methodLabels.check) isCheck = true;
    else otherLabel = inferred || '';
  }
  const isOther = !isCash && !isCheck;
  const sumaEnLetras = `${numberToWords(absAmount)} CON ${String(Math.round((absAmount % 1) * 100)).padStart(2, '0')}/100`;
  const cashedBy = tx.metadata?.adminReviewedByName || '';

  return `
    <div class="receipt-physical">
      <div class="physical-header">
        <div class="physical-logo"><img src="${logoUrl}" alt="Alborada" /></div>
        <div class="physical-center">
          <div class="physical-receipt-title">${t('modules.transactions.receiptRecibo')}</div>
          <div class="physical-receipt-number">${tx.voucherNumber || ''}</div>
        </div>
        <div class="physical-contact">
          <div class="physical-contact-row"><strong>email:</strong> comunicadosalborada@gmail.com</div>
          <div class="physical-contact-row"><strong>Tel:</strong> 474-6310/6311</div>
        </div>
        <div class="physical-claim-note">${t('modules.transactions.receiptClaimNote')}</div>
      </div>

      <div class="physical-form">
        <div class="physical-form-line">
          ${t('modules.transactions.receiptDateLabel')}
          <span class="physical-blank">${day}</span> de
          <span class="physical-blank">${month}</span> de 20
          <span class="physical-blank">${year}</span>
          <span class="physical-casa">${t('modules.transactions.receiptCasaNo')}</span>
          <span class="physical-blank">${tx.propertyId || ''}</span>
        </div>
        <div class="physical-form-line fill">
          ${t('modules.transactions.receiptReceived')} <span class="physical-blank physical-wide">${ownerName}</span>
        </div>
        <div class="physical-form-line fill">
          ${t('modules.transactions.receiptSumOf')} <span class="physical-blank physical-wide">${sumaEnLetras}</span>
        </div>
        <div class="physical-form-line fill">
          ${t('modules.transactions.receiptConceptOf')} <span class="physical-blank physical-wide">${tx.description || ''}</span>
        </div>
      </div>

      <div class="physical-payform">
        <div class="physical-payform-title">${t('modules.transactions.receiptPayForm')}</div>
        <div class="physical-payform-row">
          <label class="physical-check"><span class="physical-checkbox ${isCash ? 'checked' : ''}"></span> ${t('modules.transactions.receiptPayCash')}</label>
          <label class="physical-check"><span class="physical-checkbox ${isCheck ? 'checked' : ''}"></span> ${t('modules.transactions.receiptPayCheck')}</label>
          <label class="physical-check"><span class="physical-checkbox ${isOther ? 'checked' : ''}"></span> ${t('modules.transactions.receiptPayOther')}</label>
          <span class="physical-blank physical-inline">${otherLabel}</span>
        </div>
        <div class="physical-saldo-row"><span class="physical-saldo-label">${t('modules.transactions.receiptPrevBalance')}</span><span class="physical-blank physical-saldo-value">${fmtMoney(saldoAnterior)}</span></div>
        <div class="physical-saldo-row"><span class="physical-saldo-label">${t('modules.transactions.receiptPaymentAmt')}</span><span class="physical-blank physical-saldo-value">${fmtMoney(absAmount)}</span></div>
        <div class="physical-saldo-row"><span class="physical-saldo-label">${t('modules.transactions.receiptCurrentBalance')}</span><span class="physical-blank physical-saldo-value">${fmtMoney(saldoActual)}</span></div>
      </div>

      <div class="physical-sign">
        <div class="physical-sign-line">${cashedBy}</div>
        <div class="physical-sign-label">${t('modules.transactions.receiptCollectedBy')}</div>
      </div>
    </div>
  `;
}