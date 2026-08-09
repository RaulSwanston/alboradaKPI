# Memoria de Sesiones - Bitácora de Proyecto

## 📌 RETOMA AQUÍ (última sesión: 8 de Agosto de 2026)

**Estado:** Sesión de UI del dashboard. Grid de 2 columnas en dashboard, headers de módulos homologados al estilo calendar, ajustes de tarjetas de actividad reciente. **Pendiente de verificación en navegador.**

### Resumen de cambios
- **DPA (Contrato de Encargo de Tratamiento de Datos):** Creado `public/src/doc/legal/contrato-encargo-tratamiento-datos.md` — Ley 81 de 2019 + Decreto Ejecutivo 285 de 2021 (Panamá), adaptado a la arquitectura real (Firebase/Firestore/Auth/Storage). Roles: Condominio=Responsable, empresa operadora=Encargado, Google=subencargado. Completo con Anexos I (datos/finalidad), II (medidas seguridad), III (subencargados). Contiene placeholders `[corchetes]` para completar. Pendiente revisión por abogado.
- **Grid dashboard (`root.css:321-332`):** `[data-content="dashboard"] { display:grid; gap:2rem; grid-template-columns: 1fr; }` + `@media (min-width:992px) { repeat(2, 1fr) }`. Aplica a TODAS las vistas dashboard (comparten el `data-content`); config.html (header) y transactions podrían requerir ajuste (`grid-column: 1/-1`).
- **`financialSummary.css`:** `.financial-summary-module { grid-column: 1 / -1 }` (ocupa toda la fila).
- **`quickActions.css`:** `.quick-actions-module { grid-column: 1 / -1 }`.
- **Headers de módulos homologados al estilo calendar** (header en columna, gap .25rem, título 1.5rem/800/`--color-text-primary`, subtítulo .875rem/`--color-text-secondary`):
  - `financialSummary.html` + `.fs-subtitle` (`.fs-header` ahora columna).
  - `quickActions.html` + `.qa-header`/`.qa-subtitle`; `.qa-title` pasó de uppercase .875rem a 1.5rem/800.
  - `recentActivity.html` — título migrado de texto hardcodeado "Actividad Reciente" a `::i18n.recentActivity.title` + `.recent-activity-subtitle`.
- **i18n (es/en):** nuevas claves `subtitle` en `financialSummary`, `quickActions`, `recentActivity`. En `en` se creó el bloque `quickActions` (antes no existía → mostraba clave cruda). JSON validado con `node -e JSON.parse`.
- **Tarjetas actividad reciente (`recentActivity.css`):**
  - Fondo de `.activity-card`: `var(--color-surface)` → `#ffffff`.
  - `.activity-card-left { flex: 3 1 0; min-width: 0 }` (3/4) y `.activity-card-right { flex: 1 1 0 }` (1/4) — misma fila. Se descartó el wrapper `.activity-card-inner` (lo probamos y el usuario lo eliminó manualmente; quedó huérfana la clase en CSS, pendiente de limpiar).
  - **Nota UX:** `text-align: right` no mueve el ojo (contenedor flex); se requiere `justify-content: flex-end` en `.activity-card-right` para alinear el eye a la derecha. Aún no confirmado si se aplicó.
- **Borde interno del calendario:** viene del tema schedule-x (`--sx-border: 1px solid var(--sx-color-outline-variant)`): `#c4c7c5` claro / `#444746` oscuro. El `.calendar-module-container` no tiene borde propio.

### Pendiente
- Limpiar `.activity-card-inner` huérfano en `recentActivity.css` (si aplica tras la edición manual).
- Aplicar/verificar `justify-content: flex-end` en `.activity-card-right`.
- Verificar en navegador: grid 2 columnas escritorio, headers de módulos, tarjetas de actividad con eye alineado a la derecha.
- Revisar si `config.html` (header) y otras vistas dashboard necesitan `grid-column: 1 / -1`.

---

## Entrada previa: 6-7 de Agosto de 2026

**Estado:** Reconciliación de pagos (F1–F3/F4 del plan `docs/plan-reconciliacion-pagos.md`) avanzada. Procesados y **aplicados a Firestore**: Feb 2025 (histórico), **Marzo y Abril 2025**. Pendiente: **enero 2025** y mayo 2025 → junio 2026.

