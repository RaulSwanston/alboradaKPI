import { db, collection, doc, getDoc, writeBatch, serverTimestamp, query, where, orderBy, getDocs, runTransaction } from "../core/firebase.js";
import { resolveApprovalIncomeType } from "../core/incomeTypes.js";
import Transaction from "./Transaction.js";
import AppConfig from "./AppConfig.js";

/**
 * Error de validación con mensaje apto para el usuario final. El controlador
 * puede mostrarlo tal cual en vez del mensaje genérico.
 */
const validationError = (message) => {
  const error = new Error(message);
  error.friendly = true;
  return error;
};

/**
 * Modelo para gestionar las notificaciones de pago enviadas por los residentes.
 */
export default class PaymentNotification {
  /**
   * Registra un reporte de pago de forma atómica junto con su actividad.
   * Utiliza writeBatch para asegurar que ambas operaciones ocurran juntas,
   * manteniendo la compatibilidad con el modo offline de Firestore.
   *
   * @param {Object} data - Datos del reporte de pago.
   * @param {Object} initiator - Datos del usuario que realiza el reporte {id, name, email}.
   * @returns {Promise<string>} El ID de la notificación creada.
   */
  static async create(data, initiator) {
    try {
      if (!initiator?.id) {
        throw new Error("No se pudo identificar al residente que reporta el pago.");
      }

      const amount = Number(data?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("El monto del reporte no es válido.");
      }

      const propertyId = String(data?.propertyId || '').trim();
      if (!propertyId) {
        throw new Error("El reporte no tiene una unidad válida.");
      }

      // El reparto lo decide el residente; aquí solo se normaliza para que no
      // entre basura (montos negativos, enlaces sin id) ni se confíe en el
      // `excessAmount` que venga del formulario.
      const appliedTo = (Array.isArray(data?.appliedTo) ? data.appliedTo : [])
        .filter(a => a && a.transactionId && Number(a.amount) > 0)
        .map(a => ({
          transactionId: String(a.transactionId),
          amount: Math.round(Number(a.amount) * 100) / 100,
          description: a.description || ''
        }));
      const appliedTotal = appliedTo.reduce((sum, a) => sum + a.amount, 0);
      const excessAmount = Math.max(0, Math.round((amount - appliedTotal) * 100) / 100);
      if (appliedTotal > amount + 0.005) {
        throw new Error("El reparto del pago supera el monto reportado.");
      }

      // No confiar en el reparto que llega del formulario: cada enlace debe
      // caber en el saldo real del cargo y no puede chocar con otro reporte
      // pendiente. Sin esto, dos reportes podían cubrir la misma factura y el
      // segundo se quedaba atascado al aprobar ("ya no tiene saldo suficiente").
      if (appliedTo.length > 0) {
        const reports = await PaymentNotification.getByUser(initiator.id);
        const inReview = new Map();
        for (const report of reports) {
          if (report.status !== 'pending_verification' || report.propertyId !== propertyId) continue;
          for (const ap of (Array.isArray(report.appliedTo) ? report.appliedTo : [])) {
            if (!ap?.transactionId) continue;
            inReview.set(
              ap.transactionId,
              (inReview.get(ap.transactionId) || 0) + (Number(ap.amount) || 0)
            );
          }
        }

        for (const link of appliedTo) {
          const label = link.description || link.transactionId;
          if ((inReview.get(link.transactionId) || 0) > 0) {
            throw validationError(`La factura "${label}" ya tiene un reporte de pago en revisión.`);
          }

          const snap = await getDoc(doc(db, "transactions", link.transactionId));
          if (!snap.exists()) {
            throw validationError(`La factura "${label}" ya no existe.`);
          }
          const cargo = snap.data();
          if (cargo.propertyId !== propertyId) {
            throw validationError(`La factura "${label}" no pertenece a esta unidad.`);
          }
          if (cargo.type !== 'FEE' && cargo.type !== 'FINE') {
            throw validationError(`El movimiento "${label}" no es una factura por pagar.`);
          }
          const pending = Transaction.getChargePending(cargo);
          if (link.amount > pending + 0.005) {
            throw validationError(`La factura "${label}" solo tiene $${pending.toFixed(2)} pendientes.`);
          }
        }
      }

      const batch = writeBatch(db);

      // 1. Referencia para la notificación (ID auto-generado)
      const notificationRef = doc(collection(db, "paymentNotifications"));
      const reportData = {
        ...data,
        propertyId,
        amount,
        appliedTo,
        excessAmount,
        residentUid: initiator.id,
        status: 'pending_verification',
        reportDate: serverTimestamp(),
        createdAt: serverTimestamp() // Campo de auditoría estándar
      };

      batch.set(notificationRef, reportData);

      // 2. Referencia para la actividad
      const activityRef = doc(collection(db, "activities"));
      batch.set(activityRef, {
        timestamp: serverTimestamp(),
        type: 'PAYMENT_REPORTED',
        description: `Nuevo reporte de pago de ${propertyId} por $${amount}`,
        initiator: {
          type: 'USER',
          id: initiator.id,
          name: initiator.name || initiator.email
        },
        target: {
          type: 'PROPERTY',
          id: propertyId,
          name: `Unidad ${propertyId}`
        },
        visibility: ['admin'],
        details: {
          amount,
          notificationId: notificationRef.id
        }
      });

      // 3. Ejecutar batch (Soporta offline)
      await batch.commit();

      return notificationRef.id;
    } catch (error) {
      console.error("[PaymentNotification] Error al crear reporte:", error);
      throw error;
    }
  }

