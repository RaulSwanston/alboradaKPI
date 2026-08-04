# Plan de Tareas Pendientes — Backlog de Módulos

> **Estado:** T4, T1, T5, T6, T2, T8, T3 y T7 completadas. Backlog de 8 tareas cerrado.
> **Fecha:** 3 de Agosto de 2026.
> A medida que se completen las tareas pueden surgir ajustes inmediatos; este plan es la guía inicial.

---

## Orden propuesto (de más fácil a más compleja)

1. **T4 — Placeholder de notas en blanco** (trivial)
2. **T1 — Actividades recientes: cargar solo 5** (trivial)
3. **T5 — Mostrar/ocultar contraseña en signup** (fácil)
4. **T2 — Actividades recientes por rol (residents solo lo suyo)** (media)
5. **T8 — Persistencia del logo de la app (Storage → navigator)** (media)
6. **T6 — Mejorar emailVerification con imágenes** (media, requiere assets del usuario)
7. **T3 — Editar propiedades de módulos desde configManager** (compleja)
8. **T7 — "Cambiar Unidad" en el topbar** (la más compleja)

---

## T4 — Placeholder de notas en blanco ✅

**Dónde:** `public/app/modules/paymentReport/paymentReport.controller.js:38`
```js
document.getElementById('notes').placeholder = t('paymentReport.notesPlaceholder');
```
**Qué:** El cliente pidió dejar el placeholder en blanco. Basta con **no** asignarlo (eliminar la línea 38). El textarea de `paymentReport.html:88` no tiene placeholder estático, así que quedará vacío.

**Opcional:** Eliminar la clave `notesPlaceholder` de las traducciones es/en o dejarla (inofensiva). Recomendado: dejarla por si se reutiliza.

**Estado:** ✅ **Completada (3 Ago 2026).** Eliminada la asignación del placeholder y las claves `notesPlaceholder` de es/en.

---

## T1 — Actividades recientes: solo 5 ✅

**Dónde:** `public/app/modules/recentActivity/recentActivity.controller.js:15`
```js
const PAGE_SIZE = 15;
```
**Qué:** Cambiar a `const PAGE_SIZE = 5`.

**Consideración:** El botón "Cargar más actividades" (`loadMoreContainer`) sigue funcionando con paginación de a 5. Si el cliente quiere **solo 5 siempre** (sin botón), además habría que ocultar `#load-more-container` y no pasar paginación. **Preguntar al cliente** si el botón "cargar más" debe permanecer.

**Estado:** ✅ **Completada (3 Ago 2026).** `PAGE_SIZE = 5`. El cliente confirmó que el botón "Cargar más" se mantiene.

---

## T5 — Mostrar/ocultar contraseña en signup ✅

**Dónde:** `public/app/modules/signup/signup.html:18-25`
```html
<label class="form-label" for="SignUpPassword">Contraseña</label>
<div class="field">
  <input type="password" name="SignUpPassword" placeholder="******************" required />
  <svg class="icon" ...>...</svg>
</div>
```
**Qué:** Agregar un botón con icono "ojo" (eye) dentro del `.field` que alterne `input.type = 'text' | 'password'`. El layout ya es `flex-direction: row-reverse` (signup.css:25), así que el nuevo elemento se acomoda como icono adicional.

**Icono:** usar SVG local inline (regla del proyecto: sin librerías de iconos externas, skills.md). Proyecto ya usa SVG inline en `signup.html` (iconos de usuario, email, candado).

**Cambios:**
- `signup.html`: botón `<button type="button">` con SVG eye/eye-off (o un solo SVG eye que cambia a eye-off).
- `signup.controller.js`: listener `click` que togglea el `type` del input.
- `signup.css`: estilos mínimos para el botón (transparente, cursor pointer, alineado).

**Nota:** El campo usa `name="SignUpPassword"` y el submit lee `e.target["SignUpPassword"].value` (signup.controller.js:31) — no se ve afectado.