### Flujo de trabajo (todo local en `scripts/`)
1. `analyze_month.js <periodo>` — lee `scripts/data/allTransactions_2025-01_2026-06.json`, cruza PAYMENT↔FEE por descripción, genera `data/reconcile/<periodo>.json` (auto/revisar/excluir/yaReconciliado/extra).
2. `build_write_batch_month.js <periodo>` — genera `data/reconcile/write_batch_<periodo>.json` (paymentUpdates con appliedTo+overpayment, feeUpdates con paidBy+pendingAmount).
3. `apply_reconciliation_month.js <periodo> --commit` — escribe a Firestore en lotes de 400, con retry ante cuota (código 8/14). Sin `--commit` = dry-run. **Usa el snapshot local, sin lecturas a Firestore.**

### Decisiones y hallazgos de esta sesión
- **Campos de escritura (únicos, el resto intacto):** PAYMENT → `appliedTo` + `overpayment` (raíz, no `metadata.excessAmount`); FEE → `paidBy` + `pendingAmount`. El campo `amount` es **inviolable**.
- **`overpayment` raíz:** decisión del cliente. Se cambió `PaymentNotification.js:166` (era `metadata.excessAmount`) a `overpayment: notif.excessAmount || 0` a nivel raíz de la transacción. `excessAmount` sigue viviendo en `paymentNotifications`.
- **Acumulación de estado local:** `scripts/lib/accumulated_state.js` — `applyPriorBatches(all, targetPeriod)` aplica en memoria los batches de meses anteriores (que aun no están en Firestore) para que la regla "hacia atrás" y `pendingAmount` reflejen el estado real. Integrado en `analyze_month.js` y `build_write_batch_month.js`.
- **Extras por periodo:** bug corregido — los `EXTRA_PAYMENT_UPDATES` (ajustes de pagos de otros periodos) estaban hardcodeados y se filtraban a **todos** los meses. Ahora `EXTRA_PAYMENT_UPDATES_BY_PERIOD[periodo]` (solo marzo tiene).
- **`MANUAL_EXCLUDE`** (pag. no tocar por decisión humana) y **`MANUAL_OVERRIDES_2025_04`** (overrides por mes vía `Object.assign`).
- **Casa 271 (Eneida):** patrón confirmado — paga $20 por cuota de $15 → **$5 overpayment en todos los meses** (ene–abr). Overrides en feb/mar/abr.
- **Caso D-01 (Dayra Flores):** corrección aplicada a Firestore vía `scripts/correct_d01.js` — el pago `2025-02_D-01_PAYMENT_16810` ($45) quedó cubriendo **Ene+Feb+Mar** (antes Feb+Mar+Abr) y el de marzo `17046` ($30) cubre **Abr+May**. Sin doble pago.

### Subido a Firestore (sesión 6-7 ago)
- Corrección D-01 (3 docs).
- Batch **marzo 2025**: 665 ops (232 pagos + 436 fees), $6,725 aplicado.
- Batch **abril 2025**: 356 ops (144 pagos + 212 fees), $3,225 aplicado + $5 overpayment (271).
- Sin tocar (revisión manual, `docs/revision-manual-reconciliacion.md`): pago Cueto `2025-04_*_PAYMENT_0` ($60, casa 002) y depósitos de cuenta de ahorros.

### Estado real Firestore (FEEs con paidBy / total 358 por mes)
- Ene 2025: 145 — **resuelto** (no hay pagos con periodo 2025-01; los que cubren enero están registrados en feb/mar y ya reconciliados)
- Feb 2025: 226
- Mar 2025: 205
- Abr 2025: 126

### Pendiente
- Procesar **mayo → junio 2026** mes por mes con revisión humana. Enero/feb/mar/abr ya están reconciliados.
- Mantener `docs/revision-manual-reconciliacion.md` con los casos manuales.

**Convenciones recordar (AGENTS.md):** staging selectivo (nunca `git add .`), push a `github main` (existe `gitlab` como alternativo), secretos excluidos por `.gitignore`, sintaxis JS validada con `node --check` como `.mjs`. `scripts/` está en `.gitignore` (no se commitea).

---

## Entrada previa: 4 de Agosto de 2026

**Estado global:** Backlog de 8 tareas del plan **CERRADO y commiteado** (commit `cdd62d3` pusheado a `github main`). T4, T1, T5, T6, T2, T8, T3 y T7 completadas.

