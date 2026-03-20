import { db, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from "../core/firebase.js";
import { createActivity } from "./Activities.js";

/**
 * La clase Transaction gestiona el historial contable del condominio.
 * Implementa un CRUD completo con registro automático de actividades para auditoría.
 */
export default class Transaction {
  /**
   * Crea una nueva transacción y registra la actividad correspondiente.
   * @param {Object} data - Datos de la transacción (propertyId, amount, type, description, etc.)
   * @param {Object} initiator - Datos del usuario que realiza la acción {id, name, type: 'USER'|'SYSTEM'}
   * @returns {Promise<string>} El ID de la transacción creada.
   */
  static async create(data, initiator = { type: 'SYSTEM', name: 'Sistema' }) {
    try {
      const transData = {
        ...data,
        createdAt: serverTimestamp(),
        status: data.propertyId === '__UNIDENTIFIED__' ? 'unidentified' : (data.status || 'verified')
      };

      const docRef = await addDoc(collection(db, "transactions"), transData);

      // Registrar la actividad automáticamente
      await createActivity({
        type: data.amount > 0 ? 'PAYMENT_REPORTED' : 'FEE_GENERATED',
        description: `${data.description} por ${Math.abs(data.amount)} USD`,
        initiator: initiator,
        target: {
          type: 'PROPERTY',
          id: data.propertyId,
          name: data.propertyId === '__UNIDENTIFIED__' ? 'Sin identificar' : `Unidad ${data.propertyId}`
        },
        details: { transactionId: docRef.id, amount: data.amount }
      });

      return docRef.id;
    } catch (error) {
      console.error("[Transaction] Error al crear transacción:", error);
      throw error;
    }
  }

  /**
   * Actualiza una transacción existente (ej: identificar un pago o corregir descripción).
   * @param {string} id - ID de la transacción.
   * @param {Object} data - Nuevos datos.
   * @param {Object} initiator - Datos del usuario que realiza la acción.
   */
  static async update(id, data, initiator = { type: 'SYSTEM', name: 'Sistema' }) {
    try {
      const docRef = doc(db, "transactions", id);
      await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });

      // Registrar actividad de actualización
      await createActivity({
        type: 'TRANSACTION_UPDATED',
        description: `Actualización de transacción ${id}`,
        initiator: initiator,
        target: { type: 'TRANSACTION', id: id },
        details: { changes: Object.keys(data) }
      });
    } catch (error) {
      console.error(`[Transaction] Error al actualizar transacción ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una transacción (uso restringido para corrección de errores).
   * @param {string} id - ID de la transacción.
   * @param {Object} initiator - Datos del usuario que realiza la acción.
   */
  static async delete(id, initiator) {
    try {
      const docRef = doc(db, "transactions", id);
      await deleteDoc(docRef);

      // Registrar actividad de eliminación
      await createActivity({
        type: 'TRANSACTION_DELETED',
        description: `Eliminación de transacción ${id}`,
        initiator: initiator,
        target: { type: 'TRANSACTION', id: id }
      });
    } catch (error) {
      console.error(`[Transaction] Error al eliminar transacción ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene una transacción específica por ID.
   */
  static async getById(id) {
    try {
      const docSnap = await getDoc(doc(db, "transactions", id));
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      console.error(`[Transaction] Error al obtener transacción ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los movimientos vinculados a una unidad.
   */
  static async getByPropertyId(propertyId) {
    try {
      // Consulta simple (sin orderBy) para no requerir índices compuestos
      const q = query(
        collection(db, "transactions"),
        where("propertyId", "==", propertyId)
      );
      
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      
      // Ordenamos en memoria por fecha efectiva (descendente)
      return list.sort((a, b) => {
        const dateA = a.effectiveDate?.toDate ? a.effectiveDate.toDate() : new Date(a.effectiveDate || 0);
        const dateB = b.effectiveDate?.toDate ? b.effectiveDate.toDate() : new Date(b.effectiveDate || 0);
        return dateB - dateA;
      });
    } catch (error) {
      console.error(`[Transaction] Error para unidad ${propertyId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los pagos no identificados.
   */
  static async getUnidentified() {
    try {
      const q = query(
        collection(db, "transactions"),
        where("status", "==", "unidentified"),
        orderBy("effectiveDate", "desc")
      );
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error("[Transaction] Error al obtener no identificados:", error);
      throw error;
    }
  }

  /**
   * Obtiene todas las transacciones (Libro Mayor Completo).
   * @param {number|null} limitCount - Opcional: límite de registros.
   */
  static async getAll(limitCount = null) {
    try {
      let q;
      if (limitCount) {
        q = query(collection(db, "transactions"), orderBy("effectiveDate", "desc"), limit(limitCount));
      } else {
        q = query(collection(db, "transactions"), orderBy("effectiveDate", "desc"));
      }
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error("[Transaction] Error al obtener todas:", error);
      throw error;
    }
  }
}