**Estado:** ✅ **Completada (3 Ago 2026).** Botón `#toggle-password` con SVG inline; ojo a la **derecha** (el `.field` usa `row-reverse`, el botón va como primer hijo); toggle de tipo + icono ojo abierto/cerrado; sin `:hover` de color (fijo en `--color-gurkha-400`).

---

## T2 — Actividades recientes por rol ✅

**Estado:** ✅ **Completada (3 Ago 2026).** Ver "Implementación T2" más abajo.

**Problema:** Hoy `recentActivity.controller.js` llama a `getRecentActivities()` (Activities.js) que trae **todas** las actividades sin filtrar. Un residente ve la actividad de otros residentes y de administradores.

**Contexto descubierto (clave):**
- La colección `activities` **ya tiene** el campo `visibility` (array de strings): `['admin']`, `['admin', userUid]`. (MembershipRequest.js:94,140,181; PaymentNotification.js:48,203; ServiceRequest.js:32,143,176; billingGenerator; servicesNew; servicesDetail.)
- `notificationsFeed.controller.js:51-71` **ya implementa** el patrón correcto:
  - Admin → `where("visibility", "array-contains", "admin")`
  - Residente → `where("visibility", "array-contains", user.uid)`
- **PERO** `Transaction.js` (create/update/delete) y otros crean actividades **sin** `visibility` → no aparecerían para nadie con el filtrado nuevo. Revisar `Transaction.js:133,173,197`, `billingGenerator.controller.js:155`, `servicesNew.controller.js:310`, `servicesDetail.controller.js:307,340`.

**Plan propuesto:**
1. **Modelo `Activities.js`:** extender `getRecentActivities(count, lastDoc, user, isAdmin)` para que arme la query según rol:
   - Admin: `where("visibility", "array-contains", "admin")` + `orderBy("timestamp","desc")` + paginación.
   - Residente: `where("visibility", "array-contains", user.uid)` + igual.
2. **Compatibilidad/backfill:** las actividades sin `visibility` (p.ej. las de Transaction) quedan invisibles con el filtro nuevo. Definir estrategia:
   - Opción A: backfill en Firestore (agregar `visibility: ['admin']` a las históricas de admin).
   - Opción B: usar `where(..., "in")`/`array-contains-any` con `['admin', user.uid]` para que admin siga viendo las que tienen `['admin']` y las sin campo no aparezcan.
   - **Nota importante:** `where("visibility","array-contains",...)` solo devuelve documentos que **tienen** el campo → las actividades sin `visibility` desaparecerán. Hay que decidir si es aceptable (feed solo muestra lo accionable) o migrar las históricas.
3. **Preguntas al cliente:** ¿El residente debe ver SOLO las actividades donde él es destinatario (`visibility: [..., uid]`)? ¿Las de su propiedad vía `target.id`? ¿Las administrativas globales (p.ej. cuota generada) no le interesan? El criterio propuesto: residente ve solo lo suyo (`array-contains uid`).

**Riesgo:** Requiere **índice compuesto** en Firestore (`visibility` array-contains + `timestamp` desc). Ya existe uno similar para notificationsFeed (ver firestore.indexes.json).

**Implementación T2 (3 Ago 2026):**
1. `Activities.js` → `getRecentActivities(count, lastDoc, visibilityKey)`: añade `where("visibility", "array-contains", visibilityKey)` cuando se pasa clave; si es null, comportamiento original (sin filtro, modo sin sesión).
2. `recentActivity.controller.js` → recibe `contexto`, calcula `visibilityKey = permissions.isAdmin ? 'admin' : (user?.uid || null)` y lo pasa al modelo.
3. `Transaction.js:133,174,199` → añadido `visibility: ['admin']` a create/update/delete (eran operaciones del admin sin visibilidad). Verificado: los demás `createActivity` (billingGenerator, servicesNew, servicesDetail, ServiceRequest, MembershipRequest, PaymentNotification) ya tenían `visibility`.
4. **Backfill Firestore:** 36 de 48 actividades históricas carecían de `visibility` (todas de Transaction.js: UPDATED/DELETED/PAYMENT_REPORTED/FEE_GENERATED). Se migraron con `visibility: ['admin']` vía script temporal. Verificado: 48/48 con visibility (44 `['admin']`, 4 `['admin', uidResidente]`). Índice compuesto ya existía en firestore.indexes.json.

