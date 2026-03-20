const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function auditPropertyIds() {
  try {
    console.log('--- Iniciando Auditoría de IDs de Propiedad ---');

    // 1. Obtener los IDs oficiales de la colección 'properties'
    const propertiesSnapshot = await db.collection('properties').get();
    const canonicalIds = new Set();
    propertiesSnapshot.forEach(doc => canonicalIds.add(doc.id));
    console.log(`Total de propiedades oficiales: ${canonicalIds.size}`);

    // 2. Obtener todos los propertyId usados en 'transactions'
    const transactionsSnapshot = await db.collection('transactions').select('propertyId').get();
    const usedIds = new Map(); // ID usado -> Cantidad de transacciones

    transactionsSnapshot.forEach(doc => {
      const pid = doc.data().propertyId;
      if (!pid) return;
      usedIds.set(pid, (usedIds.get(pid) || 0) + 1);
    });

    console.log(`Total de IDs distintos encontrados en transacciones: ${usedIds.size}`);

    // 3. Identificar inconsistencias
    console.log('\n--- Análisis de Inconsistencias ---');
    const inconsistencies = [];

    for (const [id, count] of usedIds) {
      // Ignorar IDs especiales como __UNIDENTIFIED__
      if (id.startsWith('__')) continue;

      if (!canonicalIds.has(id)) {
        // Intentar encontrar el ID canónico (ej: si es "70", buscar "070")
        const numericPart = id.replace(/^0+/, ''); // "058" -> "58", "58" -> "58"
        const paddedId3 = numericPart.padStart(3, '0'); // "58" -> "058"
        
        let targetId = null;
        if (canonicalIds.has(paddedId3)) targetId = paddedId3;
        else if (canonicalIds.has(numericPart)) targetId = numericPart;

        if (targetId && targetId !== id) {
          console.log(`⚠️  Inconsistencia: ID "${id}" (${count} transacciones) -> Debería ser "${targetId}"`);
          inconsistencies.push({ current: id, target: targetId });
        } else {
          console.log(`❓ ID Huérfano: "${id}" (${count} transacciones) - No existe en 'properties'`);
        }
      }
    }

    if (inconsistencies.length === 0) {
      console.log('No se encontraron más inconsistencias de formato (ceros a la izquierda).');
    } else {
      console.log(`\nSe encontraron ${inconsistencies.length} tipos de inconsistencias.`);
      console.log('Puedes pedirme que las corrija automáticamente.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error durante la auditoría:', error);
    process.exit(1);
  }
}

auditPropertyIds();
