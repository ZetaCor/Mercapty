// Conector para tiendas en WooCommerce (hoy: Superunico), usando la Store API
// pública (/wp-json/wc/store/v1/products) que alimenta el propio sitio.
// Recorre el catálogo completo página por página, despacio.
import { BOT_HEADERS, sleep } from './util.js';
import { isValidGtin, normalizeGtin } from '../server/lib/normalize.js';

const PER_PAGE = 100; // máximo que acepta la Store API

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? m;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const base = cfg.baseUrl ?? new URL(store.homepage).origin;
  const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 60;
  const delayMs = cfg.delayMs ?? 1500;
  const offers = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${base}/wp-json/wc/store/v1/products?per_page=${PER_PAGE}&page=${page}`, { headers: BOT_HEADERS });
    if (res.status === 400 && page > 1) break; // pedir una página después de la última responde 400
    if (!res.ok) throw new Error(`página ${page} respondió ${res.status}`);
    const products = await res.json();

    for (const p of products) {
      const minor = p.prices?.currency_minor_unit ?? 2;
      const money = (v) => (v == null || v === '' ? null : Number(v) / 10 ** minor);
      // Muchas tiendas usan el código de barras como SKU; solo se toma si su dígito verificador es válido.
      const gtin = normalizeGtin(p.sku);
      const name = decodeEntities(p.name);
      offers.push({
        sku: String(p.id),
        gtin: gtin && isValidGtin(gtin) ? gtin : null,
        title: name,
        name,
        brand: p.brands?.[0]?.name ?? null,
        category: (p.categories ?? []).map((c) => decodeEntities(c.name)).join(' / '),
        size: null,
        price: money(p.prices?.price),
        listPrice: money(p.prices?.regular_price),
        inStock: p.is_in_stock !== false,
        url: p.permalink,
        image: p.images?.[0]?.src,
      });
    }

    const totalPages = Number(res.headers.get('x-wp-totalpages')) || page;
    log(`  ${store.name}: página ${page}/${totalPages}`);
    if (page >= totalPages || products.length < PER_PAGE) break;
    await sleep(delayMs);
  }
  return offers;
}