---

## T8 — Persistencia del logo de la app ✅

**Estado:** ✅ **Completada (3 Ago 2026).** Ver "Implementación T8" más abajo.

**Estado actual:**
- `configManager.controller.js` ya sube el logo a Storage (`uploadLogoToFirebase`, línea 85-95) y guarda `localConfig.branding.logoUrl` con la URL remota (línea 433), luego `AppConfig.save(localConfig)` (línea 445).
- `navigator.controller.js:56-61` ya lee `config.branding.logoUrl` y lo aplica al `#nav-logo`.
- En teoría el flujo ya existe. **Pero hay un bug crítico de rutas de Firestore:**

**BUG CRÍTICO (discrepancia de colección):**
- `auth.js:16` (sessionGuard) lee la config de **`appConfig/app`**.
- `Property.js:175` y `Transaction.js:25,73` leen/escriben **`appConfig/app`**.
- **`AppConfig.js:13,31`** (`get`/`save`) usan **`_config/app`** ❌ (ruta distinta, con guion bajo).

→ **Consecuencia:** `configManager` guarda en `_config/app`, pero `sessionGuard` carga desde `appConfig/app`. La config guardada **nunca se vuelve a leer** → el logo (y todo lo demás) no persiste al recargar. Además, `firestore.rules` solo protege `appConfig/**` (firestore.rules:87); `_config` no tiene reglas → probablemente denegado o inseguro.

**Plan:**
1. **Decisión:** unificar la ruta. Recomendado: usar **`appConfig/app`** en `AppConfig.js` (es la que usan sessionGuard y el resto de modelos, y la que protegen las reglas). Eliminar el uso de `_config/app`.
2. Verificar reglas: `appConfig/**` ya permite `read` autenticado y `write` admin (firestore.rules:87-92) — correcto.
3. `configManager` guarda `localConfig` completo con merge → el logo remoto persiste.
4. Verificar en navegador: subir logo → guardar → recargar → `navigator` muestra el logo de Storage. También revisar `initLogoEvents` y el preview al cargar (configManager.controller.js:124-135) para que muestre la URL remota al reabrir.

**Pregunta:** ¿Confirmar con el cliente que el logo debe aplicarse solo al `navigator` (sidebar) o también al topbar/login? (El módulo `topbar` hoy no muestra logo; el `navigator` sí.)

**Implementación T8 (3 Ago 2026):**
1. `AppConfig.js:13,31` → ruta unificada a `appConfig/app` (antes `_config/app`). Eliminadas las referencias a `_config`.
2. Verificado en Firestore: `appConfig/app` EXISTE (solo stats), `_config/app` NO EXISTE → no hay datos que migrar; el fix es seguro.
3. Reglas `firestore.rules:87` ya protegen `appConfig/**` (read auth, write admin) — correcto.
4. Flujo del logo confirmado: `configManager` sube a Storage (`config/branding/logo_*`), guarda `branding.logoUrl` remoto vía `AppConfig.save`, `navigator.controller.js:56-61,270` aplica al `#nav-logo`, y el preview al recargar carga `branding.logoUrl` (configManager.controller.js:124-135).
5. Pendiente de verificación en navegador: subir logo → guardar → recargar (requiere sesión real).

---

## T6 — Mejorar emailVerification con imágenes ✅

**Dónde:** `public/app/modules/emailVerification/emailVerification.html` (+ .controller.js si hace falta).

