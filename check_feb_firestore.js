const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkFeb2025() {
  try {
    console.log('--- Analizando FEBRERO 2025 en Firestore ---');
    
    const transactionsSnapshot = await db.collection('transactions').get();
    
    let totalIncome = 0;
    let count = 0;
    const transactions = [];

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

      // Filtro estricto: Febrero 2025, No FEE, Monto Positivo
      if (date.getFullYear() === 2025 && date.getMonth() === 1 && type !== 'FEE' && amount > 0) {
        totalIncome += amount;
        count++;
        transactions.push({
            date: date.toISOString().split('T')[0],
            amount: amount,
            desc: data.description,
            propId: data.propertyId
        });
      }
    });

    console.log(`Total Ingresos Febrero 2025: ${totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (${count} transacciones)`);
    
    // Ordenar y mostrar para comparar
    console.log('\n--- Detalle de Transacciones (Primeras 20) ---');
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    transactions.slice(0, 20).forEach(t => {
        console.log(`${t.date} | $${t.amount.toFixed(2).padStart(6)} | Prop: ${t.propId.padEnd(5)} | ${t.desc.substring(0, 40)}...`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkFeb2025();
