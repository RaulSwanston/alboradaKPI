const fs = require('fs');
const path = require('path');

const propertiesPath = path.join(process.cwd(), 'public/src/doc/allProperties.json');
const movimientosDir = path.join(process.cwd(), 'public/src/doc/movimientos_propiedades');

const monthMap = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
};

async function run() {
    console.log('Cargando propiedades...');
    const allProperties = JSON.parse(fs.readFileSync(propertiesPath, 'utf8'));
    const propertyIds = allProperties.map(p => p.id);
    console.log(`Se encontraron ${propertyIds.length} propiedades.`);

    const files = fs.readdirSync(movimientosDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        console.log(`Procesando ${file}...`);
        const filePath = path.join(movimientosDir, file);
        
        // Extraer mes y año del nombre: transacciones_mes_año.json
        const parts = file.replace('.json', '').split('_');
        const mesNombre = parts[1];
        const año = parts[2];
        const mesNum = monthMap[mesNombre.toLowerCase()];

        if (!mesNum) {
            console.error(`No se pudo determinar el mes para el archivo: ${file}`);
            continue;
        }

        const effectiveDate = `${año}-${mesNum}-01`;
        const description = `Cuota de Mantenimiento Area Social ${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} ${año}`;

        let transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Crear los nuevos cargos FEE
        const newFees = propertyIds.map(id => ({
            effectiveDate,
            voucherNumber: "S/N",
            description,
            propertyId: id,
            amount: -15.00,
            voucherType: "Cargo",
            type: "FEE",
            status: "verified"
        }));

        // Combinar: los cargos FEE primero, luego los movimientos existentes
        const updatedTransactions = [...newFees, ...transactions];

        fs.writeFileSync(filePath, JSON.stringify(updatedTransactions, null, 2));
        console.log(`Inyectados ${newFees.length} cargos en ${file}.`);
    }

    console.log('Proceso completado con éxito.');
}

run().catch(err => {
    console.error('Error durante el proceso:', err);
    process.exit(1);
});
