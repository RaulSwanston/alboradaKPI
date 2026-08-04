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

## Alcance del Agente
- No leer archivos fuera del workspace (`/home/raul/Proyectos/webapps/Gestión de Propiedad Horizontal en Condominios`) a menos que el usuario lo solicite explícitamente.
- No cargar skills sin autorización explícita del usuario.

## Publicación a GitHub
- **Staging selectivo:** agregar SOLO los archivos del trabajo acordado (`git add <archivo>...`); no usar `git add .` sin revisar. El `.gitignore` excluye secretos (Firebase Admin key, `.env`, `node_modules/`, `scripts/`, `*.mjs`); verificar que ningún secreto nuevo quede rastreado.
- **Push:** `git push github main` tras el commit. Existe también `gitlab` como remoto alternativo (`git push gitlab main`).
