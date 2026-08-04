import { db, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp, startAfter } from "../core/firebase.js";

/**
 * Crea un nuevo documento en la colección 'activities'.
 * @param {object} activityData - El objeto con los datos de la actividad a crear.
 * @returns {Promise<string>} El ID del documento de actividad creado.
 */
export async function createActivity(activityData) {
  try {
    const activityWithTimestamp = {
      ...activityData,
      timestamp: serverTimestamp() // Añade el timestamp del servidor al momento de escribir.
    };
    const docRef = await addDoc(collection(db, "activities"), activityWithTimestamp);
    console.log("Actividad creada con ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error al crear la actividad: ", error);
    throw error; // Re-lanza el error para que el código que llama pueda manejarlo.
  }
}

/**
 * Obtiene las actividades más recientes de la base de datos con soporte para paginación.
 * Filtra por visibilidad según el rol del usuario.
 * @param {number} count - El número de actividades a obtener.
 * @param {DocumentSnapshot} lastDoc - El último documento de la carga anterior para paginación.
 * @param {string} visibilityKey - Clave de visibilidad para filtrar ('admin' o el UID del residente).
 * @returns {Promise<{activities: Array, lastVisible: DocumentSnapshot}>} Un objeto con el array de actividades y el último documento visible.
 */
export async function getRecentActivities(count = 15, lastDoc = null, visibilityKey = null) {
  try {
    const activitiesRef = collection(db, "activities");
    let q;

    if (visibilityKey) {
      // Filtro por rol: admin → 'admin'; residente → su UID
      if (lastDoc) {
        q = query(activitiesRef, where("visibility", "array-contains", visibilityKey), orderBy("timestamp", "desc"), startAfter(lastDoc), limit(count));
      } else {
        q = query(activitiesRef, where("visibility", "array-contains", visibilityKey), orderBy("timestamp", "desc"), limit(count));
      }
    } else if (lastDoc) {
      q = query(activitiesRef, orderBy("timestamp", "desc"), startAfter(lastDoc), limit(count));
    } else {
      q = query(activitiesRef, orderBy("timestamp", "desc"), limit(count));
    }
    
    const querySnapshot = await getDocs(q);
    
    const activities = [];
    querySnapshot.forEach((doc) => {
      activities.push({ id: doc.id, ...doc.data() });
    });
    
    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
    
    return { activities, lastVisible };
  } catch (error) {
    console.error("Error al obtener actividades recientes: ", error);
    throw error;
  }
}
