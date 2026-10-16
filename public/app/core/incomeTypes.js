/**
 * incomeTypes — catálogo y clasificación de TIPOS DE INGRESO.
 *
 * Por qué existe: `paymentMethod` dice CÓMO pagó el residente; el tipo de ingreso
 * dice PARA QUÉ entró el dinero (cuota, rifa, venta de tarjeta, intereses...).
 * Son ejes distintos y complementarios.
 *
 * Por qué NO se rellena el campo histórico: los 2.789 pagos anteriores nunca
 * tuvieron un campo de tipo de ingreso y solo ~13% tienen una palabra clave útil
 * en la descripción (el 87% es literalmente "YAPPY DE <NOMBRE>"). Escribir un
 * backfill obligaría a adivinar y produciría un gráfico que miente. En su lugar se
 * infiere en tiempo de lectura, exactamente igual que ya hace `inferPaymentMethod`
 * (Analytics.js) para `paymentMethod`, que también está vacío en Firestore.
 *
 * De ahí la precedencia: el campo declarado gana, la inferencia es el respaldo.
 *
 *   const tipo = resolveIncomeTypeId(tx);
 *
 * Lo que no existe (o no encaja en ninguna regla) cae en `null` y la UI lo
 * muestra como "Sin clasificar" — mismo criterio que `expenseAccountId` con los
 * 168 gastos que quedaron sin cuenta. No se inventa una categoría.
 *
 * `aggregateIncomeByType()` (más abajo) es la MISMA función que alimenta la tarjeta
 * de ingresos de `generalExpenses` y la línea base de
 * `scripts/classify_payments_local.js`, así que la pantalla y el test de regresión
 * no pueden divergir.
 */

/**
 * Tarifa mensual de la cuota de mantenimiento de área social.
 *
 * No es una suposición: los 9.666 FEEs del histórico son todos de exactamente
 * -15 y hay 358 unidades en los 27 periodos, y además el catálogo
 * `chargeConcepts` declara `defaultAmount: 15, isRecurring: true,
 * billingFrequency: 'monthly'` para ese concepto. Si algún día sube la cuota,
 * cambia aquí y el script de clasificación avisa si los conteos se mueven.
 */
export const CUOTA_AREA_SOCIAL_AMOUNT = 15;

/**
 * Todo ingreso por debajo de este importe es un interés bancario: los depósitos
 * de la cuenta de Savings rinden centavos. El único pago de cuota más barato
 * observado es de $10, así que el umbral no colisiona con nada.
 */
export const SMALL_INTEREST_MAX_AMOUNT = 3.5;

export const INCOME_TYPE_IDS = {
  CUOTA_AREA_SOCIAL: 'cuota-area-social',
  VENTA_TARJETA_ACCESO: 'venta-tarjeta-acceso',
  RIFA: 'rifa',
  EVENTOS_ACTIVIDADES: 'eventos-actividades',
  INTERESES_BANCARIOS: 'intereses-bancarios',
  DONACIONES: 'donaciones',
  MULTAS_PENALIZACIONES: 'multas-penalizaciones',
  OTROS_INGRESOS: 'otros-ingresos',
};

export const UNCLASSIFIED_LABEL = 'Sin clasificar';

/**
 * Catálogo semilla. Los ids son slugs estables y hacen de id de documento en la
 * colección `incomeTypes`, para que la inferencia y el catálogonever divergan.
 * El esquema replica `expenseAccounts`: { name, description, defaultAmount,
 * active, order }.
 */
