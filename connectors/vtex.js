// Conector para tiendas en VTEX (hoy: Super Xtra y El Machetazo), usando la
// API pública de catálogo que la propia tienda expone a su sitio web.
// Devuelve código de barras, precio, precio regular, disponibilidad y el
// enlace directo al producto.
//
// IMPORTANTE: úsalo solo con autorización de la tienda o después de revisar
// sus términos de uso. Está desactivado por defecto (ver data/stores.json).
import { sleep } from './util.js';

// Términos de búsqueda por defecto: productos de la canasta básica.
const DEFAULT_QUERIES = [
  'leche', 'arroz', 'frijoles', 'lentejas', 'aceite', 'azucar', 'sal', 'cafe',
  'huevos', 'pan', 'pasta', 'atun', 'pollo', 'queso', 'mantequilla', 'avena',
  'papel higienico', 'detergente', 'cloro', 'jabon', 'pasta dental', 'panales',
];
const PAGE_SIZE = 50; // máximo que acepta VTEX por página

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const base = cfg.baseUrl ?? new URL(store.homepage).origin;
  const queries = cfg.queries ?? DEFAULT_QUERIES;
  const maxPages = cfg.maxPages ?? 2;
  const delayMs = cfg.delayMs ?? 1500; // no saturar el sitio de la tienda
  const seen = new Map();

  for (const query of queries) {
    for (let page = 0; page < maxPages; page++) {
      const from = page * PAGE_SIZE;
      const url = `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=${from}&_to=${from + PAGE_SIZE - 1}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'PanaPrecioBot/0.1', Accept: 'application/json' } });
      if (!res.ok) { log(`  ${store.name}: "${query}" respondió ${res.status}`); break; }
      const products = await res.json();

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
            category: vtexCategory(product.categories),
            size: null, // se deduce del nombre ("946ml", "5 lb"...)
            price: offer.Price,
            listPrice: offer.ListPrice,
            inStock: Boolean(offer.IsAvailable ?? offer.AvailableQuantity > 0),
            url: product.link,
            image: item.images?.[0]?.imageUrl,
          });
        }
      }
      if (products.length < PAGE_SIZE) break;
      await sleep(delayMs);
    }
    await sleep(delayMs);
  }
  return [...seen.values()];
}

// "/Supermercado/Lácteos/Leche/" -> "Lácteos"
function vtexCategory(categories) {
  const parts = (categories?.[0] ?? '').split('/').filter(Boolean);
  const meaningful = parts.filter((p) => !/^supermercado$/i.test(p));
  return meaningful[0] ?? parts[0] ?? 'Otros';
}
