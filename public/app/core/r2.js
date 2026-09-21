/**
 * r2.js — Integración con el Worker de Cloudflare (gestionph).
 *
 * Worker: /api/v1/r2/{condominio}/{clave}
 *  - POST  sube el archivo (multipart) y devuelve { propertyId, key, storedKey, size, contentType, url }
 *  - GET   descarga el objeto (requiere Authorization: Bearer <API key>)
 *  - DELETE elimina el objeto
 *
 * Las imágenes NO pueden usarse en <img src> directo (el GET exige la key).
 * Para mostrarlas usa getAuthObjectURL() → blob → URL.createObjectURL.
 */

const R2_BASE_URL = 'https://gestionph.synch.workers.dev/api/v1/r2';
const R2_SLUG = 'alboradakpi';
const R2_API_KEY = 'gest_9Fvi1DLQEKIkLY206k2oO1byRvnncxgE9Gw0ws4p1tE';

const objectUrlCache = new Map();

const pad = (n) => String(n).padStart(2, '0');

const r2Stamp = () => {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const sanitize = (v) => String(v == null ? '' : v).replace(/[^a-z0-9_-]/gi, '-');

/**
 * Clave para un archivo vinculado a una PROPIEDAD (comprobantes de pago y
 * evidencia de transacciones): {propiedad}/{uid_usuario}_{concepto}_{stamp}.{ext}
 * La propiedad va SIEMPRE primero (es estable; los propietarios varían).
 */
export function buildPropertyUploadKey(propiedad, uid, concepto, ext) {
  return `${sanitize(propiedad)}/${sanitize(uid)}_${sanitize(concepto)}_${r2Stamp()}.${ext}`;
}

/**
 * Clave para una imagen de un SERVICIO (subidas vía TinyMCE):
 * services/{slug}/{uid_usuario}_{stamp}.{ext}
 */
export function buildServiceImageKey(slug, uid, ext) {
  return `services/${sanitize(slug)}/${sanitize(uid)}_${r2Stamp()}.${ext}`;
}

/**
 * Clave para una imagen del SISTEMA/APP (logo, branding):
 * app/{concepto}_{stamp}.{ext}
 */
export function buildSystemImageKey(concepto, ext) {
  return `app/${sanitize(concepto)}_${r2Stamp()}.${ext}`;
}

/**
 * Sube un archivo (Blob o File) al condominio y devuelve la URL pública del Worker.
 */
export async function uploadFileToR2(file, key) {
  const form = new FormData();
  form.append('file', file, file.name || key);
  const res = await fetch(`${R2_BASE_URL}/${R2_SLUG}/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${R2_API_KEY}` },
    body: form
  });
  if (!res.ok) {
    let msg = `R2 ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch (e) { /* sin cuerpo JSON */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.url || `${R2_BASE_URL}/${R2_SLUG}/${key}`;
}

const isDirectUsable = (refUrl) =>
  refUrl.startsWith('data:') || refUrl.startsWith('/') || refUrl.startsWith('blob:');

/**
 * Devuelve una URL usable (blob:) para mostrar una referencia almacenada.
 * - 'data:', 'blob:' o rutas locales ('/...') se devuelven tal cual.
 * - URLs remotas (http/https) se descargan vía fetch autenticado → blob.
 * - cualquier otra string se interpreta como clave R2 ({R2_SLUG}/{ref}).
 * Los blob: se cachean en memoria para no redescargar en cada render.
 */
export function getAuthObjectURL(refUrl) {
  if (!refUrl || typeof refUrl !== 'string') return Promise.resolve(null);
  if (isDirectUsable(refUrl)) return Promise.resolve(refUrl);
  if (objectUrlCache.has(refUrl)) return objectUrlCache.get(refUrl);

  const url = /^https?:\/\//i.test(refUrl) ? refUrl : `${R2_BASE_URL}/${R2_SLUG}/${refUrl}`;
  const promise = (async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${R2_API_KEY}` } });
    if (!res.ok) throw new Error(`R2 ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  })();

  objectUrlCache.set(refUrl, promise);
  promise.catch(() => objectUrlCache.delete(refUrl));
  return promise;
}

/**
 * Revoca todos los blob: cacheados (llamar en cleanup/desmontaje de módulos).
 */
export function revokeAuthObjectURLs() {
  objectUrlCache.forEach((promise) => {
    Promise.resolve(promise).then((url) => {
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    }).catch(() => {});
  });
  objectUrlCache.clear();
}