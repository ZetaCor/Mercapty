// Base de datos: Turso en producción (Vercel y GitHub Actions) y un archivo
// SQLite en data/ para trabajar en local. Es el mismo motor, así que las
// consultas son idénticas en ambos casos.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTLIER_MIN_GAP, OUTLIER_RATIO } from './lib/compare.js';
import { normalizeText, matchKey } from './lib/normalize.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_DB = path.join(ROOT, 'data', 'mercapty.db');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stores (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    homepage   TEXT NOT NULL,
    search_url TEXT,
    platform   TEXT,
    color      TEXT,
    source     TEXT, -- conector que la alimenta: vtex | woocommerce | feed
    logo       TEXT, -- logo horizontal (franja de la portada y página de tiendas)
    icon       TEXT, -- ícono cuadrado (junto a cada precio)
    logo_bg    TEXT  -- fondo para logos claros
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
  // Para buscar por codigo de barras (el escaner de la app) sin recorrer la tabla.
  'CREATE INDEX IF NOT EXISTS products_gtin ON products(gtin)',
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
  // Páginas de producto de las tiendas que se leen una por una (Súper 99):
  // cuándo se leyó cada una y qué pasó, para repartir la lectura entre corridas.
  // Mejor oferta de cada producto, cuántas tiendas lo tienen y cuánto se ahorra:
  // lo recalculan los bots al final de cada corrida (rebuildAggregates). Así la web no
  // recorre todas las ofertas en cada visita, que es lo que cobra Turso.
  `CREATE TABLE IF NOT EXISTS product_best (
    product_id  INTEGER PRIMARY KEY REFERENCES products(id),
    offer_id    INTEGER NOT NULL,
    price       REAL NOT NULL,
    list_price  REAL,
    store_id    TEXT NOT NULL,
    store_count INTEGER NOT NULL, -- en cuántas tiendas está disponible
    max_price   REAL NOT NULL,
    store_ids   TEXT NOT NULL,    -- todas las tiendas, de la más barata a la más cara
    savings     REAL NOT NULL,    -- max_price - price
    category    TEXT,             -- copiados de products para ordenar y filtrar sin unir tablas
    name        TEXT NOT NULL,
    updated_at  TEXT              -- la oferta disponible más reciente
  )`,
  'CREATE INDEX IF NOT EXISTS product_best_stores ON product_best(store_count DESC, name)',
  'CREATE INDEX IF NOT EXISTS product_best_category ON product_best(category, store_count DESC, name)',
  'CREATE INDEX IF NOT EXISTS product_best_category_price ON product_best(category, price, name)',
  'CREATE INDEX IF NOT EXISTS product_best_savings ON product_best(savings DESC)',
  'CREATE INDEX IF NOT EXISTS product_best_price ON product_best(price, name)',
  // Avisos al celular: el token de Expo de cada teléfono, con lo que quiere recibir y los
  // productos de su lista que sigue. No hay cuentas ni datos personales.
  `CREATE TABLE IF NOT EXISTS devices (
    token      TEXT PRIMARY KEY,
    platform   TEXT,
    lang       TEXT,
    prefs      TEXT NOT NULL, -- JSON: qué avisos quiere
    products   TEXT NOT NULL, -- JSON: ids de «Mi lista»
    version    TEXT,          -- versión de la app instalada, para avisar solo a quien va atrasado
    updated_at TEXT NOT NULL
  )`,
  // Bajadas de precio desde la corrida anterior, para avisar a los celulares que siguen ese
  // producto en «Mi lista» (scripts/notify.js). Se limpia sola a los siete días.
  `CREATE TABLE IF NOT EXISTS price_drops (
    product_id INTEGER PRIMARY KEY REFERENCES products(id),
    old_price  REAL NOT NULL,
    new_price  REAL NOT NULL,
    store_id   TEXT,
    seen_at    TEXT NOT NULL,
    notified   INTEGER NOT NULL DEFAULT 0
  )`,
  // Totales de la portada, las categorías y las tiendas, en JSON: contarlos en cada
  // visita cuesta recorrer las tablas enteras.
  `CREATE TABLE IF NOT EXISTS stats (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS store_pages (
    store_id   TEXT NOT NULL,
    url        TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    status     TEXT NOT NULL, -- ok | skip (no es de súper) | gone (ya no existe) | error
    PRIMARY KEY (store_id, url)
  )`,
  // Códigos de barras que el catálogo de la tienda no publica y que el bot de
  // scripts/codigos.js va a buscar a la ficha de cada producto. Se guardan aparte
  // para que el bot de precios siga siendo rápido: cuando recorre la tienda, lee
  // esta tabla y le pega el código a cada oferta.
  `CREATE TABLE IF NOT EXISTS store_barcodes (
    store_id   TEXT NOT NULL,
    sku        TEXT NOT NULL, -- el mismo que guarda la oferta (en Shopify, el id de la variante)
    gtin       TEXT,          -- ya normalizado a 14 dígitos; vacío si la tienda no lo publica
    fetched_at TEXT NOT NULL,
    status     TEXT NOT NULL, -- ok | vacio (la tienda no lo publica) | gone | error
    PRIMARY KEY (store_id, sku)
  )`,
];

