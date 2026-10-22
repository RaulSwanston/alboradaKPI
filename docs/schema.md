# Esquema de Datos (Firestore)

## Colección `users`
- **ID:** UID de Firebase Auth.
- **Campos:** `uid`, `email`, `displayName`, `photoUrl`, `role`, `isActive`, `propertyIds`, `createdAt`, `emergencyContact`, `communicationPreferences`, `mobiles` (Array de objetos `{code: string, number: string}`), `phones` (Array de objetos `{code: string, number: string}`).

  *Campos legacy (compatibilidad):* `mobile` (string), `phone` (string) — se convierten a arrays al leer.

## Colección `properties`
- **ID:** `propertyId` (legible, ej: "101", "D-15").
- **Campos:** `name`, `address`, `balance`, `currency`, `ownerInfo`, `residentUids`.

## Colección `chargeConcepts`
- **ID:** Auto-generado.
- **Campos:** `name`, `icon` (SVG), `defaultAmount`, `isRecurring`, `billingFrequency`, `isRequestableByResident`, `requiresApproval`.

## Colección `membershipRequests`
- **ID:** `residency_` + `UID` + `propertyId`.
- **Campos:** `userId`, `userEmail`, `userName`, `requestedPropertyId`, `status`, `createdAt`, `processedAt`.

## Colección `serviceRequests`
- **ID:** Auto-generado.
- **Campos:** `propertyId`, `chargeConceptId`, `requestDate`, `status`, `residentNotes`, `adminNotes`, `finalAmount`.

## Colección `transactions`
- **ID:** Auto-generado.
- **Campos:** `propertyId`, `status`, `amount`, `pendingAmount`, `paidBy` (Array), `appliedTo` (Array), `type`, `description`, `voucherType`, `voucherNumber`, `period`, `createdAt`, `effectiveDate`, `incomeTypeId`.
- **Clasificación de gastos:** `expenseAccountId` referencia `expenseAccounts/{docId}`. Solo aplica a `type: 'EXPENSE'`; si está ausente, el gasto se muestra y agrupa como **"Sin clasificar"**. Es la fuente de verdad compartida por el módulo de Gastos Generales y por los gráficos de Analytics.
- **`propertyId` según tipo:** obligatorio para movimientos de una unidad (`FEE`, `PAYMENT`, `FINE`); `null` en `EXPENSE` y `OTHER`; `"__ADMIN_INCOME__"` en `OTHER_INCOME` (ingresos de la administración). Ninguno de esos tres últimos altera el saldo de una propiedad, pero sí cuentan en la caja real. Excepción histórica pendiente de revisión manual: un gasto de 2025-12 con `propertyId: "D-03"`.
- **Solo `FEE` y `FINE` son deuda:** al crearse, únicamente estos tipos reciben `pendingAmount = |amount|`; `EXPENSE`, `OTHER` y `OTHER_INCOME` nacen con `pendingAmount: 0`. `Transaction.getPendingDebts()` excluye además `EXPENSE`, `ADMIN_EXPENSE` y `OTHER` como red de seguridad.
- **Ingreso administrativo (`OTHER_INCOME`):** monto positivo, `propertyId: "__ADMIN_INCOME__"`, `incomeTypeId` (ej. `intereses-bancarios`), `voucherType: "Nota de Crédito"` y `voucherNumber` (referencia bancaria o `"N/A"`). No genera deuda y alimenta `appConfig.stats.ingresosPorTipo` (tarjeta "Ingresos por categoría"). El tipo de ingreso se elige en el formulario (`core/incomeTypes.js`); si falta, la lectura lo infiere por descripción/importe.
- **Abonos parciales:** no hay un campo adicional. En un `PAYMENT`, `appliedTo[].amount` guarda el importe efectivamente aplicado a cada cargo (puede ser menor que el cargo). El cargo correspondiente guarda en `paidBy[].amount` la parte cubierta por ese pago y en `pendingAmount` el saldo restante. `overpayment` es solo para el excedente de un pago, no para abonos parciales.
- **Comprobante de pago:** `metadata.receiptURL` guarda una **URL del Worker de Cloudflare** (Cloudflare R2 `alboradakpi/...`) tras subirla vía POST con API key. Para MOSTRARLA usar `getAuthObjectURL()` (fetch→blob), nunca `<img src>` directo.

## Colección `expenseAccounts`
- **ID:** Auto-generado.
- **Campos:** `name` (nombre de la cuenta/proveedor, ej. "TIGO"), `category` (grupo al que pertenece, ej. "servicios básicos y comunicaciones"), `order` (orden dentro de la categoría), `active`, `createdAt`, `updatedAt`.
- **Jerarquía:** `category` agrupa y `name` identifica. Son campos independientes, de modo que varias cuentas pueden compartir categoría.
- **Categorías actuales:** `áreas comunes`, `seguridad`, `servicios básicos y comunicaciones`, `eventos y actividades`.
- **Consumidores:** `ExpenseAccount` (CRUD), módulo de configuración (alta/edición), Gastos Generales (agrupación y filtro) y `Analytics.getExpensesByCategory()` (gráfico por `category`).
- **Reglas de escritura:** lectura para cualquier usuario autenticado; escritura solo `admin` (ver `firestore.rules`).

## Colección `paymentNotifications`
- **ID:** Auto-generado.
- **Campos:** `propertyId`, `residentUid`, `amount`, `paymentDate`, `reportDate`, `status`, `receiptUrl`, `appliedTo` (Array), `excessAmount`, `notes`.
- **Comprobante:** `receiptUrl` guarda la misma clase de URL del Worker de Cloudflare (se muestra con `getAuthObjectURL()`).

## Colección `activities`
- **ID:** Auto-generado.
- **Campos:** `timestamp`, `type`, `description`, `initiator` (Object), `target` (Object), `details` (Object), `visibility` (Array).
