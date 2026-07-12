# Memoria de Sesiones - Bitácora de Proyecto

## Entrada: 12 de Julio de 2026
**Estado:** Fix de conciliación al editar PAYMENT en transactions-detail.

### Resumen de cambios:
- **Fix del gap crítico:** Se completó la conciliación al **editar** un PAYMENT existente en `transactions-detail.controller.js`. Ahora:
  - Compara `oldAppliedTo` vs `newAppliedTo` (diff added/removed)
  - **Cargos añadidos**: decrementa `pendingAmount` + agrega `paidBy` via `arrayUnion`
  - **Cargos removidos**: restaura `pendingAmount` + filtra `paidBy`
  - **Balance** de propiedad: ajusta por `(nuevoMonto - viejoMonto)`
  - Todo en un solo `writeBatch` atómico
- **Nueva variable** `originalTransaction` para almacenar el estado previo al cargar una transacción existente.

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `modules/transactions-detail/transactions-detail.controller.js` | +`originalTransaction`, lógica de conciliación con diff (added/removed) al editar PAYMENT |
| `docs/memory.md` | Esta entrada |

### Pendiente:
- Datos históricos: cargos sin `pendingAmount` se muestran como impagos (requiere estrategia de reconciliación).
- Dashboard de resumen financiero para el residente.

---

## Entrada: 10 de Julio de 2026
**Estado:** Refactor visual de transactions-detail + Diagnóstico de conciliación de pagos.

### Resumen de cambios:
- **CSS reorganizado:** Cada sección de `transactions-detail` pasó de ser parte de una tarjeta monolítica a una tarjeta independiente con brand watermark, sombra y borde (inspirado en el prototipo `transactions_pay.html`). Colores homologados al design system (kaitoke-green, gurkha). Sin cambios en HTML/JS.
- **Ancho completo en desktop:** `.td-wrapper` ahora ocupa 100% del ancho disponible (se eliminó `max-width: 900px`).
- **Nuevos métodos de pago:** Se agregaron ACH y Yappy al select de "Método de Pago".

### Descubrimientos/Discusiones:
- **Gap crítico:** `applyPaymentToCharges()` solo se ejecuta para transacciones NUEVAS. Al editar un PAYMENT existente, el `appliedTo` se guarda pero no se actualizan `pendingAmount`/`paidBy` de los cargos vinculados/desvinculados, ni el balance de propiedad.
- **Bug menor:** Al editar un PAYMENT, `recalculateAmount()` sobrescribe el monto original con la suma de cargos seleccionados.
- **Datos históricos:** Los cargos previos a la implementación de `pendingAmount` no tienen el campo, por lo que `getPendingDebts()` los muestra como impagos. Pendiente de reconciliar.

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `modules/transactions-detail/transactions-detail.css` | Cada sección como tarjeta individual + brand watermark + ancho completo + colores consistentes + bordes refinados |
| `modules/transactions-detail/transactions-detail.html` | +ACH, +Yappy en métodos de pago |
| `docs/memory.md` | Esta entrada |

## Entrada: 1 de Julio de 2026
**Estado:** Flujo de reportes de pago completado (MVP).

### Resumen de cambios:
- **Internacionalización:** Se internacionalizó completamente el módulo `paymentReport` (HTML con `::i18n`, controlador con `t()`). Se documentó en `docs/skills.md` que Mosaic solo procesa `::i18n` en texto, no en atributos HTML.
- **Topbar:** Se eliminó el botón de notificaciones, se fusionaron los menús de perfil y configuración en uno solo con 3 grupos (Mi Cuenta / Preferencias / Configuración admin), y se agregó `initSessionUI()` para visibilidad por roles vía `data-role-required`.
- **CSS Homologado:** Se homologó `paymentReport.css` al sistema de diseño de `propertyDetail` (`.summary-card`, `.card-label`, sombras), se eliminó `!important` y se corrigió el modal con `.modal-overlay.hidden` (especificidad 0,2,0).
- **Upload Zone corregida:** Se agregaron `.hidden-input`, `position: relative` en `.upload-zone`, estilos para `.upload-content`/`.upload-text`, y `.form-select` local en `paymentReport.css`.
- **Modelo PaymentNotification:** Se agregaron métodos `getByUser()`, `getPending()`, `approve()`, `reject()`.
- **Nuevo módulo paymentHistory:** Vista `/dashboard/payments/history` con listado de reportes del residente, status badges y empty state.
- **Nuevo módulo paymentApproval:** Vista `/dashboard/payments/pending` para admin, con cards de reportes, vista de comprobante, y modal de rechazo con motivo.
- **Firestore Indexes:** Se agregaron índices para `paymentNotifications` (status+reportDate, residentUid+reportDate) y se desplegaron.
- **AppConfig:** Se registraron los nuevos módulos en `allowedModules` y se agregó navegación `paymentHistory` al sidebar.

