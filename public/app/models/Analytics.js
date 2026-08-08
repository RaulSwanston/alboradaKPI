import { db, collection, getDocs, query, where } from "../core/firebase.js";

const MONTH_LABELS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Normaliza cualquier representación de fecha (Timestamp de Firestore, Date, string) a Date.
 */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

/**
 * Devuelve la clave de periodo "YYYY-MM" de una fecha.
 */
function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Etiqueta corta de periodo, ej. "2026-03" -> "Mar 26".
 */
function monthLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTH_LABELS_ES[m - 1]} ${String(y).slice(2)}`;
}

/**
 * Secuencia de periodos "YYYY-MM" de los últimos N meses (incluye meses sin datos).
 */
function monthSequence(months) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

/**
 * Palabras clave para inferir el método de pago cuando el campo paymentMethod
 * no existe (los pagos históricos no lo tienen; las descripciones sí lo indican).
 */
function inferPaymentMethod(transaction) {
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
 * Categoriza una descripción de gasto (EXPENSE) en categorías legibles.
 * Las descripciones actuales son texto libre, por lo que se usa matching por palabras clave.
 */
function categorizeExpense(description) {
  const d = (description || '').toUpperCase();
  const has = (...words) => words.some(w => d.includes(w));
  if (has('INST', 'MEDIDOR', 'TUBO', 'GARITA', 'BAÑO', 'PINTUR', 'REPARA', 'ARREGLO', 'MATERIAL',
            'LAMPARA', 'FOCO', 'BOMBA', 'PLOMER', 'GRIFFE', 'CERRA', 'HERRAMIENTA', 'FILTRO', 'CLORO')) return 'Mantenimiento';
  if (has('AGUA', 'LUZ', 'ELECTRIC', 'ENE.', 'CABLE', 'INTERNET', 'TELEFON', 'FACTURA')) return 'Servicios';
  if (has('SEGURIDAD', 'VIGIL', 'ALARMA', 'CAMARA')) return 'Seguridad';
  if (has('ABOGADO', 'NOTARIA', 'IMPUESTO', 'TASA', 'MULTA', 'REGISTRO')) return 'Administrativos';
  if (has('SUPERMERCADO', 'COMPRA', 'FERRETERIA', 'SUMINISTRO')) return 'Suministros';
  return 'Otros';
}

/**
 * Normaliza una descripción de cargo (FEE) para agrupar por concepto,
 * eliminando la referencia temporal (mes/año) de la descripción.
 */
function normalizeConcept(description) {
  return (description || 'SIN CONCEPTO')
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|sept|octubre|noviembre|diciembre)\b/gi, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'SIN CONCEPTO';
}

/**
 * Analytics
 * Capa de datos agregados para los gráficos del módulo apexCharts.
 * Cada instancia memoiza las lecturas a Firestore: una única consulta por
 * colección por render, y todos los gráficos se computan en memoria.
 */
export default class Analytics {
  constructor(contexto = {}) {
    this.contexto = contexto;
    this._cache = {};
  }

  /**
   * Cache simple de promesas: lee cada colección una sola vez por instancia.
   */
  _data(key, loader) {
    if (!this._cache[key]) this._cache[key] = loader();
    return this._cache[key];
  }

  async _collectionDocs(name) {
    const snap = await getDocs(collection(db, name));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list;
  }

  _properties() {
    return this._data('properties', () => this._collectionDocs('properties'));
  }

  _transactions() {
    return this._data('transactions', async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 12, 1);
      start.setHours(0, 0, 0, 0);
      const q = query(collection(db, "transactions"), where("effectiveDate", ">=", start));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      return list;
    });
  }

  _paymentNotifications() { return this._data('paymentNotifications', () => this._collectionDocs('paymentNotifications')); }
  _serviceRequests() { return this._data('serviceRequests', () => this._collectionDocs('serviceRequests')); }
  _communityEvents() { return this._data('communityEvents', () => this._collectionDocs('communityEvents')); }
  _chargeConcepts() { return this._data('chargeConcepts', () => this._collectionDocs('chargeConcepts')); }

  /**
   * Filtra transacciones a los últimos `months` meses.
   */
  _window(transactions, months) {
    const start = new Date();
    start.setMonth(start.getMonth() - months, 1);
    start.setHours(0, 0, 0, 0);
    return transactions.filter(t => {
      const d = toDate(t.effectiveDate);
      return d && d >= start;
    });
  }

  _round(v) { return Math.round(v * 100) / 100; }

  _unitLabel(prop) { return prop.name || `Unidad ${prop.id}`; }

  // ---------------------------------------------------------------------------
  // ADMINISTRACIÓN
  // ---------------------------------------------------------------------------

  /**
   * Flujo de caja mensual: Ingresos (pagos recibidos) vs Gastos (egresos).
   */
  async getCashFlow({ months = 6 } = {}) {
    const tx = this._window(await this._transactions(), months);
    const periods = monthSequence(months);
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
        { name: 'Ingresos', data: ingresos.map(v => this._round(v)) },
        { name: 'Gastos', data: gastos.map(v => this._round(v)) }
      ]
    };
  }

  /**
   * Recaudación vs Facturación por mes: lo facturado (cargos FEE) vs lo cobrado (pagos).
   */
  async getCollectionRate({ months = 6 } = {}) {
    const tx = this._window(await this._transactions(), months);
    const periods = monthSequence(months);
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
        { name: 'Facturado', data: facturado.map(v => this._round(v)) },
        { name: 'Cobrado', data: cobrado.map(v => this._round(v)) }
      ]
    };
  }

  /**
   * Salud de la comunidad: unidades al día vs unidades en mora.
   */
  async getUnitsHealth() {
    const props = await this._properties();
    let alDia = 0, mora = 0;
    for (const p of props) {
      const b = p.balance || 0;
      if (b >= -0.01) alDia++;
      else mora++;
    }
    return { categories: ['Al día', 'En mora'], series: [alDia, mora] };
  }

  /**
   * Top deudores: unidades con mayor saldo pendiente.
   */
  async getTopDebtors({ top = 6 } = {}) {
    const props = (await this._properties())
      .filter(p => (p.balance || 0) < -0.01)
      .sort((a, b) => (a.balance || 0) - (b.balance || 0))
      .slice(0, top);
    return {
      categories: props.map(p => this._unitLabel(p)),
      series: [{ name: 'Deuda', data: props.map(p => this._round(Math.abs(p.balance))) }]
    };
  }

  /**
   * Saldos a favor: unidades con saldo positivo.
   */
  async getOverpayments({ top = 6 } = {}) {
    const props = (await this._properties())
      .filter(p => (p.balance || 0) > 0.01)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, top);
    return {
      categories: props.map(p => this._unitLabel(p)),
      series: [{ name: 'Saldo a favor', data: props.map(p => this._round(p.balance)) }]
    };
  }

  /**
   * Distribución de cobros por método de pago (inferido de la descripción si falta el campo).
   */
  async getPaymentMethodDistribution({ months = 12 } = {}) {
    const tx = this._window(await this._transactions(), months).filter(t => t.type === 'PAYMENT');
    const counts = {};
    for (const t of tx) {
      const method = inferPaymentMethod(t);
      counts[method] = (counts[method] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => v) };
  }

  /**
   * Ingresos por concepto: cargos agrupados por concepto normalizado.
   */
  async getIncomeByConcept({ months = 12 } = {}) {
    const tx = this._window(await this._transactions(), months).filter(t => t.type === 'FEE' || t.type === 'FINE');
    const totals = {};
    for (const t of tx) {
      const concept = normalizeConcept(t.description);
      totals[concept] = (totals[concept] || 0) + Math.abs(t.amount || 0);
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => this._round(v)) };
  }

  /**
   * Gastos por categoría (categorización por palabras clave de la descripción).
   */
  async getExpensesByCategory({ months = 12 } = {}) {
    const tx = this._window(await this._transactions(), months).filter(t => t.type === 'EXPENSE' || t.type === 'ADMIN_EXPENSE');
    const totals = {};
    for (const t of tx) {
      const cat = categorizeExpense(t.description);
      totals[cat] = (totals[cat] || 0) + Math.abs(t.amount || 0);
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => this._round(v)) };
  }

  /**
   * Estados de los reportes de pago.
   */
  async getPaymentReportStatus() {
    const pn = await this._paymentNotifications();
    const counts = {};
    for (const r of pn) counts[r.status || 'unknown'] = (counts[r.status || 'unknown'] || 0) + 1;
    const entries = Object.entries(counts);
    return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => v) };
  }

  /**
   * Estados de las solicitudes de servicio.
   */
  async getServiceRequestStatus() {
    const sr = await this._serviceRequests();
    const counts = {};
    for (const r of sr) counts[r.status || 'unknown'] = (counts[r.status || 'unknown'] || 0) + 1;
    const entries = Object.entries(counts);
    return { categories: entries.map(([k]) => k), series: entries.map(([, v]) => v) };
  }

  // ---------------------------------------------------------------------------
  // COMUNIDAD (residentes)
  // ---------------------------------------------------------------------------

  /**
   * Estado de cuenta de la unidad activa del residente.
   */
  async getMyBalance({ propertyId } = {}) {
    const id = propertyId || this.contexto.data?.activePropertyId;
    if (!id) return { categories: [], series: [] };
    const props = await this._properties();
    const prop = props.find(p => p.id === id);
    if (!prop) return { categories: [], series: [] };
    const balance = prop.balance || 0;
    const deuda = Math.max(-balance, 0);
    const favor = Math.max(balance, 0);
    const categories = ['Deuda', 'Saldo a favor'];
    const series = [this._round(deuda), this._round(favor)];
    if (deuda === 0 && favor === 0) {
      categories.unshift('Al día');
      series.unshift(1);
    }
    return { categories, series };
  }

  /**
   * % de unidades al día: indicador global de salud financiera (solo agregado).
   */
  async getCommunityHealth() {
    const props = await this._properties();
    const total = props.length || 1;
    let alDia = 0;
    for (const p of props) if ((p.balance || 0) >= -0.01) alDia++;
    return { categories: [''], series: [this._round((alDia / total) * 100)] };
  }

  /**
   * ¿En qué se invierte la comunidad? (agregado público de gastos por categoría).
   */
  async getCommunityExpenses({ months = 12 } = {}) {
    return this.getExpensesByCategory({ months });
  }

  /**
   * Servicios más solicitados (por concepto).
   */
  async getTopServices({ top = 6 } = {}) {
    const [sr, concepts] = await Promise.all([this._serviceRequests(), this._chargeConcepts()]);
    const conceptName = {};
    for (const c of concepts) conceptName[c.id] = c.name;
    const counts = {};
    for (const r of sr) {
      const name = conceptName[r.chargeConceptId] || r.chargeConceptId || 'Sin concepto';
      counts[name] = (counts[name] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, top);
    return { categories: entries.map(([k]) => k), series: [{ name: 'Solicitudes', data: entries.map(([, v]) => v) }] };
  }

  /**
   * Eventos comunitarios por mes.
   */
  async getEventsByMonth({ months = 6 } = {}) {
    const events = await this._communityEvents();
    const periods = monthSequence(months);
    const counts = new Array(periods.length).fill(0);
    for (const e of events) {
      const d = toDate(e.start || e.date || e.timestamp);
      if (!d) continue;
      const key = monthKey(d);
      const i = periods.indexOf(key);
      if (i !== -1) counts[i]++;
    }
    return { categories: periods.map(monthLabel), series: [{ name: 'Eventos', data: counts }] };
  }
}
