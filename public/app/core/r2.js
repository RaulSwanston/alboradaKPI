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

// La API key del Worker se lee de r2.config.js (gitignoreado). Si el archivo
// no existe (ej. clon sin configuración), se carga vacía y la subida falla
// con un mensaje claro en vez de romper el módulo.
let cachedApiKey = null;
async function getApiKey() {
  if (cachedApiKey !== null) return cachedApiKey;
  try {
    const mod = await import('./r2.config.js');
    cachedApiKey = (mod.R2_API_KEY || '').trim();
  } catch (e) {
    cachedApiKey = '';
  }
  return cachedApiKey;
}

const objectUrlCache = new Map();

const pad = (n) => String(n).padStart(2, '0');

/**
 * Construye una clave segura para R2: {tipo}_{propiedad}_{yyyyMMdd}_{HHmmss}.{ext}
 * Solo minúsculas, números, guiones y guion bajo (regla del Worker).
 */
export function buildR2Key(tipo, propiedad, ext, extra = '') {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const prop = String(propiedad == null ? '' : propiedad).replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const safeExtra = String(extra).replace(/[^a-z0-9_-]/gi, '-').slice(0, 24);
  const base = [tipo, prop || '0', stamp, safeExtra].filter(Boolean).join('_');
  return `${base}.${ext}`;
}

/**
 * Sube un archivo (Blob o File) al condominio y devuelve la URL pública del Worker.
 */
export async function uploadFileToR2(file, key) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('R2_API_KEY no configurada (falta r2.config.js)');
  const form = new FormData();
  form.append('file', file, file.name || key);
  const res = await fetch(`${R2_BASE_URL}/${R2_SLUG}/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
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
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('R2_API_KEY no configurada (falta r2.config.js)');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
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