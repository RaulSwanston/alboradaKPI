import { db, collection, getDocs, query, doc, getDoc, updateDoc, where, setDoc, orderBy } from "../core/firebase.js";

/**
 * La clase Property encapsula la lógica para interactuar con la colección 'properties' en Firestore.
 */
export default class Property {
  /**
   * Obtiene una propiedad específica por su ID.
   * @param {string} id - El ID de la propiedad (ej: '001', '101').
   * @returns {Promise<Object|null>} Un objeto con los datos de la propiedad o null si no existe.
   */
  static async getById(id) {
    try {
      const docRef = doc(db, "properties", id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        console.warn(`[Property] No se encontró la propiedad con ID: ${id}`);
        return null;
      }
    } catch (error) {
      console.error(`[Property] Error al obtener propiedad ${id}:`, error);
      throw error;
    }
  }

  /**
   * Importa múltiples propiedades de forma masiva utilizando lotes (writeBatch).
   * @param {Array} properties - Lista de objetos de propiedad [{id, ...data}].
   * @param {Function} onBatchComplete - Callback opcional para reportar progreso.
   * @returns {Promise<{success: boolean, total: number}>}
   */
  static async importMany(properties, onBatchComplete = null) {
    const { writeBatch } = await import("../core/firebase.js");
    
    try {
      // Dividimos en lotes de 450 (límite Firestore es 500)
      const chunks = [];
      for (let i = 0; i < properties.length; i += 450) {
        chunks.push(properties.slice(i, i + 450));
      }

      let totalProcessed = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const batch = writeBatch(db);
        
        chunk.forEach(prop => {
          const { id, ...data } = prop;
          if (id) {
            const docRef = doc(db, 'properties', String(id));
            batch.set(docRef, {
              ...data,
              updatedAt: new Date()
            }, { merge: true });
          }
        });

        await batch.commit();
        totalProcessed += chunk.length;
        if (onBatchComplete) onBatchComplete(i + 1, chunks.length, totalProcessed);
      }

      return { success: true, total: totalProcessed };
    } catch (error) {
      console.error("[Property] Error en importación masiva:", error);
      throw error;
    }
  }

  /**
   * Recalcula el saldo de una propiedad basándose en todas sus transacciones
   * y actualiza el campo 'balance' en el documento de la propiedad.
   * @param {string} propertyId 
   */
  static async recalculateBalance(propertyId) {
    try {
      const q = query(
        collection(db, "transactions"),
        where("propertyId", "==", propertyId)
      );
      const querySnapshot = await getDocs(q);
      let newBalance = 0;
      querySnapshot.forEach(doc => {
        newBalance += (doc.data().amount || 0);
      });

      await updateDoc(doc(db, "properties", propertyId), {
        balance: newBalance,
        lastBalanceUpdate: new Date()
      });

      return newBalance;
    } catch (error) {
      console.error(`❌ Error recalculando saldo para ${propertyId}:`, error);
      throw error;
    }
  }

  /**
   * Recalcula el saldo de todas las propiedades de forma masiva y eficiente.
   * Utiliza una sola lectura de transacciones y procesa en memoria para máximo rendimiento.
   * @param {Function} onProgress - Callback para reportar el progreso.
   * @returns {Promise<{success: boolean, stats: Object}>} Devuelve las nuevas estadísticas.
   */
  static async recalculateAllBalances(onProgress = null) {
    const { writeBatch, serverTimestamp } = await import("../core/firebase.js");

    try {
      // 1. Lectura maestra (Solo 2 peticiones al servidor)
      const allProps = await this.getAll();
      const transSnapshot = await getDocs(collection(db, "transactions"));
      
      const total = allProps.length;
      let stats = {
        saldoCajaDisponible: 0,
        totalCuentasPorCobrar: 0,
        totalSaldosAFavor: 0,
        ultimoPagoMonto: 0,
        unidadesAlDiaCount: 0,
        totalUnidades: total,
        ultimaSincronizacion: new Date()
      };

      // 2. Mapeo y procesamiento en memoria (Velocidad luz)
      const propBalances = {};
      allProps.forEach(p => propBalances[p.id] = 0);

      let ultimoPagoFecha = 0;

      transSnapshot.forEach(doc => {
        const t = doc.data();
        if (propBalances[t.propertyId] !== undefined) {
          propBalances[t.propertyId] += (t.amount || 0);
        }
        
        // Caja Real: Pagos e Ingresos - Gastos
        if (["PAYMENT", "OTHER_INCOME", "EXPENSE", "ADMIN_EXPENSE"].includes(t.type)) {
          stats.saldoCajaDisponible += (t.amount || 0);
        }

        // Rastrear el último pago global
        if (t.type === 'PAYMENT') {
          const fecha = t.effectiveDate?.toDate ? t.effectiveDate.toDate().getTime() : new Date(t.effectiveDate).getTime();
          if (fecha > ultimoPagoFecha) {
            ultimoPagoFecha = fecha;
            stats.ultimoPagoMonto = Math.abs(t.amount || 0);
          }
        }
      });

      // 3. Preparar guardado atómico (Batch)
      const batch = writeBatch(db);

      allProps.forEach((prop, index) => {
        const balance = propBalances[prop.id];
        
        if (balance >= -0.01) stats.unidadesAlDiaCount++;

        if (balance < 0) stats.totalCuentasPorCobrar += Math.abs(balance);
        else if (balance > 0) stats.totalSaldosAFavor += balance;

        const propRef = doc(db, "properties", prop.id);
        batch.update(propRef, {
          balance: balance,
          lastBalanceUpdate: serverTimestamp()
        });

        if (onProgress) onProgress(index + 1, total);
      });

      // 4. Actualizar appConfig/app en el mismo batch
      const configRef = doc(db, "appConfig", "app");
      batch.set(configRef, { stats }, { merge: true });

      // 5. Commit único
      await batch.commit();

      return { success: true, stats };
    } catch (error) {
      console.error("❌ Error en la sincronización masiva de saldos:", error);
      throw error;
    }
  }

  /**
   * Realiza una única consulta a la colección 'properties' para obtener un resumen financiero.
   * @returns {Promise<{totalReceivable: number, creditBalance: number}>}
   *          Un objeto con la suma de todos los saldos negativos (Cuentas por Cobrar)
   *          y la suma de todos los saldos positivos (Saldo a Favor).
   */
  static async getFinancialSummary() {
    let totalReceivable = 0;
    let creditBalance = 0;

    try {
      const propertiesCollectionRef = collection(db, "properties");
      const q = query(propertiesCollectionRef);
      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const balance = data.balance || 0; // Usar 0 si el campo de balance no existe

        if (balance < 0) {
          totalReceivable += balance;
        } else if (balance > 0) {
          creditBalance += balance;
        }
      });
      
      // totalReceivable será un número negativo o cero. Para mostrarlo como "Cuentas por Cobrar", 
      // lo devolvemos como un valor positivo.
      return { 
        totalReceivable: -totalReceivable, 
        creditBalance 
      };

    } catch (error) {
      console.error("Error al obtener el resumen financiero de las propiedades:", error);
      // En caso de error, devolvemos cero para no romper la UI.
      return { totalReceivable: 0, creditBalance: 0 };
    }
  }

  /**
   * Obtiene todas las propiedades registradas.
   * @param {string} sortBy - Campo por el que ordenar (por defecto 'name').
   * @returns {Promise<Array>} Lista de propiedades con su ID y datos.
   */
  static async getAll(sortBy = 'name') {
    try {
      const q = query(collection(db, "properties"), orderBy(sortBy));
      const querySnapshot = await getDocs(q);
      const props = [];
      querySnapshot.forEach((doc) => {
        props.push({ id: doc.id, ...doc.data() });
      });
      return props;
    } catch (error) {
      console.error("[Property] Error al obtener propiedades:", error);
      throw error;
    }
  }
}
