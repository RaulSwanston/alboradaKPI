/**
 * ChartsData — generación PURA de los agregados que alimentan `apexCharts`.
 *
 * Por qué existe:
 *   `Analytics` consultaba Firestore en cada render del dashboard (~6.500
 *   lecturas por visita). El plan gratuito de Firestore factura 1 lectura por
 *   documento, así que ocho visitas agotaban la cuota diaria y dejaban la app
 *   caída para los residentes.
 *
 *   La solución es mover el cálculo al único sitio que YA tiene todos los datos
 *   en memoria: `Property.recalculateAllBalances()` (el botón "Sincronizar").
 *   Ese proceso construye este objeto y lo guarda en `appConfig.stats.charts`.
 *   Después, `Analytics` solo lee de `localStorage` / `contexto.data.appConfig`.
 *
 * Reglas de este módulo:
 *   - Funciones puras: entran documentos, salen datasets. Sin red, sin Firestore.
 *   - `buildChartsData()` es la única puerta de escritura del snapshot.
 *   - Si un gráfico no tiene datos, devuelve arrays vacíos (el controlador
 *     muestra el estado vacío); nunca inventa cifras.
 *
 * Coste: 0 lecturas. El costo son las 5 colecciones pequeñas que el sync ya
 * necesita leer para construir el snapshot (ver `Property.js`).
 */

import { resolveIncomeTypeId, incomeTypeName } from "../core/incomeTypes.js";

export const MONTH_LABELS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Clave reservada del mapa de saldos por unidad (no es un gráfico). */
export const BALANCES_KEY = 'balancesByProperty';

/**
 * Clave estable de un gráfico: `metodo:param=valor,param=valor` con los
 * parámetros ordenados alfabéticamente. Debe ser idéntica al productor y al
 * lector, o el gráfico sale vacío.
 */
export function chartKey(method, params = {}) {
  const parts = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return parts.length ? `${method}:${parts.join(',')}` : method;
}

/** Dataset vacío, mismo contrato que usaba `Analytics`. */
export function emptyChartData() {
  return { categories: [], series: [] };
}

// ---------------------------------------------------------------------------
// Utilidades de fecha / formato
// ---------------------------------------------------------------------------

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(period) {
  const [y, m] = period.split('-').map(Number);
  const label = MONTH_LABELS_ES[m - 1] || String(m);
  return `${label} ${String(y).slice(2)}`;
}

function monthSequence(months, now) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

function windowStart(months, now) {
  return new Date(now.getFullYear(), now.getMonth() - months, 1);
}

function inWindow(transactions, months, now) {
  const start = windowStart(months, now);
  return transactions.filter((t) => {
    const d = toDate(t.effectiveDate);
    return d && d >= start;
  });
}

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

function unitLabel(prop) {
  return prop.name || `Unidad ${prop.id}`;
}

/**
 * Palabras clave para inferir el método de pago cuando el campo paymentMethod
 * no existe (los pagos históricos no lo tienen; las descripciones sí lo indican).
 */
export function inferPaymentMethod(transaction) {
  const desc = ((transaction.description || '') + ' ' + (transaction.paymentMethod || '')).toUpperCase();
  if (desc.includes('YAPPY')) return 'Yappy';
  if (desc.includes('CHEQUE')) return 'Cheque';
  if (desc.includes('EFECTIVO') || desc.includes(' CASH')) return 'Efectivo';
  if (desc.includes('TARJETA') || desc.includes('CARD') || desc.includes('POS')) return 'Tarjeta';
  if (desc.includes('DEPOSIT') || desc.includes('DEPÓSITO')) return 'Depósito';
  if (desc.includes('TRANSFER') || desc.includes('BANCA') || desc.includes('ACH') || desc.includes(' BG ')) return 'Transferencia';
  return 'Otro';
}

/**
 * Normaliza una descripción de cargo (FEE) para agrupar por concepto,
 * eliminando la referencia temporal (mes/año) de la descripción.
 */
export function normalizeConcept(description) {
  return (description || 'SIN CONCEPTO')
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|sept|octubre|noviembre|diciembre)\b/gi, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'SIN CONCEPTO';
}

// ---------------------------------------------------------------------------
// Constructores (mismo cálculo que la antigua Analytics, sin tocar red)
// ---------------------------------------------------------------------------

