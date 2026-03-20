const fs = require('fs');
const path = require('path');

async function analyzeFebJson() {
  try {
    const filePath = path.join(__dirname, 'public/src/doc/movimientos_propiedades/transacciones_febrero_2025.json');
    const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    let totalIncome = 0;
    let countPayments = 0;
    let countFees = 0;
    let countExpenses = 0;
    let countOther = 0;

    // Mapa para detectar duplicados por VoucherNumber (Recibo)
    const vouchers = new Map();
    const duplicates = [];

    transactions.forEach(t => {
      const type = (t.type || '').toUpperCase();
      const amount = Number(t.amount) || 0;
      const voucher = t.voucherNumber;

      if (type === 'FEE') {
        countFees++;
      } else if (type === 'EXPENSE') {
        countExpenses++;
      } else {
        if (amount > 0) {
          totalIncome += amount;
          countPayments++;
          
          // Detectar duplicados de pagos reales
          if (voucher && voucher !== 'S/N') {
            if (vouchers.has(voucher)) {
              duplicates.push({ voucher, desc: t.description, amount });
            }
            vouchers.set(voucher, (vouchers.get(voucher) || 0) + 1);
          }
        } else {
          countOther++;
        }
      }
    });

    console.log('--- Análisis del JSON Febrero 2025 ---');
    console.log(`Cargos (FEE):      ${countFees}`);
    console.log(`Gastos (EXPENSE):  ${countExpenses}`);
    console.log(`Ingresos (PAGOS):  ${countPayments}`);
    console.log(`TOTAL INGRESOS $:  ${totalIncome.toFixed(2)}`);
    console.log(`Otros:             ${countOther}`);
    
    if (duplicates.length > 0) {
      console.log('\n--- Posibles Duplicados Detectados ---');
      duplicates.forEach(d => console.log(`Voucher ${d.voucher}: ${d.desc} ($${d.amount})`));
    } else {
      console.log('\n✅ No se detectaron vouchers duplicados en el JSON.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeFebJson();