**Último trabajo (T7 — Cambiar Unidad en topbar):**
- `auth.js` sessionGuard asigna `contexto.data.activePropertyId` y `contexto.data.property` (fix del hallazgo histórico: antes siempre `undefined`).
- Modal en topbar (`topbar.html` + `topbar.controller.js` + `topbar.css`): lista de unidades desde `users.propertyIds` vía `Property.getById`, selección → `localStorage('gph_active_property')` + `window.location.reload()` (cambio global).
- i18n `topbar.*` completada en es/en (el bloque `en` estaba incompleto).
- Estilos con tokens del design system; patrón `[hidden] { display:none }` especificidad 0,2,0 (como calendar) + `body.modal-open { overflow:hidden }`.

**Verificaciones pendientes (requieren sesión real en navegador):**
1. Modal "Cambiar Unidad": abrir dropdown → Cambiar Unidad → seleccionar → recarga con unidad activa.
2. Logo (T8): subir → guardar → recargar (configManager Storage `config/branding/logo_*` → `branding.logoUrl` → navigator `#nav-logo`).
3. Configuración Firebase pendiente del cliente: CORS Storage + AppCheck `exchangeDebugToken 403` (el cliente decidió no hacerla por ahora).

**Trabajo futuro (fuera del backlog):**
- Panel de edición de métodos de pago en configManager (origen en T3).
- Vista `/dashboard/payments/:id` (ruta registrada, sin vista).
- Dashboard de resumen financiero para el residente.
- Migración de traducciones a `modules.*` (i18n.1–i18n.5).
- Pruebas funcionales en emulador.
- Reconciliación de datos históricos (cargos sin `pendingAmount`).
- Integración Cloudflare (email u otros servicios).

**Convenciones recordar (AGENTS.md):** staging selectivo (nunca `git add .`), push a `github main` (existe `gitlab` como alternativo), secretos excluidos por `.gitignore`, sintaxis JS validada con `node --check` como `.mjs`.

---

## Entrada: 3 de Agosto de 2026 (parte 2)
**Estado:** T4, T1 y T5 ejecutadas. T6 (emailVerification) rediseñada siguiendo el prototipo del usuario, adaptada al design system.

### Fix topbar (desborde horizontal en vista emailVerification):
- **Bug:** el `.topbar` usaba un truco full-bleed (`margin: -1.5rem; width: calc(100% + 3rem)`) para romper el `padding: 1.5rem` de `#app-view` (navigator.css en desktop). En las vistas auth (verify-email/account-status, `theme.simple` sin navigator.css) ese padding no existe → el topbar desbordaba 24px por lado → scroll horizontal.
- **Causa adicional:** `topbar.css` usaba 10 variables inexistentes en root.css (`--card-border`, `--bg-canvas`, `--text-primary`, `--text-secondary`, `--input-border`, `--input-focus-border`, `--text-link`, `--bg-hero`, `--error`, `--solid-pink-50`) → bordes/fondos sin resolver.
- **Fix (opción elegida por el usuario: "ancho normal + border en el contenido"):** quitar el full-bleed (margen negativo + width calc) → `width: 100%`; reemplazar todas las variables rotas por las del design system (`--color-border`, `--color-gurkha-100/200`, `--color-text-primary/secondary`, `--color-kaitoke-green-500/600`, `--color-error`, `--color-solid-pink-50`).
- **Verificado con render headless:** en auth y dashboard (420px) el topbar ocupa `0→420` sin desborde (scrollWidth = viewport); en desktop dashboard queda contenido dentro del sidebar (260px) + padding (nuevo comportamiento).

### Fix posterior (apariencia del emailVerification):
- **Bug:** la vista se veía sin estilos porque **`root.css` no se cargaba** en las vistas auth `verify-email.html` y `account-status.html` (usaban `::theme.simple` pero **sin** la directiva `<!-- ::css.root -->` que sí tienen login/signup/recovery). Sin root.css, las variables `--color-*` y `--button-principal-background` no existen → el CSS del módulo no aplicaba colores.
- **Fix:** se agregó `<!-- ::css.root -->` a `verify-email.html` y `account-status.html`.
- **Verificado con render headless (Chromium vía playwright-core en /tmp/opencode):** las variables de root.css resuelven (kaitoke-green-500 `#28bf63`, `--button-principal-background` `#197c40`), y el módulo se ve correcto (tarjeta gurkha-50/borde gurkha-300/radius 12px/480px, pasos con número verde, nota gurkha-100, botones primario `#197c40` y secundario gurkha-100).
- **Nota:** el modelo de trabajo no soporta entrada de imágenes (no se puede revisar screenshot).

