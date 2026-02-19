import { db, collection, getCountFromServer, query, where, doc, setDoc } from "../core/firebase.js";

export async function contarUsuariosActivos() {
  try {
    const usersCollectionRef = collection(db, "users");
    const activeUsersQuery = query( usersCollectionRef, where("active", "==", true) );
    const snapshot = await getCountFromServer(activeUsersQuery);
    return snapshot.data().count;
  } catch (error) {
    return error;
  }
}

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
      // Generar un ID único (slug) a partir del label
      // Ejemplo: "Teléfono Móvil" -> "telefono_movil"
      const id = label
        .toLowerCase()
        .normalize("NFD") // Descompone caracteres con acentos
        .replace(/[\u0300-\u036f]/g, "") // Elimina los acentos
        .replace(/\s+/g, "_"); // Reemplaza espacios con guiones bajos

      const docRef = doc(db, collectionName, id);
      
      // Usamos setDoc con merge: true para crear o actualizar sin borrar otros campos si existieran
      await setDoc(docRef, {
        label: label,
        active: true,
        id: id // Guardamos también el ID dentro del documento por si es útil
      }, { merge: true });
      
      console.log(`Atributo procesado: ${label} (ID: ${id})`);
    });

    await Promise.all(promises);
    console.log(`Colección '${collectionName}' actualizada correctamente.`);
    return true;

  } catch (error) {
    console.error("Error al actualizar la colección de datos de usuario:", error);
    return error;
  }
}