### Siguientes pasos estratégicos:
- Vista de detalle `/dashboard/payments/:id` (ruta ya registrada en el router).
- Conciliación financiera al aprobar un reporte (actualizar transacciones).

## Entrada: 4 de Julio de 2026
**Estado:** Auditoría y planificación del sistema financiero (Facturas ↔ Recibos).

### Resumen:
Se realizó un análisis profundo de todo el flujo financiero de la aplicación. Se detectaron **13 gaps** (6 críticos, 6 moderados, 6 menores) que impiden tener un sistema contable formal.

### Documentos creados:
- **`docs/plan-pagos-facturas-recibos.md`** — Plan detallado con gaps, capas de solución, dependencias y orden sugerido.
- **`project-tasks.json`** — 14 tareas estructuradas con prioridad, capa, y gaps asociados.

### Principales hallazgos:
1. `Transaction.create()` no genera `voucherNumber` ni `voucherType` — no existen FAC- ni REC-.
2. Aprobar un pago (`PaymentNotification.approve()`) no crea una transacción en `transactions`.
3. `pendingAmount`, `paidBy`, `appliedTo` nunca se escriben — sin conciliación.
4. Botón "Solicitar" en servicios sin event handler — flujo roto.
5. No existe `paymentMethod` en ningún lado.
6. Ruta `/dashboard/payments/:id` muerta (sin vista).

### Propuesta: 3 Capas
- **Capa 1:** Sistema de numeración secuencial + generación de vouchers.
- **Capa 2A:** Reparar flujo de servicios (solicitud → factura).
- **Capa 2B:** Completar flujo de pagos (notificación → recibo → conciliación).
- **Capa 3:** UI de recibos, impresión y estado del residente.

### Refinamientos incorporados al plan:
- **Secuencial manual via appConfig:** Admin puede definir `appConfig.app.counters.fac/rec` como número de inicio. `_generateVoucher()` lo respeta.
- **Nuevo módulo `billingGenerator`:** Reemplaza la Cloud Function. Vista `/dashboard/billing/generate` para generación manual de cuotas recurrentes con lógica inteligente (no duplicar, detectar expirados, progreso en vivo).
- **project-tasks.json** actualizado con 3 nuevas tareas (layer1.3 + layer2a.4).

### Implementado:

**Capa 1 — Sistema de Numeración ✅**
- `Transaction._generateVoucher()` con contadores atómicos en `system/counters`
- Soporte de secuencial manual desde `appConfig.app.counters`
- `voucherNumber`/`voucherType` auto-generado en `Transaction.create()` (FAC/REC)
- `pendingAmount` auto-calculado
- Sección `counters` agregada a `appConfig.js`

**Capa 2B — Ciclo de Pagos ✅**
- `PaymentNotification.approve()` reescrito: crea PAYMENT transaction, concilia facturas (pendingAmount/paidBy/appliedTo), actualiza balance propiedad, todo en writeBatch atómico
- Campo `paymentMethod` agregado al formulario de reporte de pago, al modelo y a la transacción resultante
- Vista de aprobación muestra la forma de pago
- `increment` y `arrayUnion` agregados a los exports de Firebase

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `models/Transaction.js` | +`_generateVoucher()`, imports, pendingAmount/voucher en create() |
| `core/firebase.js` | +`increment` en import/export |
| `models/PaymentNotification.js` | approve() reescrito (crea PAYMENT + concilia), +getDoc +increment +arrayUnion |
| `core/appConfig.js` | +sección counters |
| `modules/paymentReport/paymentReport.html` | +select paymentMethod |
| `modules/paymentReport/paymentReport.controller.js` | +paymentMethod en reportData |
| `modules/paymentApproval/paymentApproval.controller.js` | +paymentMethod en vista, +alert con voucherNumber |

