eres genial
---

# Directrices del Proyecto: Gestión de Pagos de Condominio

Este documento resume el entendimiento actual sobre los objetivos y la estrategia de desarrollo para la aplicación.

## 1. Objetivo Principal de la Aplicación

- Construir una aplicación web (SPA - Single Page Application) para que los residentes de un condominio puedan gestionar y consultar sus pagos correspondientes al mantenimiento de las áreas sociales.
- La funcionalidad clave es permitir a cada residente ver su historial de pagos y cualquier saldo pendiente.

## 2. Stack Tecnológico

- **Backend as a Service (BaaS):** Google Firebase.
- **Base de Datos:** Cloud Firestore (para almacenar información de usuarios, pagos, etc.).
- **Autenticación:** Firebase Authentication (para gestionar el inicio de sesión de los residentes).
- **Almacenamiento:** Firebase Storage (para alojar archivos como comprobantes de pago en imagen, si es necesario).
- **Hosting:** Firebase Hosting (para desplegar la aplicación web).
- **Infraestructura Adicional:** Cloudflare (potencialmente para funciones serverless como BFF o seguridad avanzada).

## 3. Principios de Seguridad y Desarrollo

- **Claves de Cliente Públicas:** Se asume que la configuración de Firebase del lado del cliente (`firebaseConfig`) es pública y visible en el navegador. La seguridad no dependerá de ocultar estas claves.
- **Seguridad Basada en Backend:** La protección de los datos se implementará en los servidores de Firebase mediante:
    - **Autenticación Obligatoria:** Solo los usuarios autenticados podrán interactuar con los datos.
    - **Gestión de Roles Segura (Custom Claims):** Los roles de usuario (ej: "admin") no se gestionan en la base de datos, sino a través de **Custom Claims** de Firebase Authentication. Estos claims se asignan desde un entorno seguro (como una Cloud Function o usando el Admin SDK) y se integran en el token de autenticación del usuario. Esto previene que un usuario pueda auto-asignarse privilegios elevados.
    - **Reglas de Seguridad (Security Rules):** Se definirán reglas estrictas en Firestore y Storage para asegurar que un usuario solo pueda acceder y modificar su propia información, basándose en sus Custom Claims (ej: `request.auth.token.admin == true`).
    - **App Check:** Se habilitará para garantizar que las solicitudes provengan exclusivamente de la aplicación web autorizada.

---

## 4. Hoja de Ruta del Producto (Phased Approach)

Se ha acordado seguir un enfoque de desarrollo por fases para asegurar la entrega de valor de forma incremental y mantener el foco en el objetivo principal.

### Fase 1: Producto Mínimo Viable (MVP) - "Mi Estado de Cuenta"

El objetivo de la primera versión es resolver el problema central del residente: conocer su situación financiera con el condominio.

- **Funcionalidades Clave:**
    1.  **Autenticación de Residentes:** Registro e inicio de sesión.
    2.  **Dashboard del Residente:** Una vista única y clara que muestra:
        - Saldo actual (pendiente o a favor).
        - Historial de pagos realizados.
        - Lista de cuotas de mantenimiento pendientes.

### Fases Futuras (Visión a Largo Plazo)

Una vez que el MVP sea sólido, se podrán incorporar las funcionalidades investigadas en el "brief", siguiendo un orden lógico:

- **Fase 2 (Administración):** Herramientas para el administrador (gestión de egresos, reportes financieros, etc.).
- **Fase 3 (Operaciones):** Gestión de mantenimiento, solicitudes de residentes, etc.
- **Fase 4 (Comunidad):** Reserva de áreas comunes, muro de noticias, gestión de visitas.
- **Fase 5 (Seguridad):** Control de acceso avanzado e integraciones.

---

## 5. Modelo de Funcionamiento y Flujos Clave

La aplicación ha evolucionado de un simple gestor de cobros a una **plataforma de servicios para el residente**, con dos interfaces de usuario distintas y flujos de trabajo definidos.

### El Rol del Administrador (Panel de Control)
El administrador tiene control total sobre la lógica de negocio del condominio a través de un panel de control privado. Sus funciones principales son:
- **Gestión de Conceptos de Cargo:** Definir todos los servicios, cuotas o multas que existen en el condominio (ej: "Cuota de Mantenimiento", "Reserva de Salón"). Esto incluye establecer montos por defecto y si son recurrentes o si pueden ser solicitados por los residentes.
- **Aprobación de Solicitudes:** Revisar y gestionar las solicitudes de servicios que los residentes inician desde su portal.
- **Generación de Cargos Manuales:** Aplicar cargos únicos o extraordinarios a propiedades específicas.
- **Supervisión de Automatización:** Monitorear los cargos recurrentes que el sistema genera automáticamente.

