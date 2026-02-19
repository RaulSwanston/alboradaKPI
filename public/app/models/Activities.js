import { db, collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from "../core/firebase.js";

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
 * Obtiene las actividades más recientes de la base de datos.
 * @param {number} count - El número de actividades a obtener (por defecto 20).
 * @returns {Promise<Array>} Un array con los documentos de las actividades.
 */
export async function getRecentActivities(count = 20) {
  try {
    const activitiesRef = collection(db, "activities");
    // Creamos una consulta para obtener los 'count' documentos más recientes, ordenados por 'timestamp' descendente.
    const q = query(activitiesRef, orderBy("timestamp", "desc"), limit(count));
    const querySnapshot = await getDocs(q);
    
    const activities = [];
    querySnapshot.forEach((doc) => {
      activities.push({ id: doc.id, ...doc.data() });
    });
    
    return activities;
  } catch (error) {
    console.error("Error al obtener actividades recientes: ", error);
    throw error;
  }
}
