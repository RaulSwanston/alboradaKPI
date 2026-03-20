const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixAllPropertyIds() {
  try {
    console.log('--- Iniciando Corrección Masiva de IDs ---');

    // 1. Obtener IDs oficiales para validación
    const propertiesSnapshot = await db.collection('properties').get();
    const canonicalIds = new Set();
    propertiesSnapshot.forEach(doc => canonicalIds.add(doc.id));

    const transactionsRef = db.collection('transactions');
    const snapshot = await transactionsRef.get();
    
    let updatedCount = 0;
    let batch = db.batch();
    let operationCount = 0;

    for (const doc of snapshot.docs) {
      const currentId = doc.data().propertyId;
      if (!currentId || typeof currentId !== 'string' || currentId.startsWith('__')) continue;

      // Intentar normalizar a 3 dígitos (ej: "5" -> "005", "58" -> "058")
      const numericPart = currentId.replace(/^0+/, '');
      if (numericPart === '') continue; // Evitar casos vacíos
      
      const paddedId = numericPart.padStart(3, '0');

      // Si el ID actual no es el oficial pero el normalizado SÍ existe en properties
      if (currentId !== paddedId && canonicalIds.has(paddedId)) {
        batch.update(doc.ref, { propertyId: paddedId });
        updatedCount++;
        operationCount++;

        // Firestore limita los batches a 500 operaciones
        if (operationCount === 450) {
          await batch.commit();
          batch = db.batch();
          operationCount = 0;
          console.log(`Progreso: ${updatedCount} transacciones actualizadas...`);
        }
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }

    console.log(`\n¡Éxito! Se han corregido ${updatedCount} transacciones en total.`);
    process.exit(0);
  } catch (error) {
    console.error('Error durante la corrección:', error);
    process.exit(1);
  }
}

fixAllPropertyIds();
