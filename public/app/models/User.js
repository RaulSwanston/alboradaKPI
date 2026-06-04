import { db, collection, getCountFromServer, query, where, doc, getDoc, setDoc } from "../core/firebase.js";

/**
 * La clase User gestiona la interacción con la colección 'users' en Firestore.
 */
export default class User {
  /**
   * Obtiene un perfil de usuario por su UID.
   * @param {string} uid - El UID del usuario de Firebase Auth.
   * @returns {Promise<Object|null>} Los datos del usuario o null si no existe.
   */
  static async getById(uid) {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error(`[User] Error al obtener usuario ${uid}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene el conteo de usuarios marcados como activos.
   */
  static async contarUsuariosActivos() {
    try {
      const usersCollectionRef = collection(db, "users");
      const activeUsersQuery = query(usersCollectionRef, where("isActive", "==", true));
      const snapshot = await getCountFromServer(activeUsersQuery);
      return snapshot.data().count;
    } catch (error) {
      console.error("[User] Error al contar usuarios activos:", error);
      throw error;
    }
  }
}

// --- Funciones para compatibilidad con módulos existentes ---

/**
 * @deprecated Usar User.contarUsuariosActivos() en su lugar.
 */
export async function contarUsuariosActivos() {
  return await User.contarUsuariosActivos();
}

/**
 * Inicializa atributos de usuario (utilidad).
 */
export async function userData() {
  const userAttributes = [
    "Nombre",
    "Apellido",
    "Dirección Residencial",
    "Teléfono Residencial",
    "Teléfono Móvil",
    "Correo Electrónico",
    "Acciones"
  ];

  const collectionName = "userDataCollection";

  try {
    const promises = userAttributes.map(async (label) => {
      const id = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");

      const docRef = doc(db, collectionName, id);
      await setDoc(docRef, {
        label: label,
        active: true,
        id: id
      }, { merge: true });
    });

    await Promise.all(promises);
    return true;
  } catch (error) {
    console.error("Error al actualizar la colección de datos de usuario:", error);
    return error;
  }
}
