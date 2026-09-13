// Manejador de peticiones compartido: lo usa server/index.js en local y
// api/index.js como función de Vercel. Atiende la API JSON, la redirección a
// tiendas, el panel de imágenes y, en local, los archivos de public/.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openDb, ROOT } from './db.js';
import { createApi } from './api.js';
import { saveImage, deleteImage, canStoreImages, IMAGES_DIR, LOCAL_IMAGE_RE } from './storage.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // Vercel acepta hasta 4.5 MB por petición

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

// La base se abre una vez por proceso (en Vercel, por instancia de la función).
let apiPromise;
function getApi() {
  apiPromise ??= openDb().then(createApi).catch((err) => {
    apiPromise = null; // reintentar en la próxima petición
    throw err;
  });
  return apiPromise;
}

// Clave del panel de administración. En producción se define con ADMIN_KEY;
// en local se genera una la primera vez y se guarda en data/admin-key.txt.
function loadAdminKey() {
  if (process.env.ADMIN_KEY) return { key: process.env.ADMIN_KEY, generated: false };
  if (process.env.VERCEL) return { key: null, generated: false }; // sin clave, el panel queda desactivado
  const file = path.join(ROOT, 'data', 'admin-key.txt');
  if (existsSync(file)) return { key: readFileSync(file, 'utf8').trim(), generated: true };
  const key = randomBytes(12).toString('base64url');
  writeFileSync(file, `${key}\n`);
  return { key, generated: true };
}
export const admin = loadAdminKey();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'El archivo es demasiado grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const body = await readBody(req, 64 * 1024);
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

function intParam(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function requireAdmin(req) {
  if (!admin.key) throw new HttpError(503, 'El panel está desactivado: define ADMIN_KEY en Vercel');
  const given = Buffer.from(String(req.headers['x-admin-key'] ?? ''));
  const expected = Buffer.from(admin.key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Clave de administrador incorrecta');
  }
}

// El tipo se decide por los bytes del archivo, no por lo que declare el cliente.
function detectImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function sendFile(res, file, cacheControl) {
  let body;
  try { body = await readFile(file); }
  catch { throw new HttpError(404, 'No encontrado'); }
  const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  res.writeHead(200, headers);
  res.end(body);
}

async function serveStatic(res, pathname) {
  let rel;
  try { rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, ''); }
  catch { throw new HttpError(400, 'Ruta inválida'); }
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Prohibido');
  return sendFile(res, file);
}

async function handleAdmin(req, res, pathname, api) {
  requireAdmin(req);
  let m;
  if (req.method === 'GET' && pathname === '/api/admin/check') return sendJson(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/api/admin/products') return sendJson(res, 200, await api.adminProducts());

  if ((m = pathname.match(/^\/api\/admin\/products\/(\d+)\/image$/))) {
    const id = Number(m[1]);
    if (!(await api.productExists(id))) throw new HttpError(404, 'Producto no encontrado');

    if (req.method === 'PUT') {
      if (!canStoreImages()) throw new HttpError(503, 'Conecta Vercel Blob al proyecto para poder subir fotos');
      const body = await readBody(req, MAX_IMAGE_BYTES);
      const ext = detectImageType(body);
      if (!ext) throw new HttpError(415, 'Formato no soportado: usa una imagen JPG, PNG o WebP');
      const url = await saveImage(id, ext, body);
      await deleteImage(await api.setCustomImage(id, url));
      return sendJson(res, 200, await api.productImage(id));
    }
    if (req.method === 'DELETE') {
      await deleteImage(await api.setCustomImage(id, null));
      return sendJson(res, 200, await api.productImage(id));
    }
  }
  throw new HttpError(404, 'Ruta no encontrada');
}

async function route(req, res) {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  const get = req.method === 'GET' || req.method === 'HEAD';
  let m;

  // Rutas que no necesitan la base de datos.
  if (get && (m = LOCAL_IMAGE_RE.exec(pathname))) {
    // El nombre cambia en cada subida, así que se puede guardar en caché para siempre.
    return sendFile(res, path.join(IMAGES_DIR, m[1]), 'public, max-age=31536000, immutable');
  }
  if (get && !pathname.startsWith('/api/') && !pathname.startsWith('/go/')) return serveStatic(res, pathname);

  const api = await getApi().catch((err) => {
    console.error(err);
    throw new HttpError(503, 'La base de datos no está disponible. Si acabas de publicar, conecta Turso al proyecto en Vercel.');
  });
  if (pathname.startsWith('/api/admin/')) return handleAdmin(req, res, pathname, api);
  if (get && pathname === '/api/meta') return sendJson(res, 200, await api.meta());
  if (get && pathname === '/api/stores') return sendJson(res, 200, await api.listStores());
  if (get && pathname === '/api/categories') return sendJson(res, 200, await api.listCategories());
  if (get && pathname === '/api/deals') return sendJson(res, 200, await api.deals(intParam(searchParams.get('limit'), 1, 24, 8)));
  if (get && pathname === '/api/products') {
    return sendJson(res, 200, await api.searchProducts({
      q: searchParams.get('q') ?? '',
      category: searchParams.get('categoria') ?? '',
      sort: searchParams.get('orden') ?? 'nombre',
      limit: intParam(searchParams.get('limit'), 1, 500, 24),
      offset: intParam(searchParams.get('offset'), 0, 1_000_000, 0),
    }));
  }
  if (get && (m = pathname.match(/^\/api\/products\/(\d+)$/))) {
    const product = await api.getProduct(Number(m[1]));
    return product ? sendJson(res, 200, product) : sendJson(res, 404, { error: 'Producto no encontrado' });
  }
  if (req.method === 'POST' && pathname === '/api/list/optimize') {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.optimizeList(body.items));
  }
  if (get && (m = pathname.match(/^\/go\/(\d+)$/))) {
    const target = await api.redirectTarget(Number(m[1]));
    if (!target) throw new HttpError(404, 'Oferta no encontrada');
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (!get) throw new HttpError(405, 'Método no permitido');
  throw new HttpError(404, 'Ruta no encontrada');
}

export async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    await route(req, res);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.end();
    sendJson(res, status, { error: status === 500 ? 'Error interno' : err.message });
  }
}
