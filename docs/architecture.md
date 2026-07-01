# Arquitectura y Flujos de Operación

## Modelo de Funcionamiento
La aplicación es una plataforma de servicios con dos interfaces:
- **Admin Panel:** Gestión total (conceptos, aprobación, reportes).
- **Portal Residente:** Autogestión (estado de cuenta, catálogo de servicios, pagos).
- **Perfil Híbrido:** Un usuario puede ser residente y proveedor.

## Flujos Clave
- **Solicitud de Servicio:** Configuración -> Solicitud -> Registro -> Aprobación -> Generación de cargo.
- **Generación de Cuota Mensual:** Automatizada mediante Cloud Function (ejecución mensual).

## Configuración Dinámica (appConfig)
- **Fuente de Verdad:** Firestore (`appConfig/app`).
- **Prioridad de Carga:** `localStorage` -> objeto por defecto en `appConfig.js`.
- **Estrategia:** Inyección de configuración en `contexto.data` para acceso síncrono.

## Sincronización Global y Cierre Financiero
- **Proceso `recalculateAllBalances`:** Método manual de cierre contable.
    - Concilia saldos de todas las unidades.
    - Actualiza caché global (`stats`) en Firestore.
- **Eficiencia:** Lectura única masiva, procesamiento en memoria del navegador.

## Gestión de Usuarios y Roles
- Evolución: `pending` -> `guest` -> `resident`/`provider` -> `hybrid`.
- Paginación Firestore para carga de usuarios masiva.
