# Plan: Sistema de Pagos, Facturas y Recibos

> Documento de análisis y planificación. Creado: Julio 2026.

---

## 1. Diagnóstico: El Problema Central

La aplicación carece de un **sistema contable formal** que distinga entre:

| Documento | Propósito | Formato | Tipo Transaction |
|-----------|-----------|---------|------------------|
| **Factura (FAC)** | Representa una deuda/deber del residente | `FAC-YYYYMM-PropId` | `FEE`, `FINE`, etc. |
| **Recibo (REC)** | Representa el pago que extingue una deuda | `REC-YYYYMMDD-XXXX` | `PAYMENT` |

Cada recibo debe referenciar qué factura(s) paga (`appliedTo`), y cada factura debe listar qué recibo(s) la han pagado (`paidBy`). **Hoy esto no ocurre en ninguna parte del código ni en los datos.**

---

## 2. Tabla de Gaps

### 🔴 Críticos (Bloquean la funcionalidad)

| ID | Gap | Archivos/Lugar | Impacto |
|----|-----|----------------|---------|
| C1 | **`voucherNumber` nunca se genera** | `models/Transaction.js:15` — `create()` no setea el campo | No existen folios FAC- ni REC- en producción |
| C2 | **`voucherType` nunca se setea** | `models/Transaction.js:15` — `create()` no setea el campo | No se distingue "Cargo", "Recibo", "Gasto" |
| C3 | **Aprobar pago no crea transacción** | `models/PaymentNotification.js:112` — `approve()` solo cambia status | Pagos aprobados nunca aparecen en `transactions` |
| C4 | **Flujo de Solicitud de Servicio roto** | `modules/services/services.controller.js` — botón "Solicitar" sin handler | Residentes no pueden solicitar servicios |
| C5 | **`pendingAmount` no se setea al crear cargos** | `models/Transaction.js:15` | Las FEE no tienen saldo pendiente inicial para conciliación |
| C6 | **No hay generación de cuotas mensuales** | No existe Cloud Function ni script | Cuotas recurrentes son solo definiciones, no se generan |

### 🟡 Moderados (Afectan la integridad)

| ID | Gap | Archivos/Lugar | Impacto |
|----|-----|----------------|---------|
| M1 | **`paidBy`/`appliedTo` nunca se pueblan** | Los arrays existen en schema pero nadie los escribe | Sin trazabilidad entre pagos y deudas |
| M2 | **No existe `paymentMethod`** | En ningún modelo, formulario o schema | No se registra si fue efectivo, transferencia, etc. |
| M3 | **No hay sistema de numeración secuencial** | No hay contador ni lógica de auto-incremento | No se pueden generar FAC- o REC- consistentes |
| M4 | **Sin vista de recibo ni impresión** | `jsPDF` existe en `propertyDetail` pero sin uso para recibos | Residentes no obtienen comprobante de pago |
| M5 | **Sin modelo `ServiceRequest`** | No existe `models/ServiceRequest.js` | No hay representación de solicitudes de servicio |
| M6 | **Sin generación de transacción al aprobar servicio** | No hay código que convierta solicitud aprobada en FEE | Servicios aprobados no generan deuda |

### 🔵 Menores (UX/Consistencia)

| ID | Gap | Archivos/Lugar |
|----|-----|----------------|
| m1 | Ruta `/dashboard/payments/:id` muerta | Registrada en `router.js:35` pero sin vista |
| m2 | `paymentModal` es HTML huérfano | Solo tiene `paymentModal.html`, sin controller ni CSS |
| m3 | Tabla de transacciones no muestra estado del residente | `modules/transactions/` — no indica "al día", "debe", "a favor" |
| m4 | `concepts` module incompleto | Solo tiene HTML, sin controller |
| m5 | Botón "Nueva Transacción" faltante | `modules/transactions/transactions.html` no tiene botón para crear |
| m6 | `servicesNew` tiene nombre engañoso | Crea ChargeConcepts, no service requests |

---

## 3. Propuesta de Solución por Capas

### Capa 1: Sistema de Numeración (Factura + Recibo)

**Objetivo:** Que cada transacción tenga un identificador único y trazable.

#### Tareas:

- [ ] **1.1** Modificar `Transaction.create()` para que **genere automáticamente**:
  - Agregar método `_generateVoucher()` que:
    1. Lee el documento `system/counters` (usando `runTransaction` para atomicidad)
    2. Si no existe, verifica `appConfig.app.counters` (secuencial manual definido por el admin)
    3. Si el admin configuró un secuencial manual, inicializa `system/counters` con ese valor
    4. Si no, inicializa en 1
    5. Incrementa el contador atómicamente
  - `voucherNumber`: `FAC-YYYYMM-NNNNNN` para cargos (type: FEE, FINE)
  - `voucherNumber`: `REC-YYYYMMDD-NNNNNN` para pagos (type: PAYMENT)
  - `voucherType` según corresponda: "Cargo", "Recibo", "Gasto"
  - Solo auto-genera si `data.voucherNumber` no fue provisto manualmente
- [ ] **1.2** Modificar `Transaction.create()` para que **setee `pendingAmount`**:
  - Para cargos (amount < 0): `pendingAmount = Math.abs(amount)`
  - Para pagos (amount > 0): `pendingAmount = 0`

### Capa 2: Flujo Financiero Completo

**Objetivo:** Cerrar el ciclo de vida de deuda → pago → conciliación.

#### Subcapa 2A: Ciclo de Servicios (Solicitud → Factura)

- [ ] **2A.1** Crear modelo `ServiceRequest.js` con métodos:
  - `create()` — atómico con actividad
  - `getPending()`, `getByProperty()` — consultas
  - `approve()` — al aprobar, **crea una transacción FEE con factura** y actualiza estado
  - `reject()` — solo cambia estado
