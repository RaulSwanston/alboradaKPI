/**
 * api.js — Cliente de datos del condominio vía Worker de Cloudflare (D1).
 *
 * Ola 1 del corte: SOLO LECTURA. Los modelos (`models/*.js`) conservan su
 * interfaz pública y, cuando `isD1()` es true, delegan aquí en lugar del
 * SDK de Firestore. Firestore sigue siendo el default hasta el corte real.
 *
 * Cambiar de backend (sin tocar código):
 *   - `?d1=1` en la URL (temporal)
 *   - `localStorage.setItem('gph_backend', 'd1')` (persistente)
 *   - `window.GPH_API_BASE_URL` para apuntar a otro Worker (pruebas)
 *
 * Formas: el Worker devuelve centavos y epoch ms. Aquí se convierten a la
 * forma que la app vieja ya entiende (dólares float, Date, campos camelCase)
 * para que los controladores no cambien.
 */
import { R2_BASE_URL } from './r2.js';
import { INCOME_TYPE_IDS } from './incomeTypes.js';
import { authHeaders } from './authToken.js';

const PROPERTY_ID = () => window.GPH_PROPERTY_ID || 'residencial-alborada';

// Base de la API v1 (incluye `/api/v1`). Las rutas se pasan SIN version:
// `apiRoot() + '/users'` → `.../api/v1/users`. Concatenar otro `/v1` da 404.
const apiRoot = () =>
  window.GPH_API_BASE_URL || localStorage.getItem('gph_api_base') || R2_BASE_URL.replace(/\/r2\/?$/, '');

const apiBase = () => `${apiRoot()}/properties/${PROPERTY_ID()}`;

// `authHeaders` (en authToken.js) aporta el `Authorization: Bearer <idToken>`.
// Ya no se envía la API key del condominio: el Worker la rechaza en datos.

/**
 * ¿Los modelos deben leer de D1 en lugar de Firestore?
 *
 * D1 es el backend POR DEFECTO (corte hecho). Firestore queda solo como
 * escape hatch temporal para comparar, nunca como camino normal:
 *   - `?d1=0` en la URL
 *   - `localStorage.setItem('gph_backend', 'firestore')`
 *   - `window.GPH_BACKEND = 'firestore'`
 */
export function isD1() {
  if (window.GPH_BACKEND === 'firestore') return false;
  if (window.GPH_BACKEND === 'd1') return true;
  const stored = localStorage.getItem('gph_backend');
  if (stored === 'firestore') return false;
  if (stored === 'd1') return true;
  try {
    const flag = new URLSearchParams(window.location.search).get('d1');
    if (flag === '0') return false;
  } catch {
    /* sin search params */
  }
  return true;
}