  /**
   * Obtiene todos los reportes de pago de un residente.
   * @param {string} uid - UID del residente.
   * @returns {Promise<Array>}
   */
  static async getByUser(uid) {
    try {
      const q = query(
        collection(db, "paymentNotifications"),
        where("residentUid", "==", uid),
        orderBy("reportDate", "desc")
      );
      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error("[PaymentNotification] Error al obtener reportes del usuario:", error);
      throw error;
    }
  }

  /**
   * Obtiene los reportes pendientes de verificación.
   * @returns {Promise<Array>}
   */
  static async getPending() {
    try {
      const q = query(
        collection(db, "paymentNotifications"),
        where("status", "==", "pending_verification"),
        orderBy("reportDate", "desc")
      );
      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error("[PaymentNotification] Error al obtener reportes pendientes:", error);
      throw error;
    }
  }

  /**
   * Convierte la fecha declarada por el residente a un Date local.
   *
   * `paymentDate` se guarda como `YYYY-MM-DD` (string). `new Date('2026-10-26')`
   * lo interpreta como medianoche UTC y en Venezuela puede mostrar el día
   * anterior. Si viene un Timestamp o un Date se respeta tal cual.
   *
   * @param {*} value
   * @returns {Date}
   */
  static _parsePaymentDate(value) {
    if (!value) return new Date();
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value?.toDate === 'function') return value.toDate();

