import { db, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, serverTimestamp, runTransaction, writeBatch } from "../core/firebase.js";
import { createActivity } from "./Activities.js";
import AppConfig from "./AppConfig.js";

/** Tipos que nunca representan una deuda de una unidad, aunque su monto sea negativo. */
const NON_DEBT_TYPES = new Set(['EXPENSE', 'ADMIN_EXPENSE', 'OTHER']);

/** IDs de `propertyId` que no corresponden a una unidad real. */
const NON_PROPERTY_IDS = new Set([
  '__UNIDENTIFIED__',
  '__ADMIN_INCOME__',
  '__ADMIN_EXPENSE__',
  'PAGOS',
  'INTERES'
]);

/** Tipos que alimentan `appConfig.stats.ingresosPorTipo`. */
const INCOME_TYPES = new Set(['PAYMENT', 'OTHER_INCOME']);

/**
 * Convierte un Timestamp de Firestore, un Date o un string a milisegundos.
 * Devuelve 0 si el valor no existe o no es una fecha válida.
 */
const timestampMs = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

/**
 * Orden canónico de los listados: fecha efectiva descendente y, para el mismo
 * día, el último creado primero. Sin este desempate, Firestore ordena los
 * empates de `effectiveDate` por ID de documento, por lo que un pago recién
 * creado podía aparecer en medio de los pagos del mismo día.
 */
