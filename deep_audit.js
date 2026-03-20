const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function deepAudit() {
  try {
    console.log('--- Iniciando Auditoría Profunda de IDs ---');

    // 1. Cargar IDs oficiales
    const propertiesSnapshot = await db.collection('properties').get();
    const canonicalIds = new Set();
    propertiesSnapshot.forEach(doc => canonicalIds.add(doc.id));
    console.log(`Propiedades oficiales: ${canonicalIds.size}`);

    // 2. Analizar todas las transacciones
    const transactionsSnapshot = await db.collection('transactions').get();
    const uniquePids = new Map();

    transactionsSnapshot.forEach(doc => {
      const pid = doc.data().propertyId;
      if (!pid) {
        console.log(`⚠️ Transacción sin propertyId encontrada: ${doc.id}`);
        return;
      }
      uniquePids.set(pid, (uniquePids.get(pid) || 0) + 1);
    });

    console.log('\n--- Resultados de Auditoría ---');
    let issuesFound = 0;

    for (const [id, count] of uniquePids) {
      // Ignorar IDs internos del sistema
      if (id.startsWith('__')) continue;

      // Limpiar el ID (quitar espacios) para ver si eso lo arregla
      const cleanId = id.trim();
      
      if (!canonicalIds.has(id)) {
        issuesFound++;
        
        // Caso 1: Espacios en blanco
        if (canonicalIds.has(cleanId)) {
          console.log(`❌ ERROR (Espacios): "${id}" (${count} trans) -> Debería ser "${cleanId}"`);
        } 
        // Caso 2: Ceros faltantes (nuevamente por si alguno se escapó)
        else {
          const numericPart = id.replace(/^0+/, '');
          const paddedId = numericPart.padStart(3, '0');
          if (canonicalIds.has(paddedId)) {
            console.log(`❌ ERROR (Formato): "${id}" (${count} trans) -> Debería ser "${paddedId}"`);
          } else {
            console.log(`🚨 ID DESCONOCIDO: "${id}" (${count} trans) - No existe en la base de datos de propiedades.`);
          }
        }
      }
    }

    if (issuesFound === 0) {
      console.log('✅ ¡Limpieza total! No se encontraron más inconsistencias en las transacciones.');
    } else {
      console.log(`\nSe encontraron ${issuesFound} IDs problemáticos pendientes.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deepAudit();
