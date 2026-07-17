import { db, collection, doc, writeBatch, serverTimestamp, query, where, getDocs, orderBy, arrayUnion, updateDoc } from "../core/firebase.js";

/**
 * Modelo para gestionar las solicitudes de vinculación a propiedades.
 */
export default class MembershipRequest {
  /**
   * Obtiene las solicitudes de un usuario específico.
   * @param {string} userId 
   * @returns {Promise<Array>}
   */
  static async getByUserId(userId) {
    try {
      const q = query(
        collection(db, "membershipRequests"), 
        where("userId", "==", userId)
      );
      const querySnap = await getDocs(q);
      const requests = [];
      querySnap.forEach(doc => {
        requests.push({ id: doc.id, ...doc.data() });
      });
      return requests;
    } catch (error) {
      console.error("[MembershipRequest] Error al obtener solicitudes:", error);
      throw error;
    }
  }

  /**
   * Obtiene todas las solicitudes con un estado específico (ej: 'pending').
   * @param {string} status 
   * @returns {Promise<Array>}
   */
  static async getByStatus(status = 'pending') {
    try {
      const q = query(
        collection(db, "membershipRequests"), 
        where("status", "==", status)
      );
      const querySnap = await getDocs(q);
      const list = [];
      querySnap.forEach(snap => {
        list.push({ id: snap.id, ...snap.data() });
      });
      return list;
    } catch (error) {
      console.error(`[MembershipRequest] Error al obtener solicitudes ${status}:`, error);
      throw error;
    }
  }

  /**
   * Procesa una solicitud (aprobación o rechazo) de forma atómica.
   * Si se aprueba, vincula automáticamente al usuario con la propiedad en ambas direcciones.
   * 
   * @param {string} requestId - ID de la solicitud.
   * @param {Object} requestData - Datos de la solicitud.
   * @param {string} newStatus - 'approved' o 'rejected'.
   */
  static async process(requestId, requestData, newStatus) {
    try {
      const batch = writeBatch(db);

      // 1. Actualizar estado de la solicitud
      const requestRef = doc(db, "membershipRequests", requestId);
      batch.update(requestRef, { 
        status: newStatus,
        processedAt: serverTimestamp()
      });

      if (newStatus === 'approved') {
        // 2. Vincular propiedad al usuario
        const userRef = doc(db, "users", requestData.userId);
        batch.update(userRef, {
          role: 'resident', // Elevamos el rol a residente
          propertyIds: arrayUnion(requestData.requestedPropertyId)
        });

        // 3. Vincular usuario a la propiedad
        const propertyRef = doc(db, "properties", requestData.requestedPropertyId);
        batch.update(propertyRef, {
          residentUids: arrayUnion(requestData.userId)
        });

        // 4. Registrar actividad de sistema
        const activityRef = doc(collection(db, "activities"));
        batch.set(activityRef, {
          type: 'MEMBERSHIP_APPROVED',
          timestamp: serverTimestamp(),
          description: `Solicitud de ${requestData.userName} para ${requestData.requestedPropertyName} aprobada.`,
          initiator: { type: 'SYSTEM', name: 'Administración' },
          target: { type: 'PROPERTY', id: requestData.requestedPropertyId, name: requestData.requestedPropertyName },
          visibility: ['admin', requestData.userId]
        });
      }

      await batch.commit();
      return true;
    } catch (error) {
      console.error("[MembershipRequest] Error al procesar solicitud:", error);
      throw error;
    }
  }

  /**
   * Registra múltiples solicitudes de membresía de forma atómica junto con sus actividades.
   * @param {Object} user - Datos del usuario solicitante {uid, email, displayName}.
   * @param {Map} selectedProperties - Map con los IDs de propiedades y sus detalles {name, relationship}.
   */
  static async createMany(user, selectedProperties) {
    try {
      const batch = writeBatch(db);

      selectedProperties.forEach((data, id) => {
        // ID auto-generado para permitir múltiples intentos
        const requestRef = doc(collection(db, "membershipRequests"));
        
        // 1. Guardar la solicitud de membresía
        batch.set(requestRef, {
          userId: user.uid,
          userEmail: user.email,
          userName: user.displayName || user.email.split('@')[0],
          requestedPropertyId: id,
          requestedPropertyName: data.name,
          relationship: data.relationship,
          status: 'pending',
          visibleToUser: true,
          createdAt: serverTimestamp()
        });

        // 2. Registrar la actividad para el administrador
        const activityRef = doc(collection(db, "activities"));
        batch.set(activityRef, {
          type: 'MEMBERSHIP_REQUESTED',
          timestamp: serverTimestamp(),
          description: `${user.displayName || user.email} solicitó vinculación como ${data.relationship} de ${data.name}.`,
          initiator: { type: 'USER', id: user.uid, name: user.displayName || user.email },
          target: { type: 'PROPERTY', id: id, name: data.name },
          visibility: ['admin']
        });
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error("[MembershipRequest] Error al crear múltiples solicitudes:", error);
      throw error;
    }
  }

  /**
   * Vincula directamente un administrador a una o múltiples propiedades,
   * sin pasar por el flujo de solicitud/aprobación.
   * @param {Object} user - Datos del usuario {uid, email, displayName}
   * @param {Map} selectedProperties - Map con propertyId -> {name, relationship}
   */
  static async linkDirectly(user, selectedProperties) {
    try {
      const batch = writeBatch(db);
      const propertyIds = Array.from(selectedProperties.keys());

      const userRef = doc(db, "users", user.uid);
      batch.update(userRef, {
        propertyIds: arrayUnion(...propertyIds)
      });

      selectedProperties.forEach((data, propertyId) => {
        const propertyRef = doc(db, "properties", propertyId);
        batch.update(propertyRef, {
          residentUids: arrayUnion(user.uid)
        });

        const activityRef = doc(collection(db, "activities"));
        batch.set(activityRef, {
          type: 'MEMBERSHIP_APPROVED',
          timestamp: serverTimestamp(),
          description: `Vinculación directa de ${user.displayName || user.email} a ${data.name}.`,
          initiator: { type: 'USER', id: user.uid, name: user.displayName || user.email },
          target: { type: 'PROPERTY', id: propertyId, name: data.name },
          visibility: ['admin', user.uid]
        });
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error("[MembershipRequest] Error en vinculación directa:", error);
      throw error;
    }
  }

  /**
   * Permite al usuario descartar (ocultar) una solicitud rechazada.
   * @param {string} requestId - ID de la solicitud a descartar.
   * @param {string} userId - UID del usuario propietario.
   */
  static async dismiss(requestId, userId) {
    try {
      await updateDoc(doc(db, "membershipRequests", requestId), {
        visibleToUser: false
      });
      return true;
    } catch (error) {
      console.error("[MembershipRequest] Error al descartar solicitud:", error);
      throw error;
    }
  }
}
