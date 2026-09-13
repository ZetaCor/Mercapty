// Dónde se guardan las fotos subidas desde el panel: Vercel Blob en
// producción (cuando existe BLOB_READ_WRITE_TOKEN) o data/images/ en local.
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './db.js';

export const IMAGES_DIR = path.join(ROOT, 'data', 'images');
export const LOCAL_IMAGE_RE = /^\/img\/([a-z0-9-]+\.(?:jpg|png|webp))$/;
const BLOB_URL_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//;
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// En Vercel el disco es de solo lectura: sin Blob conectado no hay dónde guardar.
export const canStoreImages = () => useBlob() || !process.env.VERCEL;

export async function saveImage(productId, ext, body) {
  const name = `p${productId}-${Date.now().toString(36)}.${ext}`;
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`productos/${name}`, body, {
      access: 'public', contentType: CONTENT_TYPES[ext], addRandomSuffix: true,
    });
    return blob.url;
  }
  await mkdir(IMAGES_DIR, { recursive: true });
  await writeFile(path.join(IMAGES_DIR, name), body);
  return `/img/${name}`;
}

export async function deleteImage(url) {
  const local = LOCAL_IMAGE_RE.exec(url ?? '');
  if (local) {
    await unlink(path.join(IMAGES_DIR, local[1])).catch(() => {});
  } else if (useBlob() && BLOB_URL_RE.test(url ?? '')) {
    const { del } = await import('@vercel/blob');
    await del(url).catch(() => {});
  }
}
