# Memoria de Sesiones - Bitácora de Proyecto

## Entrada: 16 de Julio de 2026
**Estado:** Refactor completo del módulo Profile — Teléfonos dinámicos, floating labels, diseño unificado.

### Resumen de cambios:
- **Profile Module — Teléfonos dinámicos con arrays:**
  - `profile.html`: Reemplazados inputs estáticos `mobile`/`phone` por contenedores dinámicos `#mobiles-container` / `#phones-container` con botones "+ Agregar Celular/Fijo".
  - `profile.controller.js`: Lógica completa de teléfonos dinámicos — `normalizeToArray()` (convierte string legacy a array), `renderPhoneList()` (puebla filas), `createPhoneRow()` (select código país + input + label + botón ×), `collectPhones()` (recolecta arrays para guardar).
  - `profile.css`: Estilos para `.phone-row` (flex con select + input + label + btn-remove), floating label integrado en la fila (posicionado sobre el input considerando ancho del select), transiciones focus/blur, `.form-select` (código país), `.btn-remove` (× rojo), `.button-add` (+ verde), `.form-label-static` (encabezados).
  - Modelo `User.updateProfile()` ya aceptaba cualquier campo; ahora se guardan arrays `mobiles[]` / `phones[]` con objetos `{code, number}`.

- **Profile Module — Floating Labels refinados:**
  - `profile.css`: `form-input` padding ajustado (`1.125rem 1rem 0.375rem`), `line-height: 1.3` para altura refinada (~47px). Label siempre en tamaño pequeño (`0.65rem`, uppercase, letter-spacing) y solo se desplaza (`top: 1.15rem → 0.4rem`) al focus/llenar — sin cambio de tamaño.
  - Posición de label en focus ajustada a `top: 0.4rem` (respiro visual).

- **Profile Module — Layout con Flex + Gap:**
  - `.profile-card` ahora `display: flex; flex-direction: column; gap: 1.5rem` — espaciado uniforme entre hijos (título, descripción, formulario, opciones). Márgenes individuales eliminados de `.profile-card-title`, `.profile-card-desc`, `.dropdown-divider`.

- **Botón Guardar:**
  - Alineado a la izquierda (`justify-content: flex-start`) y tamaño homogéneo al botón "Solicitar otra unidad" de residencyRequest (`padding: 0.5rem 1.25rem`, `font-size: 0.8125rem`, `border-radius: 0.65rem`, `font-weight: 800`).

- **Datos en Firestore — Migración esquemática:**
  - Antes: `mobile: "6123-4567"`, `phone: "212-3456"` (strings)
  - Después: `mobiles: [{code: "+507", number: "6123-4567"}]`, `phones: [{code: "+507", number: "212-3456"}]` (arrays de objetos)
  - `normalizeToArray()` en controller maneja migración transparente al leer (string → array).

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `modules/profile/profile.html` | Contenedores dinámicos `#mobiles-container`, `#phones-container`, botones + |
| `modules/profile/profile.css` | **Rewrite completo**: floating labels refinados, teléfonos dinámicos, flex+gap en card, botón guardar redimensionado |
| `modules/profile/profile.controller.js` | **Rewrite completo**: teléfonos dinámicos (arrays), códigos país, migración legacy, collect/save |
| `docs/schema.md` | Actualizado esquema `users` — `mobile`/`phone` → `mobiles[]`/`phones[]` arrays |

---

## Entrada: 15 de Julio de 2026
**Estado:** Refactor completo del módulo residencyRequest y profile con diseño moderno.

### Resumen de cambios:
- **MembershipRequest model:** IDs auto-generados (doc(collection(...))), nuevo campo `visibleToUser`, nuevo método `dismiss(requestId, userId)` via `updateDoc`.
- **firestore.rules:** Permiso `update` para el usuario en sus propios documentos (`request.auth.uid == resource.data.userId`).
- **profile.controller.js:** Referencias DOM corregidas (form, btnSave, inputs, nameTitle).
- **profile.css:** Refactor completo — eliminados todos los selectores duplicados que pertenecían a residencyRequest (search, chips, status, card-header-with-icon). Brand watermark (`::before` radial gradient) en header y profile cards. Colores migrados a `--color-gurkha-*`/`--color-kaitoke-green-*`/`--color-solid-pink-*`. Selectores `.form-label`/`.form-input` scoped a `.profile-module` para evitar conflicto con root.css.
- **residencyRequest.controller.js:**
  - Status list renderizada como tarjetas (`.mc-card` con icono, título, badge, dismiss).
  - Fix campo `address.street` (era `p.street`, Firestore usa `address.fullAddress` + `address.street`).
  - Animación show/hide del formulario: `showFormContainer()` / `hideFormContainer()` con `@starting-style` para entrada y clase `.form-exit` + `transitionend` para salida suave.
  - Filtro de propiedades con solicitud activa excluidas del search.
  - Re-show del formulario al descartar la última solicitud.
