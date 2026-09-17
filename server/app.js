// Manejador de peticiones compartido: lo usa server/index.js en local y
// api/index.js como función de Vercel. Atiende la API JSON, la redirección a
// tiendas, el panel de imágenes y, en local, los archivos de public/.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openDb, ROOT } from './db.js';
import { createApi } from './api.js';
import { productPath } from './lib/normalize.js';
import { saveImage, deleteImage, canStoreImages, IMAGES_DIR, LOCAL_IMAGE_RE } from './storage.js';
import { contactInfo } from './contact.js';
import { activePromos } from './promos.js';

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
  '.ico': 'image/x-icon',
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

// Google AdSense: se activa definiendo ADSENSE_CLIENT (ca-pub-…) en Vercel.
// Los bloques ADSENSE_SLOT_* son opcionales; sin ellos, AdSense puede colocar
// anuncios automáticos si se activan en su panel.
function adsConfig() {
  const client = (process.env.ADSENSE_CLIENT ?? '').trim();
  if (!/^ca-pub-\d{10,20}$/.test(client)) return null;
  const slot = (name) => (/^\d{6,15}$/.test(process.env[name] ?? '') ? process.env[name] : null);
  return {
    client,
    slots: { home: slot('ADSENSE_SLOT_HOME'), search: slot('ADSENSE_SLOT_SEARCH'), product: slot('ADSENSE_SLOT_PRODUCT') },
  };
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Lo que solo se lee se guarda en la red de Vercel: los precios cambian cuando corren los
// bots, así que casi ninguna visita necesita tocar la base de datos (Turso cobra por filas
// leídas). Vencido el plazo, sigue sirviendo la copia guardada mientras pide una nueva.
const CACHE_READ = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';
// Los días de descuento cambian al cambiar el día: se guardan poco y sin servir copias viejas.
const CACHE_PROMOS = 'public, max-age=0, s-maxage=600';

function sendJson(res, status, body, cache = 'no-store') {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': cache });
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
  try { rel = pathname === '/' ? 'shell.html' : decodeURIComponent(pathname).replace(/^\/+/, ''); }
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

function needApi() {
  return getApi().catch((err) => {
    console.error(err);
    throw new HttpError(503, 'La base de datos no está disponible. Si acabas de publicar, conecta Turso al proyecto en Vercel.');
  });
}

// --- Páginas para Google: dirección normal + título, descripción y datos ---

const DEFAULT_DESCRIPTION = 'Compara producto por producto los precios de los supermercados en línea de Panamá y compra donde está más barato.';
const STATIC_PAGES = {
  '/': ['Compara precios de supermercados en Panamá', DEFAULT_DESCRIPTION],
  '/tiendas': ['Supermercados que comparamos', 'Mira qué supermercados de Panamá compara Mercapty y en cuántos productos tiene cada uno el mejor precio.'],
  '/app': ['Descarga la app', 'Instala Mercapty en tu celular y compara los precios del súper desde el pasillo.'],
  '/lista': ['Mi lista', DEFAULT_DESCRIPTION, 'noindex'],
  '/admin': ['Panel de imágenes', DEFAULT_DESCRIPTION, 'noindex'],
};

const money = (n) => `$${Number(n).toFixed(2)}`;
const escapeHtml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const absoluteUrl = (url, origin) => (!url ? null : /^https?:\/\//.test(url) ? url : `${origin}${url}`);

// Dirección pública para canonical y sitemap. Con dominio propio, define
// SITE_URL (por ejemplo https://mercapty.com) para que Google no la mezcle con vercel.app.
function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').replace(/[^a-z0-9.:-]/gi, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0];
  return `${proto}://${host}`;
}

function robotsTxt(origin) {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /go/', 'Disallow: /admin', 'Disallow: /lista', 'Disallow: /shell.html', '',
    `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

function productJsonLd(product, available, origin) {
  const prices = available.map((o) => o.price);
  const image = absoluteUrl(product.image, origin);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(image ? { image: [image] } : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(prices.length ? {
      offers: {
        '@type': 'AggregateOffer', priceCurrency: 'USD', offerCount: prices.length,
        lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2),
        availability: 'https://schema.org/InStock',
      },
    } : {}),
  };
}

async function pageMeta(pathname, searchParams, origin) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  let m;
  if ((m = clean.match(/^\/producto\/(\d+)(?:-[a-z0-9-]*)?$/))) {
    const product = await (await needApi()).getProduct(Number(m[1]));
    if (!product) return { status: 404, title: 'Producto no encontrado', robots: 'noindex' };
    const available = product.offers.filter((o) => o.inStock);
    const best = available[0];
    const stores = `${available.length} supermercado${available.length === 1 ? '' : 's'}`;
    return {
      title: best ? `${product.name}: desde ${money(best.price)} en ${best.storeName}` : product.name,
      description: best
        ? `Compara el precio de ${product.name} en ${stores} de Panamá. El más barato hoy: ${best.storeName}, ${money(best.price)}.`
        : `Precio de ${product.name} en los supermercados de Panamá.`,
      path: product.path,
      image: product.image,
      jsonLd: productJsonLd(product, available, origin),
    };
  }
  if (clean === '/buscar') {
    const q = searchParams.get('q');
    const categoria = searchParams.get('categoria');
    if (q) return { title: `Precios de «${q}» en supermercados de Panamá`, robots: 'noindex, follow' };
    if (categoria) {
      return {
        title: `${categoria}: compara precios en supermercados de Panamá`,
        description: `Precios de ${categoria.toLowerCase()} en los supermercados de Panamá, producto por producto.`,
        path: `/buscar?categoria=${encodeURIComponent(categoria)}`,
      };
    }
    return { title: 'Todos los productos', path: '/buscar' };
  }
  const known = STATIC_PAGES[clean];
  if (known) {
    const meta = { title: known[0], description: known[1], robots: known[2], path: clean };
    return clean === '/' ? { ...meta, jsonLd: siteJsonLd(origin) } : meta;
  }
  return { status: 404, title: 'Página no encontrada', robots: 'noindex' };
}

let shellHtml;
async function pageShell() {
  shellHtml ??= await readFile(path.join(PUBLIC_DIR, 'shell.html'), 'utf8');
  return shellHtml;
}

// Códigos con los que Google Search Console y Bing comprueban que el sitio es tuyo. Se
// definen en Vercel (GOOGLE_SITE_VERIFICATION y BING_SITE_VERIFICATION) y, si no están,
// no se escribe nada. También se puede verificar por DNS, sin tocar esto.
// AdSense quiere encontrar su script en el HTML que llega, no puesto después por
// JavaScript: así lo ve su revisor cuando pides la cuenta y su robot cuando rastrea. La
// etiqueta «google-adsense-account» es la que usan hoy para comprobar que el sitio es tuyo.
// Lleva el id de adsbygoogle-js para que public/js/ads.js no lo cargue dos veces.
function adsenseTags() {
  const { client } = adsConfig() ?? {};
  if (!client) return [];
  const id = escapeHtml(client);
  return [
    `<meta name="google-adsense-account" content="${id}">`,
    `<script async id="adsbygoogle-js" crossorigin="anonymous"`
      + ` src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}"></script>`,
  ];
}

