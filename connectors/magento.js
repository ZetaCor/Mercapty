// Conector para tiendas Magento. Tiene dos modos:
//
//   - listados (el de siempre, hoy Super Carnes): lee las páginas de categoría.
//   - "mode": "api" (Panafoto y Do It Center): le pide el catálogo al propio Magento por
//     /graphql, que es lo que usa su web para pintarse. Es más limpio y más rápido, pero
//     solo sirve donde la tienda lo deja abierto: Arrocha y Sysco no.
//
// Modo listados: cada página trae hasta 160 productos con
// nombre, precio, precio anterior, foto y código de barras (su SKU, que también
// va al final de la dirección del producto). Súper 99 también es Magento, pero
// sus listados los arma un buscador externo: tiene su propio bot (super99.js).
//
// Sus categorías cargan más productos al bajar (sin páginas ?p=2), así que se
// leen las subcategorías finales, que caben en una página: el mapa del sitio
// las lista todas.
import { BOT_HEADERS, decodeHtml, fetchText, sitemapLocs, sleep, tidyName } from './util.js';

const PAGE_SIZE = 160; // productos que muestra cada página de categoría

const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag ?? '')?.[1];

// Precio de la etiqueta con data-price-type="finalPrice" (vigente) u "oldPrice" (antes de la oferta).
export function priceOf(html, type) {
  const tag = new RegExp(`<[^>]*data-price-type="${type}"[^>]*>`).exec(html)?.[0];
  const amount = attr(tag, 'data-price-amount');
  return amount ? Number(amount) : null;
}

// Productos de una página de categoría.
export function parseListing(html, category) {
  const items = [];
  for (const chunk of html.split('product-item-info').slice(1)) {
    const link = /<a[^>]*class="product-item-link"[^>]*>([\s\S]*?)<\/a>/.exec(chunk);
    const url = decodeHtml(attr(link?.[0], 'href'));
    const name = tidyName(decodeHtml(link?.[1]?.replace(/<[^>]+>/g, '')));
    const price = priceOf(chunk, 'finalPrice');
    if (!url || !name || !price) continue;
    const sku = attr(chunk, 'data-product-sku');
    items.push({
      sku: sku ?? null,
      gtin: /^\d{8,14}$/.test(sku ?? '') ? sku : /-(\d{8,14})$/.exec(url)?.[1] ?? null,
      title: name,
      name,
      brand: null, // no viene en el listado; se une por código de barras
      category,
      size: null, // se deduce del nombre
      price,
      listPrice: priceOf(chunk, 'oldPrice'),
      inStock: /tocart/i.test(chunk) && !/stock unavailable|agotado/i.test(chunk),
      url,
      image: decodeHtml(attr(/<img[^>]*class="product-image-photo"[^>]*>/.exec(chunk)?.[0], 'src')) || null,
    });
  }
  return items;
}

// Subcategorías finales de los departamentos de súper, según el mapa del sitio.
// Los productos tienen direcciones planas que terminan en su código de barras.
async function leafCategories(cfg) {
  const prefix = `${cfg.baseUrl}/`;
  const departments = new Set(cfg.departments);
  const paths = new Set();
  for (const url of await sitemapLocs(cfg.sitemap)) {
    if (!url.startsWith(prefix) || url.includes('js')) continue; // su robots.txt: Disallow: *js
    const path = url.slice(prefix.length).replace(/\/$/, '');
    if (departments.has(path.split('/')[0]) && !/-\d{8,14}$/.test(path)) paths.add(path);
  }
  const all = [...paths];
  return all
    .filter((p) => !all.some((q) => q.startsWith(`${p}/`)))
    .map((p) => ({ url: prefix + p, category: p.replace(/-/g, ' ').split('/').join(' / ') }));
}

// --- Modo API (GraphQL) ---

const API_PAGE = 100;     // productos por petición
const API_ATTEMPTS = 3;

const CATEGORY_QUERY = `query($paths:[String]!){categoryList(filters:{url_path:{in:$paths}}){uid name url_path}}`;

// La marca viene en un campo propio de cada tienda («marca_text» en Do It Center) o no viene.
// Pedir un campo que no existe hace fallar la consulta entera, así que solo se añade si la
// configuración lo nombra.
const productsQuery = (brandField) => `query($uid:String!,$page:Int!,$size:Int!){
  products(filter:{category_uid:{eq:$uid}},pageSize:$size,currentPage:$page){
    total_count
    items{
      sku
      name
      url_key
      stock_status
      image{url}
      price_range{minimum_price{final_price{value} regular_price{value}}}
      ${brandField ?? ''}
    }
  }
}`;