    if (typeof value === 'string') {
      const onlyDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (onlyDate) {
        return new Date(Number(onlyDate[1]), Number(onlyDate[2]) - 1, Number(onlyDate[3]), 12, 0, 0);
      }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /**
   * Aprueba un reporte de pago: crea la transacción PAYMENT con recibo,
   * concilia las facturas vinculadas y actualiza el balance de la propiedad.
   *
   * Todo ocurre en UNA sola `runTransaction`:
   *   - si el reporte ya no está `pending_verification`, no se duplica nada;
   *   - el folio numérico se incrementa en la misma transacción;
   *   - `paidBy`/`pendingAmount` de los cargos se derivan con la misma regla
   *     que `Transaction.reconcileCharges()`;
   *   - el reparto se valida contra la unidad y el saldo real de cada cargo.
   *
   * @param {string} id - ID de la notificación.
   * @param {Object} adminData - Datos del admin que aprueba {uid, name}.
   * @param {Object} [overrides] - Ajustes del admin antes de aprobar.
   * @param {string} [overrides.incomeTypeId] - Tipo de ingreso corregido. Si se
   *   omite, se conserva el que declaró el residente.
   * @returns {Promise<{transactionId: string, voucherNumber: string}>}
   */
  static async approve(id, adminData, overrides = {}) {
    const notifRef = doc(db, "paymentNotifications", id);
    let approvedPayment = null;

    try {
      const result = await runTransaction(db, async (transaction) => {
        const notifSnap = await transaction.get(notifRef);
        if (!notifSnap.exists()) throw new Error("Notificación no encontrada");

        const notif = { id: notifSnap.id, ...notifSnap.data() };

        // Idempotencia: un doble clic o un reintento no puede duplicar el pago.
        if (notif.status === 'approved') {
          if (!notif.paymentTransactionId) {
            throw new Error("El reporte figura como aprobado pero no tiene un pago asociado.");
          }
          return {
            transactionId: notif.paymentTransactionId,
            voucherNumber: notif.voucherNumber || '',
            alreadyApproved: true
          };
        }
        if (notif.status !== 'pending_verification') {
          throw new Error("Este reporte ya fue rechazado. No se puede aprobar.");
        }

        const amount = Number(notif.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("El monto del reporte no es válido.");
        }

        const propertyId = String(notif.propertyId || '').trim();
        if (!propertyId) throw new Error("El reporte no tiene una unidad válida.");

        // Normaliza y valida el reparto ANTES de escribir nada.
        const links = [];
        const seen = new Set();
        let appliedTotal = 0;

        for (const raw of (Array.isArray(notif.appliedTo) ? notif.appliedTo : [])) {
          const transactionId = raw && raw.transactionId ? String(raw.transactionId) : '';
          const linkAmount = Number(raw && raw.amount);

          if (!transactionId) {
            throw new Error("El reparto del pago contiene un cargo sin identificador.");
          }
          if (!Number.isFinite(linkAmount) || linkAmount <= 0) {
            throw new Error("El reparto del pago contiene un monto inválido.");
          }
          if (seen.has(transactionId)) {
            throw new Error("El reparto del pago contiene el mismo cargo más de una vez.");
          }

          seen.add(transactionId);
          links.push({
            transactionId,
            amount: Math.round(linkAmount * 100) / 100,
            description: raw.description || ''
          });
          appliedTotal += linkAmount;
        }

        appliedTotal = Math.round(appliedTotal * 100) / 100;
        if (appliedTotal > amount + 0.005) {
          throw new Error("El reparto del pago supera el monto reportado.");
        }

        const propRef = doc(db, "properties", propertyId);
        const propSnap = await transaction.get(propRef);
        if (!propSnap.exists()) throw new Error("La unidad del reporte ya no existe.");

        const chargeSnaps = await Promise.all(
          links.map(link => transaction.get(doc(db, "transactions", link.transactionId)))
        );

        const paymentRef = doc(collection(db, "transactions"));
        const chargeUpdates = [];

        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const snap = chargeSnaps[i];
          const label = link.description || link.transactionId;

          if (!snap.exists()) {
            throw new Error(`El cargo "${label}" ya no existe.`);
          }

          const cargo = snap.data();
          if (cargo.type !== 'FEE' && cargo.type !== 'FINE') {
            throw new Error(`El movimiento "${label}" no es un cargo por pagar.`);
          }
          if (cargo.propertyId !== propertyId) {
            throw new Error(`El reparto incluye un cargo de otra unidad ("${label}").`);
          }

          const pending = Transaction.getChargePending(cargo);
          if (pending + 0.005 < link.amount) {
            throw new Error(`El cargo "${label}" ya no tiene saldo suficiente.`);
          }

          chargeUpdates.push({
            ref: doc(db, "transactions", link.transactionId),
            ...Transaction.buildChargePaymentUpdate(cargo, paymentRef.id, link)
          });
        }

        const dateObj = PaymentNotification._parsePaymentDate(notif.paymentDate);
        const voucher = await Transaction._generateVoucherInTransaction(transaction, 'PAYMENT', dateObj);

        // Tipo de ingreso: lo declarado por el residente, corregible por el admin.
        // Si no viene nada, queda en null y la lectura lo infiere con
        // `resolveIncomeTypeId()` (public/app/core/incomeTypes.js).
        const { incomeTypeId, incomeTypeSource } = resolveApprovalIncomeType(
          notif.incomeTypeId,
          overrides.incomeTypeId
        );

        const overpayment = Math.max(0, Math.round((amount - appliedTotal) * 100) / 100);
        const period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

        const paymentData = {
          propertyId,
          amount,
          type: 'PAYMENT',
          description: notif.notes || `Pago registrado por administración`,
          status: 'verified',
          effectiveDate: dateObj,
          period: period,
          pendingAmount: 0,
          voucherNumber: voucher.voucherNumber,
          voucherType: voucher.voucherType,
          paymentMethod: notif.paymentMethod || null,
          incomeTypeId: incomeTypeId,
          appliedTo: links.map(link => ({
            transactionId: link.transactionId,
            amount: link.amount,
            description: link.description
          })),
          overpayment: overpayment,
          createdAt: serverTimestamp(),
          metadata: {
            paymentNotificationId: id,
            receiptURL: notif.receiptUrl || null,
            incomeTypeSource: incomeTypeSource,
            adminReviewedBy: adminData.uid,
            adminReviewedByName: adminData.name
          }
        };

        transaction.set(paymentRef, paymentData);

        for (const update of chargeUpdates) {
          transaction.update(update.ref, {
            paidBy: update.paidBy,
            pendingAmount: update.pendingAmount
          });
        }

        transaction.update(propRef, {
          balance: (Number(propSnap.data().balance) || 0) + amount,
          lastBalanceUpdate: new Date()
        });

        transaction.update(notifRef, {
          status: 'approved',
          reviewedBy: adminData.uid,
          reviewedByName: adminData.name,
          reviewedAt: serverTimestamp(),
          paymentTransactionId: paymentRef.id,
          voucherNumber: voucher.voucherNumber,
          approvedAmount: amount,
          appliedAmount: appliedTotal,
          excessAmount: overpayment
        });

        const activityRef = doc(collection(db, "activities"));
        transaction.set(activityRef, {
          timestamp: serverTimestamp(),
          type: 'PAYMENT_APPROVED',
          description: `Pago de $${amount} aprobado para unidad ${propertyId} (Recibo: ${voucher.voucherNumber})`,
          initiator: { type: 'USER', id: adminData.uid, name: adminData.name },
          target: { type: 'TRANSACTION', id: paymentRef.id, name: `Recibo ${voucher.voucherNumber}` },
          visibility: ['admin', notif.residentUid].filter(Boolean),
          details: {
            amount: amount,
            voucherNumber: voucher.voucherNumber,
            notificationId: id,
            transactionId: paymentRef.id,
            propertyId: propertyId
          }
        });

        approvedPayment = paymentData;

        return {
          transactionId: paymentRef.id,
          voucherNumber: voucher.voucherNumber,
          alreadyApproved: false
        };
      });

      // Este es el segundo embudo de escritura de pagos: `approve()` NO pasa por
      // `Transaction.create()`, escribe con `transaction.set` directo. Sin este
      // gancho, un pago aprobado por administración se contaría en el saldo de
      // caja pero no aparecería en "Ingresos por categoría" hasta la próxima
      // sincronización. `AppConfig` actualiza además la caja disponible.
      if (!result.alreadyApproved && approvedPayment) {
        await AppConfig.applyIncomeDelta(approvedPayment, 1);
      }

      return {
        transactionId: result.transactionId,
        voucherNumber: result.voucherNumber
      };
    } catch (error) {
      console.error("[PaymentNotification] Error al aprobar reporte:", error);
      throw error;
    }
  }