export function sortTransactionsByDateDesc(list) {
  return list.sort((a, b) =>
    timestampMs(b.effectiveDate) - timestampMs(a.effectiveDate) ||
    timestampMs(b.createdAt) - timestampMs(a.createdAt)
  );
}

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
        let bankRef = null;
        if (data.metadata && typeof data.metadata === 'object') {
          bankRef = data.metadata.bankReference || data.metadata.bankRef || null;
        }
        if (!bankRef && data['metadata.bankReference']) {
          bankRef = data['metadata.bankReference'];
        }
        if (data.type === 'PAYMENT' && bankRef && String(bankRef).trim()) {
          transData.voucherNumber = String(bankRef).trim();
          transData.voucherType = 'Recibo';
        } else {
          const voucher = await this._generateVoucher(data.type, dateObj);
          if (voucher) {
            transData.voucherNumber = voucher.voucherNumber;
            transData.voucherType = voucher.voucherType;
          }
        }
      }

      if (transData.pendingAmount === undefined) {
        // Solo FEE y FINE son cargos/deudas de una unidad. Un EXPENSE u OTHER
        // con monto negativo no debe nacer con pendingAmount: lo haría aparecer
        // como cargo por pagar en la conciliación y en el reporte del residente.
        const isCharge = data.type === 'FEE' || data.type === 'FINE';
        transData.pendingAmount = isCharge ? Math.abs(data.amount) : 0;
      }

      const docRef = await addDoc(collection(db, "transactions"), transData);

      // Registrar la actividad automáticamente.
      // Un movimiento sin unidad (gasto comunitario, apunte administrativo o
      // ingreso de la administración) no puede apuntar a una propiedad
      // inexistente: se enlaza a la transacción para que el feed abra su detalle.
      const isOtherIncome = data.type === 'OTHER_INCOME';
      const hasProperty = !!data.propertyId && !NON_PROPERTY_IDS.has(data.propertyId);
      await createActivity({
        type: isOtherIncome
          ? 'OTHER_INCOME_REGISTERED'
          : (data.amount > 0 ? 'PAYMENT_REPORTED' : 'FEE_GENERATED'),
        description: `${data.description} por ${Math.abs(Number(data.amount) || 0)} USD`,
        initiator: initiator,
        target: hasProperty
          ? {
              type: 'PROPERTY',
              id: data.propertyId,
              name: `Unidad ${data.propertyId}`
            }
          : {
              type: 'TRANSACTION',
              id: docRef.id,
              name: isOtherIncome ? 'Ingreso de la administración' : 'Movimiento de administración'
            },
        visibility: ['admin'],
        details: { transactionId: docRef.id, amount: data.amount }
      });

      // Mantener al día el desglose de ingresos de Gastos Generales. Va DESPUÉS
      // del addDoc: si el agregado falla, el pago sigue escrito (es la fuente de
      // la verdad) y `AppConfig` solo avisa por consola en vez de romper la UI.
      await AppConfig.applyIncomeDelta(transData, 1);

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
      
      const docRef = doc(db, "transactions", id);

      // Para el desglose de ingresos hay que restar la contribución VIEJA antes de
      // sumar la nueva: si un pago pasa de $100 en marzo a $150 en abril, sin esto
      // el agregado sumaría los dos. Son 1 lectura, solo en escrituras de admins.
      const prevSnap = await getDoc(docRef);
      const prev = prevSnap.exists() ? prevSnap.data() : null;
      const prevWasIncome = prev && INCOME_TYPES.has(prev.type);

      // Si se está actualizando la fecha, recalculamos el periodo y aseguramos objeto Date
      if (data.effectiveDate) {
        const dateObj = data.effectiveDate instanceof Date ? data.effectiveDate : (data.effectiveDate.toDate ? data.effectiveDate.toDate() : new Date(data.effectiveDate));
        updateData.effectiveDate = dateObj;
        updateData.period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      }

      // Red de seguridad para cualquier llamador: si llega `metadata` como mapa,
      // `updateDoc` lo reemplazaría entero y borraría campos hermanos (comprobante,
      // notificación de pago, autor de la revisión…). Se fusiona con el previo.
      if (prev && data.metadata && typeof data.metadata === 'object') {
        updateData.metadata = { ...(prev.metadata || {}), ...data.metadata };
      }

      await updateDoc(docRef, updateData);

      // Restar lo viejo y sumar lo nuevo. `updateData` ya trae el `period`
      // recalculado arriba, así que mover un pago de mes no deja el cubo viejo.
      // También cubre el cambio de tipo: antes, pasar de un gasto a un ingreso
      // no sumaba el nuevo importe al agregado porque solo se miraba el tipo previo.
      const nextTx = prev
        ? { ...prev, ...updateData, period: updateData.period || prev.period }
        : null;
      const nextIsIncome = nextTx && INCOME_TYPES.has(nextTx.type);
      if (prevWasIncome) {
        await AppConfig.applyIncomeDelta(prev, -1);
      }
      if (nextTx && (prevWasIncome || nextIsIncome)) {
        await AppConfig.applyIncomeDelta(nextTx, 1);
      }

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

      // Hay que leer el pago ANTES de borrarlo: es el único momento en que se
      // conoce cuánto estaba sumando al desglose de ingresos.
      const prevSnap = await getDoc(docRef);
      const prev = prevSnap.exists() ? prevSnap.data() : null;

      await deleteDoc(docRef);

      if (prev && (prev.type === 'PAYMENT' || prev.type === 'OTHER_INCOME')) {
        await AppConfig.applyIncomeDelta(prev, -1);
      }

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
   * Obtiene los cargos (amount < 0) de una propiedad.
   *
   * Por defecto solo devuelve los que tienen saldo pendiente. `includeIds` permite
   * traer también cargos ya saldados que estén vinculados al pago que se está
   * editando, para poder mostrarlos seleccionados en el panel de conciliación.
   * No cuesta lecturas extra: la consulta ya descarga todas las transacciones.
   *
   * @param {string} propertyId
   * @param {{includeIds?: string[]}} [options]
   * @returns {Promise<Array>}
   */
  static async getPendingDebts(propertyId, { includeIds = [] } = {}) {
    try {
      const q = query(
        collection(db, "transactions"),
        where("propertyId", "==", propertyId)
      );

      const querySnapshot = await getDocs(q);
      const include = new Set((includeIds || []).filter(Boolean));
      const list = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        // Un gasto o un apunte administrativo con monto negativo NO es una
        // deuda del residente. Se excluye por tipo y no solo por propertyId:
        // los datos antiguos pueden traer una unidad en esos movimientos.
        if (NON_DEBT_TYPES.has(data.type)) return;
        const pending = data.pendingAmount !== undefined ? data.pendingAmount : Math.abs(data.amount);
        if (data.amount < 0 && (pending > 0 || include.has(doc.id))) {
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
   * Reconcilia de forma AUTO-REPARABLE los cargos (FEE/FINE) vinculados a un pago.
   *
   * A diferencia del patrón basado en el diff de `appliedTo`, este método hace
   * `upsert` por `paymentId` en cada cargo de `links` y DERIVA `pendingAmount` de la
   * suma de `paidBy` (en vez de restar incrementalmente). Consecuencias:
   *   - Volver a guardar SIEMPRE repara un cargo que quedó sin `paidBy`: aunque el
   *     `appliedTo` del pago ya lo liste, se vuelve a enlazar y se recalcula el
   *     pendiente. El aviso "vuelva a guardar para reintentar" pasa a ser cierto.
   *   - No hay doble descuento: `pendingAmount` se recalcula, no se acumula.
   *   - Varias entradas del mismo pago en `paidBy` se colapsan en una sola.
   *
   * Todo se escribe en un único `writeBatch` atómico. Un cargo solo se actualiza si
   * su resultado difiere del estado actual (evita escrituras inútiles y, por tanto,
   * que la UI muestre "guardado" cuando en realidad no había nada que reparar).
   *
   * @param {Object} payload
   * @param {string} payload.paymentId - ID del pago que se concilia.
   * @param {string} payload.propertyId - Unidad a la que deben pertenecer los cargos.
   * @param {Array<{transactionId: string, amount: number, description?: string}>} payload.links
   *        Cargos que este pago debe cubrir (el `appliedTo` deseado).
   * @param {string[]} [payload.releaseIds] - Cargos de los que hay que desvincular el pago.
   * @param {Array} [payload.appliedTo] - Si se indica, se guarda como `appliedTo` del
   *        pago dentro del mismo batch (fuente de verdad de los vínculos).
   * @param {number} [payload.balanceDelta] - Ajuste a `properties/{propertyId}.balance`.
   * @returns {Promise<{conciliados:number, liberados:number, omitidos:number}>}
   */
  static async reconcileCharges({ paymentId, propertyId, links = [], releaseIds = [], appliedTo = null, balanceDelta = 0 }) {
    // Normaliza `links` (acepta objetos o ids sueltos por compatibilidad) e ignora
    // los que no tengan monto válido: un enlace sin monto no se puede derivar.
    const linkById = new Map();
    const omitidosDeLink = [];
    for (const l of (links || [])) {
      const transactionId = typeof l === 'string' ? l : (l && l.transactionId);
      const amount = typeof l === 'string' ? 0 : Number(l && l.amount) || 0;
      if (!transactionId) continue;
      if (amount <= 0) { linkById.set(transactionId, { transactionId, amount: 0, description: '' }); omitidosDeLink.push(transactionId); continue; }
      linkById.set(transactionId, { transactionId, amount, description: (l && l.description) || '' });
    }

    const omitidosSet = new Set(omitidosDeLink);
    const releaseSet = new Set((releaseIds || []).filter(id => id && !linkById.has(id)));
    const ids = [...new Set([...linkById.keys(), ...releaseSet])];
    if (!ids.length && !balanceDelta && appliedTo === null) return { conciliados: 0, liberados: 0, omitidos: 0 };

    const snapshots = await Promise.all(ids.map(id => getDoc(doc(db, "transactions", id))));

    const batch = writeBatch(db);
    let conciliados = 0;
    let liberados = 0;
    let omitidos = omitidosSet.size;
    let wrote = false;

    const sumAmounts = (arr) => (arr || []).reduce((s, pb) => s + (Number(pb.amount) || 0), 0);
    const samePaidBy = (a, b) =>
      a.length === b.length &&
      b.every(nb => a.some(cb => cb.paymentId === nb.paymentId && (Number(cb.amount) || 0) === (Number(nb.amount) || 0)));

    for (const snap of snapshots) {
      if (!snap.exists()) {
        console.warn(`[Transaction] Cargo ${snap.id} no existe. Se omite.`);
        omitidos++;
        continue;
      }
      const cargo = snap.data();

      // El cargo debe ser de esta unidad: un enlace cruzado movería el saldo de una
      // casa con el pago de otra.
      if (cargo.propertyId && propertyId && cargo.propertyId !== propertyId) {
        console.warn(`[Transaction] Cargo ${snap.id} es de ${cargo.propertyId} y el pago de ${propertyId}. Se omite.`);
        omitidos++;
        continue;
      }

      if (omitidosSet.has(snap.id)) continue; // link sin monto: no se toca

      const curPaidBy = Array.isArray(cargo.paidBy) ? cargo.paidBy : [];
      const others = curPaidBy.filter(pb => pb.paymentId !== paymentId);
      const desired = linkById.get(snap.id);

      // Upsert (link) o remove (release). El resto de entradas de otros pagos se conserva.
      const newPaidBy = desired
        ? [...others, { paymentId, amount: desired.amount, description: desired.description || '' }]
        : others;

      const newPending = Math.max(0, Math.abs(cargo.amount || 0) - sumAmounts(newPaidBy));
      const curPending = cargo.pendingAmount !== undefined ? cargo.pendingAmount : Math.abs(cargo.amount || 0);

      if (samePaidBy(curPaidBy, newPaidBy) && curPending === newPending) continue; // ya consistente

      batch.update(doc(db, "transactions", snap.id), {
        paidBy: newPaidBy,
        pendingAmount: newPending
      });
      wrote = true;
      if (desired) conciliados++; else liberados++;
    }

    // Si el llamador pide fijar el `appliedTo` del pago, va en el MISMO batch que los
    // cargos: el pago y sus facturas no pueden quedar desincronizados.
    if (appliedTo !== null) {
      batch.update(doc(db, "transactions", paymentId), { appliedTo });
      wrote = true;
    }

    if (wrote) await batch.commit();

    // El saldo va aparte y a propósito: una escritura rechazada en `properties/{id}`
    // (reglas, permisos) no debe tirar abajo la conciliación de los cargos, que es la
    // que deja las facturas en estado correcto. El saldo es recalculable.
    if (balanceDelta) {
      try {
        const propSnap = await getDoc(doc(db, "properties", propertyId));
        if (propSnap.exists()) {
          await updateDoc(doc(db, "properties", propertyId), {
            balance: (propSnap.data().balance || 0) + balanceDelta,
            lastBalanceUpdate: new Date()
          });
        }
      } catch (e) {
        console.warn(`[Transaction] No se actualizó el saldo de ${propertyId}. Los cargos sí quedaron conciliados.`, e);
      }
    }

    console.log(`[Transaction] Conciliación pago ${paymentId}: ${conciliados} enlazado(s), ${liberados} liberado(s), ${omitidos} omitido(s).`);
    return { conciliados, liberados, omitidos };
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
      
      // Ordenamos en memoria por fecha efectiva (descendente) y, para el mismo
      // día, por fecha de creación (el último registrado primero).
      return sortTransactionsByDateDesc(list);
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
      return sortTransactionsByDateDesc(list);
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
      return sortTransactionsByDateDesc(list);
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
      return sortTransactionsByDateDesc(lists.flat());
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
      return sortTransactionsByDateDesc(list);
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
      return sortTransactionsByDateDesc(list);
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
      return sortTransactionsByDateDesc(list);
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
   * Obtiene TODOS los gastos operativos (solo tipo EXPENSE) paginando en lotes.
   * Garantiza el histórico completo para el agrupamiento por cuenta de gasto,
   * sin depender del límite visible de una sola consulta.
   * @param {number} batchSize - Tamaño de lote por consulta (límite de Firestore).
   * @returns {Promise<Array>} Lista completa de gastos.
   */
  static async getAllExpenses(batchSize = 1000) {
    try {
      const base = [
        where("type", "==", "EXPENSE"),
        orderBy("effectiveDate", "desc")
      ];

      const all = [];
      let lastDoc = null;

      while (true) {
        const q = lastDoc
          ? query(collection(db, "transactions"), ...base, startAfter(lastDoc), limit(batchSize))
          : query(collection(db, "transactions"), ...base, limit(batchSize));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) break;

        querySnapshot.forEach((docSnap) => all.push({ id: docSnap.id, ...docSnap.data() }));
        lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

        if (all.length % 1000 !== 0 || querySnapshot.docs.length < batchSize) break;
      }

      console.log(`[Transaction] Carga completa de gastos: ${all.length} registros.`);
      return all;
    } catch (error) {
      console.error("[Transaction] Error al obtener todos los gastos:", error);
      throw error;
    }
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
      return sortTransactionsByDateDesc(list);
    } catch (error) {
      console.error(`[Transaction] Error al obtener por concepto ${conceptId}:`, error);
      throw error;
    }
  }
}