### El Rol del Residente (Portal de Autogestión)
El residente interactúa con la plataforma a través de un dashboard personal que le permite:
- **Consultar un Estado de Cuenta Unificado:** Ver todos sus movimientos financieros.
- **Acceder a un Catálogo de Servicios:** Ver y solicitar los servicios opcionales.
- **Gestionar sus Pagos:** Realizar acciones sobre sus saldos pendientes, como subir comprobantes de pago.

### El Perfil Híbrido (Ecosistema Comunitario)
Un usuario puede ser simultáneamente **Residente y Proveedor**. 
- **Incentivo de Pago:** El administrador puede habilitar cuotas de anuncios gratuitos o VIP para residentes que estén al día con sus pagos.
- **Economía Circular:** Los residentes pueden ofrecer sus servicios profesionales (ej: reparaciones, asesorías) a otros miembros de la comunidad directamente desde la app.
- **Identidad Dual:** El sistema habilita módulos de finanzas (si tiene `propertyIds`) y módulos de venta (si tiene el rol de `provider` o `hybrid`) en la misma sesión.

### Flujo Clave 1: Solicitud de un Servicio (Ej: Reserva de Salón)
1.  **Configuración:** El administrador crea un "Concepto de Cargo" llamado "Reserva Salón de Fiestas" y lo marca como "solicitable por el residente" y "requiere aprobación".
2.  **Solicitud:** El residente ve este servicio en su portal y envía una solicitud.
3.  **Registro:** El sistema crea un documento en `serviceRequests` con estado "pendiente_aprobacion". No se genera ningún cargo financiero aún.
4.  **Aprobación:** El administrador recibe la notificación, revisa la solicitud y la aprueba en su panel.
5.  **Generación del Cargo:** Tras la aprobación, el sistema devuelve la solicitud a "aprobada" y crea automáticamente el documento correspondiente en la colección `transactions`, impactando el saldo del residente.

### Flujo Clave 2: Generación de Cuota Mensual (Automatizado)
1.  **Configuración:** El administrador crea un "Concepto de Cargo" llamado "Cuota de Mantenimiento" y lo marca como "recurrente" con frecuencia "mensual".
2.  **Ejecución:** Una Cloud Function programada se ejecuta el primer día de cada mes.
3.  **Proceso:** La función busca todos los conceptos marcados como recurrentes/mensuales y genera las transacciones de cargo para todas las propiedades del condominio de forma masiva. El administrador no interviene en este proceso mensual.

