// Bot de Súper 99. Su web solo deja leer los productos uno por uno (unas 42 500
// páginas, cerca de 40 horas a un ritmo que no la sature), así que cada corrida
// lee lo que alcanza en su tiempo (SUPER99_MINUTES; 320 por defecto) en este orden:
//   1. los productos de Súper 99 que también venden otras tiendas (los que sirven
//      para comparar), si su precio tiene más de 20 horas;
//   2. los que todavía no conoce (así el catálogo se completa en unos días);
//   3. el resto, empezando por el que lleva más tiempo sin leerse.
// Guarda cada 100 páginas, así una corrida cortada no pierde lo avanzado.
//   npm run super99                     -> corrida completa (GitHub Actions, de noche)
//   SUPER99_MINUTES=2 npm run super99   -> prueba corta
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, upsertStore, upsertOffers, rebuildAggregates, ROOT } from '../server/db.js';
import { categoryPaths, fetchProduct, productUrls } from '../connectors/super99.js';
import { sleep } from '../connectors/util.js';
import { normalizeText } from '../server/lib/normalize.js';
import { attachByName, loadMatcher, normalizeOffer, recategorize } from './lib/pipeline.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const USEFUL_REVISIT = 20 * HOUR; // lo que se compara con otras tiendas: a diario
// El resto se relee según lo que se encontró la última vez.
const REVISIT = { ok: 7 * DAY, error: 2 * DAY, gone: 14 * DAY, skip: 30 * DAY };
const STALE_DAYS = 14; // un precio que nadie releyó en este tiempo no se muestra
const BATCH = 100;

const store = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stores.json'), 'utf8')).find((s) => s.id === 'super99');
const cfg = store.connector;
const started = Date.now();
const budget = (Number(process.env.SUPER99_MINUTES) || cfg.minutes || 320) * 60000;
const delayMs = cfg.delayMs ?? 1500;
const log = console.log;
const db = await openDb();

// Qué páginas hay, cuáles ya se leyeron y cuáles sirven para comparar.
const pages = new Map((await db.all('SELECT url, fetched_at, status FROM store_pages WHERE store_id = ?', [store.id]))
  .map((r) => [r.url, { at: Date.parse(r.fetched_at), status: r.status }]));
let urls;
try {
  urls = await productUrls(cfg.sitemap);
  log(`  ${store.name}: ${urls.length} productos en su mapa del sitio, ${pages.size} ya leídos alguna vez`);
} catch (err) {
  urls = [...pages.keys()];
  log(`  ${store.name}: ${err.message}; se releen los ${urls.length} ya conocidos`);
}
const useful = new Set((await db.all(`
  SELECT DISTINCT o.url FROM offers o
  WHERE o.store_id = ? AND EXISTS (
    SELECT 1 FROM offers x WHERE x.product_id = o.product_id AND x.store_id <> o.store_id AND x.in_stock = 1)
`, [store.id])).map((r) => r.url));

const now = Date.now();
const age = (url) => now - (pages.get(url)?.at ?? 0);
const oldestFirst = (a, b) => age(b) - age(a);
const queue = [
  ...urls.filter((u) => useful.has(u) && age(u) > USEFUL_REVISIT).sort(oldestFirst),
  ...urls.filter((u) => !pages.has(u)),
  ...urls.filter((u) => pages.has(u) && !useful.has(u) && age(u) > (REVISIT[pages.get(u).status] ?? REVISIT.ok)).sort(oldestFirst),
];
log(`  ${store.name}: ${queue.length} páginas por leer (${useful.size} se comparan con otras tiendas); tiempo: ${budget / 60000} min`);

const ctx = { paths: await categoryPaths(new URL(store.homepage).origin), departments: new Set(cfg.departments.map(normalizeText)) };
const matcher = await loadMatcher(db, store.id);
await upsertStore(db, store);

const stats = { ok: 0, skip: 0, gone: 0, error: 0, joined: 0 };
let offers = [];
let visited = [];

async function save() {
  const at = new Date().toISOString();
  if (offers.length) {
    stats.joined += attachByName(offers, matcher);
    await upsertOffers(db, store.id, offers, at);
  }
  const statements = visited.map(([url, status]) => ({
    sql: `INSERT INTO store_pages (store_id, url, fetched_at, status) VALUES (?, ?, ?, ?)
          ON CONFLICT(store_id, url) DO UPDATE SET fetched_at = excluded.fetched_at, status = excluded.status`,
    args: [store.id, url, at, status],
  }));
  // Lo que ya no existe o no es de súper deja de mostrarse.
  for (const [url, status] of visited) {
    if (status === 'gone' || status === 'skip') {
      statements.push({ sql: 'UPDATE offers SET in_stock = 0 WHERE store_id = ? AND url = ?', args: [store.id, url] });
    }
  }
  if (statements.length) await db.batch(statements);
  offers = [];
  visited = [];
}

let done = 0;
for (const url of queue) {
  if (Date.now() - started > budget) break;
  const result = await fetchProduct(url, ctx);
  stats[result.status]++;
  visited.push([url, result.status]);
  const offer = result.offer && normalizeOffer(store, result.offer);
  if (offer) offers.push(offer);
  if (++done % BATCH === 0) {
    await save();
    log(`  ${store.name}: ${done} páginas leídas en ${Math.round((Date.now() - started) / 60000)} min`);
  }
  await sleep(delayMs);
}
await save();

// Un precio que nadie releyó en dos semanas no se muestra como vigente.
const staleBefore = new Date(Date.now() - STALE_DAYS * DAY).toISOString();
const stale = (await db.run('UPDATE offers SET in_stock = 0 WHERE store_id = ? AND in_stock = 1 AND updated_at < ?', [store.id, staleBefore])).rowsAffected;

const moved = await recategorize(db);
// El resumen que usa la web (mejor precio de cada producto y totales) se rehace aquí.
await rebuildAggregates(db);

const notes = [
  `${stats.ok} productos`, `${stats.skip} fuera de súper`, `${stats.gone} ya no existen`, `${stats.error} con error`,
  stats.joined && `${stats.joined} unidos por nombre`, stale && `${stale} sin releer en ${STALE_DAYS} días`,
  moved && `${moved} cambiaron de categoría`,
].filter(Boolean);
log(`✓ ${store.name}: ${done} páginas en ${Math.round((Date.now() - started) / 60000)} min (${notes.join(', ')}). Quedan ${queue.length - done} para la próxima corrida.`);
db.close();
process.exitCode = done > 0 && stats.ok === 0 ? 1 : 0; // ninguna página útil: algo cambió en su web
