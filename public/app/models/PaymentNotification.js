import { db, collection, doc, writeBatch, serverTimestamp, query, where, orderBy, getDocs, updateDoc } from "../core/firebase.js";

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
   * Aprueba un reporte de pago.
   * @param {string} id - ID de la notificación.
   * @param {Object} adminData - Datos del admin que aprueba {uid, name}.
   */
  static async approve(id, adminData) {
    try {
      const ref = doc(db, "paymentNotifications", id);
      await updateDoc(ref, {
        status: "approved",
        reviewedBy: adminData.uid,
        reviewedByName: adminData.name,
        reviewedAt: serverTimestamp()
      });
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