// Una consulta, con reintentos: estas tiendas cortan de vez en cuando.
async function graphql(endpoint, query, variables, attempts = API_ATTEMPTS) {
  for (let i = 1; ; i++) {
    let problem;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...BOT_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) problem = `HTTP ${res.status}`;
      else {
        const { data, errors } = await res.json();
        if (errors?.length) problem = errors.map((e) => e.message).join(' · ');
        else return data;
      }
    } catch (err) {
      problem = err.message;
    }
    if (i >= attempts) throw new Error(problem ?? 'sin respuesta');
    await sleep(1000 * i);
  }
}

// Un producto del API con la forma que espera scripts/ingest.js. Estas tiendas no publican
// el código de barras, así que se unen por marca y nombre (server/lib/matching.js).
function fromApi(item, { cfg, category, brandField }) {
  const prices = item.price_range?.minimum_price;
  const price = prices?.final_price?.value;
  const regular = prices?.regular_price?.value;
  if (!price || !item.url_key) return null;
  const name = tidyName(item.name);
  return {
    sku: item.sku ?? null,
    gtin: null,
    title: name,
    name,
    brand: (brandField ? item[brandField] : null) || null,
    category,
    size: null,
    price,
    listPrice: regular && regular > price ? regular : null,
    inStock: item.stock_status !== 'OUT_OF_STOCK',
    url: `${cfg.baseUrl}/${item.url_key}${cfg.urlSuffix ?? '.html'}`,
    image: item.image?.url ?? null,
  };
}

// Recorre los departamentos de la configuración. Cada uno dice también en qué categoría de
// Mercapty cae lo que trae, porque «Línea Blanca» o «Ferretería» no existen en un súper.
async function fetchFromApi(store, log) {
  const cfg = store.connector;
  const endpoint = cfg.endpoint ?? `${cfg.baseUrl}/graphql`;
  const departments = cfg.departments.map((d) => (typeof d === 'string' ? { path: d } : d));
  const { categoryList } = await graphql(endpoint, CATEGORY_QUERY, { paths: departments.map((d) => d.path) });
  const byPath = new Map((categoryList ?? []).map((c) => [c.url_path, c]));
  const query = productsQuery(cfg.brandField);
  const seen = new Map();

  for (const dept of departments) {
    const cat = byPath.get(dept.path);
    if (!cat) {
      log(`  ${store.name}: no existe la categoría «${dept.path}»`);
      continue;
    }
    const antes = seen.size;
    for (let page = 1; ; page++) {
      const { products } = await graphql(endpoint, query, { uid: cat.uid, page, size: API_PAGE });
      const items = products?.items ?? [];
      for (const item of items) {
        const offer = fromApi(item, { cfg, category: dept.category ?? cat.name, brandField: cfg.brandField });
        if (offer && !seen.has(offer.url)) seen.set(offer.url, offer);
      }
      if (!items.length || page * API_PAGE >= (products?.total_count ?? 0)) break;
      await sleep(cfg.delayMs ?? 700);
    }
    log(`  ${store.name}: ${cat.name.trim()} → ${seen.size - antes} productos`);
    await sleep(cfg.delayMs ?? 700);
  }
  return [...seen.values()];
}

// --- Entrada ---

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  if (cfg.mode === 'api') return fetchFromApi(store, log);
  const delayMs = cfg.delayMs ?? 1500;
  const leaves = await leafCategories(cfg);
  log(`  ${store.name}: ${leaves.length} subcategorías por leer`);
  const seen = new Map();
  let full = 0;
  for (const leaf of leaves) {
    const res = await fetchText(leaf.url);
    if (res.status === 'ok') {
      const items = parseListing(res.text, leaf.category);
      for (const item of items) if (!seen.has(item.url)) seen.set(item.url, item);
      if (items.length >= PAGE_SIZE) full++;
    } else {
      log(`  ${store.name}: ${leaf.url} ${res.problem ?? res.status}`);
    }
    await sleep(delayMs);
  }
  if (full) log(`  ${store.name}: ${full} subcategorías llenas (pueden tener más de ${PAGE_SIZE} productos)`);
  return [...seen.values()];
}
