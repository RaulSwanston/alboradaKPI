import { db, collection, getDocs, query, doc, getDoc } from "../core/firebase.js";

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
   * @returns {Promise<Array>} Lista de propiedades con su ID y datos.
   */
  static async getAll() {
    try {
      const q = query(collection(db, "properties"));
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