function verificationTags() {
  return [
    ['google-site-verification', process.env.GOOGLE_SITE_VERIFICATION],
    ['msvalidate.01', process.env.BING_SITE_VERIFICATION],
  ]
    .filter(([, code]) => code?.trim())
    .map(([name, code]) => `<meta name="${name}" content="${escapeHtml(code.trim())}">`);
}

// Datos del sitio para Google: quién está detrás y cómo se busca aquí dentro, para que
// pueda mostrar la caja de búsqueda de Mercapty junto al resultado.
function siteJsonLd(origin) {
  const contact = contactInfo();
  const redes = [contact.instagram?.url, contact.facebook?.url].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#sitio`,
        url: `${origin}/`,
        name: 'Mercapty',
        description: DEFAULT_DESCRIPTION,
        inLanguage: 'es-PA',
        publisher: { '@id': `${origin}/#organizacion` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${origin}/buscar?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${origin}/#organizacion`,
        name: 'Mercapty',
        url: `${origin}/`,
        logo: `${origin}/icons/icon-512.png`,
        areaServed: 'PA',
        ...(contact.email ? { email: contact.email.text } : {}),
        ...(redes.length ? { sameAs: redes } : {}),
      },
    ],
  };
}

function injectHead(shell, meta, origin) {
  const title = `${meta.title} · Mercapty`;
  const description = meta.description ?? DEFAULT_DESCRIPTION;
  const url = meta.path ? `${origin}${meta.path}` : null;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    meta.robots && `<meta name="robots" content="${escapeHtml(meta.robots)}">`,
    url && `<link rel="canonical" href="${escapeHtml(url)}">`,
    '<meta property="og:site_name" content="Mercapty">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    url && `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(absoluteUrl(meta.image, origin) ?? `${origin}/icons/icon-512.png`)}">`,
    '<meta name="twitter:card" content="summary">',
    '<meta property="og:locale" content="es_PA">',
    ...verificationTags(),
    ...adsenseTags(),
    meta.jsonLd && `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replaceAll('<', '\\u003c')}</script>`,
  ].filter(Boolean).join('\n  ');
  return shell.replace(/<title>[^<]*<\/title>\s*<meta name="description"[^>]*>/, tags);
}

async function renderPage(req, res, pathname, searchParams) {
  const origin = siteOrigin(req);
  const meta = await pageMeta(pathname, searchParams, origin);
  const html = injectHead(await pageShell(), meta, origin);
  // La página también se guarda en la red de Vercel; los precios cambian cada pocas horas.
  res.writeHead(meta.status ?? 200, {
    'Content-Type': MIME['.html'],
    'Cache-Control': CACHE_READ,
  });
  res.end(html);
}

// El mapa del sitio va partido: /sitemap.xml es el índice y apunta a /sitemap-paginas.xml
// y a /sitemap-productos-N.xml. Es lo que Google recomienda para sitios grandes y, además,
// cada archivo se arma rápido: uno solo con 28,000 productos tardaba seis segundos.
const SITEMAP_CHUNK = 5000;
const CACHE_SITEMAP = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';

