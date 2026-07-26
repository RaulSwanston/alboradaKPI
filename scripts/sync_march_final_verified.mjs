import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import fs from 'fs';

// Configuración de Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const JSON_PATH = 'public/src/doc/movimientos_propiedades/transacciones_marzo_2025.json';

async function syncMarch() {
  console.log("🚀 Iniciando limpieza y sincronización de Marzo 2025...");

  try {
    // 1. ELIMINACIÓN: Buscar y borrar registros de marzo 2025
    console.log("🧹 Buscando registros de Marzo 2025 en Firestore...");
    
    // Rango de fechas para marzo 2025
    const startDate = new Date('2025-03-01T00:00:00Z');
    const endDate = new Date('2025-03-31T23:59:59Z');

    const querySnapshot = await db.collection('transactions')
      .where('effectiveDate', '>=', Timestamp.fromDate(startDate))
      .where('effectiveDate', '<=', Timestamp.fromDate(endDate))
      .get();

    console.log(`Encontrados ${querySnapshot.size} registros antiguos.`);

    if (querySnapshot.size > 0) {
      const batch = db.batch();
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log("✅ Registros antiguos eliminados.");
    } else {
      console.log("ℹ️ No se encontraron registros previos de marzo.");
    }

    // 2. CARGA: Leer JSON y subir datos verificados
    const rawData = fs.readFileSync(JSON_PATH, 'utf8');
    const transactions = JSON.parse(rawData);
    console.log(`📦 Preparando carga de ${transactions.length} registros desde el JSON...`);

    // Procesar en batches de 500 (límite de Firestore)
    let count = 0;
    let currentBatch = db.batch();

    for (const trans of transactions) {
      const docRef = db.collection('transactions').doc(); // ID autogenerado
      
      // Convertir fecha de string a Timestamp
      const effectiveDate = new Date(trans.effectiveDate + 'T12:00:00Z'); // Usamos mediodía para evitar problemas de zona horaria

      const dataToUpload = {
        ...trans,
        effectiveDate: Timestamp.fromDate(effectiveDate),
        createdAt: Timestamp.now(),
        amount: Number(trans.amount), // Asegurar que sea número
        status: trans.status || 'verified'
      };

      currentBatch.set(docRef, dataToUpload);
      count++;

      // Si llegamos a 500, enviamos y creamos nuevo batch
      if (count % 500 === 0) {
        await currentBatch.commit();
        currentBatch = db.batch();
        console.log(`Inyectados ${count} registros...`);
      }
    }

    // Enviar el último batch si tiene datos
    if (count % 500 !== 0) {
      await currentBatch.commit();
    }

    console.log(`\n✨ ¡ÉXITO! Se han sincronizado ${count} registros de Marzo 2025.`);
    console.log("La base de datos ahora coincide exactamente con el JSON verificado.");

  } catch (error) {
    console.error("❌ ERROR durante la sincronización:", error);
  }
}

syncMarch();
