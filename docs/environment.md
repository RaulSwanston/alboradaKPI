# Entorno de Desarrollo Local

## Sistema Operativo
- **SO:** Linux
- **Shell:** bash

> **Nota:** La sección "Reglas del Entorno" en `docs/skills.md` redirige aquí.

## Firebase CLI

- **Instalado:** vía curl (script oficial de Google)
- **Binario:** `/usr/local/bin/firebase`
- **Versión:** 15.24.0
- **Sesión:** Autenticada (`firebase login` activo)

## Proyecto Firebase

- **Proyecto activo:** `alboradakpi` (alboradaKPI)

## Capacidades del Agente

El agente (IA) puede ejecutar cualquier comando `firebase` directamente en el terminal del usuario, usando su sesión autenticada. Esto incluye:

- `firebase deploy` — desplegar Hosting, Functions, Firestore Rules, etc.
- `firebase firestore:get` / `firestore:set` / `firestore:delete` — leer y escribir datos
- `firebase firestore:indexes` — consultar índices compuestos
- `firebase auth:export` — exportar usuarios
- `firebase functions:log` — ver logs de Cloud Functions
- `firebase projects:list` — listar proyectos

No tiene acceso remoto ni independiente; todo se ejecuta localmente con las credenciales del usuario.