- [ ] **2A.2** Reparar `services` controller: conectar botón "Solicitar" → `ServiceRequest.create()`
- [ ] **2A.3** Crear módulo `serviceApproval` para admin (similar a `paymentApproval`)
- [ ] **2A.4** Crear módulo `billingGenerator` (vista `/dashboard/billing/generate`) para generación manual de cuotas recurrentes:
  - Lista conceptos con `isRecurring: true` y analiza:
    - Estado: PENDIENTE (nunca generado), AL DÍA (última generación OK), EXPIRADO (fecha fin pasada)
    - Próximo período a generar
  - Permite seleccionar conceptos y generar facturas masivas
  - Lógica inteligente: no duplica si ya existe factura para ese período + propiedad
  - Feedback visual: progreso en tiempo real, resumen al final
  - Actualiza `ultimaGeneracion` en cada concepto tras generarlo
  - Persiste un registro de ejecución en `billingLog` para auditoría

#### Subcapa 2B: Ciclo de Pagos (Notificación → Recibo → Conciliación)

- [ ] **2B.1** Modificar `PaymentNotification.approve()` para que:
  - **Cree una transacción PAYMENT** con `voucherNumber = REC-...`
  - **Actualice** `pendingAmount`, `paidBy` y `appliedTo` de las facturas vinculadas
  - Recálcule el `balance` de la propiedad
  - Todo en un `writeBatch` atómico
- [ ] **2B.2** Agregar campo `paymentMethod` a `PaymentNotification` y al formulario:
  - Valores: `cash` (efectivo), `transfer` (transferencia), `deposit` (depósito), `check` (cheque), `card` (tarjeta), `other`
- [ ] **2B.3** Agregar campo `paymentMethod` a `Transaction` para pagos (type: PAYMENT)

### Capa 3: UI de Recibos, Impresión y Estado

**Objetivo:** Que residentes y admin puedan ver, imprimir y descargar recibos.

- [ ] **3.1** Crear vista `/dashboard/payments/:id` — detalle del recibo con:
  - Número de recibo, fecha, unidad, residente, monto
  - Detalle de facturas pagadas (appliedTo)
  - Forma de pago
  - Botón "Imprimir Recibo"
- [ ] **3.2** Implementar impresión de recibo:
  - Usar `jsPDF` (ya disponible) o generar HTML+CSS para `window.print()`
  - Incluir logotipo, datos del condominio, firma digital
- [ ] **3.3** Mostrar estado del residente en tabla de transacciones:
  - Indicador visual: "Al día" (verde), "Debe $X" (rojo), "A favor $X" (azul)
  - Calcular con: balance de la propiedad vs. período actual
- [ ] **3.4** Agregar botón "Nueva Transacción" en `transactions.html`
- [ ] **3.5** Crear módulo `paymentDetail` para la vista `/dashboard/payments/:id`
- [ ] **3.6** Limpiar `paymentModal` (decidir si eliminar o completar)

---

## 4. Dependencias entre Tareas

```
Capa 1 (Numeración)
├── 1.1 Contadores en Firestore
├── 1.2 Generar voucherNumber/voucherType en Transaction.create()
└── 1.3 Setear pendingAmount

Capa 2A (Servicios)
├── 2A.1 ServiceRequest.js modelo
├── 2A.2 Reparar botón "Solicitar"
└── 2A.3 serviceApproval módulo admin

Capa 2B (Pagos -> Transacciones)
├── 2B.1 PaymentNotification.approve() -> crear PAYMENT + conciliar
├── 2B.2 paymentMethod en notificación
└── 2B.3 paymentMethod en transacción

Capa 3 (UI)
├── 3.1 payment/:id vista detalle recibo
├── 3.2 Impresión de recibo (jsPDF)
├── 3.3 Estado residente en tabla
├── 3.4 Botón "Nueva Transacción"
├── 3.5 Módulo paymentDetail
└── 3.6 Limpieza paymentModal
```

**Orden sugerido de implementación:**
1. Capa 1 (sin esto nada funciona)
2. Capa 2B (pagos → transacciones es el flujo más crítico)
3. Capa 3 (UI de recibos)
4. Capa 2A (servicios — depende de tener el patrón de facturas funcionando)

---

## 5. Notas Técnicas

- **Concurrencia:** Usar `runTransaction` de Firestore para los contadores (evita duplicados)
- **Atomicidad:** Todo lo que involucre múltiples escrituras debe usar `writeBatch`
- **Voucher formatos:**
  - Factura: `FAC-YYYYMM-NNNNNN` (ej: `FAC-202607-000247`)
  - Recibo: `REC-YYYYMMDD-NNNNNN` (ej: `REC-20260715-000089`)
  - Ambos con secuencial de 6 dígitos padded
- **Secuencial manual por admin:** El administrador puede establecer un número de inicio en `appConfig.app.counters.fac` y/o `appConfig.app.counters.rec`. `_generateVoucher()` lo respeta al inicializar el contador. Si no hay valor manual, arranca en 1.
- **jsPDF** ya está importado en `propertyDetail.controller.js` — reutilizar patrón
- **No romper compatibilidad:** Los registros existentes sin voucher quedan como están, solo se genera para nuevos

---

## 6. Estrategia de Edición (skills.md)

Según los estándares del proyecto:
- Usar exclusivamente `edit` (reemplazo quirúrgico), prohibido `write` para archivos existentes
- Presentar `oldString` y `newString` al usuario antes de aplicar
- Hacer `read` del archivo antes de proponer ediciones
- SO: Windows (win32) — comandos en PowerShell
