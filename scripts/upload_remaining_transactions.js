const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const monthMap = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
};

async function uploadAll() {
    const movimientosDir = path.join(__dirname, '../public/src/doc/movimientos_propiedades');
    const files = fs.readdirSync(movimientosDir).filter(f => f.endsWith('.json'));
    
    // Archivos a omitir (ya subidos o no necesarios)
    const skipFiles = ['transacciones_febrero_2025.json'];

    console.log(`Iniciando carga de ${files.length - skipFiles.length} meses restantes...`);

    for (const file of files) {
        if (skipFiles.includes(file)) {
            console.log(`Saltando ${file} (ya procesado).`);
            continue;
        }

        const filePath = path.join(movimientosDir, file);
        const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        console.log(`Procesando ${file} (${transactions.length} registros)...`);

        const collectionRef = db.collection('transactions');
        let batch = db.batch();
        let count = 0;
        let fileTotal = 0;

        for (const t of transactions) {
            const docRef = collectionRef.doc();
            
            // Asegurar que la fecha sea un Timestamp de Firestore
            const data = {
                ...t,
                effectiveDate: admin.firestore.Timestamp.fromDate(new Date(t.effectiveDate + 'T00:00:00Z'))
            };

            batch.set(docRef, data);
            count++;

            if (count === 500) {
                await batch.commit();
                fileTotal += count;
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
            fileTotal += count;
        }

        console.log(`Finalizado ${file}: ${fileTotal} transacciones subidas.`);
    }

    console.log('--- CARGA COMPLETA ---');
}

uploadAll().catch(err => {
    console.error('Error durante la carga masiva:', err);
    process.exit(1);
});
