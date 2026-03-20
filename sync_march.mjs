import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function syncMarch() {
  console.log("🚀 Iniciando Sincronización Total de MARZO 2025...");

  // 1. Cargar la verdad (JSON)
  const jsonPath = './public/src/doc/movimientos_propiedades/transacciones_marzo_2025.json';
  const marchData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    .filter(t => t.effectiveDate >= '2025-03-01' && t.effectiveDate <= '2025-03-31');

  console.log(`📦 Datos cargados del JSON: ${marchData.length} registros.`);

  // 2. Borrar todo lo que existe actualmente de Marzo en Firestore
  console.log("🧹 Buscando registros antiguos para borrar...");
  const oldSnapshot = await db.collection('transactions')
    .where('effectiveDate', '>=', '2025-03-01')
    .where('effectiveDate', '<=', '2025-03-31')
    .get();

  if (oldSnapshot.empty) {
    console.log("No hay registros antiguos que borrar.");
  } else {
    const batchDelete = db.batch();
    oldSnapshot.forEach(doc => batchDelete.delete(doc.ref));
    await batchDelete.commit();
    console.log(`✅ Se borraron ${oldSnapshot.size} registros antiguos.`);
  }

  // 3. Subir los nuevos registros en bloques (batches) de 500
  console.log("📤 Subiendo nuevos registros...");
  const chunks = [];
  for (let i = 0; i < marchData.length; i += 500) {
    chunks.push(marchData.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(data => {
      const docRef = db.collection('transactions').doc();
      batch.set(docRef, {
        ...data,
        createdAt: new Date(), // Fecha de sistema para auditoría
        status: data.propertyId === '__UNIDENTIFIED__' ? 'unidentified' : (data.status || 'verified')
      });
    });
    await batch.commit();
    console.log(`✨ Subido bloque de ${chunk.length} registros.`);
  }

  console.log("\n✅ PROCESO COMPLETADO: Marzo 2025 está ahora sincronizado con el JSON.");
}

syncMarch().catch(err => {
  console.error("\n❌ ERROR CRÍTICO:");
  console.error(err.message);
  if (err.message.includes('RESOURCE_EXHAUSTED')) {
    console.error("\n⚠️ LA CUOTA DIARIA DE FIREBASE ESTÁ AGOTADA. Inténtalo de nuevo más tarde o mañana.");
  }
});
