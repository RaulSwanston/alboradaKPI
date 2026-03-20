const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanAndUploadFeb() {
  try {
    console.log('--- Iniciando Sincronización Limpia de Febrero 2025 ---');

    // 1. Borrar registros actuales de Febrero 2025
    const snapshot = await db.collection('transactions').get();
    let batch = db.batch();
    let deleteCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      let date;
      if (data.effectiveDate && data.effectiveDate.toDate) date = data.effectiveDate.toDate();
      else date = new Date(data.effectiveDate);

      if (date.getFullYear() === 2025 && date.getMonth() === 1) { // Mes 1 = Febrero
        batch.delete(doc.ref);
        deleteCount++;
        if (deleteCount % 400 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }
    }
    if (deleteCount > 0) await batch.commit();
    console.log(`🧹 Borrados ${deleteCount} registros antiguos de Febrero.`);

    // 2. Cargar datos del JSON oficial
    const filePath = path.join(__dirname, 'public/src/doc/movimientos_propiedades/transacciones_febrero_2025.json');
    const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    console.log(`🚀 Subiendo ${transactions.length} registros desde el JSON oficial...`);
    
    batch = db.batch();
    let uploadCount = 0;

    for (const t of transactions) {
      const docRef = db.collection('transactions').doc();
      batch.set(docRef, {
        ...t,
        effectiveDate: admin.firestore.Timestamp.fromDate(new Date(t.effectiveDate + 'T12:00:00Z')),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      uploadCount++;

      if (uploadCount % 400 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`   Progreso: ${uploadCount} subidos...`);
      }
    }

    if (uploadCount % 400 !== 0) await batch.commit();
    console.log(`✅ ¡Éxito! Febrero 2025 sincronizado con ${uploadCount} registros.`);
    process.exit(0);
  } catch (error) {
    console.error('Error durante la sincronización:', error);
    process.exit(1);
  }
}

cleanAndUploadFeb();
