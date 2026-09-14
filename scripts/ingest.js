// Bots de precios: recorren los súper y actualizan la base de datos.
//   npm run ingest                  -> todas las tiendas activas
//   npm run ingest -- superxtra     -> solo esa tienda
// Prueba rápida: INGEST_QUERIES="leche,arroz" INGEST_MAX_PAGES=1 npm run ingest
// En producción lo corre GitHub Actions dos veces al día (.github/workflows/precios.yml).
// Súper 99 se lee producto por producto con su propio bot (scripts/super99.js).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, upsertStore, upsertOffers, countInStock, markUnseenOffersOutOfStock, ROOT } from '../server/db.js';
import { connectors } from '../connectors/index.js';
import { normalizeOffer, loadMatcher, attachByName } from './lib/pipeline.js';

const only = process.argv.slice(2);
const stores = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stores.json'), 'utf8'));
const db = await openDb();

let failures = 0;
for (const store of stores) {
  if (only.length && !only.includes(store.id)) continue;
  if (store.enabled === false) {
    console.log(`- ${store.name}: pendiente (${store.note ?? 'sin conector'})`);
    continue;
  }
  if (store.connector?.type === 'pages') {
    console.log(`- ${store.name}: lo actualiza su propio bot (npm run super99)`);
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

  const joined = attachByName(offers, await loadMatcher(db, store.id));
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
