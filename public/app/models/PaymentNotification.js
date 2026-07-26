import { db, collection, doc, writeBatch, serverTimestamp, query, where, orderBy, getDocs, updateDoc, getDoc, arrayUnion } from "../core/firebase.js";
import Transaction from "./Transaction.js";

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
      const batch = writeBatch(db);
      
      // 1. Referencia para la notificación (ID auto-generado)
      const notificationRef = doc(collection(db, "paymentNotifications"));
      const reportData = {
        ...data,
        reportDate: serverTimestamp(),
        createdAt: serverTimestamp(), // Campo de auditoría estándar
        status: data.status || 'pending_verification'
      };
      
      batch.set(notificationRef, reportData);

      // 2. Referencia para la actividad
      const activityRef = doc(collection(db, "activities"));
      batch.set(activityRef, {
        timestamp: serverTimestamp(),
        type: 'PAYMENT_REPORTED',
        description: `Nuevo reporte de pago de ${data.propertyId} por $${data.amount}`,
        initiator: { 
          type: 'USER', 
          id: initiator.id, 
          name: initiator.name || initiator.email 
        },
        target: { 
          type: 'PROPERTY', 
          id: data.propertyId, 
          name: `Unidad ${data.propertyId}` 
        },
        visibility: ['admin'],
        details: { 
          amount: data.amount,
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
   * Aprueba un reporte de pago: crea la transacción PAYMENT con recibo,
   * concilia las facturas vinculadas y actualiza el balance de la propiedad.
   * Todo en un writeBatch atómico.
   * @param {string} id - ID de la notificación.
   * @param {Object} adminData - Datos del admin que aprueba {uid, name}.
   * @returns {Promise<{transactionId: string, voucherNumber: string}>}
   */
  static async approve(id, adminData) {
    try {
      const notifRef = doc(db, "paymentNotifications", id);
      const notifSnap = await getDoc(notifRef);
      if (!notifSnap.exists()) throw new Error("Notificación no encontrada");
      const notif = { id: notifSnap.id, ...notifSnap.data() };

      const paymentDate = notif.paymentDate ? new Date(notif.paymentDate + 'T12:00:00') : new Date();
      const dateObj = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);

      const voucher = await Transaction._generateVoucher('PAYMENT', dateObj);

      // Leer valores actuales para reemplazar increment()
      const propRef = doc(db, "properties", notif.propertyId);
      const [propSnap, ...txSnaps] = await Promise.all([
        getDoc(propRef),
        ...(notif.appliedTo || []).filter(a => a.transactionId).map(a => getDoc(doc(db, "transactions", a.transactionId)))
      ]);
      const currentBalance = propSnap.exists() ? (propSnap.data().balance || 0) : 0;
      const txPending = {};
      txSnaps.forEach(s => { if (s.exists()) txPending[s.id] = s.data().pendingAmount || 0; });

      const batch = writeBatch(db);

      const paymentRef = doc(collection(db, "transactions"));
      const period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

      batch.set(paymentRef, {
        propertyId: notif.propertyId,
        amount: notif.amount,
        type: 'PAYMENT',
        description: notif.notes || `Pago registrado por administración`,
        status: 'verified',
        effectiveDate: dateObj,
        period: period,
        pendingAmount: 0,
        voucherNumber: voucher.voucherNumber,
        voucherType: voucher.voucherType,
        paymentMethod: notif.paymentMethod || null,
        appliedTo: (notif.appliedTo || []).map(a => ({
          transactionId: a.transactionId,
          amount: a.amount,
          description: a.description || ''
        })),
        createdAt: serverTimestamp(),
        metadata: {
          paymentNotificationId: id,
          receiptUrl: notif.receiptUrl || null,
          adminReviewedBy: adminData.uid,
          adminReviewedByName: adminData.name,
          excessAmount: notif.excessAmount || 0
        }
      });

      for (const applied of (notif.appliedTo || [])) {
        if (!applied.transactionId) continue;
        const currentPend = txPending[applied.transactionId] || 0;
        batch.update(doc(db, "transactions", applied.transactionId), {
          pendingAmount: Math.max(0, currentPend - applied.amount),
          paidBy: arrayUnion({
            paymentId: paymentRef.id,
            voucherNumber: voucher.voucherNumber,
            amount: applied.amount
          })
        });
      }

      batch.update(propRef, {
        balance: currentBalance + notif.amount,
        lastBalanceUpdate: new Date()
      });

      batch.update(notifRef, {
        status: 'approved',
        reviewedBy: adminData.uid,
        reviewedByName: adminData.name,
        reviewedAt: serverTimestamp(),
        paymentTransactionId: paymentRef.id
      });

      const activityRef = doc(collection(db, "activities"));
      batch.set(activityRef, {
        timestamp: serverTimestamp(),
        type: 'PAYMENT_APPROVED',
        description: `Pago de $${notif.amount} aprobado para unidad ${notif.propertyId} (Recibo: ${voucher.voucherNumber})`,
        initiator: { type: 'USER', id: adminData.uid, name: adminData.name },
        target: { type: 'PROPERTY', id: notif.propertyId, name: `Unidad ${notif.propertyId}` },
        visibility: ['admin', notif.residentUid].filter(Boolean),
        details: {
          amount: notif.amount,
          voucherNumber: voucher.voucherNumber,
          notificationId: id,
          transactionId: paymentRef.id
        }
      });

      await batch.commit();
      return { transactionId: paymentRef.id, voucherNumber: voucher.voucherNumber };
    } catch (error) {
      console.error("[PaymentNotification] Error al aprobar reporte:", error);
      throw error;
    }
  }

  /**
   * Rechaza un reporte de pago.
   * @param {string} id - ID de la notificación.
   * @param {string} reason - Motivo del rechazo.
   * @param {Object} adminData - Datos del admin {uid, name}.
   */
  static async reject(id, reason, adminData) {
    try {
      const ref = doc(db, "paymentNotifications", id);
      await updateDoc(ref, {
        status: "rejected",
        rejectionReason: reason,
        reviewedBy: adminData.uid,
        reviewedByName: adminData.name,
        reviewedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("[PaymentNotification] Error al rechazar reporte:", error);
      throw error;
    }
  }
}
