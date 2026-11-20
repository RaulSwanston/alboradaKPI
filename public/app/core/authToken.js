/**
 * authToken.js — ID token de Firebase del usuario en sesión.
 *
 * Es la credencial de PERSONA: el Worker verifica la firma contra las llaves
 * públicas de Google y saca de ahí el uid y el rol. La API key del condominio
 * ya no identifica a quien llama (ni en los datos ni en R2).
 *
 * `getIdToken()` devuelve el token cacheado y lo renueva solo cuando está por
 * vencer, así que no hay que persistirlo ni refrescarlo a mano.
 */
import { auth, waitForAuth } from './firebase.js';

let cachedToken = null; // { value, expMs }

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(part + '='.repeat((4 - (part.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Token vigente o null si no hay usuario. Devuelve el mismo token cacheado
 * mientras no esté por vencer; `getIdToken()` lo renueva automáticamente.
 */
export async function currentIdToken() {
  if (cachedToken && cachedToken.expMs - 60_000 > Date.now()) return cachedToken.value;
  const user = auth.currentUser || await waitForAuth();
  if (!user) return null;
  try {
    const value = await user.getIdToken();
    const payload = decodeJwtPayload(value);
    cachedToken = { value, expMs: (payload?.exp || 0) * 1000 };
    return value;
  } catch (error) {
    console.warn('[authToken] No se pudo obtener el ID token:', error?.message);
    return null;
  }
}

/** Cabeceras de autenticación: `Authorization: Bearer <idToken>` si hay sesión. */
export async function authHeaders(extra = {}) {
  const token = await currentIdToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}