### Resumen de cambios:
- **T4 (placeholder notas en blanco):** Eliminada la asignación del placeholder en `paymentReport.controller.js`; eliminadas claves `notesPlaceholder` de `es/translations.json:212` y `en/translations.json:238`. `t()` sigue en uso (22 usos) → import intacto.
- **T1 (5 actividades recientes):** `recentActivity.controller.js:15`: `PAGE_SIZE = 15` → `5`. El botón "Cargar más" se mantiene (decisión del usuario), paginando de a 5.
- **T5 (toggle ojo en signup):** `signup.html` botón `#toggle-password` con SVG inline; `signup.controller.js` alterna `password↔text` + icono ojo abierto/cerrado + aria-label; `signup.css` estilos `.password-toggle`. Ajustes: ojo a la DERECHA reordenando el DOM (`.field` usa `flex-direction: row-reverse`, primer hijo = botón) y eliminado `&:hover` verde (queda fijo en `--color-gurkha-400`).
- **T6 (emailVerification):**
  - `emailVerification.html`: Reesecrito como tarjeta centrada — icono circular de sobre (SVG inline `currentColor`), título, subtítulo, 4 pasos numerados con timeline, nota de spam con icono info, botón primario "Refrescar" (con icono refresh) + botón secundario "No recibí el correo".
  - `emailVerification.css` (**NUEVO**): Estilos scoped con tokens del proyecto (`--color-surface`, `--color-border`, `--button-principal-background`, `--color-gurkha-*`, `--color-kaitoke-green-*`). Sin Tailwind/Material Symbols/Manrope del prototipo.
  - `emailVerification.controller.js`: Actualizado a IDs explícitos (`#btn-refresh-email`, `#btn-resend-email`); eliminada la creación dinámica del botón de reenvío (ya está en el HTML); `setRefreshText()` actualiza solo el `.ev-btn-label` para conservar el icono SVG del botón primario.
- **Nota:** `.auth-layout`/`.auth-content` de las vistas auth (verify-email, account-status) NO tienen estilos definidos en ningún CSS — clase huérfana. El centrado ahora lo da `.email-verification` (flex + min-height 100dvh).

### Verificación:
- Sintaxis del controller OK (validada como ES module).
- HTTP 200 para html, css y controller del módulo en hosting local.

### Pendiente (backlog):
- T2 (filtrado por `visibility` en `getRecentActivities`), T3 (método de pago: una sola fuente para los selects de paymentReport y transactions-detail), T8 (persistencia del logo — bloqueado por bug `_config/app` vs `appConfig/app`), T7 (cambiar unidad).

---

## Entrada: 3 de Agosto de 2026 (T2 + T8 completadas)
**Estado:** T2 (actividades por rol) y T8 (persistencia del logo) completadas. Correcciones de estilos de account-status y limpieza de residuos en root.css. Pendientes: T3, T7.

### Resumen de cambios:
- **Fix estilos account-status (punto 1 del usuario):** NUEVO `public/src/css/auth/account-status.css` (card blanca, `margin: 4rem auto`, max-width 30rem, radius .75rem, shadow `0 .5rem 1.5rem rgba(31,31,20,0.1)`, `.btn-primary` estilo kit) + `<!-- ::css.auth.account-status -->` en `account-status.html`.
- **Fix residuos root.css (punto 2 del usuario):** eliminados `.sectionView.dashboard #emailVerified` y `.nota` de `public/src/css/root.css` (estilos huérfanos de una iteración previa de emailVerification). Verificado sin usos (grep → 0).
- **T2 (actividades recientes por rol):**
  - `Activities.js`: `getRecentActivities(count, lastDoc, visibilityKey)` → añade `where("visibility", "array-contains", visibilityKey)` cuando se pasa (patrón de notificationsFeed: admin='admin', residente=uid). Sin clave = comportamiento original.
  - `recentActivity.controller.js`: recibe `contexto`, `visibilityKey = permissions.isAdmin ? 'admin' : (user?.uid || null)`.
  - `Transaction.js:133,174,199`: añadido `visibility: ['admin']` a create/update/delete.
  - **Backfill Firestore:** 36 de 48 actividades históricas sin `visibility` migradas a `['admin']` (script temporal en /tmp, fuera del repo). Verificado 48/48 con visibility (44 `['admin']`, 4 `['admin', uid]`). Índice compuesto ya existía.
