const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findMissingPayments() {
  try {
    const transactionsSnapshot = await db.collection('transactions').get();
    
    let totalPositive = 0;
    let count = 0;

    console.log('--- Buscando todos los montos POSITIVOS (Ingresos) ---');

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const amount = Number(data.amount) || 0;
      
      if (amount > 0) {
        totalPositive += amount;
        count++;
      }
    });

    console.log(`\nSuma de TODOS los montos positivos: ${totalPositive.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    console.log(`Total de registros: ${count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findMissingPayments();
