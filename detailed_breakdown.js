const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function detailedBreakdown() {
  try {
    const transactionsSnapshot = await db.collection('transactions').get();
    const stats = {}; // { TYPE: { sum: 0, count: 0 } }

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const type = (data.type || 'UNDEFINED').toUpperCase().trim();
      const amount = Number(data.amount) || 0;

      if (!stats[type]) {
        stats[type] = { sum: 0, count: 0 };
      }
      stats[type].sum += amount;
      stats[type].count++;
    });

    console.log('--- Desglose por Tipo de Transacción ---');
    let grandTotalNonFee = 0;
    
    Object.keys(stats).sort().forEach(type => {
      const { sum, count } = stats[type];
      console.log(`${type.padEnd(15)}: ${sum.toLocaleString('en-US', { style: 'currency', currency: 'USD' }).padStart(12)} (${count} movs)`);
      
      if (type !== 'FEE') {
        grandTotalNonFee += sum;
      }
    });

    console.log('-------------------------------------------');
    console.log(`TOTAL (No FEE) : ${grandTotalNonFee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

detailedBreakdown();
