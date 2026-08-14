import Transaction from "../../models/Transaction.js";
import ChargeConcept from "../../models/ChargeConcept.js";
import Property from "../../models/Property.js";
import { db, collection, doc, writeBatch, serverTimestamp, getDoc, auth } from "../../core/firebase.js";
import { createActivity } from "../../models/Activities.js";

export default async function billingGeneratorController(contexto) {
  const permissions = contexto.data.permissions;
  if (!permissions.isAdmin) return;

  const form = document.getElementById('billing-form');
  const conceptSelect = document.getElementById('billing-concept');
  const periodInput = document.getElementById('billing-period');
  const amountInput = document.getElementById('billing-amount');
  const descInput = document.getElementById('billing-description');
  const summary = document.getElementById('billing-summary');
  const billingCount = document.getElementById('billing-count');
  const billingTotal = document.getElementById('billing-total');
  const btnSubmit = document.getElementById('btn-generate-billing');
  const resultDiv = document.getElementById('billing-result');

  if (!form) return;

  // Cargar conceptos y propiedades
  let properties = [];
  let concepts = [];

  try {
    concepts = await ChargeConcept.getAll();
    properties = await Property.getAll();

    conceptSelect.innerHTML = '<option value="">Seleccione un concepto...</option>' +
      concepts.map(c => `<option value="${c.id}" data-amount="${c.defaultAmount || 0}">${c.name}</option>`).join('');

    // Presetear periodo al mes actual y bloquear selección de meses futuros
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    periodInput.value = currentPeriod;
    periodInput.max = currentPeriod;
  } catch (error) {
    console.error("[billingGenerator] Error inicial:", error);
    resultDiv.className = 'billing-result error';
    resultDiv.textContent = 'Error al cargar datos iniciales.';
    resultDiv.style.display = 'block';
  }

  // Actualizar monto y resumen al cambiar concepto
  conceptSelect.addEventListener('change', () => {
    const opt = conceptSelect.selectedOptions[0];
    if (opt && opt.dataset.amount) {
      amountInput.value = opt.dataset.amount;
    }
    updateSummary();
  });

  amountInput.addEventListener('input', updateSummary);
  periodInput.addEventListener('input', updateSummary);

  function updateSummary() {
    const amount = parseFloat(amountInput.value) || 0;
    const count = properties.length;
    if (count > 0 && amount > 0) {
      billingCount.textContent = count;
      billingTotal.textContent = `$${(amount * count).toFixed(2)}`;
      summary.style.display = 'block';
    } else {
      summary.style.display = 'none';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const conceptId = conceptSelect.value;
    const conceptName = conceptSelect.selectedOptions[0]?.textContent || 'Cuota';
    const period = periodInput.value;
    const amount = parseFloat(amountInput.value);
    const description = descInput.value.trim() || `Cuota de Mantenimiento ${period}`;

    if (!conceptId || !period || !amount || amount <= 0) {
      resultDiv.className = 'billing-result error';
      resultDiv.textContent = 'Complete todos los campos requeridos.';
      resultDiv.style.display = 'block';
      return;
    }

    if (properties.length === 0) {
      resultDiv.className = 'billing-result error';
      resultDiv.textContent = 'No hay propiedades registradas.';
      resultDiv.style.display = 'block';
      return;
    }

    // No se permiten cuotas de periodos futuros (facturas aún no en vigencia)
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (period > currentPeriod) {
      resultDiv.className = 'billing-result error';
      resultDiv.textContent = 'No se pueden generar cuotas de periodos futuros. El periodo máximo permitido es el mes actual.';
      resultDiv.style.display = 'block';
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Generando...';
    resultDiv.style.display = 'none';

    try {
      const dateObj = new Date(`${period}-01T15:00:00`);
      const vouchers = await Transaction._generateBatchVouchers(properties.length, 'FEE', dateObj);

      // Pre-leer balances actuales de todas las propiedades
      const balanceMap = {};
      const propReads = properties.map(p => {
        const ref = doc(db, "properties", p.id || p.name);
        return getDoc(ref).then(s => {
          balanceMap[p.id || p.name] = s.exists() ? (s.data().balance || 0) : 0;
        });
      });
      await Promise.all(propReads);

      const BATCH_LIMIT = 500;
      const initiatorData = { id: user.uid, name: user.displayName || user.email };
      let totalCreated = 0;

      for (let i = 0; i < properties.length; i += BATCH_LIMIT) {
        const chunk = properties.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);

        chunk.forEach((prop, idx) => {
          const propId = prop.id || prop.name;
          const voucher = vouchers[i + idx];
          const transRef = doc(collection(db, "transactions"));
          batch.set(transRef, {
            propertyId: propId,
            amount: -amount,
            type: 'FEE',
            description: description,
            status: 'verified',
            effectiveDate: dateObj,
            period: period,
            pendingAmount: amount,
            voucherNumber: voucher.voucherNumber,
            voucherType: voucher.voucherType,
            chargeConceptId: conceptId,
            createdAt: serverTimestamp(),
            metadata: {
              generatedBy: user.uid,
              generatedByName: user.displayName || user.email,
              batchId: `batch-${Date.now()}`
            }
          });

          batch.update(doc(db, "properties", propId), {
            balance: balanceMap[propId] - amount,
            lastBalanceUpdate: new Date()
          });
        });

        await batch.commit();
        totalCreated += chunk.length;
      }

      await createActivity({
        type: 'FEE_GENERATED',
        description: `Generación masiva: ${totalCreated} cuotas de ${description} por $${amount.toFixed(2)} c/u`,
        initiator: { type: 'USER', id: user.uid, name: user.displayName || user.email },
        target: { type: 'SYSTEM', id: 'billing', name: 'Generación de Cuotas' },
        visibility: ['admin'],
        details: {
          conceptId, period, amount, count: totalCreated,
          firstVoucher: vouchers[0]?.voucherNumber,
          lastVoucher: vouchers[vouchers.length - 1]?.voucherNumber
        }
      });

      resultDiv.className = 'billing-result success';
      resultDiv.innerHTML = `
        <strong>✅ ${totalCreated} cuotas generadas exitosamente.</strong><br>
        Periodo: ${period} | Monto: $${amount.toFixed(2)} c/u | Total: $${(amount * totalCreated).toFixed(2)}<br>
        Rango de comprobantes: ${vouchers[0]?.voucherNumber} — ${vouchers[vouchers.length - 1]?.voucherNumber}
      `;
      resultDiv.style.display = 'block';
    } catch (error) {
      console.error("[billingGenerator] Error:", error);
      resultDiv.className = 'billing-result error';
      resultDiv.textContent = `Error: ${error.message}`;
      resultDiv.style.display = 'block';
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Generar Cuotas';
    }
  });
}