- **residencyRequest.css:** Rewrite completo:
  - Brand watermark en el módulo.
  - Tarjetas de estado (`.mc-card`) con animación escalonada, badges semánticos (pendiente/amarillo, aprobada/verde, rechazada/rojo).
  - Search input scoped a `.search-input-wrapper .form-input` para no pisar profile form.
  - Chips neutros (`--color-gurkha-100`/`--color-gurkha-700`) sin verde para no competir con botón primario.
  - `btn-remove-chip` con `padding: 0` para que sea circular (root.css global `padding: 0.75rem 1rem` lo desbordaba).
  - `@starting-style` en `#request-form-container` para entrada suave.
  - `.form-exit` class para salida animada.
  - Botón "Solicitar otra unidad": verde con texto blanco; en mobile full-width más grande.
  - Botón "Cancelar" en `--color-solid-pink-600`.
  - Gap de chip aumentado a 1rem en mobile para separar select de botón ×.
- **residencyRequest.html:** HTML limpiado — icono y header inline eliminados del status container, estilos inline reemplazados por clases.

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `firestore.rules` | +permiso update para usuario en sus documentos |
| `models/MembershipRequest.js` | +IDs auto-generados, +visibleToUser, +dismiss() |
| `modules/profile/profile.controller.js` | Fix referencias DOM faltantes |
| `modules/profile/profile.css` | Refactor completo, duplicados eliminados, brand watermark, colores gurkha/kaitoke |
| `modules/residencyRequest/residencyRequest.controller.js` | Tarjetas mc-card, fix address.street, animación show/hide, helpers |
| `modules/residencyRequest/residencyRequest.css` | Rewrite completo, diseño system, chips neutros, @starting-style, responsive |
| `modules/residencyRequest/residencyRequest.html` | HTML limpio, inline styles → clases |

### Pendiente:
- N/A

---

## Entrada: 12 de Julio de 2026
**Estado:** Fix conciliación PAYMENT-FEE, caché de cargos, correcciones CSS mobile y scroll.

### Resumen de cambios:
- **Fix conciliación al editar PAYMENT** (`transactions-detail.controller.js`):
  - Compara `oldAppliedTo` vs `newAppliedTo` (diff added/removed)
  - **Cargos añadidos**: decrementa `pendingAmount` + agrega `paidBy` via `arrayUnion`
  - **Cargos removidos**: restaura `pendingAmount` + filtra `paidBy`
  - **Balance** de propiedad: ajusta por `(nuevoMonto - viejoMonto)`
  - Todo en un solo `writeBatch` atómico
  - Nueva variable `originalTransaction` para almacenar estado previo
- **Eliminado caché de cargos** (`transactions.controller.js`): `loadDebtsForPanel` ahora siempre consulta Firestore al abrir el panel de conciliación, evitando datos obsoletos al conciliar múltiples pagos de una misma propiedad.
- **Fix scroll al seleccionar tarjetas** (`transactions.controller.js`): cambio de `<label>` a `<div>` con `e.preventDefault()` para que el checkbox no reciba foco y el navegador no haga scroll automático.
- **Fix ancho en mobile** (`root.css` + `transactions.css`):
  - Eliminado `display: flex` conflictivo en `.transactions-table` (≤768px) que impedía a `#transactions-list` ocupar el 100% del ancho
  - Agregado `width: 100%` explícito en `#transactions-list` para mobile
- **Centrado de columnas** (`transactions.css` + `transactions.html`): Tipo, Unidad y Monto centrados horizontalmente en escritorio. Mobile mantiene su alineación original. Eliminado inline style obsoleto en header.

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `modules/transactions-detail/transactions-detail.controller.js` | +`originalTransaction`, lógica de conciliación con diff (added/removed) al editar PAYMENT |
| `modules/transactions/transactions.controller.js` | Eliminado caché en `loadDebtsForPanel`; `<label>` → `<div>` + `e.preventDefault()` para evitar scroll |
| `modules/transactions/transactions.css` | +`width:100%` en #transactions-list mobile; centrado de `.col-type`, `.col-prop`, `.col-amount` en desktop; revertido a right/left en mobile |
| `modules/transactions/transactions.html` | Eliminado inline `style="text-align:right;padding-right:2rem"` del header |
| `src/css/root.css` | Eliminado `.transactions-table { display: flex }` del media query ≤768px |
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
