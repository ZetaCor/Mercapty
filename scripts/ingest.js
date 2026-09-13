// Actualiza la base de datos con los precios de todas las tiendas.
//   npm run ingest                    -> todas las tiendas
//   npm run ingest -- superxtra rey   -> solo esas tiendas
// Pensado para correr periódicamente (cron / tarea programada), p. ej. cada 6 horas.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, upsertStore, upsertOffer, markUnseenOffersOutOfStock, ROOT } from '../server/db.js';
import { connectors } from '../connectors/index.js';
import { storeSearchUrl } from '../connectors/util.js';
import { normalizeGtin, parseSize } from '../server/lib/normalize.js';

const only = process.argv.slice(2);
const stores = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stores.json'), 'utf8'));
const db = openDb();

// Convierte la oferta cruda de cualquier conector al formato que guarda la base.
function normalizeOffer(store, raw) {
  const price = Number(raw.price);
  const name = String(raw.name ?? '').trim();
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const listPrice = Number(raw.listPrice);
  const sizeLabel = String(raw.size ?? '').trim() || null;
  const size = parseSize(sizeLabel ?? '') ?? parseSize(raw.title ?? name);
  return {
    sku: raw.sku ? String(raw.sku) : null,
    gtin: normalizeGtin(raw.gtin),
    title: raw.title ?? name,
    name,
    brand: String(raw.brand ?? '').trim() || null,
    category: String(raw.category ?? '').trim() || 'Otros',
    sizeLabel,
    sizeValue: size?.value ?? null,
    sizeUnit: size?.unit ?? null,
    price,
    listPrice: listPrice > price ? listPrice : null,
    inStock: raw.inStock !== false,
    url: raw.url || storeSearchUrl(store, raw.title ?? name),
    imageUrl: /^https?:\/\//i.test(String(raw.image ?? '')) ? String(raw.image) : null,
    history: raw.history,
  };
}

let failures = 0;
for (const store of stores) {
  if (only.length && !only.includes(store.id)) continue;
  const connector = connectors[store.connector?.type];
  if (!connector) {
    console.warn(`- ${store.name}: conector "${store.connector?.type}" desconocido, se omite`);
    continue;
  }

  upsertStore(db, store);
  const runStartedAt = new Date().toISOString();
  let rawOffers;
  try {
    rawOffers = await connector.fetchOffers(store, { root: ROOT, log: console.log });
  } catch (err) {
    failures++;
    console.error(`✗ ${store.name}: ${err.message}`);
    continue;
  }

  let saved = 0, skipped = 0, stale = 0;
  db.exec('BEGIN');
  try {
    for (const raw of rawOffers) {
      const offer = normalizeOffer(store, raw);
      if (!offer) { skipped++; continue; }
      upsertOffer(db, store.id, offer, runStartedAt);
      saved++;
    }
    stale = markUnseenOffersOutOfStock(db, store.id, runStartedAt);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  const notes = [skipped && `${skipped} descartadas`, stale && `${stale} ya no publicadas`].filter(Boolean);
  console.log(`✓ ${store.name} (${store.connector.type}): ${saved} ofertas${notes.length ? `, ${notes.join(', ')}` : ''}`);
}

const { products } = db.prepare('SELECT COUNT(*) AS products FROM products').get();
const { offers } = db.prepare('SELECT COUNT(*) AS offers FROM offers').get();
console.log(`\nBase lista: ${products} productos, ${offers} ofertas.`);
db.close();
process.exitCode = failures ? 1 : 0;