function sendXml(res, lines) {
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE_SITEMAP });
  res.end([...lines, ''].join('\n'));
}

const xmlText = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function sendSitemapIndex(req, res, api) {
  const origin = siteOrigin(req);
  const total = await api.countProducts('');
  const partes = [
    'paginas',
    ...Array.from({ length: Math.max(1, Math.ceil(total / SITEMAP_CHUNK)) }, (_, i) => `productos-${i + 1}`),
  ];
  sendXml(res, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...partes.map((p) => `  <sitemap><loc>${xmlText(`${origin}/sitemap-${p}.xml`)}</loc></sitemap>`),
    '</sitemapindex>',
  ]);
}

// parte: «paginas» (portada, tiendas, app y categorías) o «productos-N».
async function sendSitemapPart(req, res, api, parte) {
  const origin = siteOrigin(req);
  const url = (loc, lastmod) => `  <url><loc>${xmlText(origin + loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}</url>`;
  let urls;
  if (parte === 'paginas') {
    const categories = await api.listCategories();
    urls = [
      url('/'), url('/tiendas'), url('/app'),
      ...categories.map((c) => url(`/buscar?categoria=${encodeURIComponent(c.name)}`)),
    ];
  } else {
    const pagina = Number(parte.split('-')[1]);
    const products = await api.sitemapEntries({ limit: SITEMAP_CHUNK, offset: (pagina - 1) * SITEMAP_CHUNK });
    if (!products.length) throw new HttpError(404, 'No encontrado');
    urls = products.map((p) => url(productPath(p.id, p.name), p.updatedAt));
  }
  sendXml(res, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ]);
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
  if (get && pathname === '/ads.txt') {
    // Autoriza a Google a vender los anuncios de este sitio (se genera desde ADSENSE_CLIENT).
    const ads = adsConfig();
    if (!ads) throw new HttpError(404, 'No encontrado');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end(`google.com, ${ads.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  }
  if (get && pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end(robotsTxt(siteOrigin(req)));
  }
  // Los días de descuento que anuncia cada súper no salen de la base de datos.
  if (get && pathname === '/api/promos') return sendJson(res, 200, activePromos(), CACHE_PROMOS);
  if (get && pathname === '/sitemap.xml') return sendSitemapIndex(req, res, await needApi());
  if (get && (m = /^\/sitemap-(paginas|productos-\d{1,3})\.xml$/.exec(pathname))) {
    return sendSitemapPart(req, res, await needApi(), m[1]);
  }
  // Archivos con extensión (CSS, JS, imágenes, manifiesto...) salen de public/.
  if (get && path.extname(pathname)) return serveStatic(res, pathname);
  // Cualquier otra dirección es una página de la app: la plantilla shell.html con el título,
  // la descripción y los datos de esa página ya puestos, para Google.
  if (get && !pathname.startsWith('/api/') && !pathname.startsWith('/go/')) return renderPage(req, res, pathname, searchParams);

  const api = await needApi();
  if (pathname.startsWith('/api/admin/')) return handleAdmin(req, res, pathname, api);
  if (get && pathname === '/api/meta') {
    return sendJson(res, 200, { ...(await api.meta()), ads: adsConfig(), contact: contactInfo() }, CACHE_READ);
  }
  if (get && pathname === '/api/stores') return sendJson(res, 200, await api.listStores(), CACHE_READ);
  if (get && pathname === '/api/categories') return sendJson(res, 200, await api.listCategories(), CACHE_READ);
  if (get && pathname === '/api/deals') return sendJson(res, 200, await api.deals(intParam(searchParams.get('limit'), 1, 24, 8)), CACHE_READ);
  if (get && pathname === '/api/products') {
    return sendJson(res, 200, await api.searchProducts({
      q: searchParams.get('q') ?? '',
      category: searchParams.get('categoria') ?? '',
      sort: searchParams.get('orden') ?? '', // la API elige: relevancia si hay palabras, nombre si no
      limit: intParam(searchParams.get('limit'), 1, 500, 24),
      offset: intParam(searchParams.get('offset'), 0, 1_000_000, 0),
    }), CACHE_READ);
  }
  if (get && (m = pathname.match(/^\/api\/products\/(\d+)$/))) {
    const product = await api.getProduct(Number(m[1]));
    return product ? sendJson(res, 200, product, CACHE_READ) : sendJson(res, 404, { error: 'Producto no encontrado' });
  }
  // Avisos al celular: la app manda su token de Expo y qué quiere recibir.
  if (req.method === 'POST' && pathname === '/api/devices') {
    const body = await readJsonBody(req);
    const token = String(body.token ?? '');
    if (!/^Expo(nent)?PushToken\[[\w.-]+\]$/.test(token)) throw new HttpError(400, 'Token inválido');
    await (body.remove ? api.removeDevice(token) : api.saveDevice({ ...body, token }));
    return sendJson(res, 200, { ok: true });
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
