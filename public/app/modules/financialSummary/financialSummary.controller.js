import Property from '../../models/Property.js';

/**
 * Controlador para el módulo de Resumen Financiero (financialSummary).
 * 
 * Propósito:
 * 1. Conectarse a Firestore a través del modelo Property para obtener los datos financieros.
 * 2. Calcular y mostrar las métricas clave en la tarjeta de resumen.
 */
export default async function financialSummary(contexto) {
  console.log("Controlador 'financialSummary' cargado.");

  // --- Elementos del DOM ---
  const totalReceivableEl = document.getElementById('fs-total-receivable');
  const pastDueAmountEl = document.getElementById('fs-past-due-amount');
  const creditBalanceAmountEl = document.getElementById('fs-credit-balance-amount');

  // Helper para formatear números como moneda USD
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Muestra un estado de carga inicial
  if (totalReceivableEl) totalReceivableEl.textContent = 'Cargando...';
  if (pastDueAmountEl) pastDueAmountEl.textContent = '...';
  if (creditBalanceAmountEl) creditBalanceAmountEl.textContent = '...';

  // --- Lógica de consulta y actualización ---
  try {
    const summary = await Property.getFinancialSummary();

    if (totalReceivableEl) {
      totalReceivableEl.textContent = formatCurrency(summary.totalReceivable);
    }
    if (creditBalanceAmountEl) {
      creditBalanceAmountEl.textContent = formatCurrency(summary.creditBalance);
    }
    
    // Deuda Atrasada se deja como placeholder por ahora
    if (pastDueAmountEl) {
      pastDueAmountEl.textContent = formatCurrency(0); 
    }

  } catch (error) {
    console.error("Error al renderizar el resumen financiero:", error);
    if (totalReceivableEl) totalReceivableEl.textContent = 'Error';
  }
}