// Los códigos que el bot de scripts/codigos.js ya encontró para una tienda,
// listos para pegárselos a sus ofertas: sku -> código de barras.
export async function loadBarcodes(db, storeId) {
  const rows = await db.all('SELECT sku, gtin FROM store_barcodes WHERE store_id = ? AND gtin IS NOT NULL', [storeId]);
  return new Map(rows.map((r) => [r.sku, r.gtin]));
}

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

// El servidor web no crea las tablas al arrancar: son ~25 sentencias que solo hacen falta
// cuando los bots escriben, y en Vercel las pagaría cada arranque en frío, o sea la primera
// visita después de un rato. Si faltaran (base recién creada), la API las crea al vuelo.
// El cliente de Turso no trae tiempo de espera: si una petición se queda a medias, no vuelve
// nunca y tampoco lanza error, así que conReintentos —que solo reintenta lo que falla— ni se
// entera. Por eso el resumen se quedó colgado cuatro veces hasta que GitHub lo mató a los 30
// minutos, y la web se pasó dos días enseñando cifras viejas con las tiendas nuevas en cero.
// Con un límite, una petición muerta se corta, se puede reintentar y, si de verdad algo va
// mal, la corrida falla a la vista en vez de quedarse esperando.
const TIEMPO_LIMITE = Number(process.env.TURSO_TIMEOUT_MS) || 60000;

function fetchConLimite(input, init = {}) {
  const limite = AbortSignal.timeout(TIEMPO_LIMITE);
  const signal = init.signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([init.signal, limite])
    : init.signal ?? limite;
  return fetch(input, { ...init, signal });
}

export async function openDb({ schema = !process.env.VERCEL } = {}) {
  let client;
  if (process.env.TURSO_DATABASE_URL) {
    // Cliente sin módulos nativos: funciona igual en Vercel y en GitHub Actions.
    const { createClient } = await import('@libsql/client/web');
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
      fetch: fetchConLimite,
    });
  } else {
    if (process.env.VERCEL || process.env.CI) {
      throw new Error('Falta TURSO_DATABASE_URL: en producción la base de datos debe estar en Turso');
    }
    mkdirSync(path.dirname(LOCAL_DB), { recursive: true });
    const { createClient } = await import('@libsql/client');
    client = createClient({ url: `file:${LOCAL_DB.replaceAll('\\', '/')}` });
  }
  const db = wrap(client);
  if (schema) await createSchema(db);
  return db;
}

