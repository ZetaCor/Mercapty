// Bots de precios: recorren los súper y actualizan la base de datos.
//   npm run ingest                  -> todas las tiendas activas
//   npm run ingest -- superxtra     -> solo esa tienda
// Prueba rápida: INGEST_QUERIES="leche,arroz" INGEST_MAX_PAGES=1 npm run ingest
// En producción lo corre GitHub Actions una vez al día (.github/workflows/precios.yml).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, upsertStore, upsertOffers, countInStock, markUnseenOffersOutOfStock, ROOT } from '../server/db.js';
import { connectors } from '../connectors/index.js';
import { storeSearchUrl } from '../connectors/util.js';
import { canonicalCategory, matchKey, normalizeGtin, parsePack, parseSize } from '../server/lib/normalize.js';
import { createMatcher } from '../server/lib/matching.js';

const only = process.argv.slice(2);
const stores = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stores.json'), 'utf8'));
const db = await openDb();

// Convierte la oferta cruda de cualquier conector al formato que guarda la base.
function normalizeOffer(store, raw) {
  const price = Number(raw.price);
  const name = String(raw.name ?? '').trim();
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const listPrice = Number(raw.listPrice);
  const sizeLabel = String(raw.size ?? '').trim() || null;
  const size = parseSize(sizeLabel ?? '') ?? parseSize(raw.title ?? name);
  const pack = Math.max(size?.count ?? 1, parsePack(raw.title ?? name));
  // "946 ml (Pack de 12)": el tamaño del nombre es de una unidad; el total son 12 × 946 ml.
  const sizeValue = size ? (size.count > 1 ? size.value : size.value * pack) : null;
  return {
    sku: raw.sku ? String(raw.sku) : null,
    gtin: normalizeGtin(raw.gtin),
    title: raw.title ?? name,
    name,
    brand: String(raw.brand ?? '').trim() || null,
    category: canonicalCategory(raw.category, name),
    // Categoría más específica de la tienda ("Sodas"): sirve para buscar.
    categoryLeaf: String(raw.category ?? '').split(/[/>|]/).map((s) => s.trim()).filter(Boolean).pop() ?? '',
    sizeLabel,
    sizeValue,
    sizeUnit: size?.unit ?? null,
    pack,
    price,
    listPrice: listPrice > price ? listPrice : null,
    inStock: raw.inStock !== false,
    url: raw.url || storeSearchUrl(store, raw.title ?? name),
    imageUrl: /^https?:\/\//i.test(String(raw.image ?? '')) ? String(raw.image) : null,
  };
}

// Productos sin código de barras, o con uno que ninguna otra tienda usa (cada
// súper puede usar otro código para lo mismo): se intenta unir cada uno con el
// mismo producto de otra tienda (ver server/lib/matching.js). Cada producto de
// otra tienda se une como máximo con uno de esta; gana el parecido más alto.
async function attachByName(storeId, offers) {
  const candidates = await db.all(`
    SELECT p.match_key AS matchKey, p.name, p.brand, p.category
    FROM products p
    WHERE EXISTS (SELECT 1 FROM offers o WHERE o.product_id = p.id AND o.store_id <> ? AND o.in_stock = 1)
  `, [storeId]);
  const known = new Set(candidates.map((c) => c.matchKey));
  const pending = offers.filter((o) => !o.gtin || !known.has(matchKey(o)));
  if (!pending.length) return 0;
  const findMatch = createMatcher(candidates);
  const proposals = pending
    .map((offer) => ({ offer, match: findMatch(offer) }))
    .filter((p) => p.match)
    .sort((a, b) => b.match.score - a.match.score);
  const taken = new Set();
  for (const { offer, match } of proposals) {
    if (taken.has(match.matchKey)) continue;
    taken.add(match.matchKey);
    offer.matchKey = match.matchKey;
    if (process.env.INGEST_SHOW_MATCHES) console.log(`  ${offer.name} [${offer.brand}]  ⇄  ${match.name}  (${match.score.toFixed(2)})`);
  }
  return taken.size;
}

let failures = 0;
for (const store of stores) {
  if (only.length && !only.includes(store.id)) continue;
  if (store.enabled === false) {
    console.log(`- ${store.name}: pendiente (${store.note ?? 'sin conector'})`);
    continue;
  }
  const connector = connectors[store.connector?.type];
  if (!connector) {
    console.warn(`- ${store.name}: conector "${store.connector?.type}" desconocido, se omite`);
    continue;
  }

  const started = Date.now();
  const runStartedAt = new Date().toISOString();
  let offers;
  try {
    const raw = await connector.fetchOffers(store, { root: ROOT, log: console.log });
    offers = raw.map((r) => normalizeOffer(store, r)).filter(Boolean);
  } catch (err) {
    failures++;
    console.error(`✗ ${store.name}: ${err.message}`);
    continue;
  }
  // Un sitio caído o que bloqueó al bot no debe dejar toda la tienda como agotada.
  if (!offers.length) {
    failures++;
    console.error(`✗ ${store.name}: no se obtuvo ningún producto`);
    continue;
  }

  const joined = await attachByName(store.id, offers);
  await upsertStore(db, store);
  const before = await countInStock(db, store.id);
  await upsertOffers(db, store.id, offers, runStartedAt);
  let stale = 0;
  if (offers.length >= before * 0.5) {
    stale = await markUnseenOffersOutOfStock(db, store.id, runStartedAt);
  } else {
    console.warn(`  ${store.name}: llegaron muchos menos productos que antes (${offers.length} de ${before}); no se marcan agotados`);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const notes = [joined && `${joined} unidas por nombre`, stale && `${stale} ya no publicadas`].filter(Boolean);
  console.log(`✓ ${store.name} (${store.connector.type}): ${offers.length} ofertas en ${seconds}s${notes.length ? `, ${notes.join(', ')}` : ''}`);
}

const totals = await db.get(`
  SELECT (SELECT COUNT(*) FROM products) AS products,
    (SELECT COUNT(*) FROM offers WHERE in_stock = 1) AS offers`);
console.log(`\nBase lista: ${totals.products} productos, ${totals.offers} ofertas disponibles.`);
db.close();
process.exitCode = failures ? 1 : 0;