function cashFlow(transactions, months, now) {
  const tx = inWindow(transactions, months, now);
  const periods = monthSequence(months, now);
  const idx = Object.fromEntries(periods.map((p, i) => [p, i]));
  const ingresos = new Array(periods.length).fill(0);
  const gastos = new Array(periods.length).fill(0);
  for (const t of tx) {
    const i = idx[t.period];
    if (i === undefined) continue;
    if (t.type === 'PAYMENT' || t.type === 'OTHER_INCOME') ingresos[i] += (t.amount || 0);
    else if (t.type === 'EXPENSE' || t.type === 'ADMIN_EXPENSE') gastos[i] += Math.abs(t.amount || 0);
  }
  return {
    categories: periods.map(monthLabel),
    series: [
      { name: 'Ingresos', data: ingresos.map(round) },
      { name: 'Gastos', data: gastos.map(round) }
    ]
  };
}

function collectionRate(transactions, months, now) {
  const tx = inWindow(transactions, months, now);
  const periods = monthSequence(months, now);
  const idx = Object.fromEntries(periods.map((p, i) => [p, i]));
  const facturado = new Array(periods.length).fill(0);
  const cobrado = new Array(periods.length).fill(0);
  for (const t of tx) {
    const i = idx[t.period];
    if (i === undefined) continue;
    if (t.type === 'FEE' || t.type === 'FINE') facturado[i] += Math.abs(t.amount || 0);
    else if (t.type === 'PAYMENT') cobrado[i] += (t.amount || 0);
  }
  return {
    categories: periods.map(monthLabel),
    series: [
      { name: 'Facturado', data: facturado.map(round) },
      { name: 'Cobrado', data: cobrado.map(round) }
    ]
  };
}

function unitsHealth(properties) {
  let alDia = 0;
  let mora = 0;
  for (const p of properties) {
    if ((p.balance || 0) >= -0.01) alDia++;
    else mora++;
  }
  return { categories: ['Al día', 'En mora'], series: [alDia, mora] };
}

function topDebtors(properties, top) {
  const props = [...properties]
    .filter((p) => (p.balance || 0) < -0.01)
    .sort((a, b) => (a.balance || 0) - (b.balance || 0))
    .slice(0, top);
  return {
    categories: props.map(unitLabel),
    series: [{ name: 'Deuda', data: props.map((p) => round(Math.abs(p.balance))) }]
  };
}

function overpayments(properties, top) {
  const props = [...properties]
    .filter((p) => (p.balance || 0) > 0.01)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .slice(0, top);
  return {
    categories: props.map(unitLabel),
    series: [{ name: 'Saldo a favor', data: props.map((p) => round(p.balance)) }]
  };
}

function paymentMethodDistribution(transactions, months, now) {
  const tx = inWindow(transactions, months, now).filter((t) => t.type === 'PAYMENT');
  const counts = {};
  for (const t of tx) {
    const method = inferPaymentMethod(t);
    counts[method] = (counts[method] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => v) };
}

function incomeByType(transactions, months, now) {
  const tx = inWindow(transactions, months, now)
    .filter((t) => t.type === 'PAYMENT' || t.type === 'OTHER_INCOME');
  const totals = {};
  for (const t of tx) {
    const label = incomeTypeName(resolveIncomeTypeId(t));
    totals[label] = (totals[label] || 0) + Math.abs(t.amount || 0);
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => round(v)) };
}

function incomeByConcept(transactions, months, now) {
  const tx = inWindow(transactions, months, now).filter((t) => t.type === 'FEE' || t.type === 'FINE');
  const totals = {};
  for (const t of tx) {
    const concept = normalizeConcept(t.description);
    totals[concept] = (totals[concept] || 0) + Math.abs(t.amount || 0);
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => round(v)) };
}

function expensesByCategory(transactions, expenseAccounts, months, now) {
  const tx = inWindow(transactions, months, now)
    .filter((t) => t.type === 'EXPENSE' || t.type === 'ADMIN_EXPENSE');
  const labelByAccount = new Map(expenseAccounts.map((a) => [a.id, a.category || a.name || 'Sin clasificar']));
  const totals = {};
  for (const t of tx) {
    const label = labelByAccount.get(t.expenseAccountId) || 'Sin clasificar';
    totals[label] = (totals[label] || 0) + Math.abs(t.amount || 0);
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => round(v)) };
}

function statusDistribution(docs, labelKey) {
  const counts = {};
  for (const d of docs) {
    const label = d[labelKey] || 'unknown';
    counts[label] = (counts[label] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => v) };
}

