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
- **Consultar un Estado de Cuenta Unificado:** Ver todos sus movimientos financieros: cuotas obligatorias, servicios solicitados, etc.
- **Acceder a un Catálogo de Servicios:** Ver y solicitar los servicios opcionales que el administrador ha configurado.
- **Gestionar sus Pagos:** Realizar acciones sobre sus saldos pendientes, como subir comprobantes de pago.

### Flujo Clave 1: Solicitud de un Servicio (Ej: Reserva de Salón)
1.  **Configuración:** El administrador crea un "Concepto de Cargo" llamado "Reserva Salón de Fiestas" y lo marca como "solicitable por el residente" y "requiere aprobación".
2.  **Solicitud:** El residente ve este servicio en su portal y envía una solicitud.
3.  **Registro:** El sistema crea un documento en `serviceRequests` con estado "pendiente_aprobacion". No se genera ningún cargo financiero aún.
4.  **Aprobación:** El administrador recibe la notificación, revisa la solicitud y la aprueba en su panel.
5.  **Generación del Cargo:** Tras la aprobación, el sistema actualiza la solicitud a "aprobada" y crea automáticamente el documento correspondiente en la colección `transactions`, impactando el saldo del residente.

### Flujo Clave 2: Generación de Cuota Mensual (Automatizado)
1.  **Configuración:** El administrador crea un "Concepto de Cargo" llamado "Cuota de Mantenimiento" y lo marca como "recurrente" con frecuencia "mensual".
2.  **Ejecución:** Una Cloud Function programada se ejecuta el primer día de cada mes.
3.  **Proceso:** La función busca todos los conceptos marcados como recurrentes/mensuales y genera las transacciones de cargo para todas las propiedades del condominio de forma masiva. El administrador no interviene en este proceso mensual.

---

## 6. Estructura de la Base de Datos (Firestore)

Para cumplir con la visión de una plataforma de servicios flexible y automatizada, se ha definido la siguiente estructura de colecciones.

### Colección: `users`
- **Propósito:** Almacena el perfil del residente y lo vincula a su propiedad.
- **ID del Documento:** UID de Firebase Authentication.
- **Campos:**
    - `email` (Texto): Email de inicio de sesión.
    - `displayName` (Texto): Nombre completo del residente.
    - `propertyId` (Texto): ID del documento en la colección `properties`.
    - `role` (Texto): Rol del usuario (ej: "resident", "admin"). **Nota:** Este campo debe considerarse solo para fines informativos (ej: filtros en el panel de admin). La autorización real y los privilegios se determinan mediante Custom Claims seguros en el token de autenticación.
    - `createdAt` (Fecha y Hora): Fecha de creación del perfil.

### Colección: `properties`
- **Propósito:** Representa cada unidad del condominio y su estado financiero.
- **ID del Documento:** ID único y legible (ej: "APT-101").
- **Campos:**
    - `name` (Texto): Nombre de la propiedad (ej: "Apartamento 101").
    - `address` (Texto): Dirección de la unidad.
    - `balance` (Número): Saldo actual. Negativo si el residente debe, positivo si tiene saldo a favor.
    - `currency` (Texto): Moneda (ej: "USD").
    - `ownerUids` (Array): Lista de `userId` de los dueños/residentes de la propiedad.

### Colección: `chargeConcepts`
- **Propósito:** Almacena las plantillas o definiciones de todos los posibles cargos y servicios que pueden generarse en el condominio. Es el cerebro del módulo de cargos.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `name` (Texto): Nombre descriptivo del concepto (ej: "Cuota de Mantenimiento", "Reserva Salón de Fiestas").
    - `defaultAmount` (Número): Monto sugerido para el cargo.
    - `isRecurring` (Booleano): `true` si el cargo se debe generar automáticamente de forma periódica.
    - `billingFrequency` (Texto): Si es recurrente, la frecuencia (ej: "monthly", "yearly").
    - `isRequestableByResident` (Booleano): `true` si los residentes pueden ver y solicitar este servicio desde su panel.
    - `requiresApproval` (Booleano): `true` si la solicitud de un residente para este servicio requiere aprobación del administrador.

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
- **Propósito:** Libro contable inmutable de todos los movimientos financieros (cargos y pagos).
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `propertyId` (Texto): ID de la propiedad a la que pertenece.
    - `amount` (Número): Monto del movimiento. Negativo para cargos (débitos), positivo para créditos (pagos).
    - `type` (Texto): Tipo de transacción (ej: "FEE", "PAYMENT", "FINE").
    - `description` (Texto): Descripción legible del movimiento.
    - `voucherType` (Texto): Tipo de comprobante asociado (ej: "Factura", "Recibo", "Nota de Crédito").
    - `voucherNumber` (Texto): Número del comprobante.
    - `serviceRequestId` (Texto, Opcional): Si la transacción se originó por una solicitud de servicio, se guarda el ID para trazabilidad.
    - `createdAt` (Fecha y Hora): Fecha de registro en el sistema.
    - `effectiveDate` (Fecha): Fecha a la que corresponde el movimiento contable.

### Colección: `paymentNotifications`
- **Propósito:** Almacena los reportes de pago enviados por los residentes, pendientes de verificación por parte del administrador.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `propertyId` (Texto): ID de la propiedad que reporta el pago.
    - `amount` (Número): Monto que el residente reporta haber pagado.
    - `paymentDate` (Fecha): Fecha en que el residente realizó el pago.
    - `reportDate` (Fecha y Hora): Fecha y hora en que se creó el reporte.
    - `status` (Texto): Estado del flujo de verificación (ej: "pending_verification", "verified", "rejected").
    - `receiptUrl` (Texto, Opcional): URL de la imagen del comprobante en Firebase Storage.
    - `notes` (Texto, Opcional): Notas del residente sobre el pago.
    - `adminNotes` (Texto, Opcional): Notas del administrador al verificar o rechazar.

