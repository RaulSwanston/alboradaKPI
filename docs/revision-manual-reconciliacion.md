# Revisión Manual — Reconciliación de Pagos

> Registro de casos que NO se resuelven con la lógica automática y requieren decisión humana.
> Solo se escriben en Firestore los campos `appliedTo` (PAYMENT), `paidBy` (FEE), `pendingAmount` (FEE) y `overpayment` (PAYMENT). El campo `amount` es **inviolable**.

## Formato de cada caso

- **Pago:** `id`
- **Casa:** `propertyId` — dueño si se conoce
- **Monto:** `$X` (= N meses × $15)
- **Descripción:** texto original
- **Motivo de revisión:** por qué no se resolvió automático
- **Decisión:** `pendiente` | `decidido: ...` | `no tocar (cliente)`

---

## Abril 2025

### A1. `2025-04_*_PAYMENT_0` — Casa 002 (Omar Cueto)
- **Monto:** $60 (4 meses)
- **Descripción:** "BANCA MOVIL TRANSFERENCIA DE 0427120001653 DAYRA LUCILA CANALES de SWANSTON flia cueto y v" (truncada, sin meses explícitos)
- **Motivo:** `propertyId` = `*` (sin casa); descripción truncada; conflicto con el pago del 05-jun-2025 ($45, casa 002, sin meses) que se solapa si abril cubre Abr-Jul.
- **Decisión:** **NO TOCAR** — lo resolverá el cliente. No entra al batch.
- **Nota:** marzo ya cubrió Ene–Mar 2025 (pago `2025-03_2_PAYMENT_16896` en batch marzo).

### A2. `2025-04_271_PAYMENT_17078` — Casa 271 (Yolanda Eneida Loper Alabarca)
- **Monto:** $20 (cuota $15 + $5 sobrante)
- **Descripción:** "YAPPY DE YOLANDA ENEIDA LOPER ALABARCA POR mantenimiento casa 271 abril 2025"
- **Motivo:** monto no múltiplo de $15.
- **Decisión:** **decidido** — aplicar $15 al FEE `2025-04_271_FEE` + `overpayment: 5`. Patrón confirmado: Eneida tiene saldo a favor de $5 en **todos** los meses ene–abr 2025.

### Excluidos (no son cuota de mantenimiento — no se tocan)
- `2025-04_13_PAYMENT_17161` — DEPOSITO CUENTA DE AHORROS SIN LIBRETA / FLIA CEBALLOS ($30)
- `2025-04_VARIAS CASAS_PAYMENT_17071,...` — DEPOSITO CUENTA DE AHORROS DEPOSITADO POR SARALIZ (casas 59,179,285,4,116,294,57,55,334,318,246) ($360)