async function apiGet(path) {
  const res = await fetch(`${apiBase()}/${path}`, {
    headers: await authHeaders()
  });
  if (!res.ok) {
    let msg = `D1 ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch { /* sin cuerpo JSON */ }
    throw new Error(msg);
  }
  return res.json();
}

async function apiSend(method, path, body) {
  const res = await fetch(`${apiBase()}/${path}`, {
    method,
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: body == null ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `D1 ${res.status}`);
  return j;
}

async function apiGetRoot(path) {
  const res = await fetch(`${apiRoot()}/${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    let msg = `D1 ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  return res.json();
}

async function apiSendRoot(method, path, body) {
  const res = await fetch(`${apiRoot()}/${path}`, {
    method,
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: body == null ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `D1 ${res.status}`);
  return j;
}

const cents = (v) => Math.round(Number(v ?? 0)) / 100;
const toCents = (v) => Math.round(Number(v ?? 0) * 100);
const toDate = (ms) => new Date(Number(ms ?? 0));

/* ------------------------------------------------------------------ */
/* Unidades (legacy: documentos de la colección `properties`)          */
/* ------------------------------------------------------------------ */

function mapUnit(row) {
  return {
    id: row.id,
    name: row.name,
    address: {
      street: row.street || '',
      fullAddress: row.full_address || ''
    },
    currency: 'USD',
    ownerInfo: {
      name: row.owner_name || null,
      phone: row.owner_phone || null,
      mobile: row.owner_mobile || null,
      email: row.owner_email || null,
    },
    residentUids: row.resident_uids
      ? String(row.resident_uids).split(',').filter(Boolean)
      : [],
    balance:
      Number(row.overpaid_cents ?? 0) > 0
        ? cents(row.overpaid_cents)
        : -cents(row.pending_cents),
    lastBalanceUpdate: toDate(row.balance_updated_at ?? row.created_at)
  };
}

export async function d1GetAllUnits(sortBy = 'name') {
  const { units } = await apiGet('units');
  const list = units.map(mapUnit);
  const key = sortBy === 'id' ? 'id' : 'name';
  list.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
  return list;
}

export async function d1GetUnit(id) {
  const j = await apiGet(`units/${encodeURIComponent(id)}`);
  return j.unit ? mapUnit(j.unit) : null;
}

/* Agregados del Resumen Financiero (admin). */
export async function d1GetStats() {
  const { stats } = await apiGet('stats');
  return stats ?? null;
}

/* ------------------------------------------------------------------ */
/* Movimientos (legacy: documentos de la colección `transactions`)     */
/* ------------------------------------------------------------------ */

const KIND_TO_TYPE = {
  charge: 'FEE',
  payment: 'PAYMENT',
  expense: 'EXPENSE',
  other_income: 'OTHER_INCOME',
  credit_note: 'CREDIT_NOTE'
};

const TYPE_TO_KIND = Object.fromEntries(
  Object.entries(KIND_TO_TYPE).map(([k, t]) => [t, k])
);
// FINE histórico se trata como cargo: mismo origen en D1.
TYPE_TO_KIND.FINE = 'charge';
export { TYPE_TO_KIND };

/**
 * Convención de signo (heredada de Firestore, y que usa toda la app):
 *   cargo / gasto  → NEGATIVO (es deuda o salida de caja)
 *   pago / ingreso → POSITIVO
 * D1 guarda todas las magnitudes en positivo, así que el signo se aplica aquí.
 * `-Math.abs()` es idempotente a propósito: la proyección delgada del ledger ya
 * entrega los gastos en negativo, mientras que `kind=expense` trae la fila
 * cruda en positivo. Ambas rutas convergen al mismo resultado.
 */
function mapCharge(row, allocationsByCharge, unitIdFallback) {
  const linked = allocationsByCharge.get(row.id) ?? [];
  return {
    id: row.id,
    type: 'FEE',
    period: row.period,
    propertyId: row.unit_id ?? unitIdFallback,
    effectiveDate: toDate(row.issued_at),
    amount: -Math.abs(cents(row.amount_cents)),
    pendingAmount: row.paid_cents == null && row.credited_cents == null
      // La proyección delgada del ledger no trae `paid_cents`: no se inventa
      // "todo pendiente", se deja sin dato.
      ? undefined
      : cents(row.amount_cents - (row.paid_cents ?? 0) - (row.credited_cents ?? 0)),
    paidBy: linked.map((a) => ({ paymentId: a.payment_id, amount: cents(a.amount_cents) })),
    appliedTo: [],
    description: row.note || row.concept_name || row.description || 'Cargo',
    voucherNumber: row.number || '',
    concept: row.concept_id || row.concept_slug || '',
    conceptName: row.concept_name || '',
    status: row.status === 'issued' ? 'active' : 'void',
    createdAt: toDate(row.created_at ?? row.issued_at)
  };
}

function mapPayment(row, allocationsByPayment) {
  const linked = allocationsByPayment.get(row.id) ?? [];

  // Comprobante: el Worker incluye `attachments[]` cuando el movimiento viene
  // de `/movements/:id` (ruta individual). Cada attachment tiene `r2_key`.
  const receiptURL = (row.attachments && row.attachments.length > 0)
    ? `${R2_BASE_URL}/${row.attachments[0].r2_key}`
    : null;

  return {
    id: row.id,
    type: 'PAYMENT',
    period: row.period,
    propertyId: row.unit_id ?? '',
    effectiveDate: toDate(row.received_at),
    amount: Math.abs(cents(row.amount_cents)),
    pendingAmount: 0,
    paidBy: [],
    appliedTo: linked.map((a) => ({ transactionId: a.charge_id, amount: cents(a.amount_cents) })),
    description: row.note || row.description || 'Pago',
    voucherNumber: row.number ?? row.reference ?? '',
    reference: row.reference ?? null,
    paymentMethod: row.method ?? '',
    // En D1, `payments` ES la cuota: el dinero de los residentes aplicado a
    // cargos. Los demas ingresos viven en `other_incomes` con su tipo. Sin
    // esto, el dashboard re-infiere por descripcion y un pago de $100 o de
    // $125 (que no son multiplos de 15) cae en "sin clasificar" aunque sea
    // cuota. Si algun dia la tabla gana `income_type_id`, ese valor manda.
    incomeTypeId: row.income_type_id || INCOME_TYPE_IDS.CUOTA_AREA_SOCIAL,
    status: row.status ?? 'verified',
    createdAt: toDate(row.created_at ?? row.received_at),
    // El controller de transactions-detail lee metadata.bankReference y
    // metadata.receiptURL para poblar los campos de edición del pago.
    metadata: {
      bankReference: row.reference ?? null,
      receiptURL
    }
  };
}

function mapExpense(row) {
  return {
    id: row.id,
    type: 'EXPENSE',
    period: row.period,
    propertyId: '',
    effectiveDate: toDate(row.paid_at),
    amount: -Math.abs(cents(row.amount_cents)),
    pendingAmount: 0,
    paidBy: [],
    appliedTo: [],
    description: row.note || row.description || 'Gasto',
    voucherNumber: row.number ?? row.reference ?? '',
    reference: row.reference ?? null,
    paymentMethod: row.method ?? '',
    expenseAccountId: row.expense_account_id ?? '',
    status: row.status === 'issued' ? 'active' : 'void',
    createdAt: toDate(row.created_at ?? row.paid_at)
  };
}

function mapOtherIncome(row) {
  return {
    id: row.id,
    type: 'OTHER_INCOME',
    period: row.period,
    propertyId: '',
    effectiveDate: toDate(row.received_at),
    amount: Math.abs(cents(row.amount_cents)),
    pendingAmount: 0,
    paidBy: [],
    appliedTo: [],
    description: row.description || row.note || 'Otro ingreso',
    voucherNumber: row.reference ?? '',
    reference: row.reference ?? null,
    // El tipo se guarda en `other_incomes.income_type_id` y el ledger lo
    // transporta. Si falta (filas anteriores a la migracion 0034), se deja
    // sin definir y `resolveIncomeTypeId` infiere por descripcion.
    incomeTypeId: row.income_type_id || undefined,
    status: row.status === 'issued' ? 'active' : 'void',
    createdAt: toDate(row.created_at ?? row.received_at)
  };
}

function mapCreditNote(row) {
  return {
    id: row.id,
    type: 'CREDIT_NOTE',
    period: row.period,
    propertyId: row.unit_id ?? '',
    effectiveDate: toDate(row.issued_at),
    amount: Math.abs(cents(row.amount_cents)),
    pendingAmount: 0,
    paidBy: [],
    appliedTo: [],
    description: row.reason || row.description || 'Nota de crédito',
    voucherNumber: row.number ?? '',
    status: row.status === 'issued' ? 'active' : 'void',
    createdAt: toDate(row.created_at ?? row.issued_at)
  };
}

/**
 * Normaliza la fila delgada de la vista `ledger` a la forma "completa" que
 * esperan los mapeadores.
 *
 * `/movements?kind=all` devuelve solo 9 columnas (`occurred_at`, `description`,
 * `number`, `amount_cents`...), mientras que las rutas por tipo (`kind=charge`,
 * `/movements/:id`, `/units/:id/ledger`) devuelven la fila entera de su tabla
 * (`issued_at`, `received_at`, `paid_at`, `created_at`, `note`, `paid_cents`).
 *
 * Sin esta normalización `toDate(undefined)` caía en epoch 0: todas las filas
 * quedaban fechadas en 1970 y el filtro por rango del módulo de transacciones
 * las descartaba todas (el módulo se veía vacío con cualquier preset).
 *
 * Solo rellena huecos: nunca pisa una columna que ya venga.
 */
function normalizeLedgerRow(row) {
  const at = row.occurred_at;
  if (at == null) return row;
  return {
    ...row,
    issued_at: row.issued_at ?? at,
    received_at: row.received_at ?? at,
    paid_at: row.paid_at ?? at,
    created_at: row.created_at ?? at,
    note: row.note ?? row.description ?? null
  };
}

function mapMovement(row, kind = null, unitIdFallback = null) {
  const entryKind = kind && kind !== 'all' ? kind : row.entry_kind ?? KIND_TO_TYPE[row.kind];
  const r = normalizeLedgerRow(row);
  switch (entryKind) {
    case 'charge':
      return mapCharge(r, new Map(), unitIdFallback);
    case 'payment':
      return mapPayment(r, new Map());
    case 'expense':
      return mapExpense(r);
    case 'other_income':
      return mapOtherIncome(r);
    case 'credit_note':
      return mapCreditNote(r);
    default:
      return r;
  }
}

const byDateDesc = (list) =>
  list.sort(
    (a, b) =>
      (b.effectiveDate?.getTime?.() || 0) - (a.effectiveDate?.getTime?.() || 0) ||
      (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
  );

/** Estado de cuenta completo de una unidad (legacy: getByPropertyId). */
export async function d1UnitTransactions(unitId) {
  const j = await apiGet(`units/${encodeURIComponent(unitId)}/ledger`);
  const byCharge = new Map(j.allocations.map((a) => [a.charge_id, []]));
  const byPayment = new Map(j.allocations.map((a) => [a.payment_id, []]));
  for (const a of j.allocations) {
    byCharge.get(a.charge_id)?.push(a);
    byPayment.get(a.payment_id)?.push(a);
  }
  const list = [
    ...j.charges.map((r) => mapCharge(r, byCharge, unitId)),
    ...j.payments.map((r) => mapPayment(r, byPayment)),
    ...j.creditNotes.map((r) => mapCreditNote(r))
  ];
  return byDateDesc(list);
}

/** Cargos pendientes de una unidad (legacy: getPendingDebts). */
export async function d1PendingDebts(unitId, { includeIds = [] } = {}) {
  const j = await apiGet(`units/${encodeURIComponent(unitId)}/ledger`);
  const byCharge = new Map(j.allocations.map((a) => [a.charge_id, []]));
  for (const a of j.allocations) byCharge.get(a.charge_id)?.push(a);
  return j.charges
    .filter((c) => includeIds.includes(c.id) || c.amount_cents - (c.paid_cents ?? 0) - (c.credited_cents ?? 0) > 0)
    .map((c) => mapCharge(c, byCharge, unitId))
    .sort((a, b) => (a.effectiveDate?.getTime?.() || 0) - (b.effectiveDate?.getTime?.() || 0));
}

/**
 * Conciliación de un pago: cargos pendientes de su unidad (incluidos los que
 * este pago ya cubre, aunque estén saldados) y el `appliedTo` real del pago.
 *
 * El listado de transacciones (`/movements?kind=all`) no trae asignaciones, así
 * que `tx.appliedTo` llega vacío. Este fetch único del ledger devuelve ambos
 * lados para que el panel de conciliación marque lo ya seleccionado.
 */
export async function d1PaymentReconciliation(unitId, paymentId) {
  // Cache-buster: el panel debe ver el estado real tras cada guardado, no una
  // respuesta cacheada por el navegador.
  const j = await apiGet(`units/${encodeURIComponent(unitId)}/ledger?fresh=${Date.now()}`);
  const byCharge = new Map(j.allocations.map((a) => [a.charge_id, []]));
  for (const a of j.allocations) byCharge.get(a.charge_id)?.push(a);

  const appliedTo = (j.allocations ?? [])
    .filter((a) => a.payment_id === paymentId)
    .map((a) => ({ transactionId: a.charge_id, amount: cents(a.amount_cents) }));
  const linkedIds = new Set(appliedTo.map((a) => a.transactionId));

  const debts = j.charges
    .filter((c) => linkedIds.has(c.id) || c.amount_cents - (c.paid_cents ?? 0) - (c.credited_cents ?? 0) > 0)
    .map((c) => mapCharge(c, byCharge, unitId))
    .sort((a, b) => (a.effectiveDate?.getTime?.() || 0) - (b.effectiveDate?.getTime?.() || 0));

  // nº de recibo por pago, para las píldoras de "quién más paga esta factura".
  const voucherByPayment = {};
  for (const p of j.payments ?? []) {
    voucherByPayment[p.id] = p.number ?? p.reference ?? null;
  }

  return { debts, appliedTo, voucherByPayment };
}

/** Movimientos planos (legacy: getByPeriod(s), getAll, getByType, getByDateRange...). */
export async function d1Movements({ kind = 'all', period = null, unitId = null, status = null, from = null, to = null, limit = 100, cursor = null } = {}) {
  const params = new URLSearchParams();
  params.set('kind', kind);
  params.set('limit', String(limit));
  if (period) params.set('period', period);
  if (unitId) params.set('unitId', unitId);
  if (status) params.set('status', status);
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  if (cursor) params.set('cursor', String(cursor));
  const j = await apiGet(`movements?${params.toString()}`);
  return {
    movements: j.movements.map((m) => mapMovement(m, kind)),
    nextCursor: j.nextCursor
  };
}

/** Un movimiento por id (legacy: getById). */
export async function d1GetMovement(id) {
  const j = await apiGet(`movements/${encodeURIComponent(id)}`);
  return mapMovement(j.movement);
}

/**
 * Asignaciones pago↔cargo de los movimientos de la página visible.
 * El listado (`/movements`) usa la vista delgada y no las trae; este endpoint
 * ligero devuelve también los folios para pintar los chips sin más lecturas.
 */
export async function d1MovementLinks(ids) {
  const list = Array.from(new Set((ids || []).filter(Boolean))).slice(0, 45);
  if (!list.length) return [];
  const j = await apiGet(`movements/links?ids=${encodeURIComponent(list.join(','))}`);
  return (j.links ?? []).map((r) => ({
    chargeId: r.charge_id,
    paymentId: r.payment_id,
    amount: cents(r.amount_cents),
    chargeNumber: r.charge_number ?? null,
    paymentNumber: r.payment_number ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Catálogos                                                           */
/* ------------------------------------------------------------------ */

export async function d1ChargeConcepts() {
  const { chargeConcepts } = await apiGet('charge-concepts');
  return chargeConcepts.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    description: r.description,
    descriptionLong: r.description_long,
    descriptionShort: r.description_short,
    icon: r.icon,
    defaultAmount: r.default_amount_cents != null ? cents(r.default_amount_cents) : null,
    isRecurring: Boolean(r.is_recurring),
    billingFrequency: r.billing_frequency,
    applicableTo: r.applicable_to,
    isRequestableByResident: Boolean(r.is_requestable_by_resident),
    requiresApproval: Boolean(r.requires_approval),
    active: Boolean(r.active)
  }));
}

export async function d1ExpenseAccounts() {
  const { expenseAccounts } = await apiGet('expense-accounts');
  return expenseAccounts
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      order: r.sort_order ?? 0,
      active: Boolean(r.active)
    }))
    .sort(
      (a, b) =>
        String(a.category ?? '').localeCompare(String(b.category ?? '')) ||
        (a.order || 0) - (b.order || 0) ||
        String(a.name ?? '').localeCompare(String(b.name ?? ''))
    );
}

/* ------------------------------------------------------------------ */
/* Actividades                                                         */
/* ------------------------------------------------------------------ */

function mapActivity(row, audience) {
  // `details` viaja como JSON string desde D1; Firestore lo entregaba objeto.
  // Se normaliza a objeto y se expone `amount` (dólares) desde `amountCents`.
  let details = row.details;
  if (typeof details === 'string') {
    try { details = JSON.parse(details); } catch { details = null; }
  }
  if (details && typeof details === 'object' && details.amountCents != null && details.amount == null) {
    details = { ...details, amount: cents(details.amountCents) };
  }

  return {
    id: row.id,
    type: row.type,
    description: row.description,
    timestamp: toDate(row.created_at),
    visibility: [audience ?? 'admin'],
    initiatorType: row.initiator_type,
    initiatorUid: row.initiator_uid,
    initiatorName: row.initiator_name,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    details,
    __cursor: row.__cursor ?? null
  };
}

/**
 * Feed de actividades (legacy: getRecentActivities).
 * `lastDoc` puede ser un documento devuelto por una carga anterior; el cursor
 * de paginación viaja como propiedad no enumerable para no ensuciar el doc.
 */
export async function d1Activities(count = 15, lastDoc = null, visibilityKey = null, types = null) {
  const params = new URLSearchParams();
  params.set('limit', String(count));
  params.set('audience', visibilityKey || 'admin');
  if (types && types.length) params.set('types', types.join(','));
  const cursor = lastDoc?.__cursor ?? lastDoc?.cursor ?? null;
  if (cursor) params.set('cursor', String(cursor));
  const j = await apiGet(`activities?${params.toString()}`);
  const activities = j.activities.map((r) => mapActivity(r, visibilityKey));
  const nextCursor = j.nextCursor;
  if (activities.length > 0 && nextCursor) {
    const last = activities[activities.length - 1];
    Object.defineProperty(last, '__cursor', { value: nextCursor, enumerable: false, writable: true });
  }
  return { activities, lastVisible: activities[activities.length - 1] ?? null, nextCursor, totalCount: j.count ?? null };
}

/* ------------------------------------------------------------------ */
/* Totales por periodo                                                 */
/* ------------------------------------------------------------------ */

export async function d1Periods() {
  const { periods } = await apiGet('periods');
  return periods.map((r) => ({
    period: r.period,
    charges: cents(r.charges_cents),
    payments: cents(r.payments_cents),
    credited: cents(r.credited_cents),
    expenses: cents(r.expenses_cents),
    otherIncome: cents(r.other_income_cents),
    updatedAt: toDate(r.updated_at)
  }));
}

/* ------------------------------------------------------------------ */
/* Escrituras (Ola 2)                                                  */
/* ------------------------------------------------------------------ */

export async function d1CreateCharge(data) {
  return apiSend('POST', 'charges', {
    unitId: data.propertyId,
    conceptId: data.concept,
    amountCents: Math.abs(toCents(data.amount)),
    note: data.description || data.note || null,
    effectiveDate: (data.effectiveDate?.getTime?.() ?? data.effectiveDate) || Date.now(),
    dueDate: data.dueDate ? (data.dueDate?.getTime?.() ?? data.dueDate) : null
  });
}

export async function d1CreatePayment(data) {
  const unitId = !data.propertyId || data.propertyId === '__UNIDENTIFIED__' ? null : data.propertyId;
  return apiSend('POST', 'payments', {
    unitId,
    amountCents: toCents(data.amount),
    method: data.paymentMethod || data.method || null,
    reference: data.reference || null,
    note: data.description || data.note || null,
    idempotencyKey: data.idempotencyKey || null,
    receivedAt: (data.effectiveDate?.getTime?.() ?? data.effectiveDate) || Date.now(),
    attachments: data.attachments || null,
  });
}

export async function d1CreateExpense(data) {
  return apiSend('POST', 'expenses', {
    expenseAccountId: data.expenseAccountId,
    amountCents: Math.abs(toCents(data.amount)),
    method: data.paymentMethod || data.method || null,
    reference: data.reference || null,
    number: data.voucherNumber || null,
    vendor: data.vendor || null,
    note: data.description || data.note || null,
    paidAt: (data.effectiveDate?.getTime?.() ?? data.effectiveDate) || Date.now(),
    attachments: data.attachments || null,
  });
}

export async function d1CreateOtherIncome(data) {
  return apiSend('POST', 'other-incomes', {
    incomeTypeId: data.incomeTypeId || 'otros-ingresos',
    amountCents: toCents(data.amount),
    description: data.description || 'Otro ingreso',
    reference: data.reference || null,
    receivedAt: (data.effectiveDate?.getTime?.() ?? data.effectiveDate) || Date.now()
  });
}

export async function d1CreateCreditNote(data) {
  return apiSend('POST', 'credit-notes', {
    unitId: data.propertyId,
    amountCents: toCents(data.amount),
    reason: data.description || data.reason || null,
    effectiveDate: (data.effectiveDate?.getTime?.() ?? data.effectiveDate) || Date.now(),
    links: (data.appliedTo || []).map((l) => ({ chargeId: l.transactionId, amountCents: toCents(l.amount) }))
  });
}

export async function d1ApplyPayment(paymentId, links) {
  return apiSend('POST', `payments/${encodeURIComponent(paymentId)}/apply`, {
    links: links.map((l) => ({ chargeId: l.transactionId ?? l.chargeId, amountCents: toCents(l.amount) }))
  });
}

export async function d1VoidMovement(id) {
  return apiSend('POST', `movements/${encodeURIComponent(id)}/void`, null);
}

export async function d1UpdateMovement(id, data) {
  return apiSend('PATCH', `movements/${encodeURIComponent(id)}`, {
    amountCents: data.amount !== undefined ? Math.abs(toCents(data.amount)) : undefined,
    effectiveDate: data.effectiveDate ? (data.effectiveDate?.getTime?.() ?? data.effectiveDate) : undefined,
    note: data.description !== undefined ? data.description : (data.note !== undefined ? data.note : undefined),
    method: data.paymentMethod !== undefined ? data.paymentMethod : (data.method !== undefined ? data.method : undefined),
    reference: data.reference !== undefined ? data.reference : undefined,
    number: data.voucherNumber !== undefined ? data.voucherNumber : undefined,
    conceptId: data.concept !== undefined ? data.concept : undefined,
    expenseAccountId: data.expenseAccountId !== undefined ? data.expenseAccountId : undefined,
    attachments: data.attachments || null,
    receiptKey: data.receiptKey || null,
  });
}

export async function d1CreateChargeConcept(data) {
  return apiSend('POST', 'charge-concepts', {
    name: data.name,
    slug: data.slug,
    type: data.type,
    description: data.description,
    icon: data.icon,
    defaultAmountCents: data.defaultAmount != null ? toCents(data.defaultAmount) : undefined,
    isRecurring: data.isRecurring,
    billingFrequency: data.billingFrequency,
    isRequestableByResident: data.isRequestableByResident,
    requiresApproval: data.requiresApproval
  });
}
export async function d1UpdateChargeConcept(id, data) {
  return apiSend('PATCH', `charge-concepts/${encodeURIComponent(id)}`, {
    name: data.name,
    description: data.description,
    icon: data.icon,
    defaultAmountCents: data.defaultAmount != null ? toCents(data.defaultAmount) : undefined,
    isRecurring: data.isRecurring,
    billingFrequency: data.billingFrequency,
    isRequestableByResident: data.isRequestableByResident,
    requiresApproval: data.requiresApproval
  });
}
export async function d1DeactivateChargeConcept(id) {
  return apiSend('POST', `charge-concepts/${encodeURIComponent(id)}/deactivate`, null);
}

export async function d1CreateExpenseAccount(data) {
  return apiSend('POST', 'expense-accounts', { name: data.name, category: data.category, sortOrder: data.order ?? data.sortOrder });
}
export async function d1UpdateExpenseAccount(id, data) {
  return apiSend('PATCH', `expense-accounts/${encodeURIComponent(id)}`, { name: data.name, category: data.category, sortOrder: data.order ?? data.sortOrder });
}
export async function d1DeactivateExpenseAccount(id) {
  return apiSend('POST', `expense-accounts/${encodeURIComponent(id)}/deactivate`, null);
}

/* Notificaciones de pago */
export async function d1CreatePaymentNotification(data) {
  return apiSend('POST', 'payment-notifications', {
    unitId: data.propertyId,
    residentUid: data.residentUid,
    amountCents: toCents(data.amount),
    paymentDate: (data.paymentDate?.getTime?.() ?? data.paymentDate) || undefined,
    method: data.paymentMethod || null,
    notes: data.notes || null,
    appliedTo: (data.appliedTo || []).map((l) => ({ chargeId: l.transactionId, amountCents: toCents(l.amount), description: l.description })),
    attachments: data.attachments || null,
  });
}
export async function d1PaymentNotifications({ status = null, residentUid = null } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (residentUid) params.set('residentUid', residentUid);
  const j = await apiGet(`payment-notifications?${params.toString()}`);
  const byId = new Map();
  for (const n of j.notifications) byId.set(n.id, { id: n.id, ...mapNotification(n), appliedTo: [] });
  for (const a of j.allocations) {
    const n = byId.get(a.notification_id);
    if (n) n.appliedTo.push({ transactionId: a.charge_id, amount: cents(a.amount_cents), description: a.description || '' });
  }
  // Comprobante: el r2_key del attachment (incluye el slug del condominio).
  for (const att of j.attachments ?? []) {
    const n = byId.get(att.notification_id);
    if (n && att.r2_key) n.receiptUrl = `${R2_BASE_URL}/${att.r2_key}`;
  }
  return [...byId.values()];
}
function mapNotification(n) {
  return {
    propertyId: n.unit_id,
    amount: cents(n.amount_cents),
    residentUid: n.resident_uid,
    status: n.status,
    notes: n.notes,
    paymentMethod: n.method,
    paymentDate: toDate(n.payment_date),
    reportDate: toDate(n.report_date ?? n.created_at),
    reviewedBy: n.processed_by,
    paymentTransactionId: n.payment_id,
    voucherNumber: null
  };
}
export async function d1ApprovePaymentNotification(id, admin) {
  return apiSend('POST', `payment-notifications/${encodeURIComponent(id)}/approve`, { adminUid: admin?.uid, adminName: admin?.name });
}
export async function d1RejectPaymentNotification(id, reason, admin) {
  return apiSend('POST', `payment-notifications/${encodeURIComponent(id)}/reject`, { reason, adminUid: admin?.uid, adminName: admin?.name });
}

/* Solicitudes de servicio */
export async function d1CreateServiceRequest(data) {
  return apiSend('POST', 'service-requests', {
    unitId: data.propertyId,
    chargeConceptId: data.chargeConceptId,
    conceptName: data.conceptName || data.description,
    residentUid: data.residentUid,
    residentName: data.residentName,
    residentNotes: data.residentNotes || data.description,
    requestDate: (data.requestDate?.getTime?.() ?? data.requestDate) || undefined
  });
}
export async function d1ServiceRequests({ status = null } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const j = await apiGet(`service-requests?${params.toString()}`);
  return j.requests.map((r) => ({
    id: r.id,
    propertyId: r.unit_id,
    chargeConceptId: r.charge_concept_id,
    conceptName: r.concept_name,
    residentUid: r.resident_uid,
    residentName: r.resident_name,
    status: r.status,
    residentNotes: r.resident_notes,
    adminNotes: r.admin_notes,
    finalAmount: cents(r.final_amount_cents),
    chargeId: r.charge_id,
    requestDate: toDate(r.request_date ?? r.created_at)
  }));
}
export async function d1ApproveServiceRequest(id, data) {
  return apiSend('POST', `service-requests/${encodeURIComponent(id)}/approve`, { finalAmountCents: toCents(data.finalAmount), adminNotes: data.adminNotes });
}
export async function d1RejectServiceRequest(id, reason) {
  return apiSend('POST', `service-requests/${encodeURIComponent(id)}/reject`, { reason });
}

/* Solicitudes de membresía */
export async function d1CreateMembershipRequests(requests) {
  return apiSend('POST', 'membership-requests', { requests });
}
export async function d1MembershipRequests({ status = null } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const j = await apiGet(`membership-requests?${params.toString()}`);
  return j.requests.map((r) => ({
    id: r.id,
    userId: r.uid,
    requestedPropertyId: r.unit_id,
    requestedUnitName: r.requested_unit_name,
    userName: r.user_name,
    userEmail: r.user_email,
    relationship: r.relationship,
    status: r.status,
    visibleToUser: Boolean(r.visible_to_user),
    createdAt: toDate(r.created_at)
  }));
}
export async function d1ProcessMembershipRequest(id, status) {
  return apiSend('POST', `membership-requests/${encodeURIComponent(id)}/process`, { status });
}

/* Actividad directa */
export async function d1CreateActivity(data) {
  return apiSend('POST', 'activities', {
    type: data.type,
    description: data.description,
    initiatorType: data.initiator?.type || data.initiatorType || 'SYSTEM',
    initiatorUid: data.initiator?.id || data.initiatorUid || null,
    initiatorName: data.initiator?.name || data.initiatorName || null,
    targetType: data.target?.type || data.targetType || null,
    targetId: data.target?.id || data.targetId || null,
    targetName: data.target?.name || data.targetName || null,
    audiences: data.visibility || data.audiences || ['admin'],
    details: data.details || null
  });
}

/* Admin: carga masiva, recálculo, lotes, vinculación, eventos */
export async function d1ImportUnits(items) {
  return apiSend('POST', 'units/import', {
    items: items.map((u) => ({ id: u.id, name: u.name, street: u.address?.street, fullAddress: u.address?.fullAddress }))
  });
}
export async function d1RebuildProjections() {
  return apiSend('POST', 'projections/rebuild', null);
}
export async function d1BatchCharges(items, { effectiveDate, period, note } = {}) {
  return apiSend('POST', 'charges/batch', {
    items: items.map((i) => ({ unitId: i.unitId, conceptId: i.conceptId, amountCents: toCents(i.amount) })),
    effectiveDate: effectiveDate ? (effectiveDate?.getTime?.() ?? effectiveDate) : undefined,
    period,
    note
  });
}
export async function d1LinkResident(unitId, uid, relationship) {
  return apiSend('POST', 'unit-residents', { unitId, uid, relationship });
}

export async function d1CommunityEvents({ from = null, to = null } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  const j = await apiGet(`community-events?${params.toString()}`);
  return j.events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    allDay: Boolean(e.all_day),
    startDate: toDate(e.start_at),
    endDate: e.end_at ? toDate(e.end_at) : null,
    startIso: e.start_iso,
    endIso: e.end_iso,
    createdBy: e.created_by,
    createdByName: e.created_by_name
  }));
}
export async function d1CreateCommunityEvent(data, initiator) {
  return apiSend('POST', 'community-events', {
    title: data.title,
    description: data.description,
    type: data.type,
    allDay: data.allDay,
    startAt: data.start ? (data.start?.epochMilliseconds ?? data.start?.getTime?.() ?? data.start) : undefined,
    endAt: data.end ? (data.end?.epochMilliseconds ?? data.end?.getTime?.() ?? data.end) : undefined,
    startIso: data.start ? String(data.start) : undefined,
    endIso: data.end ? String(data.end) : undefined,
    createdBy: initiator?.id,
    createdByName: initiator?.name
  });
}
export async function d1UpdateCommunityEvent(id, data) {
  return apiSend('PATCH', `community-events/${encodeURIComponent(id)}`, {
    title: data.title,
    description: data.description,
    type: data.type,
    allDay: data.allDay,
    startAt: data.start ? (data.start?.epochMilliseconds ?? data.start?.getTime?.() ?? data.start) : undefined,
    endAt: data.end ? (data.end?.epochMilliseconds ?? data.end?.getTime?.() ?? data.end) : undefined,
    startIso: data.start ? String(data.start) : undefined,
    endIso: data.end ? String(data.end) : undefined
  });
}
export async function d1DeleteCommunityEvent(id) {
  return apiSend('DELETE', `community-events/${encodeURIComponent(id)}`, null);
}

/* Configuración del condominio */
// condominium_settings (plano) <-> appConfig (anidado). El controller espera la
// forma anidada (branding/systemDefaults/moduleRegistry); D1 la guarda plana.
// Cuando module_registry es NULL en D1, no se incluye en el objeto devuelto para
// que la fusión en auth.js ({ ...default, ...cloud }) preserve el moduleRegistry
// del default local (paymentMethods, apexCharts, capabilities, etc.).
function settingsToAppConfig(s) {
  const obj = {
    branding: {
      appName: s.display_name ?? '',
      logoUrl: s.logo_url ?? null,
      colors: { primary: s.primary_color ?? '', accent: s.accent_color ?? '' }
    },
    systemDefaults: {
      language: s.language ?? 'es',
      currency: s.currency ?? 'USD',
      theme: s.theme ?? 'light',
      maintenanceMode: Boolean(s.maintenance_mode),
      timezone: s.timezone ?? 'America/Panama'
    },
    receipts: {
      adminSignatureUrl: s.admin_signature_url ?? '',
      adminSignatureUid: s.admin_signature_uid ?? '',
      adminSignatureEmail: s.admin_signature_email ?? ''
    },
    adminSignatureUid: s.admin_signature_uid ?? '',
    adminSignatureEmail: s.admin_signature_email ?? ''
  };
  // Solo incluir moduleRegistry si D1 tiene datos reales. Un objeto vacío o null
  // sobrescribiría el default local en la fusión de auth.js.
  if (s.module_registry && typeof s.module_registry === 'object' && Object.keys(s.module_registry).length > 0) {
    obj.moduleRegistry = s.module_registry;
  }
  return obj;
}

function appConfigToSettings(c) {
  return {
    displayName: c?.branding?.appName,
    logoUrl: c?.branding?.logoUrl,
    primaryColor: c?.branding?.colors?.primary,
    accentColor: c?.branding?.colors?.accent,
    language: c?.systemDefaults?.language,
    currency: c?.systemDefaults?.currency,
    theme: c?.systemDefaults?.theme,
    maintenanceMode: c?.systemDefaults?.maintenanceMode,
    timezone: c?.systemDefaults?.timezone,
    adminSignatureUrl: c?.receipts?.adminSignatureUrl ?? c?.adminSignatureUrl,
    adminSignatureUid: c?.adminSignatureUid ?? c?.receipts?.adminSignatureUid,
    adminSignatureEmail: c?.adminSignatureEmail ?? c?.receipts?.adminSignatureEmail,
    moduleRegistry: c?.moduleRegistry
  };
}

export async function d1GetSettings() {
  const j = await apiGet('settings');
  return j.settings ? settingsToAppConfig(j.settings) : null;
}
export async function d1UpdateSettings(config) {
  return apiSend('PATCH', 'settings', appConfigToSettings(config));
}

/* Contadores de folios */
export async function d1GetVoucherCounter(name) {
  const j = await apiGet(`voucher-counters/${encodeURIComponent(name)}`);
  return j.lastValue ?? 0;
}
export async function d1SetVoucherCounter(name, next) {
  return apiSend('POST', `voucher-counters/${encodeURIComponent(name)}/set`, { next });
}

/* Sesión de usuario (identidad/permisos), leída de D1 */
export async function d1GetUserSession(user) {
  const res = await fetch(`${apiRoot()}/users/session`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoUrl: user.photoURL || null,
      provider: user.providerData?.[0]?.providerId || null
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `D1 ${res.status}`);
  return j.profile;
}

/* Identidad de usuario (modelo User) */
export async function d1GetUserProfile(uid) {
  const j = await apiGetRoot(`users/${encodeURIComponent(uid)}`);
  return j.user ?? null;
}
export async function d1ListUsers() {
  const j = await apiGetRoot('users');
  return j.users ?? [];
}
export async function d1UpdateUserProfile(uid, data) {
  return apiSendRoot('PATCH', `users/${encodeURIComponent(uid)}`, {
    displayName: data.displayName,
    photoUrl: data.photoUrl,
    phone: data.phone ?? data.mobile ?? data.phoneNumber
  });
}
export async function d1UpdateUserRole(uid, role) {
  return apiSendRoot('PATCH', `users/${encodeURIComponent(uid)}/role`, { role });
}

/* Conteos pendientes para el badge del navigator (polling, sin onSnapshot) */
export async function d1PendingCounts() {
  const [m, s, p] = await Promise.all([
    apiGet('membership-requests?status=pending'),
    apiGet('service-requests?status=pending_approval'),
    apiGet('payment-notifications?status=pending_verification')
  ]);
  return {
    memberships: m.requests?.length ?? 0,
    services: s.requests?.length ?? 0,
    payments: p.notifications?.length ?? 0
  };
}
