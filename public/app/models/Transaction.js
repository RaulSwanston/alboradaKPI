import { db, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp, runTransaction } from "../core/firebase.js";
import { createActivity } from "./Activities.js";

/**
 * La clase Transaction gestiona el historial contable del condominio.
 * Implementa un CRUD completo con registro automático de actividades para auditoría.
 */
export default class Transaction {
  /**
   * Genera un voucherNumber secuencial (FAC o REC) usando runTransaction.
   * Lee el contador desde system/counters, lo incrementa atómicamente,
   * y si no existe lo inicializa desde appConfig.app.counters (secuencial manual del admin).
   * @param {string} type - Tipo de transacción (FEE, FINE, PAYMENT, etc.)
   * @param {Date} effectiveDate - Fecha efectiva para el prefijo del voucher
   * @returns {Promise<{voucherNumber: string, voucherType: string}|null>}
   */
  static async _generateVoucher(type, effectiveDate) {
    const counterRef = doc(db, "system", "counters");

    return await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let facCounter, recCounter;

      if (!counterSnap.exists()) {
        const configRef = doc(db, "appConfig", "app");
        const configSnap = await transaction.get(configRef);
        const manualCounters = configSnap.data()?.counters || {};
        facCounter = manualCounters.fac || 0;
        recCounter = manualCounters.rec || 0;
        transaction.set(counterRef, { fac: facCounter, rec: recCounter });
      } else {
        facCounter = counterSnap.data().fac || 0;
        recCounter = counterSnap.data().rec || 0;
      }

      const isCharge = type === 'FEE' || type === 'FINE';
      const isPayment = type === 'PAYMENT';

      if (isCharge) {
        const newCount = facCounter + 1;
        transaction.update(counterRef, { fac: newCount });
        const seq = String(newCount).padStart(6, '0');
        const yyyymm = `${effectiveDate.getFullYear()}${String(effectiveDate.getMonth() + 1).padStart(2, '0')}`;
        return { voucherNumber: `FAC-${yyyymm}-${seq}`, voucherType: 'Cargo' };
      }

      if (isPayment) {
        const newCount = recCounter + 1;
        transaction.update(counterRef, { rec: newCount });
        const seq = String(newCount).padStart(6, '0');
        const yyyymmdd = `${effectiveDate.getFullYear()}${String(effectiveDate.getMonth() + 1).padStart(2, '0')}${String(effectiveDate.getDate()).padStart(2, '0')}`;
        return { voucherNumber: `REC-${yyyymmdd}-${seq}`, voucherType: 'Recibo' };
      }

      return null;
    });
  }

  /**
   * Genera N vouchers en una sola runTransaction, incrementando el contador atómicamente.
   * @param {number} count - Cantidad de vouchers a generar
   * @param {string} type - 'FEE' | 'FINE' | 'PAYMENT'
   * @param {Date} effectiveDate - Fecha base para el prefijo
   * @returns {Promise<Array<{voucherNumber: string, voucherType: string}>>}
   */
  static async _generateBatchVouchers(count, type, effectiveDate) {
    if (count <= 0) return [];
    const counterRef = doc(db, "system", "counters");
    return await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let facCounter, recCounter;
      if (!counterSnap.exists()) {
        const configRef = doc(db, "appConfig", "app");
        const configSnap = await transaction.get(configRef);
        const manualCounters = configSnap.data()?.counters || {};
        facCounter = manualCounters.fac || 0;
        recCounter = manualCounters.rec || 0;
        transaction.set(counterRef, { fac: facCounter, rec: recCounter });
      } else {
        facCounter = counterSnap.data().fac || 0;
        recCounter = counterSnap.data().rec || 0;
      }

      const isCharge = type === 'FEE' || type === 'FINE';
      const vouchers = [];
      if (isCharge) {
        const start = facCounter + 1;
        transaction.update(counterRef, { fac: facCounter + count });
        const yyyymm = `${effectiveDate.getFullYear()}${String(effectiveDate.getMonth() + 1).padStart(2, '0')}`;
        for (let i = 0; i < count; i++) {
          const seq = String(start + i).padStart(6, '0');
          vouchers.push({ voucherNumber: `FAC-${yyyymm}-${seq}`, voucherType: 'FAC' });
        }
      }
      return vouchers;
    });
  }

  /**
   * Crea una nueva transacción y registra la actividad correspondiente.
   * Si `data.idempotencyKey` ya existe en Firestore, reutiliza la transacción
   * previa (idempotencia) en vez de crear un duplicado.
   * @param {Object} data - Datos de la transacción (propertyId, amount, type, description, etc.)
   * @param {Object} initiator - Datos del usuario que realiza la acción {id, name, type: 'USER'|'SYSTEM'}
   * @returns {Promise<{id: string, duplicate: boolean}>} El ID de la transacción y si fue un duplicado.
   */
  static async create(data, initiator = { type: 'SYSTEM', name: 'Sistema' }) {
    try {
      // Idempotencia: si llega un idempotencyKey que ya fue procesado antes (doble clic,
      // re-intento tras timeout), reutilizamos la transacción existente en vez de duplicar.
      if (data.idempotencyKey) {
        const existingId = await this._findByIdempotencyKey(data.idempotencyKey);
        if (existingId) {
          console.warn(`[Transaction] Operación duplicada (idempotencyKey=${data.idempotencyKey}). Reutilizando transacción ${existingId}.`);
          return { id: existingId, duplicate: true };
        }
      }

      const effectiveDate = data.effectiveDate || new Date();
      const dateObj = effectiveDate instanceof Date ? effectiveDate : (effectiveDate.toDate ? effectiveDate.toDate() : new Date(effectiveDate));

      const transData = {
        ...data,
        effectiveDate: dateObj,
        createdAt: serverTimestamp(),
        period: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`,
        status: data.propertyId === '__UNIDENTIFIED__' ? 'unidentified' : (data.status || 'verified')
      };

      if (!data.voucherNumber) {
        const voucher = await this._generateVoucher(data.type, dateObj);
        if (voucher) {
          transData.voucherNumber = voucher.voucherNumber;
          transData.voucherType = voucher.voucherType;
        }
      }

      if (transData.pendingAmount === undefined) {
        transData.pendingAmount = data.amount < 0 ? Math.abs(data.amount) : 0;
      }

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
        visibility: ['admin'],
        details: { transactionId: docRef.id, amount: data.amount }
      });

      return { id: docRef.id, duplicate: false };
    } catch (error) {
      console.error("[Transaction] Error al crear transacción:", error);
      throw error;
    }
  }

  /**
   * Busca una transacción existente por su clave de idempotencia.
   * @param {string} key - Clave única generada por el cliente para una operación lógica.
   * @returns {Promise<string|null>} El ID de la transacción existente o null si no hay.
   */
  static async _findByIdempotencyKey(key) {
    const q = query(
      collection(db, "transactions"),
      where("idempotencyKey", "==", key),
      limit(1)
    );
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].id;
  }

  /**
   * Actualiza una transacción existente (ej: identificar un pago o corregir descripción).
   * @param {string} id - ID de la transacción.
   * @param {Object} data - Nuevos datos.
   * @param {Object} initiator - Datos del usuario que realiza la acción.
   */
  static async update(id, data, initiator = { type: 'SYSTEM', name: 'Sistema' }) {
    try {
      const updateData = { ...data, updatedAt: serverTimestamp() };
      
      // Si se está actualizando la fecha, recalculamos el periodo y aseguramos objeto Date
      if (data.effectiveDate) {
        const dateObj = data.effectiveDate instanceof Date ? data.effectiveDate : (data.effectiveDate.toDate ? data.effectiveDate.toDate() : new Date(data.effectiveDate));
        updateData.effectiveDate = dateObj;
        updateData.period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      }

      const docRef = doc(db, "transactions", id);
      await updateDoc(docRef, updateData);

      // Registrar actividad de actualización
      await createActivity({
        type: 'TRANSACTION_UPDATED',
        description: `Actualización de transacción ${id}`,
        initiator: initiator,
        target: { type: 'TRANSACTION', id: id },
        visibility: ['admin'],
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
        target: { type: 'TRANSACTION', id: id },
        visibility: ['admin']
      });
    } catch (error) {
      console.error(`[Transaction] Error al eliminar transacción ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los cargos (amount < 0) pendientes de una propiedad.
   * @param {string} propertyId 
   * @returns {Promise<Array>}
   */
  static async getPendingDebts(propertyId) {
    try {
      const q = query(
        collection(db, "transactions"),
        where("propertyId", "==", propertyId)
      );

      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const pending = data.pendingAmount !== undefined ? data.pendingAmount : Math.abs(data.amount);
        if (data.amount < 0 && pending > 0) {
          list.push({ id: doc.id, ...data, pending });
        }
      });
      return list.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateA - dateB;
      });
    } catch (error) {
      console.error(`[Transaction] Error al obtener deudas de ${propertyId}:`, error);
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
   * Obtiene transacciones de un periodo específico (AAAA-MM).
   * Muy eficiente para cierres mensuales.
   */
  static async getByPeriod(period) {
    try {
      const q = query(
        collection(db, "transactions"),
        where("period", "==", period),
        orderBy("effectiveDate", "desc")
      );
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error(`[Transaction] Error al obtener periodo ${period}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene transacciones de varios periodos (AAAA-MM) a la vez.
   * Útil para la vista por defecto: mes anterior + mes actual.
   * @param {Array<string>} periods - Lista de periodos (ej. ["2026-06","2026-07"]).
   * @returns {Promise<Array>} Transacciones combinadas, ordenadas por fecha efectiva desc.
   */
  static async getByPeriods(periods) {
    try {
      const lists = await Promise.all(periods.map(p => this.getByPeriod(p)));
      const merged = lists.flat();
      return merged.sort((a, b) => {
        const dateA = a.effectiveDate?.toDate ? a.effectiveDate.toDate() : new Date(a.effectiveDate || 0);
        const dateB = b.effectiveDate?.toDate ? b.effectiveDate.toDate() : new Date(b.effectiveDate || 0);
        return dateB - dateA;
      });
    } catch (error) {
      console.error("[Transaction] Error en getByPeriods:", error);
      throw error;
    }
  }

  /**
   * Obtiene transacciones dentro de un rango de fechas.
   * @param {Date|number} start - Fecha inicial.
   * @param {Date|number} end - Fecha final.
   * @param {number|null} limitCount - Límite opcional de resultados.
   */
  static async getByDateRange(start, end, limitCount = null) {
    try {
      const dStart = start instanceof Date ? start : new Date(start);
      const dEnd = end instanceof Date ? end : new Date(end);
      
      // Normalizar horas para cubrir el día completo
      dStart.setHours(0, 0, 0, 0);
      dEnd.setHours(23, 59, 59, 999);

      let q = query(
        collection(db, "transactions"),
        where("effectiveDate", ">=", dStart),
        where("effectiveDate", "<=", dEnd),
        orderBy("effectiveDate", "desc")
      );

      if (limitCount) {
        q = query(q, limit(limitCount));
      }

      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error("[Transaction] Error en getByDateRange:", error);
      throw error;
    }
  }

  /**
   * Obtiene las transacciones más recientes (Feed).
   * @param {number} limitCount - Cantidad de registros a traer (por defecto 100 para ahorrar).
   */
  static async getAll(limitCount = 100) {
    try {
      const q = query(
        collection(db, "transactions"), 
        orderBy("effectiveDate", "desc"), 
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error("[Transaction] Error al obtener todas:", error);
      throw error;
    }
  }

  /**
   * Obtiene transacciones filtradas por tipo específico.
   * @param {string} type - Tipo de transacción (FEE, FINE, PAYMENT, EXPENSE, OTHER_INCOME, etc.)
   * @param {number} limitCount - Cantidad de registros a traer.
   */
  static async getByType(type, limitCount = 100) {
    try {
      const q = query(
        collection(db, "transactions"),
        where("type", "==", type),
        orderBy("effectiveDate", "desc"),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error(`[Transaction] Error al obtener por tipo ${type}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los gastos operativos de la administración (solo tipo EXPENSE).
   * Estos son gastos de la comunidad (compras, servicios, mantenimiento) que no pertenecen
   * a una propiedad específica y son visibles para todos los usuarios autenticados.
   * @param {number} limitCount - Cantidad de registros a traer.
   */
  static async getExpenses(limitCount = 100) {
    return this.getByType('EXPENSE', limitCount);
  }

  /**
   * Obtiene todos los ingresos (PAYMENT + OTHER_INCOME).
   * @param {number} limitCount - Cantidad de registros a traer.
   */
  static async getIncome(limitCount = 100) {
    try {
      const [payments, otherIncome] = await Promise.all([
        this.getByType('PAYMENT', limitCount),
        this.getByType('OTHER_INCOME', limitCount)
      ]);
      const combined = [...payments, ...otherIncome]
        .sort((a, b) => {
          const dateA = a.effectiveDate?.toDate ? a.effectiveDate.toDate() : new Date(a.effectiveDate);
          const dateB = b.effectiveDate?.toDate ? b.effectiveDate.toDate() : new Date(b.effectiveDate);
          return dateB - dateA;
        })
        .slice(0, limitCount);
      return combined;
    } catch (error) {
      console.error("[Transaction] Error al obtener ingresos:", error);
      throw error;
    }
  }

  /**
   * Obtiene transacciones filtradas por concepto (chargeConcepts).
   * @param {string} conceptId - ID del concepto en chargeConcepts.
   * @param {number} limitCount - Cantidad de registros a traer.
   */
  static async getByConcept(conceptId, limitCount = 100) {
    try {
      const q = query(
        collection(db, "transactions"),
        where("concept", "==", conceptId),
        orderBy("effectiveDate", "desc"),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (error) {
      console.error(`[Transaction] Error al obtener por concepto ${conceptId}:`, error);
      throw error;
    }
  }
}
