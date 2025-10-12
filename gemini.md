eres genial
---

# Directrices del Proyecto: Gestión de Pagos de Condominio

Este documento resume el entendimiento actual sobre los objetivos y la estrategia de desarrollo para la aplicación.

## 1. Objetivo Principal de la Aplicación

- Construir una aplicación web (SPA - Single Page Application) para que los residentes de un condominio puedan gestionar y consultar sus pagos correspondientes al mantenimiento de las áreas sociales.
- La funcionalidad clave es permitir a cada residente ver su historial de pagos y cualquier saldo pendiente.

## 2. Stack Tecnológico

- **Framework CSS:** Tailwind CSS (para un desarrollo rápido y consistente de la interfaz de usuario).
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
    - **Reglas de Seguridad (Security Rules):** Se definirán reglas estrictas en Firestore y Storage para asegurar que un usuario solo pueda acceder y modificar su propia información.
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

## 5. Estructura de la Base de Datos (Firestore)

Para cumplir con los requisitos del MVP, se ha definido la siguiente estructura de colecciones y documentos en Firestore.

### Colección: `users`
- **Propósito:** Almacena el perfil del residente y lo vincula a su propiedad.
- **ID del Documento:** UID de Firebase Authentication.
- **Campos:**
    - `email` (Texto): Email de inicio de sesión.
    - `displayName` (Texto): Nombre completo del residente.
    - `propertyId` (Texto): ID del documento en la colección `properties`.
    - `role` (Texto): Rol del usuario (ej: "resident", "admin").
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

### Colección: `transactions`
- **Propósito:** Libro contable inmutable de todos los movimientos financieros.
- **ID del Documento:** ID auto-generado por Firestore.
- **Campos:**
    - `propertyId` (Texto): ID de la propiedad a la que pertenece.
    - `amount` (Número): Monto del movimiento. Negativo para cargos (cuotas), positivo para créditos (pagos).
    - `type` (Texto): Tipo de transacción (ej: "FEE", "PAYMENT").
    - `description` (Texto): Descripción legible.
    - `createdAt` (Fecha y Hora): Fecha de registro.
    - `effectiveDate` (Fecha): Fecha a la que corresponde el movimiento.

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
