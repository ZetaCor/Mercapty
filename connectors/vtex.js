// Conector para tiendas en VTEX (hoy: Super Xtra y El Machetazo), usando la
// API pública de catálogo que la propia tienda expone a su sitio web.
// Devuelve código de barras, precio, precio regular, disponibilidad, foto y
// el enlace directo al producto.
import { BOT_HEADERS, envList, sleep } from './util.js';

// Términos de búsqueda por defecto: lo más comprado en un súper.
const DEFAULT_QUERIES = [
  'leche', 'queso', 'yogurt', 'mantequilla', 'huevos', 'arroz', 'frijoles', 'lentejas',
  'aceite', 'azucar', 'sal', 'cafe', 'pasta', 'harina', 'avena', 'cereal', 'atun',
  'sardina', 'salsa', 'mayonesa', 'pan', 'galletas', 'pollo', 'carne', 'jamon',
  'salchichas', 'agua', 'jugo', 'refresco', 'cerveza', 'papel higienico', 'detergente',
  'cloro', 'suavizante', 'lavaplatos', 'jabon', 'shampoo', 'pasta dental',
  'desodorante', 'panales', 'toallitas',
];
const PAGE_SIZE = 50; // máximo que acepta VTEX por página

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const base = cfg.baseUrl ?? new URL(store.homepage).origin;
  const queries = envList('INGEST_QUERIES') ?? cfg.queries ?? DEFAULT_QUERIES;
  const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 2;
  const delayMs = cfg.delayMs ?? 1500; // no saturar el sitio de la tienda
  const seen = new Map();

  for (const query of queries) {
    for (let page = 0; page < maxPages; page++) {
      const from = page * PAGE_SIZE;
      const url = `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=${from}&_to=${from + PAGE_SIZE - 1}`;
      const res = await fetch(url, { headers: BOT_HEADERS });
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
            category: product.categories?.[0] ?? '', // "/Lácteos, Quesos y refrigerados/Leche/"
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
