// Conector para tiendas en Instaleap (hoy: Supermercados Rey), usando la API
// de catálogo que alimenta su propia web (searchProducts). Busca los términos
// de canasta básica y trae código de barras, precio, disponibilidad, foto y
// el enlace al producto.
import { BOT_HEADERS, GROCERY_QUERIES, envList, sleep } from './util.js';

const API = 'https://nextgentheadless.instaleap.io/api/v3';
const PAGE_SIZE = 50;
const QUERY = `query SearchProducts($searchProductsInput: SearchProductsInput!) {
  searchProducts(searchProductsInput: $searchProductsInput) {
    products { name price photosUrl ean sku isAvailable brand slug categories { name } }
    pagination { page pages }
  }
}`;

const first = (value) => (Array.isArray(value) ? value[0] : value);

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const queries = envList('INGEST_QUERIES') ?? cfg.queries ?? GROCERY_QUERIES;
  const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 2;
  const delayMs = cfg.delayMs ?? 1500; // no saturar el servicio de la tienda
  const origin = new URL(store.homepage).origin;
  const headers = { ...BOT_HEADERS, 'Content-Type': 'application/json', Origin: origin, Referer: `${origin}/` };
  const seen = new Map();

  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operationName: 'SearchProducts',
          query: QUERY,
          variables: {
            searchProductsInput: {
              clientId: cfg.clientId,
              storeReference: cfg.storeReference,
              search: [{ query }],
              currentPage: page,
              pageSize: PAGE_SIZE,
            },
          },
        }),
      });
      if (!res.ok) { log(`  ${store.name}: "${query}" respondió ${res.status}`); break; }
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);

      const result = json.data?.searchProducts;
      for (const p of result?.products ?? []) {
        const key = p.sku ?? p.slug;
        if (!key || seen.has(key)) continue;
        seen.set(key, {
          sku: p.sku,
          gtin: first(p.ean),
          title: p.name,
          name: p.name,
          brand: p.brand,
          category: (p.categories ?? []).map((c) => c.name).join(' / '),
          size: null, // se deduce del nombre ("946ml", "1.3kg"...)
          price: p.price,
          listPrice: null,
          inStock: p.isAvailable !== false,
          url: p.slug ? `${origin}/p/${p.slug}` : null,
          image: first(p.photosUrl),
        });
      }
      if (!result || page >= (result.pagination?.pages ?? 0)) break;
      await sleep(delayMs);
    }
    await sleep(delayMs);
  }
  return [...seen.values()];
}
