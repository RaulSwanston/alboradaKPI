# Plan de Reconciliación: appliedTo ↔ paidBy (Pagos ↔ Cargos)

> **Estado:** En curso (Fase 0–2, Feb 2025 como piloto).
> **Fecha:** 5 de Agosto de 2026.

## Objetivo
Completar la vinculación histórica entre pagos de residentes (`PAYMENT`) y cargos de cuota de mantenimiento (`FEE`):
- En `PAYMENT.appliedTo` → array de `{ transactionId, amount, description }` con los cargos que cada pago cubre.
- En `FEE.paidBy` → array de `{ paymentId, amount, description }` con los pagos que cada cargo recibió.
- Decrementar `pendingAmount` de cada `FEE` (mismo comportamiento que `PaymentNotification.approve()` y `transactions-detail`).

## Alcance
- **Piloto:** Febrero 2025 (93 pagos, 358 cargos).
- **Escalado:** Marzo–Diciembre 2025 + Enero–Junio 2026 (todos los meses con FEEs ya generados).
- **NO se toca** nada más: ni montos, ni balances, ni status, ni descripciones.

## Restricciones y hallazgos clave

1. **IDs reales:** los JSONs locales (`CSV_a_JSON_pagos/*.json`) NO tienen los IDs de Firestore. Además, los primeros meses usaron IDs semánticos (`2025-02_001_FEE`) pero meses recientes usan IDs auto-generados por Firestore. → **La fuente de verdad para escritura es Firestore** (solo lectura para análisis).
2. **Fuente de los pagos:** los FEEs son estandarizados (`Cuota de Mantenimiento Area Social {Mes} {Año}`, $-15). Los PAYMENTs son texto libre del banco (YAPPY / BANCA MOVIL / ACH) con referencia a casa y/o meses.
3. **La descripción es una guía, no una verdad infalible:** puede decir "enero y febrero" con monto $15 (solo pagó uno), o decir "enero" pagando $30. Hay que validar **lógica** (monto / $15 = nº de meses) contra lo que dice la descripción.
4. **Pagos que NO son cuota de mantenimiento → excluir del cruce:**
   - Gastos del condominio: IDAAN, ENSA, "seguridad y mantenimiento", "gasto de garita", intereses, depósitos, etc. (idealmente tienen `type: EXPENSE` u `OTHER_INCOME`; si un pago sin tipo EXPENSE describe un gasto, no se toca).
   - Criterio operativo: solo pagos con `propertyId` válido y descripción de cuota de mantenimiento de residente.
5. **Pagos multi-propiedad / multi-mes:** un pago puede cubrir varios cargos (misma casa varios meses, o varias casas). La suma de `appliedTo[].amount` debería ser <= monto del pago (puede haber sobrante no aplicado).
6. **Formato de escritura (definido por la app):**
   - `appliedTo = [{ transactionId, amount, description }]` (arrays en el PAYMENT).
   - `paidBy = arrayUnion({ paymentId, amount, description })` (en el FEE).
   - `pendingAmount = max(0, actual - monto aplicado)` (en el FEE).

## Fases

| Fase | Actividad | Output |
|------|-----------|--------|
| F0 | Documentar plan | `docs/plan-reconciliacion-pagos.md`, nota en `memory.md` |
| F1 | Extraer FEEs+PAYMENTs (ventana) y `allProperties` desde Firestore (solo lectura) | `scripts/data/fees_*.json`, `payments_*.json`, `allProperties.json` |
| F2 | Parser de descripciones + reglas de cruce + niveles de confianza | `scripts/data/preview_<mes>.json` |
| F3 | Revisión del cliente de casos ambiguos | decisiones documentadas |
| F4 | Script de escritura idempotente (`--dry-run` + backup previo) | Firestore actualizado |
| F5 | Escalado por mes | meses restantes |

## Reglas de cruce (borrador)

1. **Identificar propiedad:** usar `propertyId` del pago (columna "No.Casa" del CSV) como base. Corroborar con la descripción (`casa 123`, `Casa D-04`, `Flia X`, nombre del dueño vía `allProperties.ownerInfo.name`).
2. **Identificar meses:** extraer de la descripción (enero/febrero/..., "ene y feb", "Feb-Mar-Abr"). El mes del `effectiveDate` del pago es el ancla temporal.
3. **Validar monto:** esperado = nº de meses × $15. Si el monto no cuadra con los meses dichos → marcar como **revisión manual**.
4. **Construir cruce:** cada pago → lista de `FEE` `{ propertyId, mes }` que cubre. Suma de montos aplicados <= monto del pago.
5. **Niveles de confianza:**
   - `auto` → propiedad + meses + monto cuadran perfectamente.
   - `revisar` → discrepancia en meses/monto o casa ambigua (sin casa en descripción).
   - `excluir` → gastos de condominio o pagos sin propiedad.