### 6. Estándares de Ruteo y Navegación Reactiva (Actualizado)
*   **Contenedor Seguro (#app-view):** Para evitar conflictos con librerías externas (ej: reCAPTCHA v3) que inyectan elementos en el `body`, la aplicación debe renderizarse exclusivamente dentro del `<div id="app-view"></div>`. Nunca usar el `body` como contenedor principal del Router.
*   **Friendly URLs Dinámicas:** Las rutas se definen como IDs en inglés en `appConfig.js` (ej: `/dashboard/requests`), pero se muestran al usuario en su idioma (ej: `/panel/solicitudes`) mediante el motor de `i18n.js`.
*   **Evento Global `app:route-changed`:** El Router dispara este evento al finalizar cada navegación. Los componentes persistentes (Navigator, Breadcrumbs) deben suscribirse a este evento para sincronizar su estado visual sin recargar la página.
*   **Comportamiento de Clic Inteligente:**
    *   **Escritorio:** Los títulos de menú (`.menu-divider`) deben ser inertes (no navegar) y solo controlar la apertura del acordeón de submenús.
    *   **Móvil:** Los títulos de menú navegan directamente a la ruta principal de la sección y el menú se cierra automáticamente al seleccionar un sub-ítem.

### 7. Comunicación entre Módulos
*   **Eventos Personalizados:** Para mantener los módulos desacoplados, se prefiere el uso de eventos globales o burbujeados.
    *   Ejemplo: El módulo `search` emite un evento `app:search` con `detail: { query }`. Cualquier controlador de página puede escucharlo (`document.addEventListener('app:search', ...)`) para filtrar sus datos sin que el buscador sepa qué está filtrando.

### 8. Estándares de Assets e Iconografía
*   **Iconos SVG Locales:** Está estrictamente prohibido el uso de librerías de iconos externas (como Google Material Symbols o FontAwesome). Se debe utilizar exclusivamente iconos en formato SVG.
*   **Repositorio de Iconos:** Se cuenta con un archivo centralizado `public/src/img/icons.json` que contiene las definiciones de los iconos. Se prefiere su uso para mantener la consistencia y ligereza de la aplicación.
*   **Inyección de SVGs:** Los iconos deben integrarse directamente en el HTML como elementos `<svg>` o inyectarse mediante JavaScript para evitar peticiones HTTP adicionales.

### 9. Filosofía de Diseño y CSS
*   **Simple Grid:** Las listas de elementos (servicios, propiedades, etc.) deben seguir el patrón de `display: grid` con `auto-fill` y tarjetas (`.card`) limpias, inspiradas en el módulo `services`.
*   **Prohibición de !important:** Está estrictamente prohibido el uso de `!important` en las hojas de estilo. La jerarquía debe gestionarse mediante una especificidad limpia y variables CSS.
*   **Navegación UX:** Los botones de "volver" deben usar la clase `.btn-back`, contener un icono tipo Chevron de 24px y tener una micro-interacción de desplazamiento (ej. `translateX(-2px)` en hover).

### 10. Navegación desde Actividades (Actividades como Accesos Directos)
El módulo de `recentActivity` actúa como un centro de comando. Se ha establecido la siguiente convención de navegación mediante el icono de "ojo":
*   **Destino Dinámico:** La navegación se basa en el objeto `target` del documento de actividad.
*   **Mapeo de Rutas:**
    *   `type: 'TRANSACTION'` -> Redirige a `/dashboard/transactions/:id`
    *   `type: 'PROPERTY'` -> Redirige a `/dashboard/properties/:id`
*   **Comportamiento UX:** El clic en el icono de detalle utiliza `e.stopPropagation()` para no interferir con la selección visual de la tarjeta y ejecuta `router.navigate(path, 'dashboard')` para un refresco parcial y fluido.

---

### 11. Estándares del Módulo de Transacciones (Nuevo)
- **Folios de Facturación (FEE):** Todo cargo generado debe poseer un `voucherNumber` con el formato `FAC-YYYYMM-PropId` (ej: `FAC-202501-014`). Esto asegura unicidad y trazabilidad.
- **Propiedades de Conciliación (FEE):**
    - `pendingAmount` (Número): Obligatorio. Indica el saldo pendiente de ese cargo específico.
    - `paidBy` (Array de Objetos): Lista de recibos que han abonado a este cargo. Estructura: `[{ paymentId: string, voucherNumber: string, amount: number }]`.
- **Propiedades de Conciliación (PAYMENT):**
    - `appliedTo` (Array de Objetos): Lista de cargos cubiertos por este recibo. Estructura: `[{ transactionId: string, amount: number }]`.
- **Campo `period`:** Toda transacción debe incluir obligatoriamente el campo `period` con formato `YYYY-MM` (ej: "2025-06") para permitir consultas temporales eficientes.
- **Consistencia de Fechas (`effectiveDate`):** El campo `effectiveDate` debe almacenarse siempre como un objeto `Date`/`Timestamp` de Firestore. No se deben mezclar tipos (evitar strings planos) para asegurar que los filtros por rango funcionen correctamente.
- **Normalización de Unidades:** Los IDs de propiedad deben seguir estrictamente el formato de 3 dígitos para números (`001`, `014`, `105`) y `D-XX` para torres (ej. `D-01`) para mantener la coherencia financiera.
- **Estandarización de Tipos:** Los tipos de transacción deben usar los valores definidos (`FEE`, `PAYMENT`, `EXPENSE`, `OTHER_INCOME`, `FINE`, `UNCATEGORIZED`) para asegurar que el balance neto sea preciso y los chips de filtro funcionen correctamente.


Para cumplir con la visión de una plataforma de servicios flexible y automatizada, se ha definido la siguiente estructura de colecciones.

### Colección: `users`
- **Propósito:** Almacena el perfil de la persona que **inicia sesión en la aplicación**.
- **ID del Documento:** UID de Firebase Authentication.
- **Campos:**
    - `uid` (Texto): UID del usuario para facilitar consultas.
    - `email` (Texto): El email de login.
    - `displayName` (Texto): Nombre público del usuario.
    - `photoUrl` (Texto, Opcional): URL a la imagen de perfil.
    - `mobile` (Texto, Opcional): Número de teléfono celular.
    - `phone` (Texto, Opcional): Número de teléfono de casa.
    - `role` (Texto): Rol del usuario. Los roles posibles son:
        - `pending`: Usuario recién registrado, email sin verificar.
        - `guest`: Usuario con email verificado, explorador de la comunidad (visitante).
        - `resident`: Usuario verificado y vinculado legalmente a una propiedad.
        - `provider`: Usuario verificado que ofrece productos o servicios.
        - `hybrid`: Usuario que es simultáneamente residente y proveedor.
        - `admin`: Administrador total del sistema.
    - `isActive` (Booleano): `true` si el usuario está habilitado para operar en la plataforma, `false` si ha sido desactivado por un administrador.
    - `propertyIds` (Array de Strings): IDs de las propiedades asociadas.
    - `createdAt` (Timestamp): Fecha de creación del perfil.
    - `emergencyContact` (Objeto, Opcional): Información de contacto en caso de emergencia.
        - `name` (Texto)
        - `phone` (Texto)
        - `relationship` (Texto)
    - `communicationPreferences` (Objeto, Opcional): Preferencias del usuario para recibir comunicaciones.
        - `email` (Booleano)
        - `sms` (Booleano)

### Colección: `properties`
- **Propósito:** Representa cada unidad del condominio, su estado financiero y la información del propietario legal.
- **ID del Documento:** `propertyId` único y legible (ej: "101", "D-15").
- **Campos:**
    - `name` (Texto): Nombre descriptivo de la propiedad (ej: "Casa 101").
    - `address` (Objeto): Dirección estructurada de la propiedad.
        - `street` (Texto): Nombre de la calle (ej: "1RA OESTE").
        - `fullAddress` (Texto, Opcional): Dirección completa para referencia.
    - `balance` (Número): Saldo actual. Negativo si el residente debe, positivo si tiene saldo a favor.
    - `currency` (Texto): Moneda (ej: "USD").
    - `ownerInfo` (Objeto): Información del propietario principal según los listados del cliente.
        - `name` (Texto): Nombre del propietario.
        - `phone` (Texto): Teléfono fijo.
        - `mobile` (Texto): Teléfono móvil.
        - `email` (Texto): Email de contacto principal (no necesariamente el de la app).
    - `residentUids` (Array de Strings): Lista de los `userId` (UIDs de Firebase Auth) de los usuarios de la app que están autorizados a ver esta propiedad.

### Colección: `chargeConcepts`
- **Propósito:** Almacena las plantillas o definiciones de todos los posibles cargos y servicios que pueden generarse en el condominio. Es el cerebro del módulo de cargos.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `name` (Texto): Nombre descriptivo del concepto (ej: "Cuota de Mantenimiento", "Reserva Salón de Fiestas").
    - `icon` (Texto): Código SVG del icono ya procesado con el color (fill/stroke) elegido por el administrador.
    - `defaultAmount` (Número): Monto sugerido para el cargo.
    - `isRecurring` (Booleano): `true` si el cargo se debe generar automáticamente de forma periódica.
    - `billingFrequency` (Texto): Si es recurrente, la frecuencia (ej: "monthly", "yearly").
    - `isRequestableByResident` (Booleano): `true` si los residentes pueden ver y solicitar este servicio desde su panel.
    - `requiresApproval` (Booleano): `true` si la solicitud de un residente para este servicio requiere aprobación del administrador.

### Colección: `membershipRequests`
- **Propósito:** Actúa como un sistema de "tickets" para gestionar las solicitudes de vinculación de usuarios con propiedades o cambios de rol.
- **ID del Documento:** Prefijo `residency_` + `UID` + `propertyId` (para permitir múltiples solicitudes por usuario).
- **Campos:**
    - `userId` (Texto): UID del solicitante.
    - `userEmail` (Texto): Email del solicitante.
    - `userName` (Texto): Nombre del solicitante.
    - `requestedPropertyId` (Texto): ID de la unidad.
    - `requestedPropertyName` (Texto): Nombre de la unidad.
    - `relationship` (Texto): Relación declarada (Propietario, Inquilino, Familiar, etc.).
    - `status` (Texto): `pending`, `approved`, `rejected`.
    - `createdAt` (Timestamp): Fecha de creación.
    - `processedAt` (Timestamp): Fecha de resolución.

### Colección: `serviceRequests`
- **Propósito:** Registra cada solicitud de servicio hecha por un residente. Funciona como un paso intermedio de aprobación antes de que se cree un cargo financiero.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `propertyId` (Texto): ID de la propiedad que solicita el servicio.
    - `chargeConceptId` (Texto): Vínculo al documento en `chargeConcepts` que se está solicitando.
    - `requestDate` (Fecha y Hora): Cuándo se hizo la solicitud.
    - `status` (Texto): Estado del flujo de aprobación (ej: "pending_approval", "approved", "rejected").
    - `residentNotes` (Texto): Comentarios opcionales del residente al hacer la solicitud.
    - `adminNotes` (Texto): Comentarios del administrador al aprobar o rechazar.
    - `finalAmount` (Número): El monto final del cargo, definido o confirmado por el administrador al aprobar.

### Colección: `transactions`
- **Propósito:** Libro contable inmutable de todos los movimientos financieros (cargos y pagos). Funciona como el Libro Mayor del condominio.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `propertyId` (Texto): ID de la propiedad normalizado (ej: "014").
    - `status`: `verified`, `unidentified`.
    - `amount` (Número): Negativo para cargos, positivo para créditos.
    - `pendingAmount` (Número): Para cargos (FEE), indica cuánto falta por pagar de ese movimiento específico.
    - `paidBy` (Array): **(NUEVO)** Referencias a pagos aplicados `[{paymentId, voucherNumber, amount}]`.
    - `appliedTo` (Array): **(NUEVO)** Referencias a cargos cubiertos `[{transactionId, amount}]`.
    - `type` (Texto): `FEE`, `PAYMENT`, `EXPENSE`, `OTHER_INCOME`, `FINE`, `UNCATEGORIZED`.
    - `description` (Texto).
    - `metadata` (Objeto).
    - `voucherType` (Texto): "Cargo", "Recibo", "Gasto".
    - `voucherNumber` (Texto): Folio `FAC-...` para cargos, número de libreta física o formato `REC-YYYYMMDD-XXXX` para pagos validados.
    - `serviceRequestId` (Texto, Opcional).
    - `period` (Texto): Formato `YYYY-MM`.
    - `createdAt` (Fecha y Hora / Timestamp).
    - `effectiveDate` (Fecha / Timestamp).

### Colección: `paymentNotifications`
- **Propósito:** Almacena los reportes de pago enviados por los residentes, pendientes de verificación por parte del administrador.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `propertyId` (Texto): ID de la propiedad que reporta el pago.
    - `residentUid` (Texto): UID del usuario que realizó el reporte.
    - `amount` (Número): Monto total del comprobante.
    - `paymentDate` (Fecha): Fecha en que el residente realizó el pago.
    - `reportDate` (Fecha y Hora).
    - `status` (Texto): `pending_verification`, `verified`, `rejected`.
    - `receiptUrl` (Texto): URL del comprobante en Storage.
    - `appliedTo` (Array de Objetos): **(NUEVO)** Lista de deudas a las que se aplica este pago `[{ transactionId: string, amount: number }]`.
    - `excessAmount` (Número): **(NUEVO)** Monto sobrante que pasará a ser "Saldo a Favor" si el pago supera las deudas seleccionadas.
    - `notes` (Texto).
    - `adminNotes` (Texto).

### Colección: `activities`
- **Propósito:** Un registro unificado y cronológico de todos los eventos. Se utiliza para dos fines distintos:
    1. **Auditoría (Vigilante):** El módulo `recentActivity` muestra el log completo de todo lo que sucede.
    2. **Bandeja de Entrada (Accionable):** El módulo `notificationsFeed` filtra solo los eventos que requieren atención inmediata (solicitudes pendientes).
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `timestamp` (Fecha y Hora): Fecha y hora exacta en que ocurrió la actividad, para ordenar el feed.
    - `type` (Texto): Un código que describe el tipo de evento (ej: "PAYMENT_REPORTED", "MEMBERSHIP_REQUESTED", "SERVICE_REQUESTED", "MONTHLY_FEE_GENERATED", "USER_REGISTERED", "PROPERTY_UPDATED").
    - `description` (Texto): Una breve descripción legible por humanos de la actividad (ej: "Residente de Casa 101 reportó un pago").
    - `initiator` (Objeto, Opcional): Información sobre quién o qué inició la actividad.
        - `type` (Texto): "USER" o "SYSTEM".
        - `id` (Texto): UID del usuario o identificador del sistema.
        - `name` (Texto): Nombre del usuario o del proceso del sistema (para mostrar directamente).
    - `target` (Objeto): Información sobre la entidad principal afectada por la actividad.
        - `type` (Texto): "PROPERTY", "USER", "SERVICEREQUEST", "TRANSACTION", etc.
        - `id` (Texto): ID de la entidad afectada (ej: `propertyId`, `userId`, `serviceRequestId`).
        - `name` (Texto, Opcional): Nombre o identificador de la entidad (ej: "Casa 101", "Ana García").
    - `details` (Objeto, Opcional): Un objeto flexible para almacenar datos adicionales relevantes para el tipo de actividad (ej: `{ amount: 150, currency: 'USD', paymentNotificationId: 'abc' }` para un pago).
    - `visibility` (Array de Strings, Opcional): Define quién puede ver esta actividad (ej: `["admin"]`, `["admin", "resident_UID"]`).

---

## 12. Ciclo de Vida del Usuario y Evolución de Roles

Para garantizar una experiencia fluida y segura, el usuario evoluciona a través de los siguientes estados:

1.  **Registro (Origen):** El usuario nace con `role: "pending"` y `isActive: true`.
2.  **Gatekeeper (Validación):** El sistema exige la verificación de email. Mientras no se cumpla, el acceso a la app está restringido.
3.  **Transición a Visitante:** Una vez confirmado el email, el rol evoluciona de `pending` a `guest` (Visitante).
4.  **Entrada y Exploración:** Como `guest`, el usuario accede a módulos públicos habilitados por el administrador, principalmente el catálogo de `/services`.
5.  **Proactividad (Solicitud de Perfil):**
    *   Desde su `/profile`, el usuario puede reportarse como residente (solicitando vinculación a una propiedad).
    *   Desde `/services`, mediante el botón "Ofrecer Servicio", el usuario puede registrar sus datos comerciales para convertirse en `provider`.
6.  **Consolidación (Aprobación):**
    *   Si el administrador aprueba la vinculación a una propiedad, el rol pasa a `resident`.
    *   Si un `resident` decide también ser proveedor (o viceversa), su identidad final se consolida como `hybrid`.

---

## 13. Lógica de Reglas de Seguridad (Firestore Rules)

Para proteger los datos, se implementará la siguiente lógica en las reglas de seguridad de Firestore. El principio fundamental es **denegar todo por defecto** y solo permitir accesos explícitamente.

- **Colección `users`:**
    - Un usuario solo puede **leer y actualizar** su propio documento (`/users/{userId}`).
    - Un administrador puede **leer y actualizar** cualquier documento de usuario para gestionar roles y propiedades.
    - Un usuario puede **crear** su propio documento al registrarse.

- **Colección `properties`:**
    - Un usuario solo puede **leer** un documento de propiedad si su `userId` está presente en el campo `residentUids` de dicho documento.
    - Los administradores tienen permisos de **escritura** para gestionar la información de la unidad y la lista de residentes autorizados.

- **Colección `activities`:**
    - Requiere un **índice compuesto** (`visibility` [array-contains] + `timestamp` [descending]) para que el feed de notificaciones funcione correctamente tanto para admins como para residentes.

- **Colección `transactions`:**
    - Un usuario solo puede **leer** los documentos de transacciones si el `propertyId` de la transacción está incluido en el array `propertyIds` de su propio perfil de usuario (`/users/{request.auth.uid}`).
    - Los usuarios **no pueden crear, actualizar ni borrar** transacciones. Estas operaciones serán exclusivas para administradores.

---

## 14. Estándares de la Vista "Estado de Cuenta" (Property Detail)

Para asegurar la precisión financiera y la consistencia visual en el detalle de las unidades:

- **Diseño Bento Grid:** Las métricas superiores (Saldo, Pagos, Inmueble) deben seguir el diseño de rejilla Bento con tarjetas `.summary-card`.
- **Variante Dark:** La información del residente titular debe usar la clase `.dark` (`--color-gurkha-900`) para generar contraste y jerarquía visual.
- **Lógica Contable (Cálculo de Saldo):**
    - El saldo se calcula de forma **acumulativa y cronológica** (desde la transacción más antigua a la más reciente).
    - **Cargos (Monto Negativo):** Representan deuda y **aumentan** el saldo deudor del residente.
    - **Abonos/Pagos (Monto Positivo):** Representan ingresos y **disminuyen** el saldo deudor.
    - En la UI, las transacciones se muestran en orden inverso (más reciente primero) tras calcular el saldo histórico.
- **Feedback Visual de Saldo:**
    - `Deuda (> 0.01)`: Color `.status-debt` (rojo) + icono SVG `x-circle`.
    - `Al día (≈ 0)`: Color `.status-ok` (verde) + icono SVG `check-circle`.
    - `A favor (< -0.01)`: Color `.status-credit` (azul) + icono SVG `plus-circle`.
- **Iconografía local:** Se prohíbe el uso de fuentes de iconos externas. Se deben integrar SVGs directamente en el HTML o mediante inyección desde `icons.json`.

---

## 15. Arquitectura de Configuración Dinámica (appConfig)

Para garantizar la flexibilidad y escalabilidad de la plataforma, se implementa una capa de configuración centralizada que permite al administrador gestionar el comportamiento y la apariencia de la app sin modificar el código fuente.

### 1. Origen de Datos y Persistencia
- **Fuente de Verdad:** Colección `appConfig` en Firestore, documento `app`.
- **Prioridad de Carga (sessionGuard):** Para facilitar el desarrollo y las pruebas, el sistema prioriza la configuración guardada en `localStorage` (`gph_app_config`). Si no existe, utiliza el objeto por defecto en `public/app/core/appConfig.js`.
- **Estrategia Offline:** El objeto `appConfig` se inyecta en el `contexto.data` de cada navegación, asegurando que todos los controladores tengan acceso a las definiciones globales de forma síncrona.

### 2. Estructura del Objeto `appConfig`
Se divide en bloques lógicos:
- **`accessControl`**: Define la matriz de permisos por rol y la lista de módulos permitidos.
- **`systemDefaults`**: Ajustes técnicos (Idioma base, moneda, zona horaria).
- **`branding`**: Identidad visual (Nombre de la app, Logo URL, Paleta activa).
- **`stats` (Caché Financiera):** Almacena métricas pre-calculadas para optimizar el rendimiento y reducir costos de lectura:
    - `saldoCajaDisponible` (Número): Liquidez real (Ingresos - Gastos).
    - `totalCuentasPorCobrar` (Número): Suma de deudas pendientes de residentes.
    - `totalSaldosAFavor` (Número): Suma de pagos en exceso de residentes.
    - `ultimaSincronizacion` (Timestamp): Fecha del último recalculo masivo.

### 3. Cascada de Módulos (Layout Dinámico)
- El administrador puede organizar el orden (`order`) y la visibilidad (`visible`) de los módulos por cada vista, permitiendo una personalización total de la experiencia de usuario sin tocar el HTML.

---

## 16. Sistema de Cierre Financiero y Sincronización Global

Para mantener la integridad de los datos y minimizar el impacto económico en el uso de la base de datos, se establece el siguiente estándar de sincronización:

- **Proceso de Sincronización Masiva:** El método `Property.recalculateAllBalances()` actúa como un "Cierre Financiero". Su ejecución es manual (por el administrador) y realiza dos tareas críticas:
    1. **Conciliación Individual:** Recalcula el `balance` de cada propiedad analizando sus transacciones.
    2. **Caché Global:** Realiza una sumatoria única de la contabilidad para actualizar el objeto `stats` en `appConfig/app`.
- **Lógica de Caja Real (Liquidez):** Para el cálculo de `saldoCajaDisponible`, el sistema suma todos los montos de transacciones de tipo `PAYMENT` y `OTHER_INCOME`, y resta las de tipo `EXPENSE` o `ADMIN_EXPENSE`. Se excluyen explícitamente los cargos (`FEE`, `FINE`) ya que representan dinero no percibido aún.
- **Eficiencia de Lectura:** Los módulos de resumen financiero deben priorizar la lectura del campo `stats` del `appConfig` inyectado en la sesión, evitando realizar consultas masivas a las colecciones de propiedades o transacciones durante el uso cotidiano.
- **Silencio Operativo:** Los procesos de sincronización masiva deben evitar el uso de `console.log` para reportar éxitos individuales de unidades, limitando las notificaciones a la interfaz de usuario (spinners, iconos de éxito).

---

## 17. Sistema de Internacionalización Dinámica (i18n)

La aplicación implementa un motor de traducción nativo integrado en el ciclo de renderizado de `Mosaic`.

- **Directiva Nativa:** Se utiliza el marcador `<!-- ::i18n.ruta.clave -->` directamente en el HTML.
- **Resolución en Composición:** El motor `Mosaic` detecta estos marcadores durante la fase de ensamblado y los reemplaza por sus valores traducidos antes de inyectar el HTML en el DOM.
- **Diccionarios Estándar:**
    - Ubicación: `public/app/core/lang/{lang}/translations.json`.
    - Regla de Claves: Todas las claves deben estar en **inglés** para mantener la profesionalidad del código, mientras que los valores corresponden al idioma del archivo.
- **Carga Predictiva:** El middleware `sessionGuard` asegura que el diccionario del idioma configurado se cargue antes de procesar cualquier vista.

---

## 17. Filosofía de Estilo y CSS Semántico

Para mantener una base de código profesional y de alto rendimiento, se aplican las siguientes reglas de estilo:

- **Prohibición de Clases de Utilidad:** Está estrictamente prohibido el uso de clases tipo Tailwind o utilitarias que ensucien el HTML (ej: `mb-md`, `text-primary`, `border-b`).
- **CSS Semántico:** Cada módulo debe tener su propio archivo `.css` donde se definan clases con nombres descriptivos (ej: `.config-section-title`, `.module-card`).
- **Encapsulamiento Visual:** Los estilos de un módulo deben ser autosuficientes y utilizar las variables de `root.css` para garantizar la coherencia con el UI Kit global.
- **Clean HTML:** El HTML debe permanecer lo más minimalista posible, delegando toda la responsabilidad estética a las hojas de estilo correspondientes.

---

## 18. Estándares de Edición Quirúrgica y Mantenimiento

Para garantizar la integridad del código y facilitar las revisiones por parte del equipo:

- **Prioridad de `replace`:** Es mandatorio utilizar la herramienta `replace` para realizar cambios específicos y localizados. Se prohíbe el uso de sobrescrituras totales (`write_file`) en archivos existentes para evitar la pérdida accidental de contexto o contenido no relacionado.
- **Minimización de Ruido Visual:** Cada edición debe ser lo más pequeña posible, afectando únicamente a las líneas necesarias para cumplir el objetivo técnico.
- **Preservación de Memoria:** Antes de cualquier cambio estructural, se debe validar que las secciones previas de la documentación y del código no sean alteradas o eliminadas sin una justificación técnica explícita.

---

## 19. Sistema de Permisos Granulares (Module Registry)

Para permitir un control administrativo detallado, la aplicación utiliza un registro de capacidades por módulo:

- **Definición de Capacidades:** Cada módulo debe declarar sus acciones permitidas (ej: `create`, `delete`, `view_all`) en el objeto `moduleRegistry` de `appConfig.js`.
- **Etiquetas i18n:** Las etiquetas de estas capacidades deben referenciar claves de traducción para soportar múltiples idiomas.
- **Jerarquía de Acceso:** Los controladores deben validar no solo el acceso al módulo, sino la capacidad específica del usuario (ej: `permissions.can('residents.delete')`) antes de habilitar funcionalidades críticas.

---

## 20. Flujo de Gestión de Usuarios y Roles

La administración de identidades se rige por los siguientes estándares de eficiencia y seguridad:

- **Paginación Firestore:** La carga de usuarios debe realizarse de forma incremental (ej: bloques de 5 o 10) utilizando `limit` y `startAfter` para optimizar el consumo de datos.
- **Protección de Roles de Sistema:** Los roles esenciales definidos con `isSystem: true` (admin, resident, guest, pending) no pueden ser eliminados por el administrador para garantizar la estabilidad operativa.
---

## 21. Estándares del Módulo de Reporte de Pago (Conciliación)

Para garantizar una gestión contable precisa y una UX fluida en el reporte de ingresos:

### 1. Jerarquía Visual y Flujo de Usuario
- **Prioridad 1 (Evidencia):** El área de carga del comprobante debe ser el primer elemento visual. No se permite el envío sin adjuntar una imagen válida.
- **Prioridad 2 (Conciliación):** El sistema debe listar dinámicamente las deudas pendientes de la unidad (`pendingAmount > 0`). El usuario selecciona qué está pagando mediante tarjetas interactivas.
- **Prioridad 3 (Cálculo Automático):** El monto total del reporte se autocalcula basándose en la selección, aunque permite edición manual para reflejar el monto exacto del comprobante (soportando excedentes o pagos parciales).

### 2. Lógica de Aplicación de Fondos
- **Desglose de Pago:** Cada reporte debe generar un objeto `appliedTo` que vincule el dinero a transacciones de cargo específicas.
- **Excedentes:** Cualquier monto que supere la deuda seleccionada se registra como `excessAmount` para ser tratado como saldo a favor en la validación.
- **Notificación Automática:** Todo reporte enviado debe generar una entrada en la colección `actividades` con visibilidad para administradores.

### 3. Sistema de Recibos (Constancias)
- **Folio Único:** Al validar un pago, se genera un número de recibo inmutable con el formato `REC-YYYYMMDD-XXXX` (donde XXXX son los últimos 4 caracteres del ID de la transacción).
- **Generación PDF:** Se utiliza la librería `jspdf` para generar la constancia digital basada en los datos de la transacción de pago validada.
- **Trazabilidad:** El número de recibo debe quedar vinculado tanto en la transacción de pago como en la notificación de origen.

---
### Hito Junio 2026: Arquitectura de Modelos, Robustez Offline y Eficiencia Financiera

*   **Arquitectura de Modelos Centralizada:** Se ha completado la transición hacia una arquitectura donde los controladores en `/public/app/modules/` **no realizan llamadas directas a Firestore**. Toda la lógica de persistencia se delega a los archivos en `/public/app/models/` (ej: `Property`, `Transaction`, `User`, `MembershipRequest`).
*   **Blindaje Offline (Atomicidad):** Se ha estandarizado el uso de **`writeBatch`** para operaciones críticas que involucran múltiples documentos (ej: Reportar Pago + Actividad, Aprobar Residente). Esto garantiza que los cambios se guarden localmente en la caché de Firestore y se sincronicen íntegramente cuando haya conexión, resolviendo problemas de internet inestable.
*   **Optimización del Cierre Financiero (`recalculateAllBalances`):**
    *   Se eliminó el bucle de consultas secuenciales al servidor.
    *   Ahora se realiza una **lectura única masiva** de transacciones y se procesa el saldo de todas las unidades en la memoria del navegador.
    *   El método devuelve un objeto `stats` calculado, permitiendo que la UI se actualice al instante sin esperar una nueva lectura del servidor.
    *   Resultados: Reducción de latencia en un 90% y ahorro significativo en cuotas de lectura de Firebase.
*   **Mejoras en Resumen Financiero (Admin UX):**
    *   **Buscador Inteligente:** Sustitución de `<select>` por `<datalist>` para buscar entre cientos de unidades por ID o nombre de propietario.
    *   **KPIs Globales:** La tarjeta de "Último Pago" en vista global ahora muestra el monto del último ingreso y un subtexto de cumplimiento (ej: "300 unidades al día (80%)").
    *   **Avatares Dinámicos:** La tarjeta de información del usuario alterna automáticamente entre el icono blanco de comunidad (Vista Global) y la foto real del residente (Vista por Unidad).
*   **Estándares de Iconografía:** Se prohíbe el uso de colores fijos en los SVGs del catálogo. Todos los iconos en `icons.json` deben usar `fill='currentColor'` para permitir la estilización dinámica vía CSS (especialmente en tarjetas oscuras).

---
### 22. Estándares del Entorno de Desarrollo (Windows/PowerShell)

Para garantizar la compatibilidad con el entorno local del usuario y la correcta ejecución de tareas de automatización:

- **Entorno Mandatorio:** El sistema operativo de desarrollo es **Windows (win32)**.
- **Shell de Ejecución:** Se debe utilizar exclusivamente **PowerShell** para todos los comandos de shell y scripts de automatización.
- **Sintaxis de Comandos:** No se debe asumir la disponibilidad de herramientas de Unix (bash, sh). Los comandos deben seguir la sintaxis de PowerShell (ej. `Write-Output` en lugar de `echo`, `Import-Csv`, manejo de variables con `$`).
- **Scripts locales:** El uso de archivos `.ps1` es el estándar para tareas complejas de verificación o procesamiento de datos.

