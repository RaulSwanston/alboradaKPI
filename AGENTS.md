# Project: Gestión de Pagos de Condominio

## Objetivo Principal
- Construir una aplicación web (SPA) para que los residentes de un condominio puedan gestionar y consultar sus pagos de mantenimiento.
- Funcionalidad clave: Historial de pagos y saldos pendientes.

## Stack Tecnológico
- **BaaS:** Google Firebase.
- **Base de Datos:** Cloud Firestore.
- **Autenticación:** Firebase Authentication.
- **Almacenamiento:** Cloudflare R2 (Worker gestionph `gestionph.synch.workers.dev`); Firebase Storage **retirado** del código (imágenes: subida/lectura con API key `gest_...`, display vía fetch→blob).
- **Hosting:** Firebase Hosting.
- **Infraestructura:** Cloudflare (potencialmente).

## Principios de Seguridad
- **Seguridad en Backend:** Claves de cliente visibles, protección total en reglas de Firestore y en el Worker de Cloudflare (validación de API key por condominio).
- **Autenticación Obligatoria:** Roles gestionados vía **Custom Claims**.
- **App Check:** Activado para asegurar peticiones autorizadas.

## Hoja de Ruta (Phased Approach)
- **Fase 1 (MVP):** "Mi Estado de Cuenta" (Autenticación + Dashboard del residente).
- **Fases Futuras:** Administración, Operaciones, Comunidad, Seguridad avanzada.

## Presupuesto de Firestore (CRÍTICO)
El proyecto agota la cuota gratuita de lectura de Firestore con facilidad. **Cuando se agota, la APP DEJA DE FUNCIONAR para el usuario final**, no solo los scripts. Cada lectura exploratoria es presupuesto que la app necesita.

- **NUNCA explorar Firestore interactivamente** (un `get()` por cada pregunta que uno se hace). Está prohibido deducir el estado de los datos "echando un get".
- **Patrón obligatorio de tres pasos:** extraer una vez → snapshot local → clasificar en local → un único script que escribe.
  1. `scripts/extract_expenses.js` — **única** puerta de lectura de gastos. Vuelca `scripts/data/expense_snapshot_<fecha>.json`.
  2. `scripts/build_expense_batch.js` — **0 lecturas**. Clasifica sobre el snapshot y emite `scripts/data/reconcile/write_batch_expenses.json`.
  3. `scripts/apply_expense_batch.js` — **1 lectura** (el catálogo `expenseAccounts`) + las escrituras. Dry-run por defecto, `--commit` para escribir.
- **Dry-run por defecto** en todo script que escriba; el commit requiere `--commit` explícito.
- **Aserciones numéricas** en la fase de build (cantidad y monto esperados) para que un cambio de reglas se detecte antes de escribir.
- El snapshot local **es** el backup. No releer los documentos afectados "por seguridad": son lecturas desperdiciadas.
- Si un script recibe `code 8 RESOURCE_EXHAUSTED`, **no** abrir la consola para "ir mirando": esperar y reintentar.

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