**Estado actual:** Solo texto (título, lista de pasos, nota, botones "refrescar" y "reenviar"). `emailVerification.controller.js` ya maneja `reload()`, transición de rol `pending → guest`, y reenvío con cooldown de 60s.

**Plan (requiere acuerdo y assets del usuario):**
1. El usuario buscará imágenes (se las entregará). Definir layout: banner/ilustración de "bandeja de entrada" + pasos en tarjetas con íconos.
2. Mantener la lógica del controller intacta (ya está completa); solo se toca HTML/CSS (o se crea `emailVerification.css`).
3. **Regla del proyecto:** no usar librerías de iconos externas ni `!important` (skills.md); SVGs locales inline.

**Pregunta para cuando vuelva el usuario:** ¿prefiere un diseño tipo "onboarding" (pasos numerados en tarjetas con ilustración principal) o mantener la lista simple solo añadiendo un banner/ilustración arriba?

**Estado:** ✅ **Completada (3 Ago 2026).** El usuario entregó prototipo `public/src/doc/prototipado/emailVerification.html` (Tailwind/Material Symbols/Manrope). Se adaptó al design system:
- `emailVerification.html` reescrito: tarjeta centrada con icono circular de sobre (SVG inline `currentColor`), título, subtítulo, 4 pasos numerados con timeline, nota de spam con icono info, botón primario "Refrescar" (con icono) + secundario "No recibí el correo".
- `emailVerification.css` (**NUEVO**): scoped con tokens del proyecto (sin Tailwind/Material/Manrope).
- `emailVerification.controller.js`: IDs explícitos (`#btn-refresh-email`, `#btn-resend-email`); eliminada la creación dinámica del botón de reenvío; `setRefreshText()` conserva el icono del botón primario.
- **Nota:** `.auth-layout`/`.auth-content` son clases huérfanas (sin estilos); el centrado lo da `.email-verification`.
- **Fix post-rediseño:** `verify-email.html` y `account-status.html` no incluían `<!-- ::css.root -->` → sin variables `--color-*` la vista se veía sin estilos. Se agregó la directiva (ya estaba en login/signup/recovery).

---

## T3 — Editar propiedades de módulos desde configManager ✅ (parcial: fuente única)

**Estado:** ✅ **Núcleo completado (3 Ago 2026):** métodos de pago unificados en `appConfig.moduleRegistry.transactions.paymentMethods` (fuente única, texto plano). El panel de edición del admin (configManager) es trabajo futuro acordado, fuera de T3. (config dinámica por módulo)

**Objetivo:** Que el admin pueda cambiar opciones por módulo sin tocar código. Ejemplo concreto del cliente: en el reporte de pago, quitar "Tarjeta" y "Cheque" y agregar "Yappy" del dropdown de método de pago.

**Dónde están los datos hoy (hardcodeados en HTML/JS):**
- `paymentReport.html:75-82`: `<select id="paymentMethod">` con `transfer/deposit/cash/check/card/other`.
- `paymentApproval.controller.js:72-73`: mapeo `check → 'Cheque'`, `card → 'Tarjeta'` (y otros).
- `transactions-detail.html:157-160`: otro select de métodos (`YAPPY`, `CHECK`, `CARD`) — **cuidado**: es el select de edición admin, distinto del de reporte del residente. Confirmar cuál quiere configurar el cliente.

**Arquitectura propuesta (siguiendo el patrón existente):**
1. **`appConfig.js`:** agregar una sección `moduleOptions` (o `paymentMethods`):
   ```js
   moduleOptions: {
     paymentReport: {
       paymentMethods: [
         { id: 'transfer', labelKey: 'paymentReport.methods.transfer' },
         { id: 'deposit', labelKey: 'paymentReport.methods.deposit' },
         { id: 'cash',   labelKey: 'paymentReport.methods.cash' },
         { id: 'yappy',  labelKey: 'paymentReport.methods.yappy' }
       ]
     }
   }
   ```
