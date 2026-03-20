const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function sumAllTransactionsFromFirestore() {
  try {
    console.log('--- Realizando consulta DIRECTA a Firestore ---');
    console.log('Calculando sumatoria de todas las transacciones (Excluyendo FEE)...\n');

    const transactionsSnapshot = await db.collection('transactions').get();
    
    let totalBalance = 0;
    let totalIncome = 0;
    let totalExpenses = 0;
    let count = 0;
    let countFeeIgnored = 0;

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const type = (data.type || '').toUpperCase();
      const amount = Number(data.amount) || 0;

      if (type === 'FEE') {
        countFeeIgnored++;
        return;
      }

      totalBalance += amount;
      if (amount > 0) totalIncome += amount;
      else if (amount < 0) totalExpenses += amount;
      
      count++;
    });

    console.log(`📊 RESULTADOS DE LA CONSULTA DIRECTA:`);
    console.log(`-------------------------------------------`);
    console.log(`Ingresos (+) : ${totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    console.log(`Egresos (-)  : ${totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    console.log(`-------------------------------------------`);
    console.log(`💰 SUMATORIA FINAL : ${totalBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    console.log(`-------------------------------------------`);
    console.log(`ℹ️  Registros procesados: ${count}`);
    console.log(`ℹ️  Registros FEE ignorados: ${countFeeIgnored}`);

    process.exit(0);
  } catch (error) {
    console.error('Error durante la consulta:', error);
    process.exit(1);
  }
}

sumAllTransactionsFromFirestore();
