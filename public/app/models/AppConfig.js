import { db, doc, getDoc, setDoc, runTransaction, serverTimestamp } from "../core/firebase.js";
import { applyIncomeDelta } from "../core/incomeTypes.js";

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
   * @param {Object} tx    La transacción creada, editada o borrada.
   * @param {1|-1} [sign]  +1 suma el movimiento, -1 lo resta.
   * @returns {Promise<Object|null>} El agregado resultante, o null si no aplicaba.
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
          // Reloj del servidor: si dos.payloads traen marcas de tiempo distintas,
          // `generadoEn` sería el reloj del cliente y puede ir atrasado.
          serverTimestamp()
        );

        transaction.set(configRef, { stats: { ...stats, ingresosPorTipo: next } }, { merge: true });
        return next;
      });
    } catch (error) {
      console.error(
        "[AppConfig] No se pudo actualizar stats.ingresosPorTipo. El pago sí quedó registrado; " +
        "usa «Sincronizar saldos» en Resumen Financiero para reconstruir el agregado:",
        error
      );
      return null;
    }
  }
}
