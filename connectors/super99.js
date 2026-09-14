// Conector para Súper 99 (Magento). Sus listados los arma un buscador externo
// que exige su clave, pero la página de cada producto trae nombre, marca,
// precio, precio anterior, código de barras (UPC), existencias, foto y
// categorías, y su robots.txt permite leerla. Aquí se lee un producto a la vez;
// qué páginas leer en cada corrida lo decide scripts/super99.js.
import { BOT_HEADERS, sleep } from './util.js';
import { normalizeText } from '../server/lib/normalize.js';

const PAGE_HEADERS = { ...BOT_HEADERS, Accept: 'text/html' };
const XML_HEADERS = { ...BOT_HEADERS, Accept: 'application/xml' };

// Descarga con reintentos: { status: 'ok', text } | { status: 'gone' } | { status: 'error', problem }.
// Un producto que ya no existe responde 404 o redirige a otra página.
async function download(url, headers, attempts = 3) {
  for (let i = 1; ; i++) {
    let problem;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
      if (res.ok && res.redirected && new URL(res.url).pathname !== new URL(url).pathname) return { status: 'gone' };
      if (res.ok) return { status: 'ok', text: await res.text() };
      if (res.status === 404 || res.status === 410) return { status: 'gone' };
      if (res.status !== 429 && res.status < 500) return { status: 'error', problem: `HTTP ${res.status}` };
      problem = `HTTP ${res.status}`;
    } catch (err) {
      problem = err.cause?.code ?? err.name;
    }
    if (i >= attempts) return { status: 'error', problem };
    await sleep(10000 * i);
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

// Direcciones de productos del mapa del sitio. Los productos empiezan con su
// código interno (/20073831-mccormick-empamix-completo-60g); las categorías no.
export async function productUrls(sitemapUrl) {
  const index = await download(sitemapUrl, XML_HEADERS);
  if (index.status !== 'ok') throw new Error(`no se pudo leer el mapa del sitio (${index.problem ?? index.status})`);
  const files = index.text.includes('<sitemapindex') ? locs(index.text) : [sitemapUrl];
  const urls = new Set();
  for (const file of files) {
    const xml = file === sitemapUrl ? index : await download(file, XML_HEADERS);
    if (xml.status !== 'ok') throw new Error(`no se pudo leer ${file} (${xml.problem ?? xml.status})`);
    for (const url of locs(xml.text)) if (/^https:\/\/[^/]+\/\d{5,}-[^/?#]+$/.test(url)) urls.add(url);
  }
  return [...urls];
}

// Ruta de cada categoría desde su departamento: "268" -> ["Despensa", "Salsas", ...].
// La lista de categorías sí funciona en su API pública (la búsqueda de productos no).
const CATEGORY_QUERY = '{ categoryList { children { id name children { id name children { id name children { id name } } } } } }';
export async function categoryPaths(origin) {
  const res = await fetch(`${origin}/graphql`, {
    method: 'POST',
    headers: { ...BOT_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CATEGORY_QUERY }),
    signal: AbortSignal.timeout(45000),
  });
  const paths = new Map();
  const walk = (nodes, parent) => {
    for (const node of nodes ?? []) {
      const path = [...parent, node.name];
      paths.set(String(node.id), path);
      walk(node.children, path);
    }
  };
  walk((await res.json()).data?.categoryList?.[0]?.children, []);
  if (!paths.size) throw new Error(`no se pudo leer la lista de categorías (HTTP ${res.status})`);
  return paths;
}

const decode = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .trim();

// Precio de la etiqueta con data-price-type="finalPrice" (vigente) u "oldPrice" (antes de la oferta).
function priceOf(html, type) {
  const tag = new RegExp(`<[^>]*data-price-type="${type}"[^>]*>`).exec(html)?.[0];
  const amount = tag && /data-price-amount="([\d.]+)"/.exec(tag)?.[1];
  return amount ? Number(amount) : null;
}

// Lee la página de un producto. `departments` son los departamentos de súper
// (normalizados): lo que solo está en farmacia, ferretería o juguetería se salta.
export function parseProductPage(html, url, paths, departments) {
  const name = decode(/data-ui-id="page-title-wrapper"[^>]*>([^<]+)</.exec(html)?.[1]);
  const price = priceOf(html, 'finalPrice');
  if (!name || !price) return null;
  const ids = /"categories":\[([^\]]*)\]/.exec(html)?.[1]?.match(/\d+/g) ?? [];
  const known = ids.map((id) => paths.get(id)).filter(Boolean);
  const grocery = known.filter((p) => departments.has(normalizeText(p[0]))).sort((a, b) => b.length - a.length);
  return {
    skip: known.length > 0 && grocery.length === 0,
    offer: {
      sku: /- SKU (\d+)/.exec(html)?.[1] ?? /"sku":"([^"]+)"/.exec(html)?.[1] ?? null,
      gtin: /itemprop="upc">\s*(\d{8,14})\s*</.exec(html)?.[1] ?? null,
      title: name,
      name,
      brand: decode(/<input[^>]*class="product-brand-[^"]*"[^>]*value="([^"]*)"/.exec(html)?.[1]) || null,
      category: (grocery[0] ?? []).join(' / '),
      size: null, // se deduce del nombre
      price,
      listPrice: priceOf(html, 'oldPrice'),
      inStock: !/"is_salable":"?0/.test(html),
      url,
      image: decode(/<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]) || null,
    },
  };
}

// Un producto: { status: 'ok', offer } | { status: 'skip' } (no es de súper) |
// { status: 'gone' } (ya no existe o no tiene precio) | { status: 'error', problem }.
export async function fetchProduct(url, { paths, departments }) {
  const page = await download(url, PAGE_HEADERS);
  if (page.status !== 'ok') return page;
  const parsed = parseProductPage(page.text, url, paths, departments);
  if (!parsed) return { status: 'gone' };
  return parsed.skip ? { status: 'skip' } : { status: 'ok', offer: parsed.offer };
}