// Índice de texto para la búsqueda (FTS5): guarda las palabras de cada producto para
// encontrarlas sin recorrer la tabla. Se mantiene solo con los tres disparadores, y solo
// cuando el texto cambia, para no escribir de más en cada corrida de los bots.
const SEARCH_INDEX = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
    search_text, content='products', content_rowid='id', tokenize='unicode61')`,
  `CREATE TRIGGER IF NOT EXISTS products_fts_insert AFTER INSERT ON products BEGIN
    INSERT INTO products_fts(rowid, search_text) VALUES (new.id, new.search_text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS products_fts_delete AFTER DELETE ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, search_text) VALUES ('delete', old.id, old.search_text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS products_fts_update AFTER UPDATE OF search_text ON products
    WHEN new.search_text IS NOT old.search_text BEGIN
    INSERT INTO products_fts(products_fts, rowid, search_text) VALUES ('delete', old.id, old.search_text);
    INSERT INTO products_fts(rowid, search_text) VALUES (new.id, new.search_text);
  END`,
];

// Crea las tablas y los índices que falten, y agrega las columnas de tiendas que llegaron después.
export async function createSchema(db) {
  await db.batch(SCHEMA);
  await addStoreColumns(db);
  await createSearchIndex(db);
}

// Si la base no soportara FTS5, la búsqueda sigue funcionando recorriendo los nombres:
// por eso un fallo aquí solo se avisa. Devuelve si el índice quedó listo.
export async function createSearchIndex(db) {
  try {
    const existed = Boolean(await db.get("SELECT 1 AS ok FROM sqlite_master WHERE name = 'products_fts'"));
    await db.batch(SEARCH_INDEX);
    // Recién creado: se llena con lo que ya hay; después lo mantienen los disparadores.
    if (!existed) await db.run("INSERT INTO products_fts(products_fts) VALUES ('rebuild')");
    return true;
  } catch (err) {
    console.warn(`Sin índice de texto (FTS5): la búsqueda recorrerá los nombres. ${err.message}`);
    return false;
  }
}

// Columnas que llegaron después: las bases ya creadas las reciben aquí.
const NUEVAS_COLUMNAS = { stores: ['logo', 'icon', 'logo_bg'], devices: ['version'] };
async function addStoreColumns(db) {
  for (const [tabla, columnas] of Object.entries(NUEVAS_COLUMNAS)) {
    const have = new Set((await db.all(`PRAGMA table_info(${tabla})`)).map((c) => c.name));
    for (const column of columnas.filter((c) => !have.has(c))) {
      try {
        await db.run(`ALTER TABLE ${tabla} ADD COLUMN ${column} TEXT`);
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) throw err; // otra instancia la agregó a la vez
      }
    }
  }
}

export function upsertStore(db, store) {
  return db.run(`
    INSERT INTO stores (id, name, homepage, search_url, platform, color, source, logo, icon, logo_bg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, homepage = excluded.homepage,
      search_url = excluded.search_url, platform = excluded.platform, color = excluded.color,
      source = excluded.source, logo = excluded.logo, icon = excluded.icon, logo_bg = excluded.logo_bg
  `, [
    store.id, store.name, store.homepage, store.searchUrl ?? null, store.platform ?? null,
    store.color ?? null, store.connector?.type ?? null, store.logo ?? null, store.icon ?? null, store.logoBg ?? null,
  ]);
}

const PRODUCT_UPSERT = `
  INSERT INTO products (match_key, gtin, name, brand, category, size_label, size_value, size_unit, image_url, search_text)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_key) DO UPDATE SET
    -- Se queda el nombre más completo: si el guardado no dice el tamaño o la marca
    -- («Ron Claro») y el de esta tienda sí («Ron Carta Vieja 750 Ml Claro»), se cambia.
    name = CASE
      WHEN (products.name NOT GLOB '*[0-9]*' AND excluded.name GLOB '*[0-9]*')
        OR (products.brand IS NOT NULL AND instr(lower(products.name), lower(products.brand)) = 0
            AND instr(lower(excluded.name), lower(products.brand)) > 0)
      THEN excluded.name ELSE products.name END,
    -- Un producto que se guardó sin código de barras lo recibe cuando alguna tienda lo
    -- trae (hoy, el bot de scripts/codigos.js): sin esto el escáner de la app no lo
    -- encuentra nunca. El que ya tiene código no se toca.
    gtin       = COALESCE(products.gtin, excluded.gtin),
    category   = CASE WHEN products.category IS NULL OR products.category = 'Otros' THEN excluded.category ELSE products.category END,
    size_label = COALESCE(products.size_label, excluded.size_label),
    size_value = COALESCE(products.size_value, excluded.size_value),
    size_unit  = COALESCE(products.size_unit, excluded.size_unit),
    image_url  = COALESCE(products.image_url, excluded.image_url),
    -- Se suma el texto de cada tienda (su nombre para el producto y su categoría),
    -- para que la búsqueda lo encuentre como lo llame cualquier súper.
    search_text = CASE WHEN instr(products.search_text, excluded.search_text) > 0 THEN products.search_text
                       ELSE substr(products.search_text || ' ' || excluded.search_text, 1, 1500) END`;

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
      const key = offer.matchKey ?? matchKey(offer); // matchKey: unión por nombre hecha en la ingesta
      return [
        {
          sql: PRODUCT_UPSERT,
          args: [
            key, offer.gtin, offer.name, offer.brand, offer.category, offer.sizeLabel,
            offer.sizeValue, offer.sizeUnit, offer.imageUrl,
            normalizeText(`${offer.brand ?? ''} ${offer.name} ${offer.sizeLabel ?? ''} ${offer.gtin ?? ''} ${offer.categoryLeaf ?? ''}`),
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

// --- Resumen para la web (Turso cobra por filas leídas) ---

// La mejor oferta de cada producto: rn = 1 es la más barata, con cuántas tiendas lo
// tienen, el precio más alto y todas las tiendas de la más barata a la más cara.
// Las ofertas que se pueden comparar entre sí: se aparta la que se sale de rango porque
// la tienda publicó otra presentación con el mismo código de barras (server/lib/compare.js).
const COMPARABLE_OFFERS = `
  SELECT * FROM (
    SELECT o.*, MIN(o.price) OVER (PARTITION BY o.product_id) AS low
    FROM offers o
    WHERE o.in_stock = 1 AND o.product_id BETWEEN ? AND ?
  )
  WHERE price <= low * ${OUTLIER_RATIO} OR price - low < ${OUTLIER_MIN_GAP}`;

const BEST_ROWS = `
  SELECT o.*,
    ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price, o.store_id) AS rn,
    COUNT(*)          OVER (PARTITION BY o.product_id) AS store_count,
    MAX(o.price)      OVER (PARTITION BY o.product_id) AS max_price,
    MAX(o.updated_at) OVER (PARTITION BY o.product_id) AS best_updated_at,
    group_concat(o.store_id, ',') OVER (PARTITION BY o.product_id ORDER BY o.price, o.store_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS store_ids
  FROM (${COMPARABLE_OFFERS}) o`;

const STATS_UPSERT = 'INSERT INTO stats (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

// Turso no tiene la base al lado: cada sentencia es una petición HTTP y el cliente deja de
// esperar a los cinco minutos. Recorrer las ofertas de todas las tiendas de una sola vez
// pasaba de ahí y tumbaba el resumen entero, así que se rehace por tandas de productos:
// `offers` tiene índice por product_id (UNIQUE product_id, store_id), de modo que cada tanda
// es un trozo del índice y tarda segundos.
const TANDA = 5000;
const REINTENTOS = 3;

// Un tropiezo de red no debe costar la corrida entera. Las sentencias del resumen se pueden
// repetir sin hacer daño —vuelven a dejar la misma fila—, así que se reintentan con pausa.
export async function conReintentos(fn) {
  for (let intento = 1; ; intento += 1) {
    try {
      return await fn();
    } catch (err) {
      if (intento === REINTENTOS) throw err;
      console.warn(`Reintento ${intento} de ${REINTENTOS}: ${err.message}`);
      await new Promise((listo) => setTimeout(listo, intento * 5000));
    }
  }
}

// Rehace product_best y stats: una sola pasada por las ofertas al final de cada corrida de
// los bots, en vez de una por cada visita a la web. Solo se escriben las filas que cambiaron,
// porque Turso también cobra por filas escritas; la fecha se guarda por día (es la que lleva
// el mapa del sitio), así una corrida seguida de otra casi no escribe nada.
export async function rebuildAggregates(db) {
  // Productos que se quedaron sin oferta disponible.
  await conReintentos(() => db.run(`
    DELETE FROM product_best
    WHERE product_id NOT IN (SELECT product_id FROM offers WHERE in_stock = 1)`));

  const visto = new Date().toISOString();
  const { tope } = await db.get('SELECT COALESCE(MAX(product_id), 0) AS tope FROM offers');
  let cambiadas = 0;
  for (let primero = 1; primero <= tope; primero += TANDA) {
    const tanda = [primero, primero + TANDA - 1];

    // Lo que bajó de precio se anota antes de actualizar el resumen, que es cuando todavía se
    // puede comparar con el precio anterior. Si vuelve a bajar antes de que se avise, se
    // conserva el precio más viejo, que es el que hace justicia a la rebaja.
    await conReintentos(() => db.run(`
      INSERT INTO price_drops (product_id, old_price, new_price, store_id, seen_at, notified)
      SELECT b.product_id, b.price, r.price, r.store_id, ?, 0
      FROM (${BEST_ROWS}) r
      JOIN product_best b ON b.product_id = r.product_id
      WHERE r.rn = 1 AND r.price < b.price - 0.009
      ON CONFLICT(product_id) DO UPDATE SET
        old_price = CASE WHEN price_drops.notified = 0 THEN price_drops.old_price ELSE excluded.old_price END,
        new_price = excluded.new_price, store_id = excluded.store_id,
        seen_at = excluded.seen_at, notified = 0`, [visto, ...tanda]));

    const hecho = await conReintentos(() => db.run(`
      INSERT INTO product_best (product_id, offer_id, price, list_price, store_id, store_count,
        max_price, store_ids, savings, category, name, updated_at)
      SELECT r.product_id, r.id, r.price, r.list_price, r.store_id, r.store_count,
        r.max_price, r.store_ids, r.max_price - r.price, p.category, p.name, substr(r.best_updated_at, 1, 10)
      FROM (${BEST_ROWS}) r
      JOIN products p ON p.id = r.product_id
      WHERE r.rn = 1
      ON CONFLICT(product_id) DO UPDATE SET
        offer_id = excluded.offer_id, price = excluded.price, list_price = excluded.list_price,
        store_id = excluded.store_id, store_count = excluded.store_count, max_price = excluded.max_price,
        store_ids = excluded.store_ids, savings = excluded.savings, category = excluded.category,
        name = excluded.name, updated_at = excluded.updated_at
      WHERE product_best.offer_id IS NOT excluded.offer_id
        OR product_best.price IS NOT excluded.price
        OR product_best.list_price IS NOT excluded.list_price
        OR product_best.store_count IS NOT excluded.store_count
        OR product_best.max_price IS NOT excluded.max_price
        OR product_best.store_ids IS NOT excluded.store_ids
        OR product_best.category IS NOT excluded.category
        OR product_best.name IS NOT excluded.name
        OR product_best.updated_at IS NOT excluded.updated_at`, tanda));
    cambiadas += hecho.rowsAffected ?? 0;
  }

  const meta = await conReintentos(() => db.get(`
    SELECT (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(*) FROM offers WHERE in_stock = 1) AS offers,
      (SELECT MAX(updated_at) FROM offers) AS updatedAt,
      (SELECT COUNT(*) FROM stores WHERE source = 'demo') AS demoStores`));
  const categories = await conReintentos(() => db.all(
    'SELECT category AS name, COUNT(*) AS count FROM product_best GROUP BY category ORDER BY count DESC',
  ));
  const stores = await conReintentos(() => db.all(`
    SELECT s.id,
      (SELECT COUNT(*) FROM offers o WHERE o.store_id = s.id AND o.in_stock = 1) AS offers,
      (SELECT MAX(o.updated_at) FROM offers o WHERE o.store_id = s.id) AS updatedAt,
      (SELECT COUNT(*) FROM product_best b WHERE b.store_id = s.id AND b.store_count > 1) AS bestCount
    FROM stores s`));
  await conReintentos(() => db.batch([
    { sql: STATS_UPSERT, args: ['meta', JSON.stringify(meta)] },
    { sql: STATS_UPSERT, args: ['categories', JSON.stringify(categories)] },
    { sql: STATS_UPSERT, args: ['stores', JSON.stringify(stores)] },
  ]));
  return { products: meta.products, offers: meta.offers, changed: cambiadas };
}
