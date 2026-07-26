import { db, doc, getDoc, setDoc } from "../core/firebase.js";

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
      const docRef = doc(db, "_config", "app");
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
      const docRef = doc(db, "_config", "app");
      await setDoc(docRef, config, { merge: true });
      return true;
    } catch (error) {
      console.error("[AppConfig] Error al guardar configuración:", error);
      throw error;
    }
  }
}
