const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function uploadTransactions() {
  const filePath = path.join(__dirname, '../public/src/doc/movimientos_propiedades/transacciones_febrero_2025.json');
  const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  console.log(`Leídas ${transactions.length} transacciones de febrero.`);

  const collectionRef = db.collection('transactions');
  let batch = db.batch();
  let count = 0;
  let totalUploaded = 0;

  for (const t of transactions) {
    const docRef = collectionRef.doc(); // Generar ID automático
    
    // Convertir la fecha a Timestamp de Firestore
    const data = {
      ...t,
      effectiveDate: admin.firestore.Timestamp.fromDate(new Date(t.effectiveDate + 'T00:00:00Z'))
    };

    batch.set(docRef, data);
    count++;

    // Límite de Firestore es 500 por lote
    if (count === 500) {
      await batch.commit();
      totalUploaded += count;
      console.log(`Subidas ${totalUploaded} transacciones...`);
      batch = db.batch();
      count = 0;
    }
  }

  // Subir el resto
  if (count > 0) {
    await batch.commit();
    totalUploaded += count;
  }

  console.log(`Éxito: Se subieron un total de ${totalUploaded} transacciones a la colección 'transactions'.`);
}

uploadTransactions().catch(err => {
  console.error('Error durante la subida:', err);
  process.exit(1);
});