- **T8 (persistencia del logo):**
  - `AppConfig.js:13,31`: ruta unificada `_config/app` → `appConfig/app`. Verificado en Firestore que `_config/app` no existe (sin migración de datos) y `appConfig/app` sí.
  - Flujo confirmado: configManager (Storage `config/branding/logo_*` → `branding.logoUrl` → `AppConfig.save`) → navigator.controller.js:56-61,270 aplica a `#nav-logo`; preview al recargar usa `branding.logoUrl`.

### Verificación:
- Sintaxis OK (node --check como .mjs) para Activities.js, Transaction.js, recentActivity.controller.js y AppConfig.js.
- Firestore verificado vía Admin SDK (solo lectura + backfill): distribución de `visibility` final correcta.

### Pendiente (backlog):
- T3 (método de pago: una sola fuente para selects de paymentReport y transactions-detail) y T7 (cambiar unidad, `contexto.data.property` nunca asignado).
- Verificación en navegador del logo (subir → guardar → recargar) requiere sesión real.

---

## Entrada: 3 de Agosto de 2026 (T3 completada)
**Estado:** T3 (método de pago: fuente única) completada según decisión del cliente. Pendiente solo T7.

### Resumen de cambios (T3):
- **`appConfig.js`:** NUEVA `moduleRegistry.transactions.paymentMethods` — fuente única con 7 métodos en minúsculas y labels en texto plano: `transfer/Transferencia, deposit/Depósito, cash/Efectivo, check/Cheque, card/Tarjeta, yappy/Yappy, other/Otro`. La fusión nube→local de sessionGuard (auth.js:20) la preserva (el doc Firestore solo tiene `stats`).
- **`paymentReport.html`:** select vacío (sin `<option>` hardcodeadas). `paymentReport.controller.js` lo llena desde `contexto.data.appConfig.moduleRegistry.transactions.paymentMethods`.
- **`transactions-detail.html`:** quitadas las 8 `<option>` hardcodeadas (eran en MAYÚSCULA: TRANSFER/ACH/YAPPY/...). `transactions-detail.controller.js` llena desde la misma fuente + `legacyPaymentMap` para normalizar valores antiguos guardados en mayúscula.
- **`paymentApproval.controller.js`:** el objeto hardcodeado de labels se reemplaza por `paymentMethodLabels` derivado de la fuente única (+ `legacyPaymentMap`).
- **Decisión del cliente:** aplica a ambos selects (residente y admin); valores minúsculas; labels texto plano (para futuro panel de edición del admin en configManager, fuera de T3).

### Verificación:
- Sintaxis OK (node --check) de appConfig.js, paymentReport/transactions-detail/paymentApproval controllers.

### Pendiente (backlog):
- **T7** (cambiar unidad: `#btn-change-unit` sin listener, `contexto.data.property` nunca asignado en sessionGuard).
- Trabajo futuro (fuera de T3): panel de edición de métodos de pago en configManager.
- Verificación en navegador del logo (T8) requiere sesión real.

## Entrada: 4 de Agosto de 2026 (T7 completada)
**Estado:** Backlog de 8 tareas del plan cerrado (T4, T1, T5, T6, T2, T8, T3, T7 todas completadas).

