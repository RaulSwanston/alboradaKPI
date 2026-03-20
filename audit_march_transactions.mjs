import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Cargar credenciales de servicio
const serviceAccount = JSON.parse(fs.readFileSync('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function auditMarch() {
  console.log("--- Iniciando Auditoría de Marzo 2025 ---");

  // 1. Cargar JSON local
  const jsonPath = './public/src/doc/movimientos_propiedades/transacciones_marzo_2025.json';
  const localData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  // Filtrar solo marzo en el JSON local (por si acaso tiene más)
  const localMarch = localData.filter(t => t.effectiveDate >= '2025-03-01' && t.effectiveDate <= '2025-03-31');
  console.log(`Registros en JSON local (Marzo): ${localMarch.length}`);

  // 2. Consultar Firestore
  const snapshot = await db.collection('transactions')
    .where('effectiveDate', '>=', '2025-03-01')
    .where('effectiveDate', '<=', '2025-03-31')
    .get();

  const firestoreData = [];
  snapshot.forEach(doc => {
    firestoreData.push({ id: doc.id, ...doc.data() });
  });
  console.log(`Registros en Firestore (Marzo): ${firestoreData.length}`);

  // 3. Comparación
  // Usaremos una clave única compuesta para identificar duplicados o faltantes
  // Clave: effectiveDate_propertyId_amount_type
  const getHash = (t) => `${t.effectiveDate}_${t.propertyId}_${t.amount}_${t.type}`;

  const firestoreHashes = new Set(firestoreData.map(t => getHash(t)));
  const missingInFirestore = [];

  localMarch.forEach(localT => {
    const hash = getHash(localT);
    if (!firestoreHashes.has(hash)) {
      missingInFirestore.push(localT);
    }
  });

  console.log(`\n--- Resultados ---`);
  if (missingInFirestore.length === 0) {
    console.log("✅ INTEGRIDAD TOTAL: Todos los registros del JSON están en Firestore.");
  } else {
    console.log(`❌ FALTAN ${missingInFirestore.length} registros en Firestore.`);
    console.log("Ejemplos de faltantes:");
    console.table(missingInFirestore.slice(0, 5)); // Mostrar los primeros 5
    
    // Guardar reporte de faltantes
    fs.writeFileSync('missing_march_records.json', JSON.stringify(missingInFirestore, null, 2));
    console.log("\nLista completa de faltantes guardada en 'missing_march_records.json'");
  }
}

auditMarch();