  /**
   * Rechaza un reporte de pago.
   * El motivo es opcional: el administrador puede rechazar sin escribir nada.
   * @param {string} id - ID de la notificación.
   * @param {string} [reason] - Motivo del rechazo (puede ir vacío).
   * @param {Object} adminData - Datos del admin {uid, name}.
   */
  static async reject(id, reason, adminData) {
    const ref = doc(db, "paymentNotifications", id);
    const cleanReason = String(reason || '').trim();

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("Notificación no encontrada");

        const notif = { id: snap.id, ...snap.data() };
        if (notif.status === 'rejected') return; // Idempotente
        if (notif.status !== 'pending_verification') {
          throw new Error("Este reporte ya fue aprobado y no se puede rechazar.");
        }

        transaction.update(ref, {
          status: 'rejected',
          rejectionReason: cleanReason,
          reviewedBy: adminData.uid,
          reviewedByName: adminData.name,
          reviewedAt: serverTimestamp()
        });

        const activityRef = doc(collection(db, "activities"));
        transaction.set(activityRef, {
          timestamp: serverTimestamp(),
          type: 'PAYMENT_REJECTED',
          description: `Reporte de pago de $${notif.amount} rechazado para unidad ${notif.propertyId}${cleanReason ? `: ${cleanReason}` : ''}`,
          initiator: { type: 'USER', id: adminData.uid, name: adminData.name },
          target: { type: 'PROPERTY', id: notif.propertyId, name: `Unidad ${notif.propertyId}` },
          visibility: ['admin', notif.residentUid].filter(Boolean),
          details: {
            amount: notif.amount,
            notificationId: id,
            reason: cleanReason,
            propertyId: notif.propertyId
          }
        });
      });
    } catch (error) {
      console.error("[PaymentNotification] Error al rechazar reporte:", error);
      throw error;
    }
  }
}
