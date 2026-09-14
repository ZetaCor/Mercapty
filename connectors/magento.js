// Conector para tiendas Magento que muestran sus productos en las páginas de
// categoría (hoy: Super Carnes). Cada página trae hasta 160 productos con
// nombre, precio, precio anterior, foto y código de barras (su SKU, que también
// va al final de la dirección del producto). Súper 99 también es Magento, pero
// sus listados los arma un buscador externo: tiene su propio bot (super99.js).
//
// Sus categorías cargan más productos al bajar (sin páginas ?p=2), así que se
// leen las subcategorías finales, que caben en una página: el mapa del sitio
// las lista todas.
import { decodeHtml, fetchText, sitemapLocs, sleep, tidyName } from './util.js';

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

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
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
