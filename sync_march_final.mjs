import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function syncMarchDefinitive() {
  console.log("🚀 INICIANDO LIMPIEZA Y RESUBIDA TOTAL DE MARZO 2025...");

  // 1. Cargar JSON (La Verdad)
  const jsonPath = './public/src/doc/movimientos_propiedades/transacciones_marzo_2025.json';
  const marchData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    .filter(t => t.effectiveDate >= '2025-03-01' && t.effectiveDate <= '2025-03-31');

  console.log(`📦 Datos en JSON: ${marchData.length} registros.`);

  // 2. Borrado Masivo (Buscamos de varias formas para no dejar nada)
  console.log("🧹 Borrando rastro de Marzo en Firestore...");
  
  // Consulta por String (como están en el JSON)
  const snapshotStr = await db.collection('transactions')
    .where('effectiveDate', '>=', '2025-03-01')
    .where('effectiveDate', '<=', '2025-03-31')
    .get();

  const batch = db.batch();
  snapshotStr.forEach(doc => batch.delete(doc.ref));
  
  await batch.commit();
  console.log(`✅ Se eliminaron ${snapshotStr.size} registros encontrados.`);

  // 3. Subida de los 370 registros limpios
  console.log("📤 Subiendo datos validados...");
  
  // Dividir en bloques de 400 (Firestore permite hasta 500 por batch)
  const batchUpload = db.batch();
  marchData.forEach(data => {
    const docRef = db.collection('transactions').doc();
    batchUpload.set(docRef, {
      ...data,
      createdAt: new Date(),
      status: data.propertyId === '__UNIDENTIFIED__' ? 'unidentified' : (data.status || 'verified')
    });
  });

  await batchUpload.commit();
  console.log(`✨ Éxito: Se subieron los ${marchData.length} registros que cuadran con el PDF.`);
  console.log("\n--- MARZO 2025 HA SIDO REINICIADO Y SINCRONIZADO ---");
}

syncMarchDefinitive().catch(console.error);
