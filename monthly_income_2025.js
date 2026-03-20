const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function monthlyIncomeBreakdown() {
  try {
    const transactionsSnapshot = await db.collection('transactions').get();
    
    // Inicializar los 12 meses con 0
    const monthlyData = Array(12).fill(0).map(() => ({ income: 0, count: 0 }));
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const type = (data.type || '').toUpperCase();
      const amount = Number(data.amount) || 0;
      
      let date;
      if (data.effectiveDate && data.effectiveDate.toDate) {
        date = data.effectiveDate.toDate();
      } else {
        date = new Date(data.effectiveDate);
      }

      // Solo año 2025 e ignorar cargos FEE
      if (date.getFullYear() === 2025 && type !== 'FEE' && amount > 0) {
        const monthIndex = date.getMonth(); // 0-11
        monthlyData[monthIndex].income += amount;
        monthlyData[monthIndex].count++;
      }
    });

    console.log('--- DESGLOSE MENSUAL DE INGRESOS (2025) ---');
    console.log('Nota: Solo montos positivos, excluyendo FEE.\n');

    let grandTotal = 0;
    monthNames.forEach((name, index) => {
      const { income, count } = monthlyData[index];
      grandTotal += income;
      console.log(`${name.padEnd(12)}: ${income.toLocaleString('en-US', { style: 'currency', currency: 'USD' }).padStart(12)} (${count} pagos)`);
    });

    console.log('-------------------------------------------');
    console.log(`TOTAL ANUAL  : ${grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' }).padStart(12)}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

monthlyIncomeBreakdown();
