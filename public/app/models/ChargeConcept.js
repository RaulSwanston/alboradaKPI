import { db, collection, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, doc, serverTimestamp } from "../core/firebase.js";

/**
 * La clase ChargeConcept gestiona las definiciones de cargos y servicios (el "catálogo").
 * Centraliza la interacción con la colección 'chargeConcepts' en Firestore.
 */
export default class ChargeConcept {
  static collectionName = "chargeConcepts";

  /**
   * Crea un nuevo concepto de cargo en la colección.
   * @param {object} conceptData - Objeto con los datos del concepto.
   * @param {string} conceptData.name - Nombre descriptivo del concepto.
   * @param {number} conceptData.defaultAmount - Monto sugerido para el cargo.
   * @param {boolean} conceptData.isRecurring - true si el cargo es periódico.
   * @param {string} [conceptData.billingFrequency] - Frecuencia (ej: "monthly").
   * @param {boolean} conceptData.isRequestableByResident - true si es visible para residentes.
   * @param {boolean} conceptData.requiresApproval - true si requiere aprobación manual.
   * @returns {Promise<string>} El ID del documento creado en Firestore.
   */
  static async create(conceptData) {
    try {
      const docRef = await addDoc(collection(db, this.collectionName), {
        ...conceptData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`[ChargeConcept] Nuevo concepto creado: ${conceptData.name} (ID: ${docRef.id})`);
      return docRef.id;
    } catch (error) {
      console.error("[ChargeConcept] Error al crear el concepto de cargo:", error);
      throw error;
    }
  }

  /**
   * Obtiene todos los conceptos de cargo disponibles.
   * @returns {Promise<Array>} Lista de conceptos, cada uno incluyendo su ID de Firestore.
   */
  static async getAll() {
    try {
      const q = query(collection(db, this.collectionName));
      const querySnapshot = await getDocs(q);
      const concepts = [];
      querySnapshot.forEach((doc) => {
        concepts.push({ id: doc.id, ...doc.data() });
      });
      return concepts;
    } catch (error) {
      console.error("[ChargeConcept] Error al obtener la lista de conceptos:", error);
      throw error;
    }
  }

  /**
   * Obtiene un concepto específico por su ID único.
   * @param {string} id - El ID del documento en Firestore.
   * @returns {Promise<object|null>} Los datos del concepto o null si no se encuentra.
   */
  static async getById(id) {
    try {
      const docRef = doc(db, this.collectionName, id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        console.warn(`[ChargeConcept] No se encontró el concepto con ID: ${id}`);
        return null;
      }
    } catch (error) {
      console.error("[ChargeConcept] Error al buscar concepto por ID:", error);
      throw error;
    }
  }

  /**
   * Actualiza los datos de un concepto de cargo existente.
   * @param {string} id - El ID del documento a actualizar.
   * @param {object} updateData - Objeto con los campos a modificar.
   * @returns {Promise<void>}
   */
  static async update(id, updateData) {
    try {
      const docRef = doc(db, this.collectionName, id);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      console.log(`[ChargeConcept] Concepto ${id} actualizado correctamente.`);
    } catch (error) {
      console.error(`[ChargeConcept] Error al actualizar el concepto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un concepto de cargo de la colección.
   * @param {string} id - El ID del documento a eliminar.
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      const docRef = doc(db, this.collectionName, id);
      await deleteDoc(docRef);
      console.log(`[ChargeConcept] Concepto ${id} eliminado.`);
    } catch (error) {
      console.error(`[ChargeConcept] Error al eliminar el concepto ${id}:`, error);
      throw error;
    }
  }
}