2. **Persistencia:** el mecanismo ya existe — `contexto.data.appConfig` (auth.js) + `AppConfig.save()` (configManager). Se aprovecha la fusión nube→local.
3. **`configManager`:** nueva sección/pestaña (o dentro de "General") que renderice, por módulo registrado, una lista de opciones editables (ej: checkboxes para activar/desactivar métodos de pago). Guardado con el botón global existente.
4. **`paymentReport.controller.js`:** en vez de HTML hardcodeado, construir el `<select id="paymentMethod">` dinámicamente desde `contexto.data.appConfig.moduleOptions.paymentReport.paymentMethods`. Requiere **no usar** el `::i18n` para los `<option>` (se renderizan en JS con `t()`).
5. **`paymentApproval.controller.js`:** mapear los ids de método de forma genérica (ya usa un objeto de traducción; extenderlo con yappy).

**Riesgo:** 
- El select de `paymentReport.html` debe dejar de ser estático (opciones en JS) — es un cambio de patrón.
- La plantilla genérica de "editar opciones por módulo" es lo más complejo de diseñar. Se puede empezar acotada a `paymentReport.paymentMethods` como piloto.

**Preguntas para el cliente:**
- ¿La configuración de métodos de pago aplica al **reporte del residente** (paymentReport) o también al **select de edición del admin** (transactions-detail)?
- ¿Otras propiedades de módulos a futuro? (para dimensionar la UI genérica).

**Implementación T3 (3 Ago 2026) — decisión del cliente:**
- **Ambos** (reporte del residente y select del admin).
- Valores estándar unificados en **minúsculas (7):** `transfer`, `deposit`, `cash`, `check`, `card`, `yappy`, `other`.
- Labels como **texto plano editable** en appConfig (no i18n), para facilitar el futuro panel de edición del admin.

**Cambios:**
1. `appConfig.js` → `moduleRegistry.transactions.paymentMethods` (NUEVA, fuente única):
   `transfer/Transferencia, deposit/Depósito, cash/Efectivo, check/Cheque, card/Tarjeta, yappy/Yappy, other/Otro`.
2. `paymentReport.html` → select vacío; `paymentReport.controller.js` lo llena desde `contexto.data.appConfig.moduleRegistry.transactions.paymentMethods`.
3. `transactions-detail.html` → quitar options hardcodeadas; `transactions-detail.controller.js` llena desde la misma fuente + `legacyPaymentMap` para normalizar valores antiguos en mayúscula (`TRANSFER→transfer`, `ACH→deposit`, `YAPPY→yappy`, `DEPOSIT→deposit`, etc.).
4. `paymentApproval.controller.js` → el mapeo hardcodeado de labels se reemplaza por `paymentMethodLabels` derivado de la fuente única (+ legacy en mayúscula).
- **Pendiente (fuera de T3, trabajo futuro):** panel de edición en `configManager` para que el admin añada/edite/elimine métodos de pago.

---

## T7 — "Cambiar Unidad" en el topbar ✅

**Problema:** El botón `#btn-change-unit` existe en `topbar.html:30-33` pero **no tenía ningún listener** → estaba roto / no hacía nada.

**Contexto descubierto (clave):**
- El usuario tiene `propertyIds[]` en su doc de Firestore (`users/{uid}`), poblado por `MembershipRequest.process()`/`linkDirectly()`.
- `contexto.data.property` **se lee** en `topbar.controller.js` y `profile.controller.js`, **pero nunca se asignaba** en `sessionGuard` → siempre `undefined`. El topbar mostraba el rol ("Residente"/"Administrador"), nunca la unidad.

