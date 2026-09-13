// Conector para tiendas en VTEX (hoy: Super Xtra y El Machetazo), usando la
// API pública de catálogo que la propia tienda expone a su sitio web.
// Devuelve código de barras, precio, precio regular, disponibilidad, foto y
// el enlace directo al producto.
//
// Con "mode": "categories" recorre todo el catálogo de los departamentos
// indicados (así no se escapa nada, como la Coca-Cola normal); si no, busca los
// términos de canasta básica.
import { BOT_HEADERS, GROCERY_QUERIES, envList, sleep } from './util.js';
import { normalizeText } from '../server/lib/normalize.js';

const PAGE_SIZE = 50;     // máximo que acepta VTEX por página
const MAX_OFFSET = 2500;  // VTEX no pagina más allá de 2500 productos por consulta

// Si la tienda pide calma (HTTP 429), se espera y se reintenta.
async function fetchJson(url, log, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(url, { headers: BOT_HEADERS });
    if (res.status === 429 && i < attempts) {
      log(`  la tienda pidió esperar; reintento en ${15 * i} s`);
      await sleep(15000 * i);
      continue;
    }
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  }
  return { ok: false, status: 429 };
}

function addProducts(products, seen) {
  for (const product of products) {
    for (const item of product.items ?? []) {
      const seller = item.sellers?.find((s) => s.sellerDefault) ?? item.sellers?.[0];
      const offer = seller?.commertialOffer;
      if (!offer || seen.has(item.itemId)) continue;
      seen.set(item.itemId, {
        sku: item.itemId,
        gtin: item.ean,
        title: product.productName,
        name: product.productName,
        brand: product.brand,
        category: product.categories?.[0] ?? '', // "/Supermercado/Bebidas y Jugos/Sodas/"
        size: null, // se deduce del nombre ("946ml", "5 lb"...)
        price: offer.Price,
        listPrice: offer.ListPrice,
        inStock: Boolean(offer.IsAvailable ?? offer.AvailableQuantity > 0),
        url: product.link,
        image: item.images?.[0]?.imageUrl,
      });
    }
  }
}

// Recorre las páginas de una consulta. Devuelve false si llegó al tope de
// VTEX (2500) y quedaron productos sin ver.
async function crawl(url, seen, ctx, maxPages = MAX_OFFSET / PAGE_SIZE) {
  for (let page = 0; page < maxPages; page++) {
    const from = page * PAGE_SIZE;
    const r = await fetchJson(`${url}&_from=${from}&_to=${from + PAGE_SIZE - 1}`, ctx.log);
    if (!r.ok) { ctx.log(`  ${ctx.store}: una consulta respondió ${r.status}`); return true; }
    addProducts(r.data, seen);
    if (r.data.length < PAGE_SIZE) return true;
    await sleep(ctx.delayMs);
  }
  return false;
}

// Una categoría demasiado grande se divide en sus subcategorías.
async function crawlCategory(node, parentIds, seen, ctx) {
  const ids = [...parentIds, node.id];
  const complete = await crawl(`${ctx.base}/api/catalog_system/pub/products/search?fq=C:/${ids.join('/')}/`, seen, ctx);
  if (!complete) {
    for (const child of node.children ?? []) await crawlCategory(child, ids, seen, ctx);
  }
  await sleep(ctx.delayMs);
}

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const ctx = { base: cfg.baseUrl ?? new URL(store.homepage).origin, delayMs: cfg.delayMs ?? 1500, log, store: store.name };
  const seen = new Map();
  const testQueries = envList('INGEST_QUERIES'); // en pruebas rápidas se busca por palabra

  if (cfg.mode === 'categories' && !testQueries) {
    const tree = await fetchJson(`${ctx.base}/api/catalog_system/pub/category/tree/3`, log);
    if (!tree.ok) throw new Error(`no se pudo leer el árbol de categorías (HTTP ${tree.status})`);
    const wanted = cfg.departments?.length ? new Set(cfg.departments.map(normalizeText)) : null;
    const departments = tree.data.filter((d) => !wanted || wanted.has(normalizeText(d.name)));
    log(`  ${store.name}: recorriendo ${departments.map((d) => d.name).join(', ')}`);
    for (const dept of departments) {
      for (const child of dept.children?.length ? dept.children : [dept]) {
        await crawlCategory(child, child === dept ? [] : [dept.id], seen, ctx);
      }
    }
    log(`  ${store.name}: ${seen.size} productos en el catálogo`);
  } else {
    const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 2;
    for (const query of testQueries ?? cfg.queries ?? GROCERY_QUERIES) {
      await crawl(`${ctx.base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}`, seen, ctx, maxPages);
      await sleep(ctx.delayMs);
    }
  }
  return [...seen.values()];
}
