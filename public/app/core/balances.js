/**
 * Reglas de saldo compartidas por el Estado de Cuenta (`propertyDetail`) y la
 * tarjeta "Saldo Actual" del Resumen Financiero (`financialSummary`).
 *
 * Por qué existe este archivo: `units.pending_cents` cuenta TODAS las facturas
 * emitidas, incluidas las de meses que aún no llegan (las cuotas se generan por
 * adelantado para poder conciliar a los clientes que pagan anticipado). Para el
 * residente, una cuota futura solo debe contar si ya está cubierta; el resto
 * aún no vence. Esta es la única definición de esa regla.
 *
 * Convención de signos (la que ya usan los mapeadores de `api.js`):
 *   - cargos: negativos
 *   - pagos y notas de crédito: positivos
 *   - saldo: positivo = deuda, negativo = a favor
 */

/** `YYYY-MM` del mes en curso. La cuota de este mes ya cuenta. */
export const currentPeriodKey = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/**
 * ¿Es una cuota de un mes posterior al actual que todavía tiene saldo?
 * Solo esas se ocultan. Las futuras ya cubiertas se muestran (aportan 0 al
 * saldo neto y mantienen visible la conciliación del pago anticipado).
 *
 * @param {Object} t - Movimiento mapeado (`amount`, `period`, `pendingAmount`)
 * @param {string} [current] - Periodo de corte `YYYY-MM`
 * @returns {boolean} true si el movimiento NO debe mostrarse / contarse
 */
export const isHiddenFutureCharge = (t, current = currentPeriodKey()) => {
  if ((Number(t?.amount) || 0) >= 0) return false;
  if (!t?.period || t.period <= current) return false;
  const pending = t.pendingAmount !== undefined
    ? Number(t.pendingAmount) || 0
    : Math.abs(Number(t.amount) || 0);
  return pending > 0;
};

/**
 * Saldo que el residente ve en su estado de cuenta.
 * @param {Array<Object>} movements - Movimientos de la unidad (ledger)
 * @returns {number} Deuda positiva; negativo si está a favor
 */
export const visibleBalance = (movements) => {
  let net = 0;
  for (const t of movements || []) {
    if (isHiddenFutureCharge(t)) continue;
    net -= Number(t.amount) || 0;
  }
  return net;
};

/**
 * Último pago de la unidad dentro de un listado de movimientos.
 * Las notas de crédito no son pagos, así que se excluyen.
 * @param {Array<Object>} movements
 * @returns {Object|null}
 */
export const latestPayment = (movements) => {
  let best = null;
  let bestMs = -Infinity;
  for (const t of movements || []) {
    if (t?.type !== 'PAYMENT') continue;
    if (!((Number(t.amount) || 0) > 0)) continue;
    const ms = t.effectiveDate?.getTime?.() ?? 0;
    if (ms > bestMs) {
      best = t;
      bestMs = ms;
    }
  }
  return best;
};