**Solución implementada (según decisiones del cliente):**
1. **Cambio global:** al elegir otra unidad, se guarda en `localStorage` (`gph_active_property`) y se recarga la vista actual (`window.location.reload()`). Los módulos re-leen la unidad activa al re-renderizarse.
2. **Fuente de unidades:** `users/{uid}.propertyIds` (admin y residente la tienen vía `MembershipRequest.process()`/`linkDirectly()`).
3. **Unidad activa por defecto:** la guardada en localStorage si sigue siendo válida; si no, la primera de `propertyIds`.
4. **`sessionGuard` (auth.js):** ahora asigna `contexto.data.activePropertyId` y `contexto.data.property` (doc completo vía `Property.getById`).
5. **Modal en topbar:** `#btn-change-unit` abre `#unit-modal-overlay` con la lista de unidades (loading spinner → items con la activa marcada con badge "Unidad actual"). Cierra con `#unit-modal-close`, `#unit-modal-cancel` o clic en el overlay. Selector de unidad → guarda en localStorage + `location.reload()`.
6. **i18n:** nuevas claves `topbar.*` (changeUnit, changeUnitTitle, changeUnitSubtitle, loadingUnits, noUnits, unitsError, currentUnit, cancel) en es y en.

**Preguntas resueltas por el cliente:**
- **Global** (recarga la vista actual). 
- Fuente de unidades del admin = **`users.propertyIds`**.
- Sin selector visible adicional en el topbar; basta el dropdown del menú.

---

## Hallazgo transversal (bug crítico)

**Ruta de Firestore inconsistente para la configuración global:**
- `AppConfig.js` usa **`_config/app`** (líneas 13 y 31).
- `sessionGuard` (auth.js:16), `Transaction.js:25,73` y `Property.js:175` usan **`appConfig/app`**.
- `firestore.rules:87` protege **`appConfig/**`** (nada para `_config`).

**Impacto:** Toda la configuración guardada por `configManager` (incluido el logo de la T8) se escribe en `_config/app`, que **nunca se lee** y **no está protegida por reglas**. La T8 no funcionará correctamente sin corregir esto. **Se unifica a `appConfig/app`.**

---

## Archivos clave por tarea

| Tarea | Archivos |
|-------|----------|
| T4 ✅ | `modules/paymentReport/paymentReport.controller.js` |
| T1 ✅ | `modules/recentActivity/recentActivity.controller.js` |
| T5 ✅ | `modules/signup/signup.html`, `signup.controller.js`, `signup.css` |
| T2 ✅ | `models/Activities.js`, `modules/recentActivity/recentActivity.controller.js`, `firestore.indexes.json` (probable índice), backfill en Firestore |
| T8 ✅ | `models/AppConfig.js` (fix ruta), `core/firebase.js`?, `modules/configManager/*`, `modules/navigator/navigator.controller.js` |
| T6 ✅ | `modules/emailVerification/emailVerification.html`, `emailVerification.css` (nuevo), `emailVerification.controller.js` |
| T3 ✅ | `core/appConfig.js`, `modules/paymentReport/paymentReport.html|.controller.js`, `modules/paymentApproval/paymentApproval.controller.js`, `modules/transactions-detail/*` |
| T7 ✅ | `middleware/auth.js`, `modules/topbar/*` (html, controller, css), `core/lang/es|en/translations.json` |

---

## Preguntas abiertas para el usuario

1. **T1:** ¿El botón "Cargar más actividades" se mantiene (paginación de a 5) o se elimina (solo 5 siempre)? (Mantenido: paginación de a 5.)
2. **T2:** ✅ Resuelta: residente ve solo lo suyo (`array-contains uid`); histórico migrado a `['admin']`.
3. **T3:** ✅ Resuelta: aplica a ambos selects; valores en minúscula (7); labels en texto plano. Panel de edición en configManager = trabajo futuro.
4. **T7:** ¿El cambio de unidad es global o solo topbar? ¿La fuente de unidades del admin es `users.propertyIds`? ¿Hace falta selector visible además del dropdown?
5. **T8:** ¿El logo aplica solo al sidebar (navigator) o también a topbar/login?
6. **T6:** ✅ Completada (prototipo adaptado a design system).
