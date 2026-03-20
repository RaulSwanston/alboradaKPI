const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixPropertyIds() {
  try {
    const transactionsRef = db.collection('transactions');
    
    // Buscar transacciones con ID "58" (los pagos)
    const snapshot = await transactionsRef.where('propertyId', '==', '58').get();
    
    if (snapshot.empty) {
      console.log('No se encontraron transacciones con el ID "58".');
      return;
    }

    const batch = db.batch();
    snapshot.forEach(doc => {
      console.log(`Corrigiendo transaccion ${doc.id}: 58 -> 058`);
      batch.update(doc.ref, { propertyId: '058' });
    });

    await batch.commit();
    console.log(`¡Éxito! Se han unificado las transacciones bajo el ID "058".`);
    process.exit(0);
  } catch (error) {
    console.error('Error al unificar IDs:', error);
    process.exit(1);
  }
}

fixPropertyIds();