### Implementado (4 Jul 2026 — Continuación):

**Capa 2A — Flujo de Servicios (Solicitud → Factura) ✅**
- `models/ServiceRequest.js`: 6 métodos (create, getPending, getByProperty, getById, approve → FEE con voucher FAC, reject)
- `services.controller.js`: Botón "Solicitar" conectado a `ServiceRequest.create()` con confirmación, feedback de carga y validación de propiedad
- `modules/serviceApproval/`: Nuevo módulo admin para aprobar/rechazar solicitudes con modal de rechazo
- Vista `requests.html` extendida con `<!-- ::module.serviceApproval -->`

**Capa 3 — UI de Recibos y Comprobantes ✅**
- `transactions.html`: Modal de recibo agregado al footer de la tabla
- `transactions.controller.js`: Botón "Ver Recibo" en cada fila (solo transacciones con voucherNumber), modal con datos formateados (tipo FAC/REC, fecha, monto, periodo, saldo pendiente), impresión nativa
- `transactions.css`: Estilos completos para modal y print (modal-overlay, receipt-body, @media print)

**Generación Masiva de Cuotas ✅**
- `Transaction._generateBatchVouchers()`: Genera N vouchers FAC en una sola runTransaction atómica
- `modules/billingGenerator/`: Nuevo módulo admin en vista config con formulario (concepto, periodo, monto, descripción), resumen, y generación en batches de 500 con writeBatch + actualización de balances

### Archivos modificados/creados:
| Archivo | Cambio |
|---------|--------|
| `models/ServiceRequest.js` | **NUEVO** — 6 métodos del ciclo de vida |
| `models/Transaction.js` | +`_generateBatchVouchers()` |
| `modules/services/services.controller.js` | +event delegation "Solicitar" |
| `modules/serviceApproval/` | **NUEVO** — 3 archivos (html, css, controller) |
| `views/dashboard/requests.html` | +module.serviceApproval |
| `views/dashboard/config.html` | +module.billingGenerator |
| `modules/transactions/transactions.html` | +modal recibo |
| `modules/transactions/transactions.css` | +estilos modal/print |
| `modules/transactions/transactions.controller.js` | +botón recibo + showReceiptModal |
| `modules/billingGenerator/` | **NUEVO** — 3 archivos (html, css, controller) |

### Pendiente:
- Vista `/dashboard/payments/:id` (detalle de pago individual)
- Dashboard de resumen financiero para el residente
- Pruebas funcionales en emulador

---

## Entrada: 5 de Julio de 2026
**Estado:** Rediseño del módulo transactions-detail + Diagnóstico del flujo pendingAmount.

### Resumen de cambios:
- **Rediseño completo de `transactions-detail`** (HTML + CSS + controller):
  - Búsqueda de propiedad con autocomplete (input + datalist), sin auto-corrección del valor escrito
  - Selector de tipo de movimiento: 5 radio buttons con iconos SVG (FEE, PAYMENT, EXPENSE, FINE, OTHER)
  - Sección de deudas (PAYMENT only): tarjetas seleccionables con check, auto-cálculo del monto total
  - Sección de pago (PAYMENT only): método de pago + zona de upload de comprobante a Firebase Storage
  - Sección de reconciliación (solo modo edición)
  - CSS homologado al sistema de diseño de `propertyDetail` (colores `--color-gurkha-*`, `--color-kaitoke-green-*`, sombras, border-radius)
  - Mobile-first responsive

### Bugs corregidos:
1. **Property search auto-corrección:** `handlePropertyChange()` reemplazaba el valor del input al encontrar una coincidencia parcial, impidiendo escribir IDs como D-01. Fix: se eliminó la línea `propertySearch.value = prop.id`.
2. **Índice compuesto faltante en `getPendingDebts()`:** La query usaba `where("amount", "<", 0)` + `orderBy("createdAt")` sin el índice necesario. Fix: se cambió a `where("propertyId", "==", X)` solo (sin filtros que requieran índice), y el filtro `amount < 0` + orden se hace en memoria.
3. **`pendingAmount` no se decrementaba:** `Transaction.create()` guarda `appliedTo` en el PAYMENT pero nunca actualiza `pendingAmount` de los cargos vinculados. Solo `PaymentNotification.approve()` lo hacía. Fix: se agregó `applyPaymentToCharges()` en el controller usando `writeBatch` atómico (lee pending actual, decrementa, actualiza balance de propiedad).

