// Base de datos: Turso en producción (Vercel y GitHub Actions) y un archivo
// SQLite en data/ para trabajar en local. Es el mismo motor, así que las
// consultas son idénticas en ambos casos.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, matchKey } from './lib/normalize.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_DB = path.join(ROOT, 'data', 'precios.db');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stores (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    homepage   TEXT NOT NULL,
    search_url TEXT,
    platform   TEXT,
    color      TEXT,
    source     TEXT  -- conector que la alimenta: vtex | woocommerce | feed
  )`,
  // Un producto es "lo mismo" en todas las tiendas: se identifica por match_key
  // (código de barras normalizado, o marca+nombre+presentación como respaldo).
  `CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY,
    match_key    TEXT NOT NULL UNIQUE,
    gtin         TEXT,
    name         TEXT NOT NULL,
    brand        TEXT,
    category     TEXT,
    size_label   TEXT,
    size_value   REAL,
    size_unit    TEXT,
    image_url    TEXT,  -- foto publicada por una tienda (la trae el bot)
    custom_image TEXT,  -- foto subida desde el panel de administración; tiene prioridad
    search_text  TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS products_category ON products(category)',
  // El precio de un producto en una tienda concreta.
  `CREATE TABLE IF NOT EXISTS offers (
    id         INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    store_id   TEXT NOT NULL REFERENCES stores(id),
    store_sku  TEXT,
    title      TEXT,
    price      REAL NOT NULL,
    list_price REAL,
    in_stock   INTEGER NOT NULL DEFAULT 1,
    url        TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (product_id, store_id)
  )`,
  'CREATE INDEX IF NOT EXISTS offers_store ON offers(store_id)',
  `CREATE TABLE IF NOT EXISTS price_history (
    offer_id INTEGER NOT NULL REFERENCES offers(id),
    price    REAL NOT NULL,
    seen_at  TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS price_history_offer ON price_history(offer_id, seen_at)',
  // Cada redirección a una tienda: base para medir conversiones o cobrar comisión.
  `CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY,
    offer_id   INTEGER NOT NULL REFERENCES offers(id),
    clicked_at TEXT NOT NULL
  )`,
];

function toObjects({ columns, rows }) {
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

function wrap(client) {
  return {
    all: async (sql, args = []) => toObjects(await client.execute({ sql, args })),
    get: async (sql, args = []) => toObjects(await client.execute({ sql, args }))[0],
    run: (sql, args = []) => client.execute({ sql, args }),
    batch: (statements) => client.batch(statements, 'write'), // una transacción, un solo viaje de red
    close: () => client.close(),
  };
}

export async function openDb() {
  let client;
  if (process.env.TURSO_DATABASE_URL) {
    // Cliente sin módulos nativos: funciona igual en Vercel y en GitHub Actions.
    const { createClient } = await import('@libsql/client/web');
    client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    if (process.env.VERCEL || process.env.CI) {
      throw new Error('Falta TURSO_DATABASE_URL: en producción la base de datos debe estar en Turso');
    }
    mkdirSync(path.dirname(LOCAL_DB), { recursive: true });
    const { createClient } = await import('@libsql/client');
    client = createClient({ url: `file:${LOCAL_DB.replaceAll('\\', '/')}` });
  }
  const db = wrap(client);
  await db.batch(SCHEMA);
  return db;
}

export function upsertStore(db, store) {
  return db.run(`
    INSERT INTO stores (id, name, homepage, search_url, platform, color, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, homepage = excluded.homepage,
      search_url = excluded.search_url, platform = excluded.platform, color = excluded.color,
      source = excluded.source
  `, [
    store.id, store.name, store.homepage, store.searchUrl ?? null, store.platform ?? null,
    store.color ?? null, store.connector?.type ?? null,
  ]);
}

const PRODUCT_UPSERT = `
  INSERT INTO products (match_key, gtin, name, brand, category, size_label, size_value, size_unit, image_url, search_text)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_key) DO UPDATE SET
    category   = CASE WHEN products.category IS NULL OR products.category = 'Otros' THEN excluded.category ELSE products.category END,
    size_label = COALESCE(products.size_label, excluded.size_label),
    size_value = COALESCE(products.size_value, excluded.size_value),
    size_unit  = COALESCE(products.size_unit, excluded.size_unit),
    image_url  = COALESCE(products.image_url, excluded.image_url)`;

const OFFER_UPSERT = `
  INSERT INTO offers (product_id, store_id, store_sku, title, price, list_price, in_stock, url, updated_at)
  VALUES ((SELECT id FROM products WHERE match_key = ?), ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(product_id, store_id) DO UPDATE SET
    store_sku = excluded.store_sku, title = excluded.title, price = excluded.price,
    list_price = excluded.list_price, in_stock = excluded.in_stock, url = excluded.url,
    updated_at = excluded.updated_at`;

// Solo se guarda un punto de historial cuando el precio cambió.
const HISTORY_INSERT = `
  INSERT INTO price_history (offer_id, price, seen_at)
  SELECT o.id, ?, ? FROM offers o
  WHERE o.store_id = ? AND o.product_id = (SELECT id FROM products WHERE match_key = ?)
    AND (SELECT h.price FROM price_history h WHERE h.offer_id = o.id ORDER BY h.seen_at DESC LIMIT 1) IS NOT ?`;

// Guarda las ofertas ya normalizadas por scripts/ingest.js. Cada oferta son
// tres sentencias sin dependencias entre sí, así que se envían en lotes:
// con Turso, cientos de ofertas viajan en una sola petición.
export async function upsertOffers(db, storeId, offers, seenAt, chunkSize = 150) {
  for (let i = 0; i < offers.length; i += chunkSize) {
    const statements = offers.slice(i, i + chunkSize).flatMap((offer) => {
      const key = matchKey(offer);
      return [
        {
          sql: PRODUCT_UPSERT,
          args: [
            key, offer.gtin, offer.name, offer.brand, offer.category, offer.sizeLabel,
            offer.sizeValue, offer.sizeUnit, offer.imageUrl,
            normalizeText(`${offer.brand ?? ''} ${offer.name} ${offer.sizeLabel ?? ''} ${offer.gtin ?? ''}`),
          ],
        },
        {
          sql: OFFER_UPSERT,
          args: [key, storeId, offer.sku, offer.title, offer.price, offer.listPrice, offer.inStock ? 1 : 0, offer.url, seenAt],
        },
        { sql: HISTORY_INSERT, args: [offer.price, seenAt, storeId, key, offer.price] },
      ];
    });
    await db.batch(statements);
  }
}

export async function countInStock(db, storeId) {
  return (await db.get('SELECT COUNT(*) AS n FROM offers WHERE store_id = ? AND in_stock = 1', [storeId])).n;
}

// Lo que una tienda ya no publica no debe aparecer como disponible.
export async function markUnseenOffersOutOfStock(db, storeId, runStartedAt) {
  const result = await db.run('UPDATE offers SET in_stock = 0 WHERE store_id = ? AND updated_at < ? AND in_stock = 1', [storeId, runStartedAt]);
  return result.rowsAffected;
}