function communityHealth(properties) {
  const total = properties.length || 1;
  let alDia = 0;
  for (const p of properties) if ((p.balance || 0) >= -0.01) alDia++;
  return { categories: [''], series: [round((alDia / total) * 100)] };
}

function topServices(serviceRequests, chargeConcepts, top) {
  const conceptName = {};
  for (const c of chargeConcepts) conceptName[c.id] = c.name;
  const counts = {};
  for (const r of serviceRequests) {
    const name = conceptName[r.chargeConceptId] || r.chargeConceptId || 'Sin concepto';
    counts[name] = (counts[name] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, top);
  return {
    categories: entries.map(([k]) => k),
    series: [{ name: 'Solicitudes', data: entries.map(([, v]) => v) }]
  };
}

function eventsByMonth(communityEvents, months, now) {
  const periods = monthSequence(months, now);
  const counts = new Array(periods.length).fill(0);
  for (const e of communityEvents) {
    const d = toDate(e.startDate || e.start || e.date || e.timestamp);
    if (!d) continue;
    const i = periods.indexOf(monthKey(d));
    if (i !== -1) counts[i]++;
  }
  return { categories: periods.map(monthLabel), series: [{ name: 'Eventos', data: counts }] };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Construye el snapshot completo de gráficos + mapa de saldos por unidad.
 *
 * @param {Object} docs
 * @param {Array}  docs.transactions           Documentos de `transactions` (objetos planos).
 * @param {Array}  docs.properties             Propiedades con el saldo YA recalculado.
 * @param {Array}  [docs.paymentNotifications]
 * @param {Array}  [docs.serviceRequests]
 * @param {Array}  [docs.communityEvents]
 * @param {Array}  [docs.chargeConcepts]
 * @param {Array}  [docs.expenseAccounts]
 * @param {Object} [options]
 * @param {Date}   [options.now]               Momento de referencia de las ventanas.
 * @returns {Object} Objeto listo para `stats.charts`.
 */
export function buildChartsData(docs = {}, { now = new Date() } = {}) {
  const transactions = docs.transactions || [];
  const properties = docs.properties || [];
  const paymentNotifications = docs.paymentNotifications || [];
  const serviceRequests = docs.serviceRequests || [];
  const communityEvents = docs.communityEvents || [];
  const chargeConcepts = docs.chargeConcepts || [];
  const expenseAccounts = docs.expenseAccounts || [];

  const charts = {};

  // Variantes de meses/top que la configuración podría pedir. Se generan todas
  // porque el snapshot se calcula una vez y leerlas después es gratis; así un
  // cambio de `params` en appConfig no deja el gráfico vacío.
  for (const months of [6, 12]) {
    charts[chartKey('getCashFlow', { months })] = cashFlow(transactions, months, now);
    charts[chartKey('getCollectionRate', { months })] = collectionRate(transactions, months, now);
    charts[chartKey('getPaymentMethodDistribution', { months })] = paymentMethodDistribution(transactions, months, now);
    charts[chartKey('getIncomeByType', { months })] = incomeByType(transactions, months, now);
    charts[chartKey('getIncomeByConcept', { months })] = incomeByConcept(transactions, months, now);
    const gastos = expensesByCategory(transactions, expenseAccounts, months, now);
    charts[chartKey('getExpensesByCategory', { months })] = gastos;
    charts[chartKey('getCommunityExpenses', { months })] = gastos;
    charts[chartKey('getEventsByMonth', { months })] = eventsByMonth(communityEvents, months, now);
  }

  for (const top of [5, 6, 10]) {
    charts[chartKey('getTopDebtors', { top })] = topDebtors(properties, top);
    charts[chartKey('getOverpayments', { top })] = overpayments(properties, top);
    charts[chartKey('getTopServices', { top })] = topServices(serviceRequests, chargeConcepts, top);
  }

  charts[chartKey('getUnitsHealth')] = unitsHealth(properties);
  charts[chartKey('getCommunityHealth')] = communityHealth(properties);
  charts[chartKey('getPaymentReportStatus')] = statusDistribution(paymentNotifications, 'status');
  charts[chartKey('getServiceRequestStatus')] = statusDistribution(serviceRequests, 'status');

  // Saldo por unidad para "Mi Estado de Cuenta": 358 enteros, sin nombres ni
  // datos personales. `firestore.rules` ya permite a cualquier autenticado leer
  // toda la colección `properties`, así que esto no filtra nada nuevo.
  const balances = {};
  for (const p of properties) balances[p.id] = round(p.balance);
  charts[BALANCES_KEY] = balances;

  return charts;
}
