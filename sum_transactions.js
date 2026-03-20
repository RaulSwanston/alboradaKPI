const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function sumNonFeeTransactions() {
  try {
    console.log('--- Calculando Balance (Ingresos vs Egresos) ---');
    console.log('Nota: Excluyendo cargos de tipo "FEE" (cuotas recurrentes).\n');

    const transactionsSnapshot = await db.collection('transactions').get();
    
    let totalIncome = 0;   // Pagos recibidos (Montos positivos)
    let totalExpenses = 0; // Compras/Gastos (Montos negativos que no son FEE)
    let countIncome = 0;
    let countExpenses = 0;
    let countFeesIgnored = 0;

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const type = (data.type || '').toUpperCase();
      const amount = Number(data.amount) || 0;

      if (type === 'FEE') {
        countFeesIgnored++;
        return;
      }

      if (amount > 0) {
        totalIncome += amount;
        countIncome++;
      } else if (amount < 0) {
        totalExpenses += amount;
        countExpenses++;
      }
    });

    const netBalance = totalIncome + totalExpenses;

    console.log(`📊 RESULTADOS:`);
    console.log(`-------------------------------------------`);
    console.log(`✅ Ingresos (Pagos):      ${totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (${countIncome} movs)`);
    console.log(`❌ Egresos (Gastos):      ${totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (${countExpenses} movs)`);
    console.log(`-------------------------------------------`);
    console.log(`💰 BALANCE NETO:          ${netBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    console.log(`-------------------------------------------`);
    console.log(`ℹ️  Cargos FEE ignorados: ${countFeesIgnored}`);

    process.exit(0);
  } catch (error) {
    console.error('Error al calcular la sumatoria:', error);
    process.exit(1);
  }
}

sumNonFeeTransactions();
