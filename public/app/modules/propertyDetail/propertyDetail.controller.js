import Property from "../../models/Property.js";
import Transaction from "../../models/Transaction.js";

/**
 * propertyDetail.controller.js
 * 
 * Gestiona la visualización de la propiedad y calcula su saldo real 
 * basándose en la sumatoria de TODAS sus transacciones.
 */
export default async function propertyDetailController(contexto) {
  const propertyId = contexto.params.id;
  
  const idEl = document.getElementById('detail-property-id');
  const ownerEl = document.getElementById('detail-property-owner');
  const balanceEl = document.getElementById('detail-property-balance');
  const statusBadgeEl = document.getElementById('detail-property-status-badge');
  const listContainer = document.getElementById('movements-list-container');

  if (!propertyId) return;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD' 
    }).format(amount);
  };

  try {
    // 1. Obtener Metadatos de la Propiedad (Nombre y Propietario)
    const prop = await Property.getById(propertyId);
    if (prop) {
      idEl.textContent = `Unidad ${prop.id}`;
      ownerEl.textContent = prop.ownerInfo?.name || 'Propietario no registrado';
    }

    // 2. Cargar TODAS las transacciones para calcular el saldo real
    listContainer.innerHTML = '<div class="loading-text">Cargando movimientos...</div>';
    const transactions = await Transaction.getByPropertyId(propertyId);

    // 3. CALCULO DE SUMATORIA (Saldo Real)
    // Positive amount = Payment/Credit, Negative amount = Fee/Debt
    const totalBalance = transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

    // 4. Actualizar el Balance en la UI
    balanceEl.textContent = formatCurrency(totalBalance);

    // 5. Determinar y mostrar el Estado según el balance calculado
    if (totalBalance < 0) {
      statusBadgeEl.textContent = 'Pendiente';
      statusBadgeEl.style.backgroundColor = 'rgba(192, 62, 76, 0.2)'; // Solid Pink suave
      statusBadgeEl.style.color = '#c03e4c';
    } else if (totalBalance > 0) {
      statusBadgeEl.textContent = 'Saldo a Favor';
      statusBadgeEl.style.backgroundColor = 'rgba(27, 158, 78, 0.2)'; // Kaitoke Green suave
      statusBadgeEl.style.color = '#1b9e4e';
    } else {
      statusBadgeEl.textContent = 'Al día';
      statusBadgeEl.style.backgroundColor = 'rgba(40, 191, 99, 0.2)'; // Success Green suave
      statusBadgeEl.style.color = '#28bf63';
    }

    // 6. Renderizar la lista de transacciones
    if (transactions.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">No se encontraron movimientos para esta propiedad.</div>';
      return;
    }

    listContainer.innerHTML = transactions.map(t => `
      <div class="movement-item">
        <div class="movement-info">
          <h4>${t.description || 'Movimiento'}</h4>
          <span>${t.type || 'N/A'} • ${t.voucherType || '---'} ${t.voucherNumber || ''}</span>
        </div>
        <div class="movement-amount" style="color: ${t.amount < 0 ? 'var(--color-solid-pink-600)' : 'var(--color-kaitoke-green-600)'}">
          ${formatCurrency(t.amount || 0)}
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error("[PropertyDetail] Error fatal:", error);
    listContainer.innerHTML = `<div class="error">Error del sistema: ${error.message}</div>`;
  }
}
