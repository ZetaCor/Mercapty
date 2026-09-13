import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, matchKey } from './lib/normalize.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.PANAPRECIO_DB ?? path.join(ROOT, 'data', 'panaprecio.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stores (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  homepage   TEXT NOT NULL,
  search_url TEXT,
  platform   TEXT,
  color      TEXT,
  source     TEXT  -- conector que la alimenta: demo | feed | vtex
);

-- Un producto es "lo mismo" en todas las tiendas: se identifica por match_key
-- (código de barras normalizado, o marca+nombre+presentación como respaldo).
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  match_key   TEXT NOT NULL UNIQUE,
  gtin        TEXT,
  name        TEXT NOT NULL,
  brand       TEXT,
  category    TEXT,
  size_label  TEXT,
  size_value  REAL,
  size_unit    TEXT,
  image_url    TEXT,  -- foto publicada por una tienda (la trae el conector)
  custom_image TEXT,  -- foto subida desde el panel de administración; tiene prioridad
  search_text  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS products_category ON products(category);

-- El precio de un producto en una tienda concreta.
CREATE TABLE IF NOT EXISTS offers (
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
);
CREATE INDEX IF NOT EXISTS offers_store ON offers(store_id);

CREATE TABLE IF NOT EXISTS price_history (
  offer_id INTEGER NOT NULL REFERENCES offers(id),
  price    REAL NOT NULL,
  seen_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS price_history_offer ON price_history(offer_id, seen_at);

-- Cada redirección a una tienda: base para medir conversiones o cobrar comisión.
CREATE TABLE IF NOT EXISTS clicks (
  id         INTEGER PRIMARY KEY,
  offer_id   INTEGER NOT NULL REFERENCES offers(id),
  clicked_at TEXT NOT NULL
);
`;

export function openDb(file = DB_PATH) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Bases creadas antes de que existieran las imágenes.
  ensureColumn(db, 'products', 'image_url', 'TEXT');
  ensureColumn(db, 'products', 'custom_image', 'TEXT');
  return db;
}

function ensureColumn(db, table, column, type) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function upsertStore(db, store) {
  db.prepare(`
    INSERT INTO stores (id, name, homepage, search_url, platform, color, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, homepage = excluded.homepage,
      search_url = excluded.search_url, platform = excluded.platform, color = excluded.color,
      source = excluded.source
  `).run(
    store.id, store.name, store.homepage, store.searchUrl ?? null, store.platform ?? null,
    store.color ?? null, store.connector?.type ?? null,
  );
}

// Recibe una oferta ya normalizada por scripts/ingest.js y la guarda:
// crea o reutiliza el producto, actualiza el precio y registra el historial.
export function upsertOffer(db, storeId, offer, seenAt) {
  const key = matchKey(offer);
  const { id: productId } = db.prepare(`
    INSERT INTO products (match_key, gtin, name, brand, category, size_label, size_value, size_unit, image_url, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_key) DO UPDATE SET
      category   = COALESCE(products.category, excluded.category),
      size_label = COALESCE(products.size_label, excluded.size_label),
      size_value = COALESCE(products.size_value, excluded.size_value),
      size_unit  = COALESCE(products.size_unit, excluded.size_unit),
      image_url  = COALESCE(products.image_url, excluded.image_url)
    RETURNING id
  `).get(
    key, offer.gtin, offer.name, offer.brand, offer.category, offer.sizeLabel,
    offer.sizeValue, offer.sizeUnit, offer.imageUrl,
    normalizeText(`${offer.brand ?? ''} ${offer.name} ${offer.sizeLabel ?? ''} ${offer.gtin ?? ''}`),
  );

  const { id: offerId } = db.prepare(`
    INSERT INTO offers (product_id, store_id, store_sku, title, price, list_price, in_stock, url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, store_id) DO UPDATE SET
      store_sku = excluded.store_sku, title = excluded.title, price = excluded.price,
      list_price = excluded.list_price, in_stock = excluded.in_stock, url = excluded.url,
      updated_at = excluded.updated_at
    RETURNING id
  `).get(
    productId, storeId, offer.sku, offer.title, offer.price, offer.listPrice,
    offer.inStock ? 1 : 0, offer.url, seenAt,
  );

  const last = db.prepare(
    'SELECT price FROM price_history WHERE offer_id = ? ORDER BY seen_at DESC LIMIT 1',
  ).get(offerId);
  const insertHistory = db.prepare('INSERT INTO price_history (offer_id, price, seen_at) VALUES (?, ?, ?)');
  if (!last) {
    for (const point of offer.history ?? []) insertHistory.run(offerId, point.price, point.seenAt);
  }
  if (!last || last.price !== offer.price) insertHistory.run(offerId, offer.price, seenAt);
}

// Lo que una tienda ya no publica no debe aparecer como disponible.
export function markUnseenOffersOutOfStock(db, storeId, runStartedAt) {
  return db.prepare('UPDATE offers SET in_stock = 0 WHERE store_id = ? AND updated_at < ?')
    .run(storeId, runStartedAt).changes;
}
