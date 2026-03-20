const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkExpensesFeb2025() {
  try {
    console.log('--- Buscando Egresos Específicos Febrero 2025 ---');
    
    const transactionsSnapshot = await db.collection('transactions').get();
    const targets = ['TIGO', 'IDAAN', 'ENSA'];
    const found = [];

    transactionsSnapshot.forEach(doc => {
      const data = doc.data();
      const desc = (data.description || '').toUpperCase();
      const amount = Number(data.amount) || 0;
      
      // Filtrar solo egresos (monto negativo)
      if (amount < 0) {
        // Verificar si coincide con alguno de los objetivos
        if (targets.some(t => desc.includes(t))) {
           // Verificar fecha (Febrero 2025)
           let date;
           if (data.effectiveDate && data.effectiveDate.toDate) {
             date = data.effectiveDate.toDate();
           } else {
             date = new Date(data.effectiveDate);
           }

           if (date.getFullYear() === 2025 && date.getMonth() === 1) { // Mes 1 = Febrero
             found.push({
               id: doc.id,
               date: date.toISOString().split('T')[0],
               desc: data.description,
               amount: amount
             });
           }
        }
      }
    });

    if (found.length === 0) {
      console.log('❌ No se encontraron los egresos de TIGO, IDAAN o ENSA en Febrero 2025.');
    } else {
      console.log(`✅ Se encontraron ${found.length} registros:`);
      found.forEach(t => {
        console.log(`${t.date} | ${t.desc.padEnd(30)} | $${t.amount.toFixed(2)}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkExpensesFeb2025();