### Descubrimientos compartidos por el usuario (histórico):

**Problema raíz:** Los pagos históricos registrados NO están vinculados a facturas (FEE). Los campos `paidBy`/`appliedTo` están vacíos. El campo `pendingAmount` está desactualizado en TODOS los cargos porque:
- El flujo de conciliación (PaymentNotification → PAYMENT → appliedTo → pendingAmount) se implementó DESPUÉS de que los datos ya estaban subidos.
- No hay ninguna referencia (salvo la descripción textual) que asocie un pago a un cargo específico.
- 

**Decisión:** No reconciliar datos históricos automáticamente. Es inviable sin referencias explícitas. Solo se arregla el flujo hacia adelante.

### Archivos modificados en esta sesión:

| Archivo | Cambio |
|---------|--------|
| `modules/transactions-detail/transactions-detail.html` | **REESCRITO** — Nueva estructura con secciones, type selector, debt cards, upload zone |
| `modules/transactions-detail/transactions-detail.css` | **REESCRITO** — Homologado a propertyDetail design system, responsive |
| `modules/transactions-detail/transactions-detail.controller.js` | **REESCRITO** — Property search, debt selection, auto-amount, receipt upload, +`applyPaymentToCharges()`, imports `getDoc`/`writeBatch`/`arrayUnion` |
| `models/Transaction.js` | `getPendingDebts()` — removidos `where("amount","<",0)` y `orderBy` (índice faltante), ahora filtra/ordena en memoria |

### Pendientes (para próxima sesión):

1. **Verificar fix de `pendingAmount`:** Probar que al crear un PAYMENT nuevo con cargos seleccionados, el `pendingAmount` de los cargos se decremente correctamente y el balance de la propiedad se actualice.
2. **Completar conciliación al editar PAYMENT existente:** Hoy `applyPaymentToCharges()` solo corre para transacciones nuevas (`isNew`). Al editar un PAYMENT, `Transaction.update()` guarda el nuevo `appliedTo` pero NO:
   - Decrementa `pendingAmount` en los cargos recién vinculados
   - Restaura `pendingAmount` en cargos que se desvincularon
   - Actualiza `paidBy` en los cargos afectados (agregar/quitar referencias)
   - Ajusta el balance de la propiedad
   - Además hay un bug menor: `recalculateAmount()` sobrescribe el monto original del PAYMENT al cargar la edición
3. **Reconciliación de datos históricos:** Los cargos anteriores a la implementación de `pendingAmount`/`appliedTo`/`paidBy` tienen `pendingAmount = undefined`, por lo que `getPendingDebts()` los muestra como impagos aunque ya tengan pagos asociados. Quedó pendiente definir estrategia (herramienta visual de conciliación vs script FIFO automático).
4. **Considerar migración de traducciones a `modules.*`:** Los módulos `paymentReport`, `paymentApproval`, `paymentHistory`, `configManager` aún tienen sus traducciones en la raíz del JSON. El estándar nuevo es `modules.transactions.*`. Hay 5 tareas pendientes (tasks i18n.1 a i18n.5).
5. **Vista `/dashboard/payments/:id`:** Detalle individual de pago reportado (ruta ya registrada en el router, sin vista).
6. **Dashboard de resumen financiero para el residente.**
7. **Pruebas funcionales en emulador.**
8. **Integración Cloudflare** si se decide usar para email u otros servicios.

### Notas técnicas importantes:
- `increment` NO es usable desde imports dinámicos (`import(blobUrl)`). Todos los consumidores fueron migrados a pre-read + cómputo manual.
- Los placeholders HTML no soportan `::i18n` (limitación de Mosaic). Se setean via JS: `element.placeholder = t('key')`.
- `Transaction._generateVoucher()` usa `runTransaction` para contadores atómicos en `system/counters`.
- `_generateBatchVouchers()` genera N vouchers en una sola transacción atómica.
- `Transaction.create()` auto-asigna pendingAmount, voucherNumber, voucherType, period, y status.
