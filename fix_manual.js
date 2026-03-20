const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixManualInconsistencies() {
  try {
    console.log('--- Aplicando Correcciones Manuales ---');
    const batch = db.batch();

    // 1. Corregir D9 -> D-09
    const d9Ref = db.collection('transactions').doc('FXfkLSLyZhPJZ5Ydpzaz');
    batch.update(d9Ref, { propertyId: 'D-09' });
    console.log('✔ Programada corrección: D9 -> D-09');

    // 2. Dividir "30 y 75"
    const combinedRef = db.collection('transactions').doc('anH5tczoHEzdsolC4NHm');
    const combinedDoc = await combinedRef.get();
    
    if (combinedDoc.exists) {
      const data = combinedDoc.data();
      
      // Crear transacción para la 030
      const ref030 = db.collection('transactions').doc();
      batch.set(ref030, {
        ...data,
        propertyId: '030',
        amount: 15,
        description: data.description + ' (Parte 1/2: Unidad 030)'
      });

      // Crear transacción para la 075
      const ref075 = db.collection('transactions').doc();
      batch.set(ref075, {
        ...data,
        propertyId: '075',
        amount: 15,
        description: data.description + ' (Parte 2/2: Unidad 075)'
      });

      // Eliminar la transacción combinada original
      batch.delete(combinedRef);
      console.log('✔ Programada división: "30 y 75" -> 030 ($15) y 075 ($15)');
    }

    await batch.commit();
    console.log('\n¡Éxito! Base de datos totalmente saneada.');
    process.exit(0);
  } catch (error) {
    console.error('Error en la corrección manual:', error);
    process.exit(1);
  }
}

fixManualInconsistencies();
