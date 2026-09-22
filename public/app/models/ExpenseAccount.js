import { db, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "../core/firebase.js";

/**
 * La clase ExpenseAccount gestiona el catálogo de cuentas de gastos generales.
 * Centraliza la interacción con la colección 'expenseAccounts' en Firestore.
 * Cada cuenta pertenece a una categoría y permite agrupar las transacciones
 * tipo EXPENSE en el módulo de "Gastos Generales".
 */
export default class ExpenseAccount {
  static collectionName = "expenseAccounts";

  /**
   * Crea una nueva cuenta de gasto.
   * @param {object} accountData - Datos de la cuenta.
   * @param {string} accountData.name - Nombre de la cuenta (ej: "TIGER").
   * @param {string} accountData.category - Categoría (ej: "SEGURIDAD").
   * @param {number} [accountData.order] - Orden de visualización dentro de la categoría.
   * @param {boolean} [accountData.active] - true si la cuenta está vigente.
   * @returns {Promise<string>} El ID del documento creado.
   */
  static async create(accountData) {
    try {
      const docRef = await addDoc(collection(db, this.collectionName), {
        ...accountData,
        active: accountData.active !== false,
        order: Number(accountData.order) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`[ExpenseAccount] Nueva cuenta creada: ${accountData.name} (ID: ${docRef.id})`);
      return docRef.id;
    } catch (error) {
      console.error("[ExpenseAccount] Error al crear la cuenta:", error);
      throw error;
    }
  }

  /**
   * Obtiene todas las cuentas de gasto del catálogo.
   * @returns {Promise<Array>} Lista de cuentas con su ID de Firestore.
   */
  static async getAll() {
    try {
      const q = collection(db, this.collectionName);
      const querySnapshot = await getDocs(q);
      const accounts = [];
      querySnapshot.forEach((docSnap) => {
        accounts.push({ id: docSnap.id, ...docSnap.data() });
      });
      accounts.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.order || 0) - (b.order || 0) || (a.name || '').localeCompare(b.name || ''));
      return accounts;
    } catch (error) {
      console.error("[ExpenseAccount] Error al obtener las cuentas:", error);
      throw error;
    }
  }

  /**
   * Obtiene una cuenta de gasto por su ID.
   * @param {string} id - El ID del documento en Firestore.
   * @returns {Promise<object|null>} Datos de la cuenta o null.
   */
  static async getById(id) {
    try {
      const docRef = doc(db, this.collectionName, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      console.warn(`[ExpenseAccount] No se encontró la cuenta con ID: ${id}`);
      return null;
    } catch (error) {
      console.error("[ExpenseAccount] Error al buscar cuenta por ID:", error);
      throw error;
    }
  }

  /**
   * Actualiza una cuenta de gasto existente.
   * @param {string} id - El ID del documento a actualizar.
   * @param {object} updateData - Campos a modificar.
   * @returns {Promise<void>}
   */
  static async update(id, updateData) {
    try {
      const docRef = doc(db, this.collectionName, id);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      console.log(`[ExpenseAccount] Cuenta ${id} actualizada correctamente.`);
    } catch (error) {
      console.error(`[ExpenseAccount] Error al actualizar la cuenta ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una cuenta de gasto. Los gastos vinculados quedan sin clasificar.
   * @param {string} id - El ID del documento a eliminar.
   * @returns {Promise<void>}
   */
  static async delete(id) {
    try {
      const docRef = doc(db, this.collectionName, id);
      await deleteDoc(docRef);
      console.log(`[ExpenseAccount] Cuenta ${id} eliminada.`);
    } catch (error) {
      console.error(`[ExpenseAccount] Error al eliminar la cuenta ${id}:`, error);
      throw error;
    }
  }
}