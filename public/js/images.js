import { adminRequest } from './api.js';

const MAX_SIDE = 1000; // px; suficiente para la ficha del producto

// Reduce la foto en el navegador antes de subirla: pesa mucho menos y se
// descartan los metadatos (por ejemplo, la ubicación GPS de fotos del celular).
async function shrink(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con JPG o PNG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('No se pudo procesar la imagen');
  return blob;
}

export async function uploadProductImage(productId, file) {
  const blob = await shrink(file);
  return adminRequest(`/api/admin/products/${productId}/image`, { method: 'PUT', body: blob, contentType: blob.type });
}

export function removeProductImage(productId) {
  return adminRequest(`/api/admin/products/${productId}/image`, { method: 'DELETE' });
}