export const INCOME_TYPES = [
  {
    id: INCOME_TYPE_IDS.CUOTA_AREA_SOCIAL,
    name: 'Cuota de mantenimiento de área social',
    description: 'Mensualidad que cubre seguridad y mantenimiento del área social. Es el 92% del ingreso.',
    defaultAmount: CUOTA_AREA_SOCIAL_AMOUNT,
    active: true,
    order: 1,
  },
  {
    id: INCOME_TYPE_IDS.EVENTOS_ACTIVIDADES,
    name: 'Eventos y actividades',
    description: 'Boletos de obra de teatro, eventos y entradas a actividades.',
    defaultAmount: null,
    active: true,
    order: 2,
  },
  {
    id: INCOME_TYPE_IDS.RIFA,
    name: 'Rifa',
    description: 'Venta de boletos de rifa (incluye el bingo social del catálogo de conceptos).',
    defaultAmount: null,
    active: true,
    order: 3,
  },
  {
    id: INCOME_TYPE_IDS.VENTA_TARJETA_ACCESO,
    name: 'Venta de tarjeta de acceso',
    description: 'Emisión de tarjetas de acceso vehicular o de ingreso.',
    defaultAmount: null,
    active: true,
    order: 4,
  },
  {
    id: INCOME_TYPE_IDS.INTERESES_BANCARIOS,
    name: 'Intereses bancarios',
    description: 'Rendimientos de la cuenta de ahorro.',
    defaultAmount: null,
    active: true,
    order: 5,
  },
  {
    id: INCOME_TYPE_IDS.DONACIONES,
    name: 'Donaciones',
    description: 'Aportes y donaciones de residentes o terceros.',
    defaultAmount: null,
    active: true,
    order: 6,
  },
  {
    id: INCOME_TYPE_IDS.MULTAS_PENALIZACIONES,
    name: 'Multas y penalizaciones',
    description: 'Sanciones y recargos aplicados a unidades morosas.',
    defaultAmount: null,
    active: true,
    order: 7,
  },
  {
    id: INCOME_TYPE_IDS.OTROS_INGRESOS,
    name: 'Otros ingresos',
    description: 'Ingresos que no encajan en ninguna otra categoría.',
    defaultAmount: null,
    active: true,
    order: 8,
  },
];

const INCOME_TYPE_BY_ID = new Map(INCOME_TYPES.map((t) => [t.id, t]));

/**
 * Reglas en orden de precedencia: gana la primera que se cumple.
 *
 * El orden importa y no es arbitrario. Los dos casos que lo fuerzan:
 *
 *   $120 · "Pago Boletos Rifa"   -> RIFA, aunque 120 sea múltiplo de 15.
 *   $15  · "MARITZA ... EVENTO"   -> CUOTA, aunque la descripción diga "evento",
 *                                    porque $15 es la tarifa y paga cada 2 meses.
 *
 * De ahí que las reglas por palabra suelta (`evento`, `entrada`, `show`,
 * `tarjeta`) esten marcadas `onlyIfNotCuota`: son señales débiles que solo
 * deciden cuando el importe ya descarta la cuota.
 */
export const INCOME_RULES = [
  {
    id: INCOME_TYPE_IDS.INTERESES_BANCARIOS,
    // OJO: no buscar "ahorro" aqui. "DEPOSITO CUENTA DE AHORROS SIN LIBRETA" es un
    // resident pagando desde su cuenta de ahorro, no un rendimiento del banco: hay
    // $570 de cuota (hasta un deposito de $360 = 24 meses) que esa palabra robaba.
    // El rendimiento real se reconoce por la palabra "interes" o por el importe
    // ridiculo, que es lo que produces la cuenta de savings.
    label: 'descripción de interés, o importe menor a $3.50',
    test: (text, amount) => /interes/i.test(text) || amount < SMALL_INTEREST_MAX_AMOUNT,
  },
  {
    id: INCOME_TYPE_IDS.RIFA,
    label: 'descripción de rifa/sorteo/premio',
    test: (text) => /rifa|sorteo|premio/i.test(text),
  },
  {
    id: INCOME_TYPE_IDS.EVENTOS_ACTIVIDADES,
    label: 'descripción de boleto/teatro',
    test: (text) => /boleto|teatro|obra de teatro/i.test(text),
  },
  {
    id: INCOME_TYPE_IDS.EVENTOS_ACTIVIDADES,
    label: 'descripción de evento/entrada, solo si el importe no es de cuota',
    onlyIfNotCuota: true,
    test: (text) => /evento|entrada|show/i.test(text),
  },
  {
    id: INCOME_TYPE_IDS.VENTA_TARJETA_ACCESO,
    label: 'descripción de "tarjeta de acceso"',
    test: (text) => /tarjeta de (acceso|vehiculo)|llave/i.test(text),
  },
  {
    id: INCOME_TYPE_IDS.VENTA_TARJETA_ACCESO,
    label: 'descripción de tarjeta, solo si el importe no es de cuota',
    onlyIfNotCuota: true,
    test: (text) => /tarjeta/i.test(text),
  },
  {
    id: INCOME_TYPE_IDS.DONACIONES,
    label: 'descripción de donación',
    test: (text) => /donaci|dono/i.test(text),
  },
  {
    id: INCOME_TYPE_IDS.CUOTA_AREA_SOCIAL,
    label: 'importe múltiplo exacto de la cuota ($15)',
    test: (_text, _amount, isCuotaAmount) => isCuotaAmount,
  },
];

