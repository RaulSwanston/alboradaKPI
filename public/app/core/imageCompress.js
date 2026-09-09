/**
 * imageCompress.js — Compresión de imágenes en el navegador antes de subir.
 *
 * Reduce capturas/fotos de comprobantes a JPEG con techo de tamaño:
 *  - Máx. 1600px en el lado mayor
 *  - Calidad inicial 0.78
 *  - Bucle de ajuste hasta quedar bajo maxBytes (~500 KB)
 *
 * Los archivos NO-imagen (ej. PDF) pasan tal cual (solo se devuelve su extensión).
 */

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.78;
const DEFAULT_MAX_BYTES = 500 * 1024;

function extOf(file) {
  const ext = (file?.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
}

function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(() => loadViaImageElement(file));
  }
  return loadViaImageElement(file);
}

function loadViaImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/**
 * @param {File} file - archivo seleccionado
 * @param {object} [options] - { maxDimension, quality, maxBytes }
 * @returns {Promise<{ blob: Blob|File, ext: string }>}
 */
export async function compressImageFile(file, options = {}) {
  const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;

  if (!file || !file.type?.startsWith('image/')) {
    return { blob: file, ext: extOf(file) };
  }

  const source = await loadImageBitmap(file);
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;

  const ratio = Math.min(1, maxDimension / Math.max(w, h));
  let scale = ratio;
  let q = quality;
  let canvas = null;
  let bestBlob = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG no soporta alpha (comprobantes/documentos)
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(source, 0, 0, cw, ch);

    bestBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
    if (bestBlob && bestBlob.size <= maxBytes) break;

    if (attempt === 0) {
      q = 0.6;
      scale = Math.min(scale, 1200 / Math.max(w, h));
    } else if (attempt === 1) {
      q = 0.55;
      scale = Math.min(scale, 1000 / Math.max(w, h));
    } else {
      q = Math.max(0.4, q - 0.1);
    }
  }

  if (typeof source.close === 'function') source.close();
  const blob = bestBlob || new Blob([file], { type: 'image/jpeg' });
  return { blob, ext: 'jpg' };
}