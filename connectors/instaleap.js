// Conector para tiendas en Instaleap (hoy: Supermercados Rey), usando la API de catálogo que
// alimenta su propia web. Trae código de barras, precio, disponibilidad, marca, foto y el
// enlace al producto. Tiene dos modos:
//
//   - "mode": "categories" (el bueno): pide el árbol de categorías de la tienda y recorre
//     cada una hasta que se acaba. Así entra el catálogo completo, incluida la farmacia y
//     todo lo que no es comida.
//   - por búsquedas (el viejo): busca los términos de canasta básica. Solo ve lo que cae en
//     esos términos y, con el tope de páginas, se dejaba fuera la mayor parte del catálogo.
import { BOT_HEADERS, GROCERY_QUERIES, envList, sleep } from './util.js';

const API = 'https://nextgentheadless.instaleap.io/api/v3';
const PAGE_SIZE = 50;            // por búsqueda
const CATEGORY_PAGE_SIZE = 100;  // por categoría, que acepta más
const QUERY = `query SearchProducts($searchProductsInput: SearchProductsInput!) {
  searchProducts(searchProductsInput: $searchProductsInput) {
    products { name price photosUrl ean sku isAvailable brand slug categories { name } }
    pagination { page pages }
  }
}`;

const CATEGORIES_QUERY = `query GetCategory($getCategoryInput: GetCategoryInput!) {
  getCategory(getCategoryInput: $getCategoryInput) { name reference }
}`;

const BY_CATEGORY_QUERY = `query GetProductsByCategory($getProductsByCategoryInput: GetProductsByCategoryInput!) {
  getProductsByCategory(getProductsByCategoryInput: $getProductsByCategoryInput) {
    category { name products { name price photosUrl ean sku isAvailable brand slug } }
  }
}`;

const first = (value) => (Array.isArray(value) ? value[0] : value);

// Una consulta al API de la tienda.
async function pedir(headers, query, variables) {
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  if (!res.ok) throw new Error(`su API respondió ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// Un producto del API con la forma que espera scripts/ingest.js.
function comoOferta(p, { origin, category }) {
  return {
    sku: p.sku,
    gtin: first(p.ean),
    title: p.name,
    name: p.name,
    brand: p.brand,
    category,
    size: null, // se deduce del nombre ("946ml", "1.3kg"...)
    price: p.price,
    listPrice: null,
    inStock: p.isAvailable !== false,
    url: p.slug ? `${origin}/p/${p.slug}` : null,
    image: first(p.photosUrl),
  };
}

// Recorre el catálogo entero, categoría por categoría. Se pide página tras página hasta que
// una viene incompleta, que es como esta API dice «ya no hay más».
async function fetchByCategories(store, { log }) {
  const cfg = store.connector;
  const origin = new URL(store.homepage).origin;
  const headers = { ...BOT_HEADERS, 'Content-Type': 'application/json', Origin: origin, Referer: `${origin}/` };
  const tienda = { clientId: cfg.clientId, storeReference: cfg.storeReference };
  const pageSize = cfg.pageSize ?? CATEGORY_PAGE_SIZE;
  const delayMs = cfg.delayMs ?? 1500;

  const { getCategory: categorias = [] } = await pedir(headers, CATEGORIES_QUERY, { getCategoryInput: tienda });
  log(`  ${store.name}: ${categorias.length} categorías por recorrer`);

  const seen = new Map();
  for (const categoria of categorias) {
    const antes = seen.size;
    for (let page = 1; page <= (cfg.maxPages ?? 200); page++) {
      const data = await pedir(headers, BY_CATEGORY_QUERY, {
        getProductsByCategoryInput: { ...tienda, categoryReference: categoria.reference, currentPage: page, pageSize },
      });
      const products = data?.getProductsByCategory?.category?.products ?? [];
      for (const p of products) {
        const key = p.sku ?? p.slug;
        if (key && !seen.has(key)) seen.set(key, comoOferta(p, { origin, category: categoria.name }));
      }
      if (products.length < pageSize) break;
      await sleep(delayMs);
    }
    log(`  ${store.name}: ${categoria.name} → ${seen.size - antes} productos`);
    await sleep(delayMs);
  }
  return [...seen.values()];
}

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const testQueries = envList('INGEST_QUERIES'); // en pruebas rápidas se busca por palabra
  if (cfg.mode === 'categories' && !testQueries) return fetchByCategories(store, { log });

  const queries = testQueries ?? cfg.queries ?? GROCERY_QUERIES;
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