### Resumen de cambios (T7 — "Cambiar Unidad"):
- **Decisiones del cliente:** (1) cambio de unidad **global** (recarga la vista actual vía `window.location.reload()` tras setear localStorage); (2) fuente de unidades = `users/{uid}.propertyIds` (admin y residente la tienen vía `MembershipRequest.process()`/`linkDirectly()`); (3) unidad activa por defecto = la guardada en `gph_active_property` si sigue siendo válida, si no la **primera** de `propertyIds`; (4) sin selector visible adicional, basta el dropdown del menú.
- **`middleware/auth.js`:** sessionGuard ahora asigna `contexto.data.activePropertyId` (línea 84) y `contexto.data.property` (doc completo vía `Property.getById`, líneas 86-96). Fix del hallazgo histórico: `contexto.data.property` ya no es `undefined`.
- **`topbar.controller.js`:** agregado listener de `#btn-change-unit` + lógica completa del modal — `openUnitModal()` (cierra menús, quita `hidden`, `body.modal-open`, render), `renderUnitList()` (spinner → `Property.getById` por cada `propertyIds` → items con clase `is-active` y badge "Unidad actual"; maneja vacío y error), `selectUnit()` (guarda en localStorage + `location.reload()`), cierre con `#unit-modal-close`, `#unit-modal-cancel` y clic en overlay. Limpieza de listeners en el cleanup. Eliminada variable muerta `isCurrent`.
- **`topbar.html`:** la modal `#unit-modal-overlay` ya existía (título, subtítulo, lista con spinner, footer cancel); no requirió cambios.
- **`topbar.css`:** estilos del modal (`.unit-modal-overlay`, `.unit-modal`, header/close, subtítulo, lista, item con badge/arrow, loading spinner, empty, footer/cancel) con tokens del design system (`--color-gurkha-*`, `--color-kaitoke-green-*`, `--color-text-*`, `--color-primary`). Regla `.unit-modal-overlay[hidden] { display:none }` (especificidad 0,2,0 — mismo patrón que calendar) para que `hidden` gane a `display:flex`. `body.modal-open { overflow:hidden }` para bloquear scroll de fondo. Spinner scoped (`.unit-modal-loading .spinner-small`) para no depender del CSS de otro módulo.
- **i18n:** nuevas claves `topbar.*` en es y en: changeUnit, changeUnitTitle, changeUnitSubtitle, loadingUnits, noUnits, unitsError, currentUnit, cancel (el bloque `en` de topbar estaba incompleto — solo `systemSettings`; se completó con todas las claves existentes + las nuevas).
- **`docs/plan-tareas-pendientes.md`:** T7 marcada ✅, estado del backlog actualizado, tabla de archivos actualizada.

### Verificación:
- Sintaxis OK (node --check como .mjs) de auth.js y topbar.controller.js; JSON de translations válido en es/en; balance de llaves CSS OK.

### Pendiente:
- Verificación en navegador del modal (sesión real): abrir dropdown → Cambiar Unidad → seleccionar unidad → recarga con la unidad activa.
- Verificación en navegador del logo (T8) y la configuración Firebase (CORS Storage + AppCheck exchangeDebugToken 403) — el cliente decidió no configurar por ahora.

## Entrada: 3 de Agosto de 2026
**Estado:** Backlog de 8 tareas pendientes analizado y documentado. Modal del calendario finalizado con animaciones de entrada/salida suaves.

### Resumen de cambios:
- **Modal del calendario (calendar):**
  - Fix `::i18n` en atributo `placeholder` (docs/skills.md: Mosaic no lo procesa en atributos). Se setea vía `t()` en el controller (`calendar.controller.js`).
  - Fix cascada CSS: `.calendar-modal-overlay.hidden { display:none }` (especificidad 0,2,0) para que `hidden` gane a `display:flex` del overlay (root.css:183 tenía igual especificidad y perdía por orden de inyección). servicesNew lo resolvía con `!important` (viola estándar).
  - Animaciones de entrada (`calendar-fade-in` + `calendar-slide-up`) y salida (`calendar-fade-out` + `calendar-slide-down` con clase `.closing` + `setTimeout` 250ms en `closeEventModal`). Se maneja re-apertura durante cierre (clearTimeout + remove `.closing` en `openEventModal`).
- **`docs/plan-tareas-pendientes.md` (NUEVO):** Backlog de 8 tareas analizado en detalle con orden tentativo de más fácil a más compleja (T4 → T1 → T5 → T2 → T8 → T6 → T3 → T7).

### Hallazgo crítico (bug transversal):
- **Ruta Firestore inconsistente para configuración global:** `AppConfig.js` usa `_config/app` pero `sessionGuard` (auth.js:16), `Transaction.js` y `Property.js` usan `appConfig/app`. `firestore.rules:87` solo protege `appConfig/**`. → La config guardada por configManager (incluido el logo, T8) se escribe en `_config/app` que nunca se lee y no está protegida. **Fix:** unificar a `appConfig/app`.
- `contexto.data.property` se lee en topbar/profile pero **nunca se asigna** en ningún middleware → siempre undefined. Base para la T7 (Cambiar Unidad).
- `#btn-change-unit` en topbar.html **no tiene listener** → enlace roto (T7).
- Las actividades `activities` ya tienen campo `visibility` y notificationsFeed ya filtra por él; `getRecentActivities` (T2) aún no.
- El select de métodos de pago está hardcodeado en `paymentReport.html:75-82`; hay otro distinto en `transactions-detail.html:157-160` (T3).

