/**
 * Analytics — lector de los agregados que ya están en `appConfig.stats.charts`.
 *
 * IMPORTANTE: este modelo NO consulta Firestore.
 *
 * Antes leía `transactions`, `properties`, `paymentNotifications`,
 * `serviceRequests`, `communityEvents`, `chargeConcepts` y `expenseAccounts`
 * en cada render del dashboard: ~6.500 lecturas por visita, el 13 % de la
 * cuota diaria gratuita. Ocho visitas dejaban la app caída para los residentes.
 *
 * Ahora el cálculo lo hace `Property.recalculateAllBalances()` (el botón
 * "Sincronizar") usando los datos que ya tiene en memoria, y lo publica en
 * `appConfig/app`. El middleware `sessionGuard` carga ese documento UNA vez por
 * sesión y lo cachea en `localStorage['gph_app_config']`, así que los gráficos
 * se dibujan sin tocar la base.
 *
 * Contrato:
 *   - Cada método devuelve `{ categories, series }` o un dataset vacío.
 *   - Si no hay snapshot, devuelve vacío; el controlador muestra "sin datos".
 *   - Nunca hay fallback a Firestore: un fallback silencioso reintroduciría el
 *     problema de cuota que este diseño elimina.
 *
 * El productor de los datasets es `models/ChartsData.js`, que comparte con este
 * archivo las claves `chartKey()` y `BALANCES_KEY`.
 */

import { chartKey, emptyChartData, BALANCES_KEY } from "./ChartsData.js";

const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

export default class Analytics {
  constructor(contexto = {}) {
    this.contexto = contexto;
  }

  /** Snapshot publicado por el último "Sincronizar". Puede no existir. */
  _charts() {
    return this.contexto.data?.appConfig?.stats?.charts || null;
  }

  /** Lee un gráfico por su clave canónica. Devuelve `null` si no existe. */
  _chart(method, params = {}) {
    const charts = this._charts();
    if (!charts) return null;
    return charts[chartKey(method, params)] || null;
  }

  // ---------------------------------------------------------------------------
  // ADMINISTRACIÓN
  // ---------------------------------------------------------------------------

  /** Flujo de caja mensual: ingresos vs gastos. */
  async getCashFlow(params = { months: 6 }) {
    return this._chart('getCashFlow', params) || emptyChartData();
  }

  /** Recaudación vs facturación por mes. */
  async getCollectionRate(params = { months: 6 }) {
    return this._chart('getCollectionRate', params) || emptyChartData();
  }

  /** Unidades al día vs en mora. */
  async getUnitsHealth() {
    return this._chart('getUnitsHealth') || emptyChartData();
  }

  /** Top deudores. */
  async getTopDebtors(params = { top: 6 }) {
    return this._chart('getTopDebtors', params) || emptyChartData();
  }

  /** Saldos a favor. */
  async getOverpayments(params = { top: 6 }) {
    return this._chart('getOverpayments', params) || emptyChartData();
  }

  /** Distribución de cobros por método de pago. */
  async getPaymentMethodDistribution(params = { months: 12 }) {
    return this._chart('getPaymentMethodDistribution', params) || emptyChartData();
  }

  /** Ingresos agrupados por tipo (cuota, rifa, tarjeta...). */
  async getIncomeByType(params = { months: 12 }) {
    return this._chart('getIncomeByType', params) || emptyChartData();
  }

  /** Ingresos por concepto (cargos agrupados). */
  async getIncomeByConcept(params = { months: 12 }) {
    return this._chart('getIncomeByConcept', params) || emptyChartData();
  }

  /** Gastos por categoría de cuenta. */
  async getExpensesByCategory(params = { months: 12 }) {
    return this._chart('getExpensesByCategory', params) || emptyChartData();
  }

  /** Estados de los reportes de pago. */
  async getPaymentReportStatus() {
    return this._chart('getPaymentReportStatus') || emptyChartData();
  }

  /** Estados de las solicitudes de servicio. */
  async getServiceRequestStatus() {
    return this._chart('getServiceRequestStatus') || emptyChartData();
  }

  // ---------------------------------------------------------------------------
  // COMUNIDAD (residentes)
  // ---------------------------------------------------------------------------

  /**
   * Estado de cuenta de la unidad activa del residente.
   *
   * Se arma aquí a partir de `charts.balancesByProperty[id]`; no hay documento
   * que leer. Mismo formato que antes: donut Deuda / Saldo a favor, o "Al día".
   */
  async getMyBalance({ propertyId } = {}) {
    const id = propertyId || this.contexto.data?.activePropertyId;
    if (!id) return emptyChartData();

    const balances = this._charts()?.[BALANCES_KEY];
    if (!balances || balances[id] === undefined) return emptyChartData();

    const balance = Number(balances[id]) || 0;
    const deuda = Math.max(-balance, 0);
    const favor = Math.max(balance, 0);
    const categories = ['Deuda', 'Saldo a favor'];
    const series = [round(deuda), round(favor)];
    if (deuda === 0 && favor === 0) {
      categories.unshift('Al día');
      series.unshift(1);
    }
    return { categories, series };
  }

  /** % de unidades al día (agregado global). */
  async getCommunityHealth() {
    return this._chart('getCommunityHealth') || emptyChartData();
  }

  /** ¿En qué se invierte la comunidad? (agregado de gastos). */
  async getCommunityExpenses(params = { months: 12 }) {
    return this._chart('getCommunityExpenses', params) || emptyChartData();
  }

  /** Servicios más solicitados. */
  async getTopServices(params = { top: 6 }) {
    return this._chart('getTopServices', params) || emptyChartData();
  }

  /** Eventos comunitarios por mes. */
  async getEventsByMonth(params = { months: 6 }) {
    return this._chart('getEventsByMonth', params) || emptyChartData();
  }
}
