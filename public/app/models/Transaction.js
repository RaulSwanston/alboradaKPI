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
   * Lee el estado de los contadores de folios dentro de una transacción.
   * Si `system/counters` no existe, usa `appConfig.counters` como semilla
   * (último número utilizado, no el próximo).
   * @param {Object} transaction - Transacción de Firestore ya abierta.
   * @returns {Promise<{counterRef: Object, exists: boolean, fac: number, rec: number, nc: number}>}
   */
  static async _readVoucherCounters(transaction) {
    const counterRef = doc(db, "system", "counters");
    const counterSnap = await transaction.get(counterRef);

    if (counterSnap.exists()) {
      const data = counterSnap.data() || {};
      return {
        counterRef,
        exists: true,
        fac: Number(data.fac) || 0,
        rec: Number(data.rec) || 0,
        nc: Number(data.nc) || 0
      };
    }

    const configRef = doc(db, "appConfig", "app");
    const configSnap = await transaction.get(configRef);
    const manualCounters = configSnap.data()?.counters || {};
    return {
      counterRef,
      exists: false,
      fac: Number(manualCounters.fac) || 0,
      rec: Number(manualCounters.rec) || 0,
      nc: Number(manualCounters.nc) || 0
    };
  }

  /**
   * Genera un voucherNumber DENTRO de una transacción ya abierta.
   *
   * Existe para que la aprobación de un reporte de pago pueda generar el recibo
   * en la MISMA transacción que escribe el pago, los cargos y el saldo. Si se
   * llamara a `_generateVoucher()` (que abre su propia transacción) desde dentro
   * de otra, Firestore rechazaría la operación anidada o se perdería la
   * atomicidad.
   *
   * El folio de los pagos es puramente numérico (ej. `19122`): es la referencia
   * que el administrador usa como número de recibo. Los folios históricos
   * `REC-...` no se reescriben.
   *
   * @param {Object} transaction - Transacción de Firestore ya abierta.
   * @param {string} type - Tipo de transacción (FEE, FINE, PAYMENT, etc.)
   * @param {Date} effectiveDate - Fecha efectiva para el prefijo del cargo.
   * @returns {Promise<{voucherNumber: string, voucherType: string}|null>}
   */
  static async _generateVoucherInTransaction(transaction, type, effectiveDate) {
    const counters = await this._readVoucherCounters(transaction);
    const isCharge = type === 'FEE' || type === 'FINE';
    const isPayment = type === 'PAYMENT';

    if (isCharge) {
      const newCount = counters.fac + 1;
      if (counters.exists) {
        transaction.update(counters.counterRef, { fac: newCount });
      } else {
        transaction.set(counters.counterRef, { fac: newCount, rec: counters.rec });
      }
      const seq = String(newCount).padStart(6, '0');
      const yyyymm = `${effectiveDate.getFullYear()}${String(effectiveDate.getMonth() + 1).padStart(2, '0')}`;
      return { voucherNumber: `FAC-${yyyymm}-${seq}`, voucherType: 'Cargo' };
    }

    if (isPayment) {
      const newCount = counters.rec + 1;
      if (counters.exists) {
        transaction.update(counters.counterRef, { rec: newCount });
      } else {
        // Un solo `set`: Firestore no permite escribir dos veces el mismo
        // documento dentro de una transacción.
        transaction.set(counters.counterRef, { fac: counters.fac, rec: newCount, nc: counters.nc });
      }
      return { voucherNumber: String(newCount), voucherType: 'Recibo' };
    }

    if (type === 'CREDIT_NOTE') {
      const newCount = counters.nc + 1;
      if (counters.exists) {
        transaction.update(counters.counterRef, { nc: newCount });
      } else {
        transaction.set(counters.counterRef, { fac: counters.fac, rec: counters.rec, nc: newCount });
      }
      const seq = String(newCount).padStart(4, '0');
      const yyyymm = `${effectiveDate.getFullYear()}${String(effectiveDate.getMonth() + 1).padStart(2, '0')}`;
      return { voucherNumber: `NC-${yyyymm}-${seq}`, voucherType: 'Nota de Crédito' };
    }

    return null;
  }

  /**
   * Genera un voucherNumber secuencial (FAC o REC) usando runTransaction.
   * Lee el contador desde system/counters, lo incrementa atómicamente,
   * y si no existe lo inicializa desde appConfig.app.counters (secuencial manual del admin).
   * @param {string} type - Tipo de transacción (FEE, FINE, PAYMENT, etc.)
   * @param {Date} effectiveDate - Fecha efectiva para el prefijo del voucher
   * @returns {Promise<{voucherNumber: string, voucherType: string}|null>}
   */
  static async _generateVoucher(type, effectiveDate) {
    return await runTransaction(db, (transaction) =>
      this._generateVoucherInTransaction(transaction, type, effectiveDate)
    );
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
    return await runTransaction(db, async (transaction) => {
      const counters = await this._readVoucherCounters(transaction);
      const isCharge = type === 'FEE' || type === 'FINE';
      const vouchers = [];
      if (isCharge) {
        const start = counters.fac + 1;
        const nextFac = counters.fac + count;
        if (counters.exists) {
          transaction.update(counters.counterRef, { fac: nextFac });
        } else {
          transaction.set(counters.counterRef, { fac: nextFac, rec: counters.rec });
        }
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
      const isCreditNote = data.type === 'CREDIT_NOTE';
      const hasProperty = !!data.propertyId && !NON_PROPERTY_IDS.has(data.propertyId);
      await createActivity({
        type: isCreditNote
          ? 'CREDIT_NOTE_ISSUED'
          : (isOtherIncome
            ? 'OTHER_INCOME_REGISTERED'
            : (data.amount > 0 ? 'PAYMENT_REPORTED' : 'FEE_GENERATED')),
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
   * Crea una nota de crédito (condonación) de forma ATÓMICA:
   *  - valida que las facturas sean de la unidad y tengan saldo;
   *  - genera el folio NC-YYYYMM-NNNN en la misma transacción;
   *  - escribe la nota y actualiza `condonedBy`/`pendingAmount` de las facturas;
   *  - ajusta el saldo de la unidad (excluyendo facturas futuras, igual que un pago);
   *  - deja una actividad visible para el admin y los residentes de la unidad.
   *
   * No es caja: `Property` la excluye de la liquidez y `AppConfig` de los ingresos.
   *
   * @param {Object} data - { propertyId, amount, description, effectiveDate, appliedTo, metadata? }
   * @param {Object} initiator - { type, name, id? }
   * @returns {Promise<{id: string, voucherNumber: string|null}>}
   */
  static async createCreditNote(data, initiator = { type: 'USER', name: 'Administrador' }) {
    const propertyId = String(data?.propertyId || '').trim();
    if (!propertyId) throw new Error('La nota de crédito necesita una unidad.');

    const amount = Math.abs(Number(data?.amount) || 0);
    if (!(amount > 0)) throw new Error('El monto de la nota de crédito no es válido.');

    const links = (Array.isArray(data?.appliedTo) ? data.appliedTo : [])
      .filter(a => a && a.transactionId && Number(a.amount) > 0)
      .map(a => ({
        transactionId: String(a.transactionId),
        amount: Math.round((Number(a.amount) || 0) * 100) / 100,
        description: a.description || ''
      }));
    if (!links.length) throw new Error('Selecciona al menos una factura a condonar.');

    const total = Math.round(links.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
    if (Math.abs(total - amount) > 0.005) {
      throw new Error('El monto debe coincidir con lo condonado en las facturas.');
    }

    const rawDate = data.effectiveDate;
    const dateObj = rawDate instanceof Date
      ? rawDate
      : (rawDate?.toDate ? rawDate.toDate() : new Date(rawDate || Date.now()));
    const period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Lectura acotada a la unidad: permite validar el pendiente real cruzando
    // `paidBy` con el `appliedTo` de los pagos (el mismo criterio que ve el
    // admin en el formulario). Sin esto, un cargo con el `paidBy` incompleto
    // podría condonarse por más de lo que realmente debe.
    const unitTransactions = await this.getByPropertyId(propertyId);
    const appliedByCharge = new Map();
    for (const tx of unitTransactions) {
      if (tx.type !== 'PAYMENT') continue;
      for (const ap of (Array.isArray(tx.appliedTo) ? tx.appliedTo : [])) {
        if (!ap?.transactionId) continue;
        appliedByCharge.set(
          ap.transactionId,
          (appliedByCharge.get(ap.transactionId) || 0) + (Number(ap.amount) || 0)
        );
      }
    }

    return await runTransaction(db, async (transaction) => {
      const propRef = doc(db, "properties", propertyId);
      const chargeRefs = links.map(l => doc(db, "transactions", l.transactionId));
      const [propSnap, ...chargeSnaps] = await Promise.all([
        transaction.get(propRef),
        ...chargeRefs.map(ref => transaction.get(ref))
      ]);

      if (!propSnap.exists()) throw new Error('La unidad no existe.');

      let futurePortion = 0;
      chargeSnaps.forEach((snap, i) => {
        const link = links[i];
        if (!snap.exists()) {
          throw new Error(`La factura "${link.description || link.transactionId}" no existe.`);
        }
        const cargo = snap.data();
        if (cargo.type !== 'FEE' && cargo.type !== 'FINE') {
          throw new Error(`El movimiento "${link.description || link.transactionId}" no es una factura por pagar.`);
        }
        if (cargo.propertyId !== propertyId) {
          throw new Error(`La factura "${link.description || link.transactionId}" no pertenece a esta unidad.`);
        }
        const appliedPaid = appliedByCharge.get(link.transactionId) || 0;
        const pending = this.getChargePending(cargo, appliedPaid);
        if (link.amount > pending + 0.005) {
          throw new Error(`La factura "${link.description || link.transactionId}" solo tiene $${pending.toFixed(2)} pendientes.`);
        }
        if (cargo.type === 'FEE' && cargo.period && cargo.period > currentPeriod) {
          futurePortion += link.amount;
        }
      });

      const voucher = await this._generateVoucherInTransaction(transaction, 'CREDIT_NOTE', dateObj);
      const noteRef = doc(collection(db, "transactions"));
      const prop = propSnap.data();
      const residentUids = Array.isArray(prop.residentUids) ? prop.residentUids : [];

      transaction.set(noteRef, {
        ...data,
        propertyId,
        amount,
        type: 'CREDIT_NOTE',
        status: 'verified',
        effectiveDate: dateObj,
        period,
        pendingAmount: 0,
        appliedTo: links,
        voucherNumber: voucher?.voucherNumber || null,
        voucherType: voucher?.voucherType || 'Nota de Crédito',
        createdAt: serverTimestamp()
      });

      chargeSnaps.forEach((snap, i) => {
        const next = this.buildChargeCondonationUpdate(snap.data(), noteRef.id, links[i]);
        transaction.update(chargeRefs[i], {
          condonedBy: next.condonedBy,
          pendingAmount: next.pendingAmount
        });
      });

      // Igual que un pago: la porción aplicada a facturas futuras no entra al
      // saldo actual (esas facturas todavía no cuentan como deuda).
      const newBalance = (Number(prop.balance) || 0) + amount - futurePortion;
      transaction.update(propRef, {
        balance: newBalance,
        lastBalanceUpdate: new Date()
      });

      const activityRef = doc(collection(db, "activities"));
      transaction.set(activityRef, {
        timestamp: serverTimestamp(),
        type: 'CREDIT_NOTE_ISSUED',
        description: `Nota de crédito ${voucher?.voucherNumber || ''} por $${amount} en la unidad ${propertyId}`.trim(),
        initiator: initiator,
        target: {
          type: 'PROPERTY',
          id: propertyId,
          name: `Unidad ${propertyId}`
        },
        visibility: ['admin', ...residentUids],
        details: {
          creditNoteId: noteRef.id,
          amount,
          voucherNumber: voucher?.voucherNumber || null,
          reason: data.description || ''
        }
      });

      return { id: noteRef.id, voucherNumber: voucher?.voucherNumber || null };
    });
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

      // Las notas de crédito son inmutables: se crean o se eliminan. Editar una
      // obligaría a recalcular condonaciones y saldo; el flujo acordado es
      // eliminar y volver a crear.
      if (prev?.type === 'CREDIT_NOTE' || data.type === 'CREDIT_NOTE') {
        throw new Error('Las notas de crédito no se editan. Elimínala y crea una nueva.');
      }

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
      const actor = initiator || { type: 'SYSTEM', name: 'Sistema' };

      // Una nota de crédito no es un pago: al borrarla hay que liberar las
      // facturas que condonaba y revertir el saldo de la unidad. Las facturas y
      // la nota se borran en el mismo batch; el saldo va aparte y no es fatal.
      if (prev?.type === 'CREDIT_NOTE') {
        const links = (Array.isArray(prev.appliedTo) ? prev.appliedTo : [])
          .filter(a => a && a.transactionId);
        const chargeRefs = links.map(a => doc(db, "transactions", a.transactionId));
        const chargeSnaps = await Promise.all(chargeRefs.map(ref => getDoc(ref)));
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let futurePortion = 0;

        const batch = writeBatch(db);
        chargeSnaps.forEach((snap, i) => {
          if (!snap.exists()) return;
          const cargo = snap.data();
          const next = Transaction.buildChargeCondonationUpdate(cargo, id, null);
          batch.update(chargeRefs[i], {
            condonedBy: next.condonedBy,
            pendingAmount: next.pendingAmount
          });
          if (cargo.type === 'FEE' && cargo.period && cargo.period > currentPeriod) {
            futurePortion += Number(links[i].amount) || 0;
          }
        });
        batch.delete(docRef);
        await batch.commit();

        try {
          const propRef = doc(db, "properties", prev.propertyId);
          const propSnap = await getDoc(propRef);
          if (propSnap.exists()) {
            // La NC había sumado (importe − porción futura) al saldo; al borrarla
            // se revierte exactamente esa cantidad.
            const delta = -((Number(prev.amount) || 0) - futurePortion);
            await updateDoc(propRef, {
              balance: (Number(propSnap.data().balance) || 0) + delta,
              lastBalanceUpdate: new Date()
            });
          }
        } catch (balanceError) {
          console.warn(`[Transaction] No se revirtió el saldo de ${prev.propertyId}. Las facturas sí quedaron liberadas.`, balanceError);
        }

        await createActivity({
          type: 'TRANSACTION_DELETED',
          description: `Eliminación de nota de crédito ${prev.voucherNumber || id}`,
          initiator: actor,
          target: { type: 'TRANSACTION', id: id },
          visibility: ['admin']
        });
        return;
      }

      await deleteDoc(docRef);

      if (prev && (prev.type === 'PAYMENT' || prev.type === 'OTHER_INCOME')) {
        await AppConfig.applyIncomeDelta(prev, -1);
      }

      // Registrar actividad de eliminación
      await createActivity({
        type: 'TRANSACTION_DELETED',
        description: `Eliminación de transacción ${id}`,
        initiator: actor,
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

      // La query ya trae TODAS las transacciones de la unidad, así que se puede
      // cruzar el vínculo desde los dos lados sin lecturas extra: `paidBy` en el
      // cargo y `appliedTo` en el pago. Si una de las dos caras se quedó sin
      // escribir (bug histórico de conciliación), el cargo ya no se muestra
      // como impago solo porque el `paidBy` esté incompleto.
      const appliedByCharge = new Map();
      const docs = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        // `id` al final: si el documento trae un campo `id` heredado, no debe
        // pisar el ID real del documento (es la clave con la que se cruzan los
        // `appliedTo` de los pagos).
        docs.push({ ...data, id: doc.id });
        if (data.type !== 'PAYMENT') return;
        for (const ap of (Array.isArray(data.appliedTo) ? data.appliedTo : [])) {
          if (!ap?.transactionId) continue;
          appliedByCharge.set(
            ap.transactionId,
            (appliedByCharge.get(ap.transactionId) || 0) + (Number(ap.amount) || 0)
          );
        }
      });

      const include = new Set((includeIds || []).filter(Boolean));
      const list = [];
      for (const data of docs) {
        // Un gasto o un apunte administrativo con monto negativo NO es una
        // deuda del residente. Se excluye por tipo y no solo por propertyId:
        // los datos antiguos pueden traer una unidad en esos movimientos.
        if (NON_DEBT_TYPES.has(data.type)) continue;
        if (!(Number(data.amount) < 0)) continue;

        // `paidBy` es la fuente de verdad del pendiente; `pendingAmount` solo
        // un caché que puede quedar desactualizado (cargos parcialmente pagos).
        // El `appliedTo` del pago es la otra cara y cubre el caso en que el
        // cargo se quedó sin `paidBy` aunque el pago ya lo liste.
        const appliedPaid = appliedByCharge.get(data.id) || 0;
        const pending = Transaction.getChargePending(data, appliedPaid);
        if (pending > 0.005 || include.has(data.id)) {
          const total = Math.abs(Number(data.amount) || 0);
          list.push({
            ...data,
            pending,
            state: pending <= 0.005
              ? 'settled'
              : (pending >= total - 0.005 ? 'pending' : 'partial')
          });
        }
      }
      return list.sort((a, b) => {
        const pa = a.period || '';
        const pb = b.period || '';
        if (pa !== pb) return pa.localeCompare(pb);
        const dateA = a.effectiveDate?.toDate ? a.effectiveDate.toDate() : new Date(a.effectiveDate || 0);
        const dateB = b.effectiveDate?.toDate ? b.effectiveDate.toDate() : new Date(b.effectiveDate || 0);
        return dateA - dateB;
      });
    } catch (error) {
      console.error(`[Transaction] Error al obtener deudas de ${propertyId}:`, error);
      throw error;
    }
  }

  /**
   * Pendiente real de un cargo (FEE/FINE), derivado de `paidBy` cuando existe.
   *
   * `paidBy` es la fuente de verdad; `pendingAmount` es solo un caché derivado
   * que puede quedar desactualizado. Por eso, si hay entradas en `paidBy`, se
   * recalcula desde ellas; solo se recurre a `pendingAmount` (o al monto bruto)
   * cuando no hay vínculos (datos antiguos).
   *
   * @param {Object} cargo - Documento del cargo.
   * @param {number} [appliedPaid=0] - Suma que los pagos declaran en su
   *        `appliedTo` para este cargo (la otra cara de `paidBy`). El llamador
   *        la obtiene del snapshot de la unidad, sin lecturas extra.
   * @returns {number}
   */
  static getChargePending(cargo, appliedPaid = 0) {
    const amount = Math.abs(Number(cargo?.amount) || 0);
    const paidBy = Array.isArray(cargo?.paidBy) ? cargo.paidBy : [];
    const paidTotal = paidBy.reduce((sum, pb) => sum + (Number(pb?.amount) || 0), 0);
    const condonedBy = Array.isArray(cargo?.condonedBy) ? cargo.condonedBy : [];
    const condonedTotal = condonedBy.reduce((sum, cn) => sum + (Number(cn?.amount) || 0), 0);
    // Evidencia por las dos caras del vínculo. Si una quedó incompleta (un
    // `paidBy` sin `amount`, o un pago cuyo cargo nunca recibió `paidBy`), la
    // otra evita mostrar una factura ya pagada como pendiente. Las
    // condonaciones de notas de crédito se suman aparte: no son dinero.
    const settled = Math.max(paidTotal, Number(appliedPaid) || 0) + condonedTotal;
    if (settled > 0) {
      return Math.round(Math.max(0, amount - settled) * 100) / 100;
    }
    // Antes se exigía `paidBy.length > 0`; una entrada sin `amount` devolvía el
    // importe completo aunque el cargo estuviera saldado. Cuando no hay
    // evidencia utilizable, el caché `pendingAmount` es más fiable.
    if (cargo?.pendingAmount !== undefined) {
      return Math.round(Math.max(0, Number(cargo.pendingAmount) || 0) * 100) / 100;
    }
    return Math.round(amount * 100) / 100;
  }

  /**
   * Calcula el estado de un cargo después de aplicar (o liberar) el pago indicado.
   *
   * Es la regla canónica de conciliación: `paidBy` guarda una entrada por pago
   * (se reemplaza la del mismo `paymentId`, nunca se duplica) y `pendingAmount`
   * se DERIVA de la suma de `paidBy`, no se resta incrementalmente. Así, volver
   * a guardar repara un cargo descuadrado en vez de acumular el error.
   *
   * @param {Object} cargo - Documento del cargo (FEE/FINE).
   * @param {string} paymentId - ID del pago que se aplica o libera.
   * @param {{amount?: number, description?: string}|null} [link] - Vínculo a
   *        aplicar. `null` libera el pago del cargo.
   * @returns {{paidBy: Array, pendingAmount: number}}
   */
  static buildChargePaymentUpdate(cargo, paymentId, link = null) {
    const curPaidBy = Array.isArray(cargo?.paidBy) ? cargo.paidBy : [];
    const others = curPaidBy.filter(pb => pb && pb.paymentId !== paymentId);
    const newPaidBy = link
      ? [...others, {
          paymentId,
          amount: Number(link.amount) || 0,
          description: link.description || ''
        }]
      : others;
    const paidTotal = newPaidBy.reduce((sum, pb) => sum + (Number(pb?.amount) || 0), 0);
    const condonedTotal = (Array.isArray(cargo?.condonedBy) ? cargo.condonedBy : [])
      .reduce((sum, cn) => sum + (Number(cn?.amount) || 0), 0);
    const cargoAmount = Math.abs(Number(cargo?.amount) || 0);
    return {
      paidBy: newPaidBy,
      pendingAmount: Math.max(0, Math.round((cargoAmount - paidTotal - condonedTotal) * 100) / 100)
    };
  }

  /**
   * Calcula el estado de un cargo después de aplicar (o liberar) una nota de
   * crédito. Es el equivalente de `buildChargePaymentUpdate` para condonaciones:
   * `condonedBy` guarda una entrada por nota (se reemplaza la del mismo id) y
   * `pendingAmount` se DERIVA de `paidBy` + `condonedBy`, nunca se resta a mano.
   *
   * @param {Object} cargo - Documento del cargo (FEE/FINE).
   * @param {string} creditNoteId - ID de la nota de crédito.
   * @param {{amount?: number, description?: string}|null} [link] - Condonación a
   *        aplicar. `null` la libera.
   * @returns {{condonedBy: Array, pendingAmount: number}}
   */
  static buildChargeCondonationUpdate(cargo, creditNoteId, link = null) {
    const cur = Array.isArray(cargo?.condonedBy) ? cargo.condonedBy : [];
    const others = cur.filter(cn => cn && cn.creditNoteId !== creditNoteId);
    const newCondoned = link
      ? [...others, {
          creditNoteId,
          amount: Number(link.amount) || 0,
          description: link.description || ''
        }]
      : others;
    const condonedTotal = newCondoned.reduce((sum, cn) => sum + (Number(cn?.amount) || 0), 0);
    const paidTotal = (Array.isArray(cargo?.paidBy) ? cargo.paidBy : [])
      .reduce((sum, pb) => sum + (Number(pb?.amount) || 0), 0);
    const cargoAmount = Math.abs(Number(cargo?.amount) || 0);
    return {
      condonedBy: newCondoned,
      pendingAmount: Math.max(0, Math.round((cargoAmount - paidTotal - condonedTotal) * 100) / 100)
    };
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
      const desired = linkById.get(snap.id);

      // Upsert (link) o remove (release). El resto de entradas de otros pagos se conserva.
      // La misma regla la usa `PaymentNotification.approve()` al crear un pago, para
      // que ambos caminos de escritura dejen exactamente el mismo shape en `paidBy`.
      const { paidBy: newPaidBy, pendingAmount: newPending } = this.buildChargePaymentUpdate(
        cargo,
        paymentId,
        desired || null
      );
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
