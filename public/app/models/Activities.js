import { db, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp, startAfter, getCountFromServer } from "../core/firebase.js";
import { isD1, d1Activities, d1CreateActivity } from "../core/api.js";

/**
 * Crea un nuevo documento en la colección 'activities'.
 * @param {object} activityData - El objeto con los datos de la actividad a crear.
 * @returns {Promise<string>} El ID del documento de actividad creado.
 */
export async function createActivity(activityData) {
  if (isD1()) {
    try {
      const result = await d1CreateActivity(activityData);
      return result.id;
    } catch (error) {
      console.error("Error D1 al crear la actividad: ", error);
      throw error;
    }
  }
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
  if (isD1()) {
    try {
      return await d1Activities(count, lastDoc, visibilityKey);
    } catch (error) {
      console.error("Error D1 al obtener actividades recientes: ", error);
      throw error;
    }
  }
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

/**
 * Feed de notificaciones accionables: filtrado por tipos + visibilidad,
 * paginado por cursor y con el total. La bandeja (notificationsFeed) lo usa.
 * @param {Object} options - { count, cursor, visibilityKey, types }
 * @returns {Promise<{activities, lastVisible, nextCursor, totalCount}>}
 */
export async function getActivitiesFeed({ count = 15, cursor = null, visibilityKey = null, types = null } = {}) {
  if (isD1()) {
    try {
      return await d1Activities(count, cursor ? { __cursor: cursor } : null, visibilityKey, types);
    } catch (error) {
      console.error("Error D1 al obtener feed de actividades:", error);
      throw error;
    }
  }
  try {
    const activitiesRef = collection(db, "activities");
    const base = [orderBy("timestamp", "desc")];
    if (visibilityKey) base.unshift(where("visibility", "array-contains", visibilityKey));
    if (types && types.length) base.unshift(where("type", "in", types));

    const pageConstraints = [...base];
    if (cursor) pageConstraints.push(startAfter(cursor));
    pageConstraints.push(limit(count));

    const snapshot = await getDocs(query(activitiesRef, ...pageConstraints));
    const activities = [];
    snapshot.forEach((doc) => activities.push({ id: doc.id, ...doc.data() }));

    let totalCount = null;
    try {
      const countSnap = await getCountFromServer(query(activitiesRef, ...base));
      totalCount = countSnap.data().count;
    } catch { /* el conteo es best-effort en Firestore */ }

    return { activities, lastVisible: snapshot.docs[snapshot.docs.length - 1] ?? null, nextCursor: null, totalCount };
  } catch (error) {
    console.error("Error al obtener feed de actividades:", error);
    throw error;
  }
}
