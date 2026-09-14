// Conector para tiendas en VTEX (hoy: Super Xtra y El Machetazo), usando la
// API pública de catálogo que la propia tienda expone a su sitio web.
// Devuelve código de barras, precio, precio regular, disponibilidad, foto y
// el enlace directo al producto.
//
// Con "mode": "categories" recorre completos los departamentos de "departments"
// ({ id, name }): así no se escapa ningún producto (antes faltaban el ron Flor
// de Caña o la Coca-Cola normal porque ninguna palabra de búsqueda los traía).
// Sin ese modo, busca los términos de canasta básica.
import { BOT_HEADERS, GROCERY_QUERIES, envList, sleep } from './util.js';

const PAGE_SIZE = 50;     // máximo que acepta VTEX por página
const MAX_OFFSET = 2500;  // VTEX no pagina más allá de 2500 productos por consulta
// Desde $0.01: VTEX pone precio 0 a lo agotado, y en un departamento grande
// son miles de productos que no sirven para comparar.
const ALL_PRICES = [0.01, 99999.99];
// Un departamento con más de 2500 productos se parte por precio: primero en
// estas franjas y, si alguna sigue siendo muy grande, por la mitad.
const PRICE_BANDS = [0.01, 1, 2, 3, 5, 10, 20, 50, 100000];

const cents = (n) => Math.round(n * 100) / 100;

// Una página de resultados y el total de la consulta (cabecera "resources":
// "0-49/7468"). Si la tienda pide calma (HTTP 429), falla o se corta la red,
// se espera y se reintenta.
async function fetchPage(url, from, ctx, attempts = 4) {
  for (let i = 1; ; i++) {
    let problem;
    try {
      const res = await fetch(`${url}&_from=${from}&_to=${from + PAGE_SIZE - 1}`, {
        headers: BOT_HEADERS, signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const total = Number(res.headers.get('resources')?.split('/')[1] ?? 0);
        return { ok: true, data: await res.json(), total };
      }
      if (res.status !== 429 && res.status < 500) return { ok: false, status: res.status };
      problem = `HTTP ${res.status}`;
    } catch (err) {
      problem = err.cause?.code ?? err.name;
    }
    if (i >= attempts) return { ok: false, status: problem };
    ctx.log(`  ${ctx.store}: la tienda pidió esperar (${problem}); reintento en ${15 * i} s`);
    await sleep(15000 * i);
  }
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

// Todas las páginas de una consulta, hasta el tope de VTEX. Una página que
// falla se salta; las demás siguen.
async function crawlPages(url, first, seen, ctx, maxPages = MAX_OFFSET / PAGE_SIZE) {
  addProducts(first.data, seen);
  const end = Math.min(first.total, maxPages * PAGE_SIZE);
  for (let from = PAGE_SIZE; from < end; from += PAGE_SIZE) {
    await sleep(ctx.delayMs);
    const page = await fetchPage(url, from, ctx);
    if (page.ok) addProducts(page.data, seen);
    else ctx.log(`  ${ctx.store}: una página respondió ${page.status}; se omite`);
  }
}

function priceRanges([lo, hi]) {
  if (lo === ALL_PRICES[0] && hi === ALL_PRICES[1]) {
    return PRICE_BANDS.slice(0, -1).map((from, i) => [from, cents(PRICE_BANDS[i + 1] - 0.01)]);
  }
  if (hi - lo < 0.02) return null; // más de 2500 productos con el mismo precio: no se puede partir más
  const mid = cents((lo + hi) / 2);
  return [[lo, mid], [cents(mid + 0.01), hi]];
}

// Un departamento completo, solo lo que tiene precio. Si pasa de 2500
// productos, se parte por precio.
async function crawlDepartment(filter, seen, ctx, range = ALL_PRICES) {
  const url = `${ctx.search}?${filter}&fq=${encodeURIComponent(`P:[${range[0]} TO ${range[1]}]`)}`;
  const first = await fetchPage(url, 0, ctx);
  if (!first.ok) { ctx.log(`  ${ctx.store}: una consulta respondió ${first.status}`); return; }
  const parts = first.total > MAX_OFFSET ? priceRanges(range) : null;
  if (!parts) { await crawlPages(url, first, seen, ctx); return; }
  for (const part of parts) {
    await sleep(ctx.delayMs);
    await crawlDepartment(filter, seen, ctx, part);
  }
}

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const base = cfg.baseUrl ?? new URL(store.homepage).origin;
  const ctx = { search: `${base}/api/catalog_system/pub/products/search`, delayMs: cfg.delayMs ?? 1500, log, store: store.name };
  const seen = new Map();
  const testQueries = envList('INGEST_QUERIES'); // en pruebas rápidas se busca por palabra

  if (cfg.mode === 'categories' && cfg.departments?.length && !testQueries) {
    for (const dept of cfg.departments) {
      const before = seen.size;
      await crawlDepartment(`fq=C:/${dept.id}/`, seen, ctx);
      const found = seen.size - before;
      log(`  ${store.name}: ${dept.name}, ${found} productos${found ? '' : ' (¿cambió su id en data/stores.json?)'}`);
      await sleep(ctx.delayMs);
    }
    return [...seen.values()];
  }

  const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 2;
  for (const query of testQueries ?? cfg.queries ?? GROCERY_QUERIES) {
    const url = `${ctx.search}?ft=${encodeURIComponent(query)}`;
    const first = await fetchPage(url, 0, ctx);
    if (first.ok) await crawlPages(url, first, seen, ctx, maxPages);
    else log(`  ${store.name}: "${query}" respondió ${first.status}`);
    await sleep(ctx.delayMs);
  }
  return [...seen.values()];
}
