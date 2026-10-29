import { db, doc, getDoc, setDoc, runTransaction, serverTimestamp } from "../core/firebase.js";
import { applyIncomeDelta, incomePeriodKey } from "../core/incomeTypes.js";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Convierte Timestamp/Date/string a Date; devuelve null si no es válido. */
const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Modelo para gestionar la configuración global de la aplicación.
 */
export default class AppConfig {
  /**
   * Obtiene la configuración global desde Firestore.
   * @returns {Promise<Object|null>}
   */
  static async get() {
    try {
      const docRef = doc(db, "appConfig", "app");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (error) {
      console.error("[AppConfig] Error al obtener configuración:", error);
      throw error;
    }
  }

  /**
   * Guarda la configuración global en Firestore.
   * @param {Object} config - Objeto de configuración completo.
   */
  static async save(config) {
    try {
      const docRef = doc(db, "appConfig", "app");
      await setDoc(docRef, config, { merge: true });
      return true;
    } catch (error) {
      console.error("[AppConfig] Error al guardar configuración:", error);
      throw error;
    }
  }

  /**
   * Suma (o resta) el efecto de UNA transacción sobre `stats.ingresosPorTipo`.
   *
   * Existe para que la tarjeta "Ingresos por categoría" de Gastos Generales se
   * mantenga al día sin que el administrador tenga que releer los 2.791 pagos
   * con "Sincronizar saldos". Cuesta 1 lectura + 1 escritura por pago, contra
   * 2.791 lecturas por reconstrucción completa.
   *
   * Va dentro de `runTransaction` porque el saldo de caja se actualiza en varios
   * sitios a la vez (un pago reportado por un residente y otro aprobado por
   * administración pueden caer juntos): leer-modificar-escribir a pelo dejaría
   * perder una de las dos sumas. `runTransaction` reintenta solo ante ese choque.
   *
   * `{ merge: true }` de Firestore solo fusiona el PRIMER nivel, así que
   * escribir `{ stats }` sin arrastrar el resto BORRARÍA los otros saldos de
   * `stats`. Por eso se reenvía el `stats` entero con el campo nuevo pegado.
   *
   * NO propaga el error a propósito: si esto falla, el pago ya está escrito y es
   * la fuente de la verdad. Romper la interfaz aquí haría creer al usuario que su
   * pago se perdió. Se avisa por consola y el agregado se reconstruye con el
   * botón de sincronización.
   *
   * Además de `ingresosPorTipo`, mantiene al día la caja del dashboard
   * (`saldoCajaDisponible` y `saldoPorPeriodo`) para que un pago aprobado se
   * vea sin pulsar “Sincronizar saldos”. Son 1 lectura + 1 escritura, el mismo
   * coste que ya tenía el agregado de ingresos.
   *
   * @param {Object} tx    La transacción creada, editada o borrada.
   * @param {1|-1} [sign]  +1 suma el movimiento, -1 lo resta.
   * @returns {Promise<Object|null>} El agregado de ingresos resultante, o null si no aplicaba.
   */
  static async applyIncomeDelta(tx, sign = 1) {
    const isIncome = tx && (tx.type === 'PAYMENT' || tx.type === 'OTHER_INCOME');
    if (!isIncome) return null;

    const configRef = doc(db, "appConfig", "app");

    try {
      return await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(configRef);
        const current = snap.exists() ? snap.data() : {};
        const stats = current.stats || {};

        const next = applyIncomeDelta(
          stats.ingresosPorTipo,
          tx,
          sign,
          // Reloj del servidor: si dos payloads traen marcas de tiempo distintas,
          // `generadoEn` sería el reloj del cliente y puede ir atrasado.
          serverTimestamp()
        );

        // Caja: el dinero real entró/salió, así que se mueve por el monto bruto.
        // `incomePeriodKey` replica la misma regla de periodo que usa
        // `Property.recalculateAllBalances`, para que el filtro mensual no diverja.
        const cashDelta = round2(Math.abs(Number(tx.amount) || 0) * sign);
        const period = incomePeriodKey(tx);
        const saldoPorPeriodo = { ...(stats.saldoPorPeriodo || {}) };
        saldoPorPeriodo[period] = round2((Number(saldoPorPeriodo[period]) || 0) + cashDelta);
        if (saldoPorPeriodo[period] === 0) delete saldoPorPeriodo[period];

        const nextStats = {
          ...stats,
          saldoCajaDisponible: round2((Number(stats.saldoCajaDisponible) || 0) + cashDelta),
          saldoPorPeriodo,
          ingresosPorTipo: next
        };

        // Último pago global: solo tiene sentido al sumar un PAYMENT y solo si
        // su fecha efectiva es la más reciente conocida. Al restar/editar un
        // pago antiguo se conserva el último bueno; la sincronización completa
        // lo reconstruye si hiciera falta.
        if (sign > 0 && tx.type === 'PAYMENT') {
          const txDate = toDate(tx.effectiveDate || tx.createdAt);
          const lastDate = toDate(stats.ultimoPagoFecha);
          if (txDate && (!lastDate || txDate.getTime() >= lastDate.getTime())) {
            nextStats.ultimoPagoMonto = Math.abs(Number(tx.amount) || 0);
            nextStats.ultimoPagoFecha = txDate;
          }
        }

        transaction.set(configRef, { stats: nextStats }, { merge: true });
        return next;
      });
    } catch (error) {
      console.error(
        "[AppConfig] No se pudo actualizar la caja/ingresos en appConfig. El pago sí quedó registrado; " +
        "usa «Sincronizar saldos» en Resumen Financiero para reconstruir el agregado:",
        error
      );
      return null;
    }
  }

  /**
   * Fija el próximo número de recibo que generará `Transaction._generateVoucher`.
   *
   * `system/counters.rec` guarda el ÚLTIMO número usado; el próximo es +1. El
   * administrador escribe el próximo (ej. 19122) y aquí se persiste 19121.
   *
   * Se impide bajar el contador: reutilizar un número ya emitido produciría dos
   * recibos con la misma referencia. Para "reiniciar" habría que hacerlo a mano
   * y con conocimiento del histórico.
   *
   * @param {number} nextNumber - Próximo número de recibo (entero >= 1).
   * @returns {Promise<number>} El próximo número confirmado.
   */
  static async setReceiptCounter(nextNumber) {
    const next = Math.floor(Number(nextNumber));
    if (!Number.isFinite(next) || next < 1) {
      throw new Error("El próximo número de recibo debe ser un entero positivo.");
    }

    const configRef = doc(db, "appConfig", "app");
    const counterRef = doc(db, "system", "counters");

    return await runTransaction(db, async (transaction) => {
      const [configSnap, counterSnap] = await Promise.all([
        transaction.get(configRef),
        transaction.get(counterRef)
      ]);

      const current = counterSnap.exists() ? (Number(counterSnap.data().rec) || 0) : 0;
      if (next <= current) {
        throw new Error(`El próximo recibo debe ser mayor que ${current}.`);
      }

      const configCounters = configSnap.exists() ? (configSnap.data().counters || {}) : {};
      const lastUsed = next - 1;
      const counters = { ...configCounters, rec: lastUsed };

      transaction.set(configRef, { counters }, { merge: true });
      if (counterSnap.exists()) {
        transaction.update(counterRef, { rec: lastUsed });
      } else {
        transaction.set(counterRef, { fac: Number(configCounters.fac) || 0, rec: lastUsed });
      }

      return next;
    });
  }
}
