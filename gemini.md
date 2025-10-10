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
