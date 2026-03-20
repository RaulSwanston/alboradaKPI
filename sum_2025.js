const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function sum2025NonFee() {
  try {
    console.log('--- Calculando Balance del Año 2025 (Excluyendo FEE) ---');
    
    const transactionsSnapshot = await db.collection('transactions').get();
    
    let totalIncome = 0;
    let totalExpenses = 0;
    let countIncome = 0;
    let countExpenses = 0;
    let countFeeIgnored = 0;
    let countOtherYears = 0;

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const type = (data.type || '').toUpperCase();
      const amount = Number(data.amount) || 0;
      
      // Obtener la fecha (maneja tanto Timestamps de Firestore como strings ISO)
      let date;
      if (data.effectiveDate && data.effectiveDate.toDate) {
        date = data.effectiveDate.toDate();
      } else {
        date = new Date(data.effectiveDate);
      }

      // Filtrar solo por el año 2025
      if (date.getFullYear() !== 2025) {
        countOtherYears++;
        return;
      }

      // Ignorar cargos recurrentes
      if (type === 'FEE') {
        countFeeIgnored++;
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

    console.log(`\n📊 RESULTADOS PARA EL AÑO 2025:`);
    console.log(`-------------------------------------------`);
    console.log(`✅ Ingresos (Pagos/Otros): ${totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (${countIncome} movs)`);
    console.log(`❌ Egresos (Gastos):       ${totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (${countExpenses} movs)`);
    console.log(`-------------------------------------------`);
    console.log(`💰 BALANCE NETO 2025:      ${netBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`);
    console.log(`-------------------------------------------`);
    console.log(`ℹ️  Movimientos ignorados:`);
    console.log(`   - Cargos FEE: ${countFeeIgnored}`);
    console.log(`   - Otros años: ${countOtherYears}`);

    process.exit(0);
  } catch (error) {
    console.error('Error al calcular:', error);
    process.exit(1);
  }
}

sum2025NonFee();
