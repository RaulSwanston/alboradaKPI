import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function countMarchRecords() {
  console.log("--- Conteo Rápido de Registros Marzo 2025 ---");

  // 1. JSON local
  const jsonPath = './public/src/doc/movimientos_propiedades/transacciones_marzo_2025.json';
  const localData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const localMarchCount = localData.filter(t => t.effectiveDate >= '2025-03-01' && t.effectiveDate <= '2025-03-31').length;
  console.log(`Registros en JSON local: ${localMarchCount}`);

  // 2. Firestore (Conteo ligero)
  try {
    const countSnapshot = await db.collection('transactions')
      .where('effectiveDate', '>=', '2025-03-01')
      .where('effectiveDate', '<=', '2025-03-31')
      .count()
      .get();

    const firestoreCount = countSnapshot.data().count;
    console.log(`Registros en Firestore: ${firestoreCount}`);

    console.log(`\n--- Diferencia ---`);
    if (localMarchCount === firestoreCount) {
      console.log("✅ El número de registros coincide perfectamente.");
    } else {
      console.log(`❌ DISCREPANCIA: Faltan ${localMarchCount - firestoreCount} registros.`);
    }
  } catch (error) {
    console.error("Error al contar:", error.message);
  }
}

countMarchRecords();