### Verificación:
- Sintaxis y grafo de imports del calendar.controller.js OK tras los cambios.
- Claves i18n de calendar verificadas en es/en.

### Pendiente (backlog):
- Ver docs/plan-tareas-pendientes.md. Empezar por T4 (placeholder notas en blanco) y T1 (5 actividades recientes).

---

## Entrada: 1 de Agosto de 2026
**Estado:** Integración local de schedule-x (calendario) sin npm + módulo `calendar` + i18n.

### Resumen de cambios:
- **Librería vendored (sin npm):** Descargados 17 archivos a `public/src/libs/schedule-x/`:
  - `@schedule-x/calendar@4.6.1` (ESM `dist/core.js`), `@schedule-x/theme-default@4.6.1` (`dist/index.css`), `preact@10.29.7`, `@preact/signals@2.3.0`, `@preact/signals-core@1.12.0`, `temporal-polyfill@0.3.0`.
- **Import map en `public/index.html`:** 7 mapeos (preact, preact/hooks, preact/jsx-runtime, preact/compat, @preact/signals, @preact/signals-core, temporal-polyfill/global). Debe ir en `index.html`: Mosaic solo extrae `body.innerHTML`, los scripts inyectados por `innerHTML` no se ejecutan, y el import map tiene que preceder al primer fetch de módulo.
- **Nuevo módulo `calendar`** (`app/modules/calendar/`): html + css + controller. **Aún no enlazado a ninguna vista** (decisión del usuario).
  - `calendar.controller.js`: `import 'temporal-polyfill/global'` PRIMERO (define `Temporal`/`Intl.DateTimeFormat` en globalThis), luego `createCalendar` desde `../../../src/libs/schedule-x/calendar/dist/core.js`. API pública: `render(el)`, `destroy()`, `setTheme()`, `getTheme()`, `events.getAll()/add()/remove()/update()`.
  - `calendar.css`: tema cargado vía `@import url("/src/libs/schedule-x/theme-default/dist/index.css")` al inicio (RenderView deduplica; usa variables `--sx-*`, sin conflicto con `--color-*`).
- **i18n:** Claves `modules.calendar.*` (title, subtitle, sampleEvent, sampleEventDescription) en `es` y `en` (convención existente: los otros 18 idiomas tienen `modules` vacío; la app no tiene fallback automático → muestra la clave cruda).

### Descubrimientos/Decisiones:
- **schedule-x v4 exige objetos Temporal** para `start`/`end` (`validateEvents` lanza error con strings ISO, `core.js:6131`). El controlador convierte con `Temporal.ZonedDateTime`.
- Exports reales de `core.js`: `createCalendar`, `createViewMonthGrid`, `createViewWeek`, `createViewDay`, `createViewMonthAgenda`, `createViewWeekAgenda`, `createViewList`, helpers `toDateString`/`toDateTimeString`/`toJSDate`/`toTimeString`.
- El core bundlea traducciones nativas del UI (`esES`, `ptBR`, etc.) → `locale: 'es-ES'` funciona sin paquete extra.

### Verificación:
- Grafo de imports probado en Node con shim espejo del import map: `createCalendar` → `CalendarApp`, evento normalizado en `America/Panama`.
- Smoke test HTTP 200: módulo, tema, core.js, global.esm.js, translations.
- JSON de translations válido en es/en.

### Pendiente:
- Enlazar el módulo `calendar` a una vista/receta (`::module.calendar` + appConfig viewLayouts/allowedModules + ruta en router) cuando se decida.

---

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

- **Fix CSS scoping — floating labels leak a residencyRequest:**
  - `profile.css`: Selectores `.profile-module .form-label`, `.form-input`, `.form-group` cambiados a `.profile-form .*` para evitar que `position: absolute` y paddings de floating labels se filtren al módulo `residencyRequest` (insertado dentro de `.profile-module`).
  - El label "Buscar mi Casa / Unidad" y el input de búsqueda ahora mantienen su layout flex nativo sin herencia no deseada.

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
