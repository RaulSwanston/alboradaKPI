import { db, collection, getCountFromServer, query, where, doc, getDoc, setDoc, getDocs, orderBy, limit, startAfter, updateDoc } from "../core/firebase.js";

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
   * Obtiene usuarios con filtros de rol, búsqueda y paginación.
   * @param {Object} options - { role, searchTerm, pageSize, lastDoc }
   */
  static async queryUsers({ role = 'all', searchTerm = '', pageSize = 10, lastDoc = null } = {}) {
    try {
      const usersRef = collection(db, "users");
      const constraints = [orderBy("email"), limit(pageSize)];
      
      if (role !== 'all') constraints.unshift(where("role", "==", role));
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snapshot = await getDocs(query(usersRef, ...constraints));
      const users = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (searchTerm) {
          const matches = (data.displayName || '').toLowerCase().includes(searchTerm) || 
                          (data.email || '').toLowerCase().includes(searchTerm);
          if (matches) users.push({ id: doc.id, ...data });
        } else {
          users.push({ id: doc.id, ...data });
        }
      });

      return {
        users,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        size: snapshot.size
      };
    } catch (error) {
      console.error("[User] Error en queryUsers:", error);
      throw error;
    }
  }

  /**
   * Actualiza los datos del perfil de un usuario.
   * @param {string} uid - El UID del usuario.
   * @param {Object} data - Objeto con los campos a actualizar (displayName, mobile, photoUrl, etc.).
   */
  static async updateProfile(uid, data) {
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, {
        ...data,
        updatedAt: new Date()
      });
      return true;
    } catch (error) {
      console.error(`[User] Error al actualizar perfil de ${uid}:`, error);
      throw error;
    }
  }

  /**
   * Actualiza el rol de un usuario.
   * @param {string} uid 
   * @param {string} newRole 
   */
  static async updateRole(uid, newRole) {
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, { role: newRole });
      return true;
    } catch (error) {
      console.error(`[User] Error al actualizar rol de ${uid}:`, error);
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
