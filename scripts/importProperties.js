// Descripción: Este script se utiliza para poblar la colección 'properties' en Firestore.
//
// Requisitos previos:
// 1. Haber iniciado sesión con la CLI de Firebase (`firebase login`).
// 2. Haber configurado el proyecto de Firebase a utilizar (`firebase use <project_id>`).
// 3. Tener un archivo de clave de cuenta de servicio (service account key) para su proyecto.
//    - Vaya a la Consola de Firebase -> Configuración del proyecto -> Cuentas de servicio.
//    - Genere una nueva clave privada y guarde el archivo JSON en una ubicación segura.
// 4. Configurar la variable de entorno GOOGLE_APPLICATION_CREDENTIALS para que apunte a la ruta de su archivo de clave de cuenta de servicio.
//    En PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\serviceAccountKey.json"
//    En bash/zsh: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
//
// Uso:
//    node scripts/importProperties.js
//
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inicializa el SDK de Admin de Firebase
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

// Lee y procesa el archivo JSON de residentes
const jsonPath = path.join(__dirname, '..', 'public', 'src', 'doc', 'residentes_info.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Mapea los datos del JSON a la estructura de la colección 'properties'
const properties = jsonData.entities.map(entity => {
  // Lógica para manejar múltiples números de teléfono
  const phones = entity.phones || [];
  const phone = phones.length > 0 ? phones[0] : "";
  const mobile = phones.length > 1 ? phones[1] : "";

  return {
    "id": entity.propertyId,
    "name": `Casa ${entity.propertyId}`,
    "address": {
      "street": entity.address || "",
      "fullAddress": `${entity.address || ""}, Casa ${entity.propertyId}`
    },
    // Convierte el saldo pendiente a un número negativo, ya que representa una deuda.
    "balance": (entity.outstandingBalance || 0) * -1,
    "currency": "USD",
    "ownerInfo": {
      "name": entity.ownerName || "",
      "phone": phone,
      "mobile": mobile,
      "email": entity.email || ""
    },
    "residentUids": []
  };
});

/**
 * Sube el array de propiedades a la colección 'properties' en Firestore.
 * Cada propiedad se guarda con su 'id' como el ID del documento en Firestore.
 */
async function uploadProperties() {
  const batch = db.batch();

  properties.forEach((prop) => {
    if (prop.id) { // Asegurarse de que hay un ID para el documento
      const docRef = db.collection('properties').doc(prop.id);
      // El objeto 'prop' ya no tiene el 'id' dentro, así que lo removemos para no guardarlo en los campos.
      const { id, ...data } = prop;
      batch.set(docRef, data);
    }
  });

  try {
    await batch.commit();
    console.log(`¡Éxito! Se han procesado y subido ${properties.length} propiedades a Firestore.`);
  } catch (error) {
    console.error("Error al subir las propiedades: ", error);
  }
}

// Llama a la función para iniciar la subida.
uploadProperties();

