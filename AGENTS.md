# Project: Gestión de Pagos de Condominio

## Objetivo Principal
- Construir una aplicación web (SPA) para que los residentes de un condominio puedan gestionar y consultar sus pagos de mantenimiento.
- Funcionalidad clave: Historial de pagos y saldos pendientes.

## Stack Tecnológico
- **BaaS:** Google Firebase.
- **Base de Datos:** Cloud Firestore.
- **Autenticación:** Firebase Authentication.
- **Almacenamiento:** Firebase Storage.
- **Hosting:** Firebase Hosting.
- **Infraestructura:** Cloudflare (potencialmente).

## Principios de Seguridad
- **Seguridad en Backend:** Claves de cliente visibles, protección total en reglas de Firestore/Storage.
- **Autenticación Obligatoria:** Roles gestionados vía **Custom Claims**.
- **App Check:** Activado para asegurar peticiones autorizadas.

## Hoja de Ruta (Phased Approach)
- **Fase 1 (MVP):** "Mi Estado de Cuenta" (Autenticación + Dashboard del residente).
- **Fases Futuras:** Administración, Operaciones, Comunidad, Seguridad avanzada.

## Estructura de Documentación
Para detalles específicos, consulta:
- [Arquitectura y Flujos](./docs/architecture.md)
- [Esquema de Datos](./docs/schema.md)
- [Estándares y Skills](./docs/skills.md)