/**
 * Sube la regla para reportar cuál se aplicó. Se sube si el importe es un
 * múltiplo exacto de la cuota, con tolerancia por punto flotante (30/15 en
 * binario no es exactamente 2).
 */
export function isCuotaAmount(amount) {
  const value = Math.abs(Number(amount) || 0);
  if (value <= 0) return false;
  const quotient = value / CUOTA_AREA_SOCIAL_AMOUNT;
  return Math.abs(quotient - Math.round(quotient)) < 1e-9;
}

/**
 * Deduce el tipo de ingreso de una transacción. Devuelve `null` si no es un
 * ingreso o si ninguna regla aplica.
 *
 * Solo mira el importe y la descripción, y es una función pura: no lee ni
 * escribe nada, así que se puede llamar en cada agregado sin coste de cuota.
 *
 * @param {{description?: string, amount?: number}} tx
 * @returns {{id: string, ruleIndex: number}|null}
 */
export function inferIncomeType(tx) {
  // Se compara el signo, no el valor absoluto: un FEE de -15 tambien es multiplo
  // de la cuota, y tomarlo como ingreso haria que el agregado de ingresos contara
  // la facturacion como si fuera caja cobrada.
  const amount = Number(tx?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const text = tx.description || '';
  const cuota = isCuotaAmount(amount);

  for (let i = 0; i < INCOME_RULES.length; i++) {
    const rule = INCOME_RULES[i];
    if (rule.onlyIfNotCuota && cuota) continue;
    if (rule.test(text, amount, cuota)) return { id: rule.id, ruleIndex: i };
  }
  return null;
}

/**
 * El campo declarado manda; la inferencia cubre el histórico. Este es el punto
 * de entrada único para la app.
 *
 * @param {{incomeTypeId?: string, description?: string, amount?: number}} tx
 * @returns {string|null} id del catálogo, o null si no se pudo determinar
 */
export function resolveIncomeTypeId(tx) {
  if (tx?.incomeTypeId) return tx.incomeTypeId;
  return inferIncomeType(tx)?.id || null;
}

/**
 * Decide el tipo de ingreso que se graba al aprobar un reporte de pago, y deja
 * constancia de quien lo decidio.
 *
 * Prioridad: lo que el admin confirmo en la pantalla de aprobacion, si toco el
 * selector; si no, lo que declara el residente; si no, null (y la lectura lo
 * infiere con `resolveIncomeTypeId`).
 *
 * Vive aqui y no en `PaymentNotification.approve()` porque es logica de dominio
 * pura: se puede probar sin Firestore, y asi esta cubierta por
 * `scripts/classify_payments_local.js`.
 *
 * @param {string} [declaredId] - `incomeTypeId` que trae la notificacion.
 * @param {string} [overrideId] - `incomeTypeId` que eligio el admin.
 * @returns {{incomeTypeId: string|null, incomeTypeSource: 'resident'|'admin'|null}}
 */
export function resolveApprovalIncomeType(declaredId, overrideId) {
  const declared = declaredId || null;
  const incomeTypeId = overrideId || declared || null;
  if (!incomeTypeId) return { incomeTypeId: null, incomeTypeSource: null };
  return {
    incomeTypeId,
    incomeTypeSource: incomeTypeId === declared ? 'resident' : 'admin',
  };
}

/**
 * Cubo de los pagos a los que no se les puede asignar un mes.
 *
 * Se usa como clave de PERIODO en `porPeriodo` y `countsByPeriodo`.
 */
export const SIN_PERIODO_KEY = 'SIN_PERIODO';

/**
 * Cubo de los ingresos que no se pudieron clasificar en ningún tipo del catálogo.
 *
 * Se usa como clave de TIPO en `totals` y `counts`, y `incomeTypeName()` lo
 * rotula como "Sin clasificar" para que nunca se muestre el id crudo.
 *
 * Antes esto y `SIN_PERIODO_KEY` eran el mismo centinela (`__sinFecha__`), y el
 * resultado era `porPeriodo.__sinFecha__.__sinFecha__` para un pago sin mes ni
 * tipo: coherente, pero ilegible. Ahora son dos claves y se lee lo que es.
 */
export const SIN_CLASIFICAR_KEY = 'SIN_CLASIFICAR';

/**
 * Por qué las dos claves van en MAYÚSCULAS y no en el kebab-case del catálogo.
 *
 * Dos razones, y las dos importan:
 *
 * 1. Firestore PROHÍBE que un nombre de campo empiece *y* termine por `__`.
 *    El centinela viejo (`__sinFecha__`) violaba esa regla y el `batch.set`
 *    entero fallaba con "Document fields cannot begin and end with __", así que
 *    `stats.ingresosPorTipo` no se guardaba nunca.
 * 2. Los ids reales del catálogo son slugs kebab-case (`cuota-area-social`,
 *    `rifa`...). Un id en MAYÚSCULAS no puede colisionar con uno de esos ni con
 *    uno que alguien llegue a crear desde la app.
 *
 * No reintroducir aquí un nombre con `__` al principio o al final: el síntoma es
 * un error de escritura que no dice qué campo es el culpable, y se manifiesta
 * como "el campo no aparece" en vez de como "el campo está mal".
 */

/**
 * Periodo de una transacción, replicando la derivación que ya usa
 * `Property.recalculateAllBalances` para `stats.saldoPorPeriodo`.
 *
 * Importa que sea EXACTAMENTE la misma regla: si el agregado de ingresos metiera
 * un pago en un cubo que el saldo de caja no conoce, las dos tarjetas marcarían
 * números distintos para el mismo mes.
 *
 * 121 pagos ($3.140,00) no tienen `period` ni `effectiveDate` utilizable. No se
 * reparten en un mes inventado como "1969-12" ni se pierden: van a su propio cubo,
 * para que el filtro de periodo no los haga desaparecer en silencio.
 *
 * @param {{period?: string, effectiveDate?: *}} tx
 * @returns {string} clave de periodo, o SIN_PERIODO_KEY
 */
export function incomePeriodKey(tx) {
  if (tx?.period) return tx.period;
  const raw = tx?.effectiveDate;
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  if (!d || isNaN(d.getTime()) || d.getFullYear() < 2000) return SIN_PERIODO_KEY;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const round2 = (v) => Math.round(v * 100) / 100;

const addTo = (bucket, key, amount) => {
  bucket[key] = round2((bucket[key] || 0) + amount);
};

/**
 * Agrega los ingresos por tipo de ingreso.
 *
 * Es la MISMA función que alimenta la tarjeta de `generalExpenses` y la línea
 * base de `scripts/classify_payments_local.js`. Por eso la tarjeta y el test de
 * regresión no pueden divergir: si una regla de inferencia cambia, los dos lados
 * cambian en el mismo commit, y el clasificador detecta la deriva.
 *
 * Solo guarda SUMAS y CONTEO: ni nombres, ni direcciones, ni descripciones. Eso
 * es lo que permite publicarlo en `appConfig/app` (legible por cualquier usuario
 * autenticado, ver `firestore.rules:106`) sin filtrar datos de otros residentes.
 *
 * Las claves son ids del catálogo, nunca etiquetas: renombrar "Rifa" en el catálogo
 * no debe invalidar un agregado ya sincronizado.
 *
 * @param {Array<{type?: string, amount?: number, description?: string,
 *                 incomeTypeId?: string, period?: string, effectiveDate?: *}>} transactions
 * @param {{generatedAt?: Date}} [opts]
 */
export function aggregateIncomeByType(transactions, { generatedAt = null } = {}) {
  const totals = {};
  const counts = {};
  const porPeriodo = {};
  const countsByPeriodo = {};
  let total = 0;
  let movimientos = 0;

  for (const tx of transactions || []) {
    if (!tx) continue;
    const type = tx.type;
    if (type !== 'PAYMENT' && type !== 'OTHER_INCOME') continue;

    const amount = Math.abs(Number(tx.amount) || 0);
    const id = resolveIncomeTypeId(tx) || SIN_CLASIFICAR_KEY;
    const period = incomePeriodKey(tx);

    addTo(totals, id, amount);
    counts[id] = (counts[id] || 0) + 1;
    if (!porPeriodo[period]) porPeriodo[period] = {};
    addTo(porPeriodo[period], id, amount);
    if (!countsByPeriodo[period]) countsByPeriodo[period] = {};
    countsByPeriodo[period][id] = (countsByPeriodo[period][id] || 0) + 1;

    total = round2(total + amount);
    movimientos += 1;
  }

  const sinClasificarMonto = totals[SIN_CLASIFICAR_KEY] || 0;

  return {
    version: 1,
    total,
    movimientos,
    cobertura: movimientos > 0
      ? round2((100 * (movimientos - (counts[SIN_CLASIFICAR_KEY] || 0))) / movimientos)
      : 0,
    totals,
    counts,
    porPeriodo,
    countsByPeriodo,
    sinFecha: {
      monto: porPeriodo[SIN_PERIODO_KEY]
        ? Object.entries(porPeriodo[SIN_PERIODO_KEY]).reduce((s, [, v]) => round2(s + v), 0)
        : 0,
      // Cuenta TRANSACCIONES, no tipos: `Object.keys(...).length` contaba una vez
      // por tipo presente (3) y daba 3 en vez de los 121 pagos sin fecha real.
      movimientos: countsByPeriodo[SIN_PERIODO_KEY]
        ? Object.values(countsByPeriodo[SIN_PERIODO_KEY]).reduce((s, n) => s + n, 0)
        : 0,
    },
    sinClasificar: {
      monto: sinClasificarMonto,
      conteo: counts[SIN_CLASIFICAR_KEY] || 0,
    },
    generadoEn: generatedAt,
  };
}

/**
 * Agregado vacío: mismo esqueleto que devuelve `aggregateIncomeByType`, para que
 * `applyIncomeDelta` pueda partir de cero cuando `appConfig` aun no tiene el campo.
 *
 * @param {Date} [generatedAt]
 */
export function emptyIncomeAggregate(generatedAt = null) {
  return {
    version: 1,
    total: 0,
    movimientos: 0,
    cobertura: 0,
    totals: {},
    counts: {},
    porPeriodo: {},
    countsByPeriodo: {},
    sinFecha: { monto: 0, movimientos: 0 },
    sinClasificar: { monto: 0, conteo: 0 },
    generadoEn: generatedAt,
  };
}

/** Quita una clave que se quedó en cero, para que el mapa no crezca sin fin. */
const dropIfZero = (bucket, key) => {
  if (bucket && bucket[key] === 0) delete bucket[key];
};

/**
 * Aplica el efecto de UNA transaccion sobre un agregado ya calculado, sin volver
 * a leer los 2.791 pagos. Es lo que permite que la tarjeta de "Ingresos por
 * categoria" se mantenga al dia sin que el administrador pulse "Sincronizar saldos".
 *
 * Se Restar con `sign = -1` es la operacion inversa exacta: por eso los cubos que
 * se vacian se BORRAN en vez de quedarse en 0. Sin esa limpieza, un pago corregido
 * tres veces dejaría tres tipos fantasma con importes 0 en la tarjeta.
 *
 * Puro y sin dependencias de Firebase a proposito: se puede testear con el
 * snapshot local (ver `scripts/classify_payments_local.js`) sin gastar lecturas.
 *
 * @param {object} agg  Agregado actual, o null/undefined para empezar de cero.
 * @param {object} tx   La transaccion que se acaba de crear, editar o borrar.
 * @param {1|-1} [sign] +1 suma el movimiento, -1 lo resta.
 * @param {Date} [now]
 * @returns {object} Un agregado NUEVO; el de entrada no se toca.
 */
export function applyIncomeDelta(agg, tx, sign = 1, now = null) {
  const base = agg && typeof agg === 'object' && agg.version ? agg : emptyIncomeAggregate(now);

  if (!tx) return base;
  if (tx.type !== 'PAYMENT' && tx.type !== 'OTHER_INCOME') return base;

  // Copia superficial de los mapas que vamos a mutar. Los que no se tocan se
  // comparten con el original: son inmutables en la practica y asi el delta no
  // deep-clona ~4 KB en cada pago aprobado.
  const totals = { ...(base.totals || {}) };
  const counts = { ...(base.counts || {}) };
  const porPeriodo = { ...(base.porPeriodo || {}) };
  const countsByPeriodo = { ...(base.countsByPeriodo || {}) };

  const amount = round2(Math.abs(Number(tx.amount) || 0) * sign);
  const id = resolveIncomeTypeId(tx) || SIN_CLASIFICAR_KEY;
  const period = incomePeriodKey(tx);

  totals[id] = round2((totals[id] || 0) + amount);
  counts[id] = (counts[id] || 0) + sign;

  porPeriodo[period] = { ...(porPeriodo[period] || {}) };
  porPeriodo[period][id] = round2((porPeriodo[period][id] || 0) + amount);

  countsByPeriodo[period] = { ...(countsByPeriodo[period] || {}) };
  countsByPeriodo[period][id] = (countsByPeriodo[period][id] || 0) + sign;

  // Limpieza SOLO por conteo, nunca por importe: existen 3 pagos de $0 que son
  // reales y `aggregateIncomeByType` los guarda con importe 0. Si borramos al
  // llegar a 0, el incremental y el agregado completo divergirian. Al llegar el
  // conteo a 0 es cuando la transaccion ya no existe, y ahi sí se va la clave
  // entera (importe incluido) para no dejar tipos ni meses fantasma.
  //
  // El `Math.max(0, ...)` protege el caso de restar algo que nunca se sumo: sin
  // el, un borrado duplicado dejaria importes negativos en los mapas y el
  // invariante suma(totals) === total dejaria de cuadrar.
  if ((counts[id] || 0) <= 0) {
    delete counts[id];
    delete totals[id];
  } else if (totals[id] < 0) {
    totals[id] = 0;
  }

  if ((countsByPeriodo[period][id] || 0) <= 0) {
    delete countsByPeriodo[period][id];
    delete porPeriodo[period][id];
  } else if (porPeriodo[period][id] < 0) {
    porPeriodo[period][id] = 0;
  }

  if (!Object.keys(countsByPeriodo[period]).length) delete countsByPeriodo[period];
  if (!Object.keys(porPeriodo[period]).length) delete porPeriodo[period];

  const movimientos = (Number(base.movimientos) || 0) + sign;
  const total = round2((Number(base.total) || 0) + amount);

  const sinFechaMonto = round2((Number(base.sinFecha?.monto) || 0) + (period === SIN_PERIODO_KEY ? amount : 0));
  const sinFechaMov = (Number(base.sinFecha?.movimientos) || 0) + (period === SIN_PERIODO_KEY ? sign : 0);
  const sinClasMonto = round2((Number(base.sinClasificar?.monto) || 0) + (id === SIN_CLASIFICAR_KEY ? amount : 0));
  const sinClasConteo = (Number(base.sinClasificar?.conteo) || 0) + (id === SIN_CLASIFICAR_KEY ? sign : 0);

  return {
    version: 1,
    total: total < 0 ? 0 : total,
    movimientos: movimientos < 0 ? 0 : movimientos,
    cobertura: movimientos > 0
      ? round2((100 * (movimientos - (counts[SIN_CLASIFICAR_KEY] || 0))) / movimientos)
      : 0,
    totals,
    counts,
    porPeriodo,
    countsByPeriodo,
    sinFecha: { monto: sinFechaMonto < 0 ? 0 : sinFechaMonto, movimientos: sinFechaMov < 0 ? 0 : sinFechaMov },
    sinClasificar: { monto: sinClasMonto < 0 ? 0 : sinClasMonto, conteo: sinClasConteo < 0 ? 0 : sinClasConteo },
    generadoEn: now,
  };
}

/**
 * Nombre legible de un id. Si el id no está en el catálogo semilla (puede venir
 * de un documento de `incomeTypes` creado desde la app) se devuelve el id tal
 * cual para no perder información.
 */
export function incomeTypeName(id) {
  if (!id) return UNCLASSIFIED_LABEL;
  if (id === SIN_CLASIFICAR_KEY || id === SIN_PERIODO_KEY) return UNCLASSIFIED_LABEL;
  return INCOME_TYPE_BY_ID.get(id)?.name || id;
}

/** Sólo los tipos activos, en el orden de presentación. */
export function activeIncomeTypes(catalog) {
  const list = catalog || INCOME_TYPES;
  return list.filter((t) => t.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
}