---

## 6. Lógica de Reglas de Seguridad (Firestore Rules)

Para proteger los datos, se implementará la siguiente lógica en las reglas de seguridad de Firestore. El principio fundamental es **denegar todo por defecto** y solo permitir accesos explícitamente.

- **Colección `users`:**
    - Un usuario solo puede **leer y actualizar** su propio documento (`/users/{userId}`).
    - Un usuario no puede leer los documentos de otros usuarios.
    - Un usuario puede **crear** su propio documento al registrarse.

- **Colección `properties`:**
    - Un usuario solo puede **leer** un documento de propiedad si su `userId` está presente en el campo `ownerUids` de dicho documento.
    - La escritura (crear/actualizar) de propiedades será, inicialmente, solo para administradores (a definir en Fase 2).

- **Colección `transactions`:**
    - Un usuario solo puede **leer** los documentos de transacciones cuyo `propertyId` coincida con el `propertyId` de su perfil de usuario.
    - Los usuarios **no pueden crear, actualizar ni borrar** transacciones. Estas operaciones serán exclusivas para administradores.
---

## 7. Paleta de Colores

### Paletas Base

'gurkha': {
    '50': '#f6f5ef',
    '100': '#eae9dd',
    '200': '#d8d6be',
    '300': '#bfbd97',
    '400': '#9e9c68',
    '500': '#8a8958',
    '600': '#6d6d43',
    '700': '#555536',
    '800': '#44452f',
    '900': '#3b3c2b',
    '950': '#1f1f14',
},
'solid-pink': {
    '50': '#fdf3f3',
    '100': '#faeae9',
    '200': '#f6d5d5',
    '300': '#eeb3b3',
    '400': '#e4888c',
    '500': '#d55e65',
    '600': '#c03e4c',
    '700': '#a12f3e',
    '800': '#842938',
    '900': '#742736',
    '950': '#401119',
},
'kaitoke-green': {
    '50': '#f0fdf4',
    '100': '#ddfbe8',
    '200': '#bdf5d2',
    '300': '#8aebaf',
    '400': '#50d884',
    '500': '#28bf63',
    '600': '#1b9e4e',
    '700': '#197c40',
    '800': '#196236',
    '900': '#175330',
    '950': '#072c17',
},

### Paleta Expandida: "Condo-Fresh UI Kit"

#### 1. Colores de Texto

-   `text-primary`: `gurkha['900']` (#3b3c2b)
-   `text-secondary`: `gurkha['700']` (#555536)
-   `text-link`: `kaitoke-green['600']` (#1b9e4e)
-   `text-on-primary`: `#FFFFFF`

#### 2. Colores de Fondo (Backgrounds)

-   `bg-canvas`: `gurkha['100']` (#eae9dd)
-   `bg-surface`: `gurkha['50']` (#f6f5ef)
-   `bg-hero`: `kaitoke-green['100']` (#ddfbe8)

#### 3. Colores para Componentes de UI

-   **Cards:**
    -   `card-bg`: `bg-surface` (#f6f5ef)
    -   `card-border`: `gurkha['200']` (#d8d6be)
-   **Botones:**
    -   `button-primary-bg`: `kaitoke-green['500']` (#28bf63)
    -   `button-primary-hover-bg`: `kaitoke-green['600']` (#1b9e4e)
    -   `button-accent-bg`: `solid-pink['500']` (#d55e65)
    -   `button-accent-hover-bg`: `solid-pink['600']` (#c03e4c)
-   **Inputs (Campos de formulario):**
    -   `input-bg`: `bg-surface` (#f6f5ef)
    -   `input-border`: `gurkha['300']` (#bfbd97)
    -   `input-focus-border`: `kaitoke-green['500']` (#28bf63)

#### 4. Colores Semánticos (Estados)

-   `success`: `kaitoke-green['500']` (#28bf63)
-   `warning`: `#FFC700`
-   `error`: `solid-pink['600']` (#c03e4c)
---

## 8. Estándares de Documentación

Se ha acordado aplicar documentación de forma continua durante el desarrollo para asegurar la claridad y mantenibilidad del código.

-   **Para la Estructura HTML (`index.html`):**
    -   Se utilizarán **comentarios HTML (`<!-- ... -->`)** para delimitar y describir las secciones lógicas principales de la interfaz (ej: `<!-- Sección de Login -->`). Esto proporciona un mapa estructural del documento.

-   **Para la Lógica de JavaScript (en `<script>` o archivos `.js`):**
    -   Se usará **JSDoc (`/** ... */`)** para documentar todas las funciones, explicando su propósito, parámetros (`@param`) y valores de retorno (`@returns`).
    -   Se usarán comentarios de una línea (`//`) o multilínea (`/* ... */`) para aclaraciones puntuales dentro de las funciones, según sea el caso.

-   **Para CSS (`public/style.css`):**
    -   Se utilizarán comentarios de bloque (`/* --- Sección --- */`) para delimitar grandes secciones lógicas (ej: Fuentes, Variables de Color, Componentes).
    -   Se utilizarán comentarios de una línea (`/* Comentario */`) o de múltiples líneas para explicar reglas CSS complejas o decisiones de diseño específicas.
---

## 9. Flujo de Trabajo de Git

- **Doble Repositorio:** El proyecto se mantiene sincronizado en dos repositorios remotos: `github` y `gitlab`.
- **Práctica de Actualización:** Al finalizar un conjunto de cambios, se debe realizar un `push` a **ambos** remotos para mantenerlos actualizados.
  - `git push github main`
  - `git push gitlab